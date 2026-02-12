#!/bin/bash

# Test Registration Endpoint with curl
# Usage: ./test_registration_curl.sh

BASE_URL="http://localhost:8000"
ENDPOINT="${BASE_URL}/api/auth/register"

echo "=========================================="
echo "Testing Registration Endpoint"
echo "=========================================="
echo ""

# Test 1: Successful registration
echo "Test 1: Register a new user"
echo "----------------------------------------"
curl -X POST "${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "username": "testuser",
    "password": "testpassword123"
  }' \
  -w "\n\nHTTP Status: %{http_code}\n" \
  -s | jq '.' 2>/dev/null || cat

echo ""
echo ""

# Test 2: Register with different email (if first test succeeded)
echo "Test 2: Register another user"
echo "----------------------------------------"
curl -X POST "${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user2@example.com",
    "username": "user2",
    "password": "password456"
  }' \
  -w "\n\nHTTP Status: %{http_code}\n" \
  -s | jq '.' 2>/dev/null || cat

echo ""
echo ""

# Test 3: Duplicate email (should fail)
echo "Test 3: Try to register with duplicate email (should fail)"
echo "----------------------------------------"
curl -X POST "${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "username": "anotheruser",
    "password": "password789"
  }' \
  -w "\n\nHTTP Status: %{http_code}\n" \
  -s | jq '.' 2>/dev/null || cat

echo ""
echo ""

# Test 4: Missing fields (should fail)
echo "Test 4: Register with missing fields (should fail)"
echo "----------------------------------------"
curl -X POST "${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "incomplete@example.com"
  }' \
  -w "\n\nHTTP Status: %{http_code}\n" \
  -s | jq '.' 2>/dev/null || cat

echo ""
echo "=========================================="
echo "Tests completed"
echo "=========================================="

