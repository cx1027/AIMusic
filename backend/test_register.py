#!/usr/bin/env python3
"""
Simple test script for the registration endpoint.
Run this while the server is running: uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

import httpx
import sys

BASE_URL = "http://127.0.0.1:8000"


def test_register_success():
    """Test successful user registration."""
    print("Testing successful registration...")
    response = httpx.post(
        f"{BASE_URL}/api/auth/register",
        json={
            "email": "test@example.com",
            "username": "testuser",
            "password": "testpassword123"
        }
    )
    
    if response.status_code == 200:
        data = response.json()
        assert "id" in data
        assert data["email"] == "test@example.com"
        assert data["username"] == "testuser"
        assert "password" not in data
        print("✓ Registration successful")
        return data
    else:
        try:
            error_detail = response.json().get("detail", response.text)
        except Exception:
            error_detail = response.text
        print(f"✗ Registration failed: {response.status_code}")
        print(f"  Error: {error_detail}")
        return None


def test_register_duplicate_email():
    """Test registration with duplicate email."""
    print("\nTesting duplicate email registration...")
    # First registration
    response1 = httpx.post(
        f"{BASE_URL}/api/auth/register",
        json={
            "email": "test2@example.com",
            "username": "testuser1",
            "password": "testpassword123"
        }
    )
    
    if response1.status_code != 200:
        try:
            error_detail = response1.json().get("detail", response1.text)
        except Exception:
            error_detail = response1.text
        print(f"✗ First registration failed: {response1.status_code}")
        print(f"  Error: {error_detail}")
        return False
    
    # Try duplicate
    response2 = httpx.post(
        f"{BASE_URL}/api/auth/register",
        json={
            "email": "test2@example.com",
            "username": "testuser2",
            "password": "testpassword123"
        }
    )
    
    if response2.status_code == 400 and "already registered" in response2.json().get("detail", "").lower():
        print("✓ Duplicate email correctly rejected")
        return True
    else:
        print(f"✗ Duplicate email test failed: {response2.status_code} - {response2.text}")
        return False


def test_register_email_case_insensitive():
    """Test that email registration is case-insensitive."""
    print("\nTesting case-insensitive email...")
    # Register with lowercase
    response1 = httpx.post(
        f"{BASE_URL}/api/auth/register",
        json={
            "email": "test3@example.com",
            "username": "testuser1",
            "password": "testpassword123"
        }
    )
    
    if response1.status_code != 200:
        try:
            error_detail = response1.json().get("detail", response1.text)
        except Exception:
            error_detail = response1.text
        print(f"✗ First registration failed: {response1.status_code}")
        print(f"  Error: {error_detail}")
        return False
    
    # Try with uppercase (should fail)
    response2 = httpx.post(
        f"{BASE_URL}/api/auth/register",
        json={
            "email": "TEST3@EXAMPLE.COM",
            "username": "testuser2",
            "password": "testpassword123"
        }
    )
    
    if response2.status_code == 400 and "already registered" in response2.json().get("detail", "").lower():
        print("✓ Case-insensitive email check works")
        return True
    else:
        try:
            error_detail = response2.json().get("detail", response2.text)
        except Exception:
            error_detail = response2.text
        print(f"✗ Case-insensitive test failed: {response2.status_code}")
        print(f"  Error: {error_detail}")
        return False


def test_register_email_normalization():
    """Test that email is normalized."""
    print("\nTesting email normalization...")
    response = httpx.post(
        f"{BASE_URL}/api/auth/register",
        json={
            "email": "  Test4@Example.COM  ",
            "username": "testuser",
            "password": "testpassword123"
        }
    )
    
    if response.status_code == 200:
        data = response.json()
        if data["email"] == "test4@example.com":
            print("✓ Email normalization works")
            return True
        else:
            print(f"✗ Email not normalized: got {data['email']}")
            return False
    else:
        try:
            error_detail = response.json().get("detail", response.text)
        except Exception:
            error_detail = response.text
        print(f"✗ Registration failed: {response.status_code}")
        print(f"  Error: {error_detail}")
        return False


def test_register_missing_fields():
    """Test registration with missing fields."""
    print("\nTesting missing fields validation...")
    
    # Missing email
    response = httpx.post(
        f"{BASE_URL}/api/auth/register",
        json={
            "username": "testuser",
            "password": "testpassword123"
        }
    )
    if response.status_code != 422:
        print(f"✗ Missing email validation failed: {response.status_code}")
        return False
    
    # Missing username
    response = httpx.post(
        f"{BASE_URL}/api/auth/register",
        json={
            "email": "test5@example.com",
            "password": "testpassword123"
        }
    )
    if response.status_code != 422:
        print(f"✗ Missing username validation failed: {response.status_code}")
        return False
    
    # Missing password
    response = httpx.post(
        f"{BASE_URL}/api/auth/register",
        json={
            "email": "test6@example.com",
            "username": "testuser"
        }
    )
    if response.status_code != 422:
        print(f"✗ Missing password validation failed: {response.status_code}")
        return False
    
    print("✓ Field validation works")
    return True


def main():
    """Run all tests."""
    print("=" * 60)
    print("Testing Registration Endpoint: http://127.0.0.1:8000/api/auth/register")
    print("=" * 60)
    
    try:
        # Check if server is running
        response = httpx.get(f"{BASE_URL}/health", timeout=2.0)
        if response.status_code != 200:
            print("✗ Server health check failed")
            sys.exit(1)
    except Exception as e:
        print(f"✗ Cannot connect to server at {BASE_URL}")
        print(f"  Make sure the server is running: uvicorn app.main:app --reload --port 8000")
        sys.exit(1)
    
    results = []
    results.append(("Successful registration", test_register_success()))
    results.append(("Duplicate email", test_register_duplicate_email()))
    results.append(("Case-insensitive email", test_register_email_case_insensitive()))
    results.append(("Email normalization", test_register_email_normalization()))
    results.append(("Missing fields validation", test_register_missing_fields()))
    
    print("\n" + "=" * 60)
    print("Test Results:")
    print("=" * 60)
    passed = sum(1 for _, result in results if result)
    total = len(results)
    for name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"{status}: {name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    if passed == total:
        print("🎉 All tests passed!")
        sys.exit(0)
    else:
        print("❌ Some tests failed")
        sys.exit(1)


if __name__ == "__main__":
    main()

