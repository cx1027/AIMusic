-- Migration script to update all users' credits_balance to 1000
-- Run this with: psql -U aimusic -d aimusic -f migrate_update_credits_to_1000.sql

-- Update all users to have 1000 credits
UPDATE users 
SET credits_balance = 1000;

-- Verify the update
SELECT id, username, credits_balance FROM users;

