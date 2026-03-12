-- Bootstrap MariaDB for the mirroring sample.
-- This keeps the required MaxScale user in place and seeds a small dataset.

CREATE DATABASE IF NOT EXISTS sampledb;

CREATE USER IF NOT EXISTS 'maxscale'@'%' IDENTIFIED BY 'MaxScaleP@ss1!';
GRANT REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'maxscale'@'%';
GRANT SELECT ON *.* TO 'maxscale'@'%';
GRANT SUPER, SLAVE MONITOR ON *.* TO 'maxscale'@'%';
FLUSH PRIVILEGES;

USE sampledb;

CREATE TABLE IF NOT EXISTS customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_customers_email (email)
);

CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    product VARCHAR(255) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    total_price DECIMAL(10,2) NOT NULL,
    order_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_orders_customer
        FOREIGN KEY (customer_id) REFERENCES customers(id)
);

INSERT INTO customers (id, first_name, last_name, email)
SELECT 1, 'Alice', 'Smith', 'alice@example.com'
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE id = 1);

INSERT INTO customers (id, first_name, last_name, email)
SELECT 2, 'Bob', 'Johnson', 'bob@example.com'
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE id = 2);

INSERT INTO customers (id, first_name, last_name, email)
SELECT 3, 'Carol', 'Williams', 'carol@example.com'
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE id = 3);

INSERT INTO orders (id, customer_id, product, quantity, total_price)
SELECT 1, 1, 'Widget A', 2, 19.98
WHERE NOT EXISTS (SELECT 1 FROM orders WHERE id = 1);

INSERT INTO orders (id, customer_id, product, quantity, total_price)
SELECT 2, 2, 'Gadget B', 1, 49.99
WHERE NOT EXISTS (SELECT 1 FROM orders WHERE id = 2);

INSERT INTO orders (id, customer_id, product, quantity, total_price)
SELECT 3, 3, 'Thingamajig C', 5, 9.95
WHERE NOT EXISTS (SELECT 1 FROM orders WHERE id = 3);
