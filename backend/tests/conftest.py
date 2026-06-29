"""
Project Z - Test Configuration
Pytest fixtures for backend testing.
"""

import asyncio
import os
from typing import AsyncGenerator, Generator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

# Set test environment before importing app
os.environ["APP_ENV"] = "testing"
os.environ["DATABASE_URL"] = "postgresql+asyncpg://projectz:projectz_secret@localhost:5432/projectz_test"
os.environ["DATABASE_URL_SYNC"] = "postgresql://projectz:projectz_secret@localhost:5432/projectz_test"
os.environ["REDIS_URL"] = "redis://localhost:6379/1"
os.environ["SECRET_KEY"] = "test-secret-key-for-testing-only"
os.environ["DEFAULT_ADMIN_PASSWORD"] = "TestAdmin123!"


@pytest.fixture(scope="session")
def event_loop() -> Generator:
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def app():
    """Create the FastAPI application for testing."""
    from app.main import app as fastapi_app
    yield fastapi_app


@pytest_asyncio.fixture(scope="session")
async def client(app) -> AsyncGenerator[AsyncClient, None]:
    """Create an async HTTP client for testing."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture(scope="function")
async def db_session():
    """Create a test database session."""
    from app.database.session import async_session_factory

    async with async_session_factory() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def auth_headers(client: AsyncClient) -> dict:
    """Get authentication headers for a test user."""
    # Login as admin
    response = await client.post(
        "/api/v1/auth/login",
        json={
            "username": "admin",
            "password": "TestAdmin123!",
        },
    )
    if response.status_code == 200:
        data = response.json()
        token = data.get("access_token")
        if token:
            return {"Authorization": f"Bearer {token}"}
    # Fallback - return empty headers (tests should handle auth failure)
    return {}


@pytest.fixture
def sample_employee_data() -> dict:
    """Sample employee data for testing."""
    return {
        "employee_code": "EMP001",
        "full_name": "Test Employee",
        "email": "test@example.com",
        "phone": "+23212345678",
        "position": "Officer",
        "status": "active",
    }


@pytest.fixture
def sample_device_data() -> dict:
    """Sample device data for testing."""
    return {
        "serial_number": "TEST-SN-001",
        "name": "Test Device",
        "ip_address": "172.16.40.100",
        "model": "ZMM220_TFT",
        "platform": "ZMM220_TFT",
    }
