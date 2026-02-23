# Database Access Guide - Check Usernames and Passwords

This guide shows you how to access the PostgreSQL database to check usernames and passwords.

## Database Connection Info

- **Database Type**: PostgreSQL
- **Default Connection**: `postgresql+psycopg://aimusic:aimusic@localhost:5432/aimusic`
- **Username**: `aimusic`
- **Password**: `aimusic`
- **Database Name**: `aimusic`
- **Port**: `5432`

## Method 1: Using the Existing Verification Script (Recommended)

The project includes a `verify_user.py` script that can check users and verify passwords.

### List All Users
```bash
cd backend
python verify_user.py --list-all
```

### Check a Specific User by Email
```bash
cd backend
python verify_user.py --check-email user@example.com
```

### Verify a User's Password
```bash
cd backend
python verify_user.py user@example.com password123
```

This will:
- Find the user by email
- Display user information (ID, email, username, etc.)
- Verify if the provided password matches the stored hash

## Method 2: Direct PostgreSQL Access (psql)

### Connect to the Database
```bash
psql -h localhost -U aimusic -d aimusic
# When prompted, enter password: aimusic
```

### Useful SQL Queries

#### List All Users (with usernames and emails)
```sql
SELECT id, email, username, subscription_tier, credits_balance, created_at 
FROM users 
ORDER BY created_at DESC;
```

#### Find User by Email
```sql
SELECT id, email, username, password_hash, subscription_tier, credits_balance 
FROM users 
WHERE LOWER(TRIM(email)) = LOWER(TRIM('user@example.com'));
```

#### Find User by Username
```sql
SELECT id, email, username, password_hash, subscription_tier, credits_balance 
FROM users 
WHERE username = 'username_here';
```

#### View Password Hash (for debugging)
```sql
SELECT email, username, 
       SUBSTRING(password_hash, 1, 50) as password_hash_preview,
       LENGTH(password_hash) as hash_length
FROM users;
```

**Note**: Passwords are stored as bcrypt hashes, so you cannot see the plain text password. You can only verify if a password matches using the verification script.

## Method 3: Using Python Script with Direct SQL

Create a simple Python script to query the database:

```python
#!/usr/bin/env python3
from sqlalchemy import create_engine, text
from app.core.config import get_settings

settings = get_settings()
engine = create_engine(settings.database_url, pool_pre_ping=True)

with engine.connect() as conn:
    # List all users
    result = conn.execute(text("""
        SELECT id, email, username, subscription_tier, credits_balance, created_at 
        FROM users 
        ORDER BY created_at DESC
    """))
    
    print("\n=== All Users ===")
    for row in result:
        print(f"ID: {row[0]}")
        print(f"  Email: {row[1]}")
        print(f"  Username: {row[2]}")
        print(f"  Tier: {row[3]}")
        print(f"  Credits: {row[4]}")
        print(f"  Created: {row[5]}")
        print()
```

## Method 4: Using Docker (if database is in Docker)

If you're using Docker Compose:

```bash
# Connect to the PostgreSQL container
docker-compose exec postgres psql -U aimusic -d aimusic

# Then run SQL queries as shown in Method 2
```

## Important Security Notes

1. **Passwords are hashed**: Passwords are stored as bcrypt hashes, not plain text. You cannot retrieve the original password.

2. **Password Verification**: To verify if a password is correct, use the `verify_user.py` script which uses bcrypt to compare the password against the hash.

3. **Database Credentials**: The default credentials (`aimusic:aimusic`) are for development only. Change them in production!

## Quick Reference Commands

```bash
# List all users
cd backend && python verify_user.py --list-all

# Check specific user
cd backend && python verify_user.py --check-email user@example.com

# Verify password
cd backend && python verify_user.py user@example.com password123

# Direct psql access
psql -h localhost -U aimusic -d aimusic

# Docker access
docker-compose exec postgres psql -U aimusic -d aimusic
```
