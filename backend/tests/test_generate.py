from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.security import create_access_token
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


@pytest.fixture
def test_user(client: TestClient) -> tuple[User, str]:
    """Create a test user and return user object and access token."""
    # Register a test user
    response = client.post(
        "/api/auth/register",
        json={
            "email": "testgenerate@example.com",
            "username": "testgenerate",
            "password": "testpassword123"
        }
    )
    assert response.status_code == 200
    user_data = response.json()
    
    # Login to get token
    login_response = client.post(
        "/api/auth/login",
        json={
            "email": "testgenerate@example.com",
            "password": "testpassword123"
        }
    )
    assert login_response.status_code == 200
    token_data = login_response.json()
    access_token = token_data["access_token"]
    
    # Get user from database
    with Session(engine) as session:
        user = session.exec(select(User).where(User.email == "testgenerate@example.com")).first()
        assert user is not None
    
    return user, access_token


def test_generate_success(client: TestClient, test_user: tuple[User, str]):
    """Test successful music generation request."""
    user, token = test_user
    
    # Ensure user has credits
    with Session(engine) as session:
        user = session.get(User, user.id)
        user.credits_balance = 10
        session.add(user)
        session.commit()
    
    with patch("app.api.routes.generate.run_generation_task") as mock_task, \
         patch("app.api.routes.generate.init_task") as mock_init_task:
        mock_task.delay = MagicMock()
        mock_init_task.return_value = None
        
        response = client.post(
            "/api/generate",
            json={
                "prompt": "A happy upbeat song",
                "duration": 30,
                "lyrics": None
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 201
        data = response.json()
        assert "task_id" in data
        assert "events_url" in data
        assert data["events_url"] == f"/api/generate/events/{data['task_id']}"
        
        # Verify task was initialized
        mock_init_task.assert_called_once()
        # Verify task was queued
        mock_task.delay.assert_called_once()
        call_kwargs = mock_task.delay.call_args.kwargs
        assert "task_id" in call_kwargs
        assert call_kwargs["user_id"] == str(user.id)
        assert call_kwargs["prompt"] == "A happy upbeat song"
        assert call_kwargs["duration"] == 30
        assert call_kwargs["lyrics"] is None


def test_generate_with_lyrics(client: TestClient, test_user: tuple[User, str]):
    """Test generation with lyrics provided."""
    user, token = test_user
    
    # Ensure user has credits
    with Session(engine) as session:
        user = session.get(User, user.id)
        user.credits_balance = 10
        session.add(user)
        session.commit()
    
    with patch("app.api.routes.generate.run_generation_task") as mock_task, \
         patch("app.api.routes.generate.init_task") as mock_init_task:
        mock_task.delay = MagicMock()
        mock_init_task.return_value = None
        
        response = client.post(
            "/api/generate",
            json={
                "prompt": "A sad ballad",
                "duration": 60,
                "lyrics": "These are some test lyrics"
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 201
        data = response.json()
        assert "task_id" in data
        
        # Verify lyrics were passed
        call_kwargs = mock_task.delay.call_args.kwargs
        assert call_kwargs["lyrics"] == "These are some test lyrics"


def test_generate_missing_prompt(client: TestClient, test_user: tuple[User, str]):
    """Test generation with missing prompt."""
    user, token = test_user
    
    response = client.post(
        "/api/generate",
        json={
            "duration": 30
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 400
    assert "prompt is required" in response.json()["detail"]


def test_generate_empty_prompt(client: TestClient, test_user: tuple[User, str]):
    """Test generation with empty prompt."""
    user, token = test_user
    
    response = client.post(
        "/api/generate",
        json={
            "prompt": "   ",
            "duration": 30
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 400
    assert "prompt is required" in response.json()["detail"]


def test_generate_invalid_duration_string(client: TestClient, test_user: tuple[User, str]):
    """Test generation with invalid duration (string)."""
    user, token = test_user
    
    response = client.post(
        "/api/generate",
        json={
            "prompt": "Test song",
            "duration": "not-a-number"
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 400
    assert "duration must be an integer" in response.json()["detail"]


def test_generate_duration_too_low(client: TestClient, test_user: tuple[User, str]):
    """Test generation with duration too low."""
    user, token = test_user
    
    response = client.post(
        "/api/generate",
        json={
            "prompt": "Test song",
            "duration": 0
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 400
    assert "duration out of range" in response.json()["detail"]


def test_generate_duration_too_high(client: TestClient, test_user: tuple[User, str]):
    """Test generation with duration too high."""
    user, token = test_user
    
    response = client.post(
        "/api/generate",
        json={
            "prompt": "Test song",
            "duration": 301
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 400
    assert "duration out of range" in response.json()["detail"]


def test_generate_default_duration(client: TestClient, test_user: tuple[User, str]):
    """Test generation with default duration when not provided."""
    user, token = test_user
    
    # Ensure user has credits
    with Session(engine) as session:
        user = session.get(User, user.id)
        user.credits_balance = 10
        session.add(user)
        session.commit()
    
    with patch("app.api.routes.generate.run_generation_task") as mock_task, \
         patch("app.api.routes.generate.init_task") as mock_init_task:
        mock_task.delay = MagicMock()
        mock_init_task.return_value = None
        
        response = client.post(
            "/api/generate",
            json={
                "prompt": "Test song"
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 201
        # Verify default duration of 30 was used
        call_kwargs = mock_task.delay.call_args.kwargs
        assert call_kwargs["duration"] == 30


def test_generate_insufficient_credits(client: TestClient, test_user: tuple[User, str]):
    """Test generation with insufficient credits."""
    user, token = test_user
    
    # Set credits to 0
    with Session(engine) as session:
        user = session.get(User, user.id)
        user.credits_balance = 0
        session.add(user)
        session.commit()
    
    response = client.post(
        "/api/generate",
        json={
            "prompt": "Test song",
            "duration": 30
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 402
    assert "Insufficient credits" in response.json()["detail"]


def test_generate_credits_deducted(client: TestClient, test_user: tuple[User, str]):
    """Test that credits are deducted when generation starts."""
    user, token = test_user
    
    # Set initial credits
    initial_credits = 5
    with Session(engine) as session:
        user = session.get(User, user.id)
        user.credits_balance = initial_credits
        session.add(user)
        session.commit()
        user_id = user.id
    
    with patch("app.api.routes.generate.run_generation_task") as mock_task, \
         patch("app.api.routes.generate.init_task") as mock_init_task:
        mock_task.delay = MagicMock()
        mock_init_task.return_value = None
        
        response = client.post(
            "/api/generate",
            json={
                "prompt": "Test song",
                "duration": 30
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 201
        
        # Verify credits were deducted
        with Session(engine) as session:
            user = session.get(User, user_id)
            assert user.credits_balance == initial_credits - 1


def test_generate_requires_authentication(client: TestClient):
    """Test that generation requires authentication."""
    response = client.post(
        "/api/generate",
        json={
            "prompt": "Test song",
            "duration": 30
        }
    )
    
    assert response.status_code == 401


def test_generate_invalid_token(client: TestClient):
    """Test generation with invalid token."""
    response = client.post(
        "/api/generate",
        json={
            "prompt": "Test song",
            "duration": 30
        },
        headers={"Authorization": "Bearer invalid-token"}
    )
    
    assert response.status_code == 401


def test_generate_events_requires_authentication(client: TestClient):
    """Test that events endpoint requires authentication."""
    response = client.get("/api/generate/events/some-task-id")
    
    assert response.status_code == 401


def test_generate_events_not_found(client: TestClient, test_user: tuple[User, str]):
    """Test events endpoint with non-existent task."""
    user, token = test_user
    
    # Mock Redis to return None (task not found)
    with patch("app.api.routes.generate.get_task", return_value=None):
        response = client.get(
            "/api/generate/events/non-existent-task-id",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        # SSE endpoint should return 200 but with error event
        assert response.status_code == 200


def test_generate_events_wrong_user(client: TestClient, test_user: tuple[User, str]):
    """Test events endpoint with task belonging to different user."""
    user, token = test_user
    
    # Create another user
    response = client.post(
        "/api/auth/register",
        json={
            "email": "testgenerate2@example.com",
            "username": "testgenerate2",
            "password": "testpassword123"
        }
    )
    assert response.status_code == 200
    other_user_data = response.json()
    
    # Mock task belonging to other user
    fake_task_state = {
        "task_id": "some-task-id",
        "user_id": str(other_user_data["id"]),
        "status": "running",
        "progress": 50,
        "message": "generating"
    }
    
    with patch("app.api.routes.generate.get_task", return_value=fake_task_state):
        response = client.get(
            "/api/generate/events/some-task-id",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        # Should return 200 but with error event
        assert response.status_code == 200

