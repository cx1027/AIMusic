#!/usr/bin/env python3
"""
Script to test database connection and execute raw SQL SELECT query
"""
from __future__ import annotations

import sys
from sqlalchemy import create_engine, text
from app.core.config import get_settings

def test_db_connection():
    """Test database connection and execute SELECT query"""
    settings = get_settings()
    print(f"Connecting to database: {settings.database_url}")
    
    # Create engine
    engine = create_engine(settings.database_url, pool_pre_ping=True)
    
    try:
        # Test connection
        with engine.connect() as conn:
            # Test basic connection
            result = conn.execute(text("SELECT 1"))
            print("✓ Database connection successful")
            
            # Check if users table exists
            result = conn.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'users'
                );
            """))
            table_exists = result.scalar()
            
            if not table_exists:
                print("✗ Users table does not exist!")
                print("Run 'python -m app.core.database init_db' to create tables")
                return False
            
            print("✓ Users table exists")
            
            # Get table structure
            result = conn.execute(text("""
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_name = 'users'
                ORDER BY ordinal_position;
            """))
            print("\nUsers table structure:")
            for row in result:
                print(f"  - {row[0]}: {row[1]} (nullable: {row[2]})")
            
            # Count users
            result = conn.execute(text("SELECT COUNT(*) FROM users"))
            count = result.scalar()
            print(f"\n✓ Total users in database: {count}")
            
            # List all users
            if count > 0:
                result = conn.execute(text("SELECT id, email, username, created_at FROM users ORDER BY created_at DESC LIMIT 10"))
                print("\nRecent users:")
                for row in result:
                    print(f"  - {row[1]} ({row[2]}) - ID: {row[0]}")
            
            # Test the specific query that's failing
            print("\n" + "="*50)
            print("Testing email lookup query...")
            print("="*50)
            
            # Example email to test (you can modify this)
            test_email = "test@example.com"
            if len(sys.argv) > 1:
                test_email = sys.argv[1]
            
            print(f"Looking for user with email: {test_email}")
            
            # Raw SQL query equivalent to: select(User).where(User.email == normalized_email)
            query = text("SELECT * FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(:email))")
            result = conn.execute(query, {"email": test_email})
            user = result.fetchone()
            
            if user:
                print(f"✓ User found: {user[1]} ({user[2]})")
                return True
            else:
                print(f"✗ No user found with email: {test_email}")
                return True  # Query worked, just no user found
                
    except Exception as e:
        print(f"✗ Database connection failed: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        engine.dispose()

if __name__ == "__main__":
    success = test_db_connection()
    sys.exit(0 if success else 1)

