#!/usr/bin/env python3
"""Quick test script to trigger the breakpoint in the register endpoint."""

import requests
import json

# Test registration request
url = "http://127.0.0.1:8000/api/auth/register"
payload = {
    "email": "test@example.com",
    "username": "testuser",
    "password": "testpass123"
}

print("Sending registration request to trigger breakpoint...")
print(f"URL: {url}")
print(f"Payload: {json.dumps(payload, indent=2)}")
print("\n" + "="*50)
print("The server should pause at the breakpoint() call.")
print("Check your server terminal for the (Pdb) prompt.")
print("="*50 + "\n")

try:
    response = requests.post(url, json=payload, timeout=10)
    print(f"Response Status: {response.status_code}")
    print(f"Response Body: {response.text}")
except requests.exceptions.ConnectionError:
    print("ERROR: Could not connect to server. Make sure the server is running on port 8000.")
except requests.exceptions.Timeout:
    print("ERROR: Request timed out. The server may be paused at the breakpoint.")
    print("This is expected! Check your server terminal for the (Pdb) prompt.")
except Exception as e:
    print(f"ERROR: {e}")

