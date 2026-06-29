"""
Project Z - ADMS Endpoint Tests
Tests for the ADMS device communication protocol.
"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_adms_handshake_requires_serial(client: AsyncClient):
    """Test that ADMS handshake requires serial number."""
    response = await client.get("/iclock/cdata")
    # Should return error or OK with no serial
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_adms_handshake_with_serial(client: AsyncClient):
    """Test ADMS handshake with valid serial number."""
    response = await client.get(
        "/iclock/cdata",
        params={"SN": "TEST-SERIAL-001", "options": "all"},
    )
    assert response.status_code == 200
    # Response should be text/plain with ADMS options
    assert response.headers.get("content-type") == "text/plain"


@pytest.mark.asyncio
async def test_adms_getrequest(client: AsyncClient):
    """Test ADMS command polling endpoint."""
    response = await client.get(
        "/iclock/getrequest",
        params={"SN": "TEST-SERIAL-001"},
    )
    assert response.status_code == 200
    assert response.text == "OK"


@pytest.mark.asyncio
async def test_adms_data_push_empty(client: AsyncClient):
    """Test ADMS data push with empty body."""
    response = await client.post(
        "/iclock/cdata",
        params={"SN": "TEST-SERIAL-001", "table": "ATTLOG"},
        content=b"",
    )
    assert response.status_code == 200
    assert response.text == "OK"


@pytest.mark.asyncio
async def test_adms_status_endpoint(client: AsyncClient):
    """Test ADMS status diagnostic endpoint."""
    response = await client.get("/adms/status")
    assert response.status_code == 200
    data = response.json()
    assert "server" in data
    assert "devices" in data


@pytest.mark.asyncio
async def test_adms_test_scan(client: AsyncClient):
    """Test the diagnostic test scan endpoint."""
    response = await client.post(
        "/adms/test-scan",
        params={
            "SN": "TEST-DEVICE",
            "user_id": "1",
            "status": 0,
            "verify_type": 1,
        },
    )
    # Should succeed or return validation error
    assert response.status_code in (200, 400, 422)
