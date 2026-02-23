#!/usr/bin/env python3
"""
Simple script to check users in the database.
Usage:
    python check_users.py                    # List all users
    python check_users.py <email>            # Find user by email
    python check_users.py --username <name>  # Find user by username
"""
from __future__ import annotations

import sys
from sqlalchemy import create_engine, text
from app.core.config import get_settings

def list_all_users():
    """List all users with their information."""
    settings = get_settings()
    engine = create_engine(settings.database_url, pool_pre_ping=True)
    
    try:
        with engine.connect() as conn:
            result = conn.execute(text("""
                SELECT id, email, username, subscription_tier, credits_balance, created_at 
                FROM users 
                ORDER BY created_at DESC
            """))
            
            users = result.fetchall()
            
            if not users:
                print("No users found in database.")
                return
            
            print(f"\n=== All Users ({len(users)} total) ===\n")
            for row in users:
                user_id, email, username, tier, credits, created_at = row
                print(f"ID: {user_id}")
                print(f"  Email: {email}")
                print(f"  Username: {username}")
                print(f"  Subscription Tier: {tier}")
                print(f"  Credits: {credits}")
                print(f"  Created: {created_at}")
                print()
                
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        engine.dispose()


def find_user_by_email(email: str):
    """Find a user by email address."""
    settings = get_settings()
    engine = create_engine(settings.database_url, pool_pre_ping=True)
    
    try:
        with engine.connect() as conn:
            result = conn.execute(text("""
                SELECT id, email, username, password_hash, subscription_tier, credits_balance, created_at 
                FROM users 
                WHERE LOWER(TRIM(email)) = LOWER(TRIM(:email))
            """), {"email": email})
            
            user = result.fetchone()
            
            if user:
                user_id, email, username, password_hash, tier, credits, created_at = user
                print(f"\n=== User Found ===\n")
                print(f"ID: {user_id}")
                print(f"Email: {email}")
                print(f"Username: {username}")
                print(f"Subscription Tier: {tier}")
                print(f"Credits: {credits}")
                print(f"Created: {created_at}")
                print(f"Password Hash: {password_hash[:50]}... (truncated, length: {len(password_hash)})")
                print("\nNote: Password is hashed. Use verify_user.py to verify a password.")
            else:
                print(f"\n✗ User not found with email: {email}")
                
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        engine.dispose()


def find_user_by_username(username: str):
    """Find a user by username."""
    settings = get_settings()
    engine = create_engine(settings.database_url, pool_pre_ping=True)
    
    try:
        with engine.connect() as conn:
            result = conn.execute(text("""
                SELECT id, email, username, password_hash, subscription_tier, credits_balance, created_at 
                FROM users 
                WHERE username = :username
            """), {"username": username})
            
            user = result.fetchone()
            
            if user:
                user_id, email, username, password_hash, tier, credits, created_at = user
                print(f"\n=== User Found ===\n")
                print(f"ID: {user_id}")
                print(f"Email: {email}")
                print(f"Username: {username}")
                print(f"Subscription Tier: {tier}")
                print(f"Credits: {credits}")
                print(f"Created: {created_at}")
                print(f"Password Hash: {password_hash[:50]}... (truncated, length: {len(password_hash)})")
                print("\nNote: Password is hashed. Use verify_user.py to verify a password.")
            else:
                print(f"\n✗ User not found with username: {username}")
                
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        engine.dispose()


def main():
    if len(sys.argv) == 1:
        # No arguments - list all users
        list_all_users()
    elif len(sys.argv) == 2:
        if sys.argv[1] == "--help" or sys.argv[1] == "-h":
            print(__doc__)
        else:
            # Assume it's an email
            find_user_by_email(sys.argv[1])
    elif len(sys.argv) == 3 and sys.argv[1] == "--username":
        find_user_by_username(sys.argv[2])
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
