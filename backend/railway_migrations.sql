-- Railway Deployment Migration Script
-- Run this from Railway's SQL editor or nixie shell to add missing columns.
-- Safe to run multiple times (each step checks for existence first).

BEGIN;

-- Migration: add 'details' column to users
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'details'
    ) THEN
        ALTER TABLE users ADD COLUMN details TEXT DEFAULT '';
        RAISE NOTICE 'Added details column to users';
    ELSE
        RAISE NOTICE 'details column already exists in users, skipping';
    END IF;
END $$;

-- Migration: add 'background_url' column to users
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'background_url'
    ) THEN
        ALTER TABLE users ADD COLUMN background_url TEXT;
        RAISE NOTICE 'Added background_url column to users';
    ELSE
        RAISE NOTICE 'background_url column already exists in users, skipping';
    END IF;
END $$;

-- Migration: add unique constraint on 'username' in users
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_username_unique'
    ) THEN
        -- First resolve any duplicate usernames
        DELETE FROM users a USING users b
        WHERE a.ctid < b.ctid AND a.username = b.username;
        ALTER TABLE users ADD CONSTRAINT users_username_unique UNIQUE (username);
        RAISE NOTICE 'Added unique constraint on username in users';
    ELSE
        RAISE NOTICE 'username unique constraint already exists, skipping';
    END IF;
END $$;

-- Migration: update credits_balance to 1000 for all existing users
DO $$
DECLARE
    user_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO user_count FROM users;
    IF user_count > 0 THEN
        UPDATE users SET credits_balance = 1000 WHERE credits_balance IS NULL OR credits_balance < 1000;
        RAISE NOTICE 'Updated credits_balance to 1000 for existing users';
    ELSE
        RAISE NOTICE 'No users found, skipping credits update';
    END IF;
END $$;

-- Migration: add 'share_slug' column to songs (THE FIX for the current error)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'songs' AND column_name = 'share_slug'
    ) THEN
        ALTER TABLE songs ADD COLUMN share_slug VARCHAR;
        RAISE NOTICE 'Added share_slug column to songs';
    ELSE
        RAISE NOTICE 'share_slug column already exists in songs, skipping';
    END IF;
END $$;

-- Migration: add unique index on share_slug (partial to allow NULLs)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'ix_songs_share_slug'
    ) THEN
        CREATE UNIQUE INDEX ix_songs_share_slug ON songs (share_slug) WHERE share_slug IS NOT NULL;
        RAISE NOTICE 'Created unique index on share_slug';
    ELSE
        RAISE NOTICE 'Index ix_songs_share_slug already exists, skipping';
    END IF;
END $$;

-- Migration: add 'is_public_share' column to songs
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'songs' AND column_name = 'is_public_share'
    ) THEN
        ALTER TABLE songs ADD COLUMN is_public_share BOOLEAN NOT NULL DEFAULT FALSE;
        RAISE NOTICE 'Added is_public_share column to songs';
    ELSE
        RAISE NOTICE 'is_public_share column already exists in songs, skipping';
    END IF;
END $$;

COMMIT;

RAISE NOTICE 'All migrations applied successfully';
