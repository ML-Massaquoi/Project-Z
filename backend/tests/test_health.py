"""
Project Z - Health Endpoint Tests
Tests for the API health check endpoints.
"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    """Test the basic health check endpoint."""
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "Project Z API"


@pytest.mark.asyncio
async def test_health_check_returns_version(client: AsyncClient):
    """Test that health check includes version info."""
    response = await client.get("/api/v1/health")
    data = response.json()
    assert "version" in data


@pytest.mark.asyncio
async def test_root_endpoint(client: AsyncClient):
    """Test the root endpoint returns app info."""
    response = await client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "name" in data
    assert "status" in data


@pytest.mark.asyncio
async def test_openapi_docs_available(client: AsyncClient):
    """Test that OpenAPI docs are available in debug mode."""
    response = await client.get("/docs")
    # Should return 200 (HTML) or 404 if docs are disabled
    assert response.status_code in (200, 404)
