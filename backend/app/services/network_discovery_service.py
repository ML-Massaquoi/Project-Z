"""
Network Discovery Service.

Scans configured network ranges to detect ZKTeco-compatible biometric devices.
Uses TCP connect to port 4370 (SDK) to identify devices, then queries device info.
"""

import asyncio
import ipaddress
import logging
import time
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import async_session_factory
from app.models.device import Device

logger = logging.getLogger(__name__)

# ZKTeco default SDK port
ZKTECO_SDK_PORT = 4370
# Connection timeout per host (seconds)
CONNECT_TIMEOUT = 1.5
# Max concurrent scans
MAX_CONCURRENCY = 50


async def _probe_host(ip: str, port: int = ZKTECO_SDK_PORT, timeout: float = CONNECT_TIMEOUT) -> Optional[dict]:
    """
    Try to connect to a host on the ZKTeco SDK port.
    Returns device info dict if successful, None otherwise.
    """
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(ip, port),
            timeout=timeout,
        )
        # Connection succeeded — this is likely a ZKTeco device
        writer.close()
        await writer.wait_closed()
        return {"ip": ip, "port": port, "reachable": True}
    except (asyncio.TimeoutError, ConnectionRefusedError, OSError, ValueError):
        return None


async def _get_device_info_via_sdk(ip: str, port: int = ZKTECO_SDK_PORT) -> Optional[dict]:
    """
    Connect to a discovered device and pull basic info via pyzk.
    Returns device metadata or None.
    """
    from app.services.sdk_service import ZKSDKService
    sdk = ZKSDKService(ip=ip, port=port, timeout=5)
    try:
        info = await asyncio.to_thread(sdk.get_device_info)
        return {
            "serial_number": info.get("serial_number", ""),
            "model": info.get("device_name", ""),
            "platform": info.get("platform", ""),
            "firmware_version": info.get("firmware_version", ""),
            "mac_address": info.get("mac_address", ""),
            "ip_address": ip,
            "sdk_port": port,
        }
    except Exception as e:
        logger.warning(f"SDK info query failed for {ip}: {e}")
        return None
    finally:
        try:
            await asyncio.to_thread(sdk.disconnect)
        except Exception:
            pass


async def scan_network_range(
    cidr: str,
    port: int = ZKTECO_SDK_PORT,
    progress_callback=None,
) -> dict:
    """
    Scan a CIDR range for ZKTeco devices.

    Returns:
        {
            "cidr": str,
            "scanned": int,
            "discovered": int,
            "devices": [
                {
                    "ip": str,
                    "port": int,
                    "serial_number": str,
                    "model": str,
                    "firmware_version": str,
                    "is_registered": bool,
                    "device_id": str | None,
                    "device_name": str | None,
                }
            ],
            "duration_ms": int,
        }
    """
    start_time = time.monotonic()

    try:
        network = ipaddress.ip_network(cidr, strict=False)
    except ValueError as e:
        return {"error": f"Invalid CIDR: {e}", "devices": [], "scanned": 0, "discovered": 0}

    ips = [str(ip) for ip in network.hosts()]
    total = len(ips)
    discovered_devices = []

    logger.info(f"Starting network scan of {cidr} ({total} hosts, port {port})")

    semaphore = asyncio.Semaphore(MAX_CONCURRENCY)
    scanned_count = 0

    async def _scan_one(ip: str):
        nonlocal scanned_count
        async with semaphore:
            result = await _probe_host(ip, port)
            scanned_count += 1
            if progress_callback and scanned_count % 10 == 0:
                await progress_callback(scanned_count, total)
            if result:
                # Try to get detailed info
                info = await _get_device_info_via_sdk(ip, port)
                serial = info.get("serial_number", "") if info else ""
                discovered_devices.append({
                    "ip": ip,
                    "port": port,
                    "serial_number": serial or f"unknown-{ip.split('.')[-1]}",
                    "model": info.get("model", "Unknown") if info else "Unknown",
                    "firmware_version": info.get("firmware_version", "") if info else "",
                    "platform": info.get("platform", "") if info else "",
                    "mac_address": info.get("mac_address", "") if info else "",
                })

    # Run all probes concurrently
    tasks = [_scan_one(ip) for ip in ips]
    await asyncio.gather(*tasks, return_exceptions=True)

    # Check which discovered devices are already registered
    async with async_session_factory() as session:
        existing_devices = (await session.execute(
            select(Device.serial_number, Device.id, Device.name)
        )).all()
        registered_map = {d[0]: {"id": str(d[1]), "name": d[2]} for d in existing_devices}

        for dev in discovered_devices:
            serial = dev.get("serial_number", "")
            if serial in registered_map:
                dev["is_registered"] = True
                dev["device_id"] = registered_map[serial]["id"]
                dev["device_name"] = registered_map[serial]["name"]
            else:
                dev["is_registered"] = False
                dev["device_id"] = None
                dev["device_name"] = None

    duration_ms = int((time.monotonic() - start_time) * 1000)
    logger.info(f"Scan complete: {len(discovered_devices)} devices found in {duration_ms}ms")

    return {
        "cidr": cidr,
        "scanned": total,
        "discovered": len(discovered_devices),
        "devices": discovered_devices,
        "duration_ms": duration_ms,
    }


async def quick_scan(ip_range: str = "172.16.40.0/24", port: int = ZKTECO_SDK_PORT) -> dict:
    """
    Quick scan — only TCP connect check (no SDK info query).
    Much faster for initial discovery.
    """
    start_time = time.monotonic()
    network = ipaddress.ip_network(ip_range, strict=False)
    ips = [str(ip) for ip in network.hosts()]
    total = len(ips)
    reachable = []

    semaphore = asyncio.Semaphore(MAX_CONCURRENCY * 2)

    async def _check(ip: str):
        async with semaphore:
            result = await _probe_host(ip, port, timeout=0.8)
            if result:
                reachable.append(ip)

    tasks = [_check(ip) for ip in ips]
    await asyncio.gather(*tasks, return_exceptions=True)

    discovered_devices = []
    for ip in sorted(reachable):
        info = await _get_device_info_via_sdk(ip, port)
        discovered_devices.append({
            "ip": ip,
            "port": port,
            "serial_number": info.get("serial_number", f"unknown-{ip.split('.')[-1]}") if info else f"unknown-{ip.split('.')[-1]}",
            "model": info.get("model", "Unknown") if info else "Unknown",
            "firmware_version": info.get("firmware_version", "") if info else "",
            "platform": info.get("platform", "") if info else "",
            "mac_address": info.get("mac_address", "") if info else "",
            "is_registered": False,
            "device_id": None,
            "device_name": None,
        })

    duration_ms = int((time.monotonic() - start_time) * 1000)
    return {
        "cidr": ip_range,
        "scanned": total,
        "discovered": len(discovered_devices),
        "devices": discovered_devices,
        "duration_ms": duration_ms,
    }
