#!/bin/bash
# Setup script to create PostgreSQL role and database for AI Music

set -e

echo "Setting up PostgreSQL database for AI Music..."

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "Error: psql command not found. Please install PostgreSQL."
    exit 1
fi

# Create role and database
echo "Creating PostgreSQL role 'aimusic'..."
psql -U postgres -c "CREATE ROLE aimusic WITH LOGIN PASSWORD 'aimusic';" 2>/dev/null || echo "Role 'aimusic' may already exist, continuing..."

echo "Creating database 'aimusic'..."
psql -U postgres -c "CREATE DATABASE aimusic OWNER aimusic;" 2>/dev/null || echo "Database 'aimusic' may already exist, continuing..."

echo "Granting privileges..."
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE aimusic TO aimusic;" 2>/dev/null || true

echo "✅ Database setup complete!"
echo ""
echo "You can now start the backend server with:"
echo "  cd backend"
echo "  source .venv/bin/activate"
echo "  uvicorn app.main:app --reload"

