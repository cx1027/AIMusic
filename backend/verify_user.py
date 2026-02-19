#!/usr/bin/env python3
"""
Utility script to verify users in the database and check passwords.
Usage:
    python verify_user.py <email> [password]
    python verify_user.py --list-all
    python verify_user.py --check-email <email>
"""

from __future__ import annotations

import sys
import bcrypt
from sqlalchemy import text

from app.core.database import get_session
from app.models.user import User


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against a bcrypt hash."""
    password_bytes = password.encode('utf-8')
    # Truncate if necessary for verification (bcrypt has 72-byte limit)
    if len(password_bytes) > 72:
        password_bytes = password_bytes[:72]
    hash_bytes = password_hash.encode('utf-8')
    return bcrypt.checkpw(password_bytes, hash_bytes)


def list_all_users():
    """List all users in the database."""
    print("\n=== All Users in Database ===\n")
    with get_session() as db:
        sql_query = text("SELECT id, email, username, subscription_tier, credits_balance, created_at FROM users ORDER BY created_at DESC")
        result = db.execute(sql_query)
        users = result.fetchall()
        
        if not users:
            print("No users found in database.")
            return
        
        print(f"Total users: {len(users)}\n")
        for row in users:
            user_id, email, username, tier, credits, created_at = row
            print(f"ID: {user_id}")
            print(f"  Email: {email}")
            print(f"  Username: {username}")
            print(f"  Tier: {tier}")
            print(f"  Credits: {credits}")
            print(f"  Created: {created_at}")
            print()


def check_user_by_email(email: str):
    """Check if a user exists by email."""
    normalized_email = email.lower().strip()
    print(f"\n=== Checking User: {normalized_email} ===\n")
    
    with get_session() as db:
        sql_query = text("SELECT id FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(:email)) LIMIT 1")
        result = db.execute(sql_query, {"email": normalized_email})
        row = result.fetchone()
        
        if row:
            user_id = row[0]
            user = db.get(User, user_id)
            if user:
                print(f"✓ User found!")
                print(f"  ID: {user.id}")
                print(f"  Email: {user.email}")
                print(f"  Username: {user.username}")
                print(f"  Subscription Tier: {user.subscription_tier}")
                print(f"  Credits: {user.credits_balance}")
                print(f"  Created: {user.created_at}")
                print(f"  Password Hash: {user.password_hash[:50]}... (truncated)")
                return user
        else:
            print(f"✗ User not found for email: {normalized_email}")
            return None


def verify_user_password(email: str, password: str):
    """Verify a user exists and check if the password is correct."""
    normalized_email = email.lower().strip()
    print(f"\n=== Verifying User and Password ===\n")
    print(f"Email: {normalized_email}")
    print(f"Password: {'*' * len(password)} (length: {len(password)})\n")
    
    with get_session() as db:
        # Find user by email
        sql_query = text("SELECT id FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(:email)) LIMIT 1")
        result = db.execute(sql_query, {"email": normalized_email})
        row = result.fetchone()
        
        if not row:
            print(f"✗ User not found for email: {normalized_email}")
            return False
        
        user_id = row[0]
        user = db.get(User, user_id)
        
        if not user:
            print(f"✗ Could not retrieve user with ID: {user_id}")
            return False
        
        print(f"✓ User found!")
        print(f"  ID: {user.id}")
        print(f"  Email: {user.email}")
        print(f"  Username: {user.username}\n")
        
        # Verify password
        print("Verifying password...")
        is_valid = verify_password(password, user.password_hash)
        
        if is_valid:
            print("✓ Password is CORRECT!")
            return True
        else:
            print("✗ Password is INCORRECT!")
            print(f"\nDebug info:")
            print(f"  Password hash length: {len(user.password_hash)}")
            print(f"  Password hash starts with: {user.password_hash[:20]}...")
            return False


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "--list-all":
        list_all_users()
    elif command == "--check-email":
        if len(sys.argv) < 3:
            print("Error: --check-email requires an email address")
            sys.exit(1)
        check_user_by_email(sys.argv[2])
    else:
        # Assume it's an email, and optionally a password
        email = command
        password = sys.argv[2] if len(sys.argv) > 2 else None
        
        if password:
            verify_user_password(email, password)
        else:
            check_user_by_email(email)
            print("\nTo verify password, run:")
            print(f"  python verify_user.py {email} <password>")


if __name__ == "__main__":
    main()

