from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.main import create_app
from app.core.database import engine, get_session
from app.models.user import User


@pytest.fixture(scope="function")
def cleanup_test_users():
    """Cleanup test users after each test."""
    yield
    # Cleanup: delete test users
    with Session(engine) as session:
        test_users = session.exec(select(User).where(User.email.like("test%@example.com"))).all()
        for user in test_users:
            session.delete(user)
        session.commit()


@pytest.fixture
def app():
    """Create a test FastAPI app."""
    return create_app()


@pytest.fixture
def client(app, cleanup_test_users):
    """Create a test client."""
    return TestClient(app)


def test_register_success(client: TestClient):
    """Test successful user registration."""
    response = client.post(
        "/api/auth/register",
        json={
            "email": "test@example.com",
            "username": "testuser",
            "password": "testpassword123"
        }
    )
    
    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    assert data["email"] == "test@example.com"
    assert data["username"] == "testuser"
    assert "password" not in data  # Password should not be in response
    assert "password_hash" not in data  # Password hash should not be in response


def test_register_duplicate_email(client: TestClient):
    """Test registration with duplicate email."""
    # Register first user
    client.post(
        "/api/auth/register",
        json={
            "email": "test@example.com",
            "username": "testuser1",
            "password": "testpassword123"
        }
    )
    
    # Try to register with same email
    response = client.post(
        "/api/auth/register",
        json={
            "email": "test@example.com",
            "username": "testuser2",
            "password": "testpassword123"
        }
    )
    
    assert response.status_code == 400
    assert "already registered" in response.json()["detail"].lower()


def test_register_email_case_insensitive(client: TestClient):
    """Test that email registration is case-insensitive."""
    # Register with lowercase email
    client.post(
        "/api/auth/register",
        json={
            "email": "test@example.com",
            "username": "testuser1",
            "password": "testpassword123"
        }
    )
    
    # Try to register with uppercase email (should fail)
    response = client.post(
        "/api/auth/register",
        json={
            "email": "TEST@EXAMPLE.COM",
            "username": "testuser2",
            "password": "testpassword123"
        }
    )
    
    assert response.status_code == 400
    assert "already registered" in response.json()["detail"].lower()


def test_register_email_normalization(client: TestClient):
    """Test that email is normalized (lowercased and stripped) in database."""
    response = client.post(
        "/api/auth/register",
        json={
            "email": "  Test@Example.COM  ",
            "username": "testuser",
            "password": "testpassword123"
        }
    )
    
    assert response.status_code == 200
    data = response.json()
    # Email should be normalized in response
    assert data["email"] == "test@example.com"
    
    # Verify in database
    from app.core.database import get_session
    with get_session() as session:
        user = session.exec(select(User).where(User.email == "test@example.com")).first()
        assert user is not None
        assert user.email == "test@example.com"


def test_register_username_stripped(client: TestClient):
    """Test that username is stripped of whitespace."""
    response = client.post(
        "/api/auth/register",
        json={
            "email": "test2@example.com",
            "username": "  testuser  ",
            "password": "testpassword123"
        }
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "testuser"


def test_register_missing_fields(client: TestClient):
    """Test registration with missing required fields."""
    # Missing email
    response = client.post(
        "/api/auth/register",
        json={
            "username": "testuser",
            "password": "testpassword123"
        }
    )
    assert response.status_code == 422
    
    # Missing username
    response = client.post(
        "/api/auth/register",
        json={
            "email": "test@example.com",
            "password": "testpassword123"
        }
    )
    assert response.status_code == 422
    
    # Missing password
    response = client.post(
        "/api/auth/register",
        json={
            "email": "test@example.com",
            "username": "testuser"
        }
    )
    assert response.status_code == 422


def test_register_invalid_email_format(client: TestClient):
    """Test registration with invalid email format."""
    response = client.post(
        "/api/auth/register",
        json={
            "email": "not-an-email",
            "username": "testuser",
            "password": "testpassword123"
        }
    )
    # FastAPI/Pydantic should validate email format
    assert response.status_code == 422

