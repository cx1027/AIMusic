-- ============================================================
-- Complete schema creation for AIMusic app
-- Run this ONCE from Railway SQL Editor to bootstrap the DB.
-- Safe to re-run: every CREATE TABLE uses IF NOT EXISTS.
-- ============================================================

-- 1. users
CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       VARCHAR(255) NOT NULL,
    username    VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    subscription_tier VARCHAR(50) NOT NULL DEFAULT 'free',
    credits_balance INTEGER NOT NULL DEFAULT 1000,
    avatar_url       VARCHAR(500),
    background_url   VARCHAR(500),
    details          VARCHAR(2000) DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email     ON users (email);
CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username  ON users (username);
CREATE INDEX IF NOT EXISTS ix_users_subscription_tier ON users (subscription_tier);

-- 2. songs
CREATE TABLE IF NOT EXISTS songs (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title          VARCHAR(255) NOT NULL DEFAULT 'Untitled',
    prompt         TEXT NOT NULL DEFAULT '',
    o3ics          TEXT,
    audio_url      VARCHAR(500),
    cover_image_url VARCHAR(500),
    duration       INTEGER NOT NULL DEFAULT 30,
    genre          VARCHAR(100),
    bpm            INTEGER,
    is_public      BOOLEAN NOT NULL DEFAULT FALSE,
    play_count     INTEGER NOT NULL DEFAULT 0,
    like_count     INTEGER NOT NULL DEFAULT 0,
    share_slug     VARCHAR(255),
    is_public_share BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_songs_user_id   ON songs (user_id);
CREATE INDEX IF NOT EXISTS ix_songs_is_public  ON songs (is_public);
CREATE UNIQUE INDEX IF NOT EXISTS ix_songs_share_slug ON songs (share_slug) WHERE share_slug IS NOT NULL;

-- 3. song_likes
CREATE TABLE IF NOT EXISTS song_likes (
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    song_id    UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, song_id)
);

CREATE INDEX IF NOT EXISTS ix_song_likes_user_id ON song_likes (user_id);
CREATE INDEX IF NOT EXISTS ix_song_likes_song_id ON song_likes (song_id);

-- 4. file_objects
CREATE TABLE IF NOT EXISTS file_objects (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key                VARCHAR(500) NOT NULL,
    content_type       VARCHAR(100) NOT NULL DEFAULT 'application/octet-stream',
    original_filename  VARCHAR(500),
    status             VARCHAR(50) NOT NULL DEFAULT 'draft',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_file_objects_user_id ON file_objects (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS ix_file_objects_key   ON file_objects (key);
CREATE INDEX IF NOT EXISTS ix_file_objects_status      ON file_objects (status);

-- 5. music_generation_tasks
CREATE TABLE IF NOT EXISTS music_generation_tasks (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    prompt            TEXT NOT NULL DEFAULT '',
    o3ics             TEXT,
    duration          INTEGER NOT NULL DEFAULT 30,
    status            VARCHAR(50) NOT NULL DEFAULT 'queued',
    progress          INTEGER NOT NULL DEFAULT 0,
    message           VARCHAR(500) NOT NULL DEFAULT 'queued',
    cancel_requested  BOOLEAN NOT NULL DEFAULT FALSE,
    celery_task_id    VARCHAR(255),
    result_song_id    UUID,
    result_audio_key  VARCHAR(500),
    error             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_music_gen_tasks_user_id          ON music_generation_tasks (user_id);
CREATE INDEX IF NOT EXISTS ix_music_gen_tasks_status            ON music_generation_tasks (status);
CREATE INDEX IF NOT EXISTS ix_music_gen_tasks_cancel_requested  ON music_generation_tasks (cancel_requested);
CREATE INDEX IF NOT EXISTS ix_music_gen_tasks_celery_task_id    ON music_generation_tasks (celery_task_id);
CREATE INDEX IF NOT EXISTS ix_music_gen_tasks_result_song_id    ON music_generation_tasks (result_song_id);

-- 6. user_follows
CREATE TABLE IF NOT EXISTS user_follows (
    follower_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (follower_id, following_id)
);

CREATE INDEX IF NOT EXISTS ix_user_follows_follower_id  ON user_follows (follower_id);
CREATE INDEX IF NOT EXISTS ix_user_follows_following_id ON user_follows (following_id);

-- 7. file_shares
CREATE TABLE IF NOT EXISTS file_shares (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_object_id UUID NOT NULL REFERENCES file_objects(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug          VARCHAR(255) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at    TIMESTAMPTZ,
    expires_at    TIMESTAMPTZ,
    access_count  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS ix_file_shares_file_object_id ON file_shares (file_object_id);
CREATE INDEX IF NOT EXISTS ix_file_shares_user_id        ON file_shares (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS ix_file_shares_slug      ON file_shares (slug);
CREATE INDEX IF NOT EXISTS ix_file_shares_revoked_at       ON file_shares (revoked_at);
CREATE INDEX IF NOT EXISTS ix_file_shares_expires_at      ON file_shares (expires_at);

-- 8. shares
CREATE TABLE IF NOT EXISTS shares (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    song_id    UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug       VARCHAR(255) NOT NULL,
    poster_url VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_shares_song_id  ON shares (song_id);
CREATE INDEX IF NOT EXISTS ix_shares_user_id  ON shares (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS ix_shares_slug ON shares (slug);

-- 9. playlists
CREATE TABLE IF NOT EXISTS playlists (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    description VARCHAR(1000),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_playlists_user_id ON playlists (user_id);

-- 10. playlist_songs
CREATE TABLE IF NOT EXISTS playlist_songs (
    playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    song_id     UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL DEFAULT 0,
    added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (playlist_id, song_id)
);

CREATE INDEX IF NOT EXISTS ix_playlist_songs_song_id  ON playlist_songs (song_id);
CREATE INDEX IF NOT EXISTS ix_playlist_songs_position ON playlist_songs (playlist_id, position);

-- 11. subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider            VARCHAR(50) NOT NULL DEFAULT 'stripe',
    status              VARCHAR(50) NOT NULL DEFAULT 'inactive',
    current_period_end  TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_subscriptions_user_id  ON subscriptions (user_id);
CREATE INDEX IF NOT EXISTS ix_subscriptions_provider ON subscriptions (provider);
CREATE INDEX IF NOT EXISTS ix_subscriptions_status   ON subscriptions (status);
