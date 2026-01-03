const express = require('express');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  port: 5432,
});

// Idempotency Middleware
async function idempotencyMiddleware(req, res, next) {
  const idempotencyKey = req.headers['idempotency-key'];

  // Only apply to POST, PATCH, DELETE
  if (!idempotencyKey || req.method === 'GET') {
    return next();
  }

  const client = await pool.connect();

  try {
    // Check if request already exists
    const checkQuery = `
            SELECT response_status, response_body, processing_status, expires_at
            FROM idempotency_keys
            WHERE idempotency_key = $1
            AND expires_at > NOW()
        `;

    const result = await client.query(checkQuery, [idempotencyKey]);

    if (result.rows.length > 0) {
      const cached = result.rows[0];

      // If still processing, return 409 Conflict
      if (cached.processing_status === 'processing') {
        return res.status(409).json({
          error: 'Request is already being processed',
        });
      }

      // Return cached response
      if (cached.response_body) {
        return res.status(cached.response_status).json(cached.response_body);
      }
    }

    // Insert idempotency record to lock this key
    const insertQuery = `
            INSERT INTO idempotency_keys (
                idempotency_key,
                request_method,
                request_path,
                request_body,
                processing_status,
                expires_at
            )
            VALUES ($1, $2, $3, $4, 'processing', NOW() + INTERVAL '24 hours')
            ON CONFLICT (idempotency_key) DO NOTHING
            RETURNING id
        `;

    const insertResult = await client.query(insertQuery, [
      idempotencyKey,
      req.method,
      req.path,
      JSON.stringify(req.body),
    ]);

    // If no rows returned, another request is processing this
    if (insertResult.rows.length === 0) {
      return res.status(409).json({
        error: 'Request is already being processed',
      });
    }

    // Intercept the response to cache it
    const originalJson = res.json.bind(res);
    res.json = async function (body) {
      try {
        const updateQuery = `
                    UPDATE idempotency_keys
                    SET response_status = $1,
                        response_body = $2,
                        processing_status = 'completed',
                        updated_at = NOW()
                    WHERE idempotency_key = $3
                `;

        await client.query(updateQuery, [
          res.statusCode,
          JSON.stringify(body),
          idempotencyKey,
        ]);
      } catch (error) {
        console.error('Failed to cache response:', error);
      } finally {
        client.release();
      }

      return originalJson(body);
    };

    next();
  } catch (error) {
    client.release();
    console.error('Idempotency middleware error:', error);
    next(error);
  }
}

// Apply middleware
app.use(idempotencyMiddleware);

// Sample Payment Endpoint
app.post('/api/payment', async (req, res) => {
  const { amount, userId, description } = req.body;

  // Validate input
  if (!amount || !userId) {
    return res.status(400).json({
      error: 'Amount and userId are required',
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Insert payment record
    const paymentQuery = `
            INSERT INTO payments (
                payment_id,
                user_id,
                amount,
                description,
                status,
                created_at
            )
            VALUES ($1, $2, $3, $4, $5, NOW())
            RETURNING *
        `;

    const paymentId = uuidv4();
    const paymentResult = await client.query(paymentQuery, [
      paymentId,
      userId,
      amount,
      description || null,
      'completed',
    ]);

    // Update user balance (example)
    const balanceQuery = `
            UPDATE users
            SET balance = balance - $1
            WHERE user_id = $2
            RETURNING balance
        `;

    const balanceResult = await client.query(balanceQuery, [amount, userId]);

    if (balanceResult.rows.length === 0) {
      throw new Error('User not found');
    }

    await client.query('COMMIT');

    // Return success response
    res.status(201).json({
      success: true,
      payment: paymentResult.rows[0],
      remainingBalance: balanceResult.rows[0].balance,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Payment error:', error);

    res.status(500).json({
      error: 'Payment processing failed',
      message: error.message,
    });
  } finally {
    client.release();
  }
});

// Sample Order Creation Endpoint
app.post('/api/orders', async (req, res) => {
  const { userId, items, totalAmount } = req.body;

  if (!userId || !items || !totalAmount) {
    return res.status(400).json({
      error: 'userId, items, and totalAmount are required',
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create order
    const orderQuery = `
            INSERT INTO orders (
                order_id,
                user_id,
                total_amount,
                status,
                created_at
            )
            VALUES ($1, $2, $3, $4, NOW())
            RETURNING *
        `;

    const orderId = uuidv4();
    const orderResult = await client.query(orderQuery, [
      orderId,
      userId,
      totalAmount,
      'pending',
    ]);

    // Insert order items
    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, price)
                 VALUES ($1, $2, $3, $4)`,
        [orderId, item.productId, item.quantity, item.price]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      order: orderResult.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Order creation error:', error);

    res.status(500).json({
      error: 'Order creation failed',
      message: error.message,
    });
  } finally {
    client.release();
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Cleanup job for expired keys
async function cleanupExpiredKeys() {
  try {
    const result = await pool.query('DELETE FROM idempotency_keys WHERE expires_at < NOW()');
    console.log(`Cleaned up ${result.rowCount} expired idempotency keys`);
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

// Run cleanup every hour
setInterval(cleanupExpiredKeys, 60 * 60 * 1000);

module.exports = app;
