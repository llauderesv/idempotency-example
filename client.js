// client.js - Example client requests
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const BASE_URL = 'http://localhost:3000';

// Example 1: Making a payment with idempotency
async function makePayment() {
  const idempotencyKey = uuidv4();

  console.log('Making payment with idempotency key:', idempotencyKey);

  try {
    const response = await axios.post(
      `${BASE_URL}/api/payment`,
      {
        userId: 1,
        amount: 50.0,
        description: 'Coffee subscription 123',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
      }
    );

    console.log('Payment successful:', response.data);
    return { ...response.data, idempotencyKey };
  } catch (error) {
    console.error('Payment failed:', error.response?.data || error.message);
    throw error;
  }
}

// Example 2: Retry the same payment (should return cached response)
async function retryPayment(idempotencyKey) {
  console.log('Retrying payment with same idempotency key:', idempotencyKey);

  try {
    const response = await axios.post(
      `${BASE_URL}/api/payment`,
      {
        userId: 1,
        amount: 50.0,
        description: 'Coffee subscription 123',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
      }
    );

    console.log('Retry response (cached):', response.data);
    return response.data;
  } catch (error) {
    console.error('Retry failed:', error.response?.data || error.message);
    throw error;
  }
}

// Example 3: Create an order with idempotency
async function createOrder() {
  const idempotencyKey = uuidv4();

  console.log('Creating order with idempotency key:', idempotencyKey);

  try {
    const response = await axios.post(
      `${BASE_URL}/api/orders`,
      {
        userId: 2,
        items: [
          { productId: 101, quantity: 2, price: 29.99 },
          { productId: 102, quantity: 1, price: 49.99 },
        ],
        totalAmount: 109.97,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
      }
    );

    console.log('Order created:', response.data);
    return response.data;
  } catch (error) {
    console.error('Order creation failed:', error.response?.data || error.message);
    throw error;
  }
}

// Example 4: Simulate concurrent requests (race condition test)
async function testConcurrentRequests() {
  const idempotencyKey = uuidv4();

  console.log('Testing concurrent requests with same idempotency key:', idempotencyKey);

  const requests = Array(5)
    .fill(null)
    .map(() =>
      axios
        .post(
          `${BASE_URL}/api/payment`,
          {
            userId: 1,
            amount: 50.0,
            description: 'Coffee subscription 123',
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Idempotency-Key': idempotencyKey,
            },
          }
        )
        .then(r => r.data)
        .catch(err => ({
          error: true,
          status: err.response?.status,
          data: err.response?.data,
        }))
    );

  const results = await Promise.all(requests);
  console.log(results);
  console.log('\nConcurrent request results:');
  results.forEach((result, index) => {
    if (result.error) {
      console.log(
        `Request ${index + 1}: ERROR - ${result.status} - ${JSON.stringify(result.data)}`
      );
    } else {
      console.log(`Request ${index + 1}: SUCCESS - ${JSON.stringify(result.data)}`);
    }
  });
}

// Example 5: Request without idempotency key (will be processed normally)
async function requestWithoutIdempotency() {
  console.log('Making request without idempotency key');

  try {
    const response = await axios.post(
      `${BASE_URL}/api/payment`,
      {
        userId: 1,
        amount: 10.0,
        description: 'Payment without idempotency',
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('Payment successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('Payment failed:', error.response?.data || error.message);
    throw error;
  }
}

// Run examples
async function runExamples() {
  console.log('=== Starting Idempotency Examples ===\n');

  try {
    // Example 1: Initial payment
    // console.log('\n--- Example 1: Initial Payment ---');
    // const payment1 = await makePayment();
    // const idempotencyKey1 = payment1.idempotencyKey;

    // Wait a bit
    // await new Promise(resolve => setTimeout(resolve, 1000));

    // Example 2: Retry same payment (should get cached response)
    // console.log('\n--- Example 2: Retry Payment (Idempotent) ---');
    // await retryPayment(idempotencyKey1);

    // // Example 3: Create order
    // console.log('\n--- Example 3: Create Order ---');
    // await createOrder();

    // // Example 4: Test concurrent requests
    console.log('\n--- Example 4: Concurrent Requests Test ---');
    await testConcurrentRequests();

    // // Example 5: Request without idempotency
    // console.log('\n--- Example 5: Without Idempotency Key ---');
    // await requestWithoutIdempotency();
  } catch (error) {
    console.error('Example execution failed:', error.message);
  }

  console.log('\n=== Examples Complete ===');
}

// Export for use in other files
module.exports = {
  makePayment,
  retryPayment,
  createOrder,
  testConcurrentRequests,
  requestWithoutIdempotency,
  runExamples,
};

// Run if executed directly
if (require.main === module) {
  runExamples();
}
