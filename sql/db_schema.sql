-- schema.sql
-- Create processing status enum
CREATE TYPE processing_status AS ENUM ('pending', 'processing', 'completed', 'failed');

-- Idempotency keys table
CREATE TABLE idempotency_keys (
    id SERIAL PRIMARY KEY,
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    request_method VARCHAR(10) NOT NULL,
    request_path VARCHAR(500) NOT NULL,
    request_body JSONB,
    response_status INTEGER,
    response_body JSONB,
    processing_status processing_status DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL
);

-- Users table
CREATE TABLE users (
    user_id INTEGER PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    balance DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Payments table
CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    payment_id VARCHAR(36) NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(user_id),
    amount DECIMAL(10, 2) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Orders table
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(36) NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(user_id),
    total_amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Order items table
CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(36) NOT NULL REFERENCES orders(order_id),
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    price DECIMAL(10, 2) NOT NULL
);

-- Indexes for better performance
CREATE INDEX idx_idempotency_key ON idempotency_keys(idempotency_key);
CREATE INDEX idx_expires_at ON idempotency_keys(expires_at);
CREATE INDEX idx_processing_status ON idempotency_keys(processing_status);
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_orders_user_id ON orders(user_id);

-- Sample data
INSERT INTO users (user_id, username, email, balance) VALUES
(1, 'john_doe', 'john@example.com', 1000.00),
(2, 'jane_smith', 'jane@example.com', 500.00);