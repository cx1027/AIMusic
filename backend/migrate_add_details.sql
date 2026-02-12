-- Migration script to add the 'details' column to the users table
-- Run with: psql -U aimusic -d aimusic -f migrate_add_details.sql

-- Check if column exists and add it if it doesn't
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'details'
    ) THEN
        ALTER TABLE users ADD COLUMN details TEXT DEFAULT '';
        RAISE NOTICE 'Column details added to users table';
    ELSE
        RAISE NOTICE 'Column details already exists in users table';
    END IF;
END $$;

