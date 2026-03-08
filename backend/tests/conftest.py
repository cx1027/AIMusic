from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.database import engine
from app.main import create_app
from app.models.user import User


@pytest.fixture(scope="function")
def cleanup_test_users():
    yield
    with Session(engine) as session:
        test_users = session.exec(select(User).where(User.email.like("test%@example.com"))).all()
        for user in test_users:
            session.delete(user)
        session.commit()


@pytest.fixture
def app():
    return create_app()


@pytest.fixture
def client(app, cleanup_test_users):
    return TestClient(app)


@pytest.fixture
def test_user(client: TestClient) -> tuple[User, str]:
    # Register + login, return (User, access_token)
    r = client.post(
        "/api/auth/register",
        json={"email": "testmusic@example.com", "username": "testmusic", "password": "testpassword123"},
    )
    assert r.status_code == 200

    login = client.post("/api/auth/login", json={"email": "testmusic@example.com", "password": "testpassword123"})
    assert login.status_code == 200
    token = login.json()["access_token"]

    with Session(engine) as session:
        user = session.exec(select(User).where(User.email == "testmusic@example.com")).first()
        assert user is not None
    return user, token

