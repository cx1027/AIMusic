-- Migration script to add unique constraint to the 'username' column in the users table
-- Run this with: psql -U aimusic -d aimusic -f migrate_add_username_unique.sql

-- First, check for duplicate usernames (run this separately to see if there are any)
-- SELECT username, COUNT(*) as count
-- FROM users
-- GROUP BY username
-- HAVING COUNT(*) > 1;

-- If there are duplicates, resolve them first before running the ALTER TABLE command below

-- Add unique constraint to username column
ALTER TABLE users 
ADD CONSTRAINT users_username_unique UNIQUE (username);

