-- Kokpit Database Initialization
-- This script runs on first container startup

-- Create database if not exists (usually handled by MYSQL_DATABASE env var)
CREATE DATABASE IF NOT EXISTS kokpit
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

-- Use the database
USE kokpit;

-- Grant permissions (backup in case env vars don't work)
-- Note: Main user creation is handled by Docker MySQL image via environment variables

-- Create read-only user for reporting/analytics (optional)
-- CREATE USER IF NOT EXISTS 'kokpit_readonly'@'%' IDENTIFIED BY 'readonly_password';
-- GRANT SELECT ON kokpit.* TO 'kokpit_readonly'@'%';

-- Set timezone to Turkey
SET GLOBAL time_zone = '+03:00';

-- Performance optimizations for InnoDB
SET GLOBAL innodb_buffer_pool_size = 268435456; -- 256MB
SET GLOBAL innodb_log_file_size = 67108864; -- 64MB
SET GLOBAL innodb_flush_log_at_trx_commit = 2; -- Better performance, slight durability tradeoff

-- Output confirmation
SELECT 'Kokpit database initialized successfully' AS status;
