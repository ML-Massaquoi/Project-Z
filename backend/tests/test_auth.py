"""
Project Z - Auth Endpoint Tests
Tests for authentication and authorization.
"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_login_missing_credentials(client: AsyncClient):
    """Test login with missing credentials returns error."""
    response = await client.post(
        "/api/v1/auth/login",
        json={},
    )
    assert response.status_code in (400, 422, 401)


@pytest.mark.asyncio
async def test_login_invalid_credentials(client: AsyncClient):
    """Test login with invalid credentials returns error."""
    response = await client.post(
        "/api/v1/auth/login",
        json={
            "username": "nonexistent_user",
            "password": "wrong_password",
        },
    )
    assert response.status_code in (401, 400)


@pytest.mark.asyncio
async def test_me_requires_auth(client: AsyncClient):
    """Test that /me endpoint requires authentication."""
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_me_with_valid_token(client: AsyncClient, auth_headers: dict):
    """Test /me endpoint with valid authentication."""
    if not auth_headers:
        pytest.skip("Authentication not available")
    
    response = await client.get(
        "/api/v1/auth/me",
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "username" in data
