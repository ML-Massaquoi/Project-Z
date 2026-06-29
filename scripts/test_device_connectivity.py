"""
Project Z - Device Connectivity Test Script
Run this to verify the backend can receive ADMS traffic.

Usage:
    python scripts/test_device_connectivity.py
"""

import socket
import subprocess
import platform
import sys

def check_port(port, host="127.0.0.1"):
    """Check if a port is listening."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(2)
            result = s.connect_ex((host, port))
            return result == 0
    except Exception:
        return False

def get_local_ip():
    """Get the primary LAN IP."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "Unknown"

def test_http(url):
    """Test HTTP endpoint."""
    import urllib.request
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, resp.read().decode()
    except Exception as e:
        return None, str(e)

def main():
    print("=" * 60)
    print("  PROJECT Z - DEVICE CONNECTIVITY TEST")
    print("=" * 60)
    print()

    hostname = socket.gethostname()
    local_ip = get_local_ip()

    print(f"  Hostname:     {hostname}")
    print(f"  Local IP:     {local_ip}")
    print(f"  Platform:     {platform.platform()}")
    print()

    # Check ports
    print("  PORT CHECKS:")
    port_8000 = check_port(8000)
    port_8081 = check_port(8081)
    port_3000 = check_port(3000)
    print(f"    Port 8000 (Backend):    {'OPEN' if port_8000 else 'CLOSED'}")
    print(f"    Port 8081 (ADMS Proxy): {'OPEN' if port_8081 else 'CLOSED'}")
    print(f"    Port 3000 (Frontend):   {'OPEN' if port_3000 else 'CLOSED'}")
    print()

    if not port_8000:
        print("  ERROR: Backend is not listening on port 8000!")
        print("  Start the backend first: cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000")
        return 1

    if not port_8081:
        print("  WARNING: Port 8081 is not listening.")
        print("  Device ADMS traffic may not reach the backend.")
        print("  Create portproxy: netsh interface portproxy add v4tov4 listenport=8081 listenaddress=0.0.0.0 connectport=8000 connectaddress=127.0.0.1")
        print()

    # Test HTTP endpoints
    print("  HTTP TESTS:")

    status, body = test_http(f"http://127.0.0.1:8000/")
    print(f"    GET /                    : {status or 'FAILED'} - {body[:50] if body else ''}")

    status, body = test_http(f"http://127.0.0.1:8000/adms/status")
    print(f"    GET /adms/status         : {status or 'FAILED'} - {body[:50] if body else ''}")

    status, body = test_http(f"http://127.0.0.1:8000/iclock/getrequest?SN=TEST")
    print(f"    GET /iclock/getrequest   : {status or 'FAILED'} - {body[:50] if body else ''}")

    status, body = test_http(f"http://172.16.40.19:8081/iclock/getrequest?SN=TEST")
    print(f"    GET via 8081 proxy       : {status or 'FAILED'} - {body[:50] if body else ''}")
    print()

    # Test device connectivity
    print("  DEVICE CONNECTIVITY:")
    print(f"    Device 172.16.40.12 ping: ", end="")
    try:
        result = subprocess.run(
            ["ping", "-n", "1", "-w", "1000", "172.16.40.12"],
            capture_output=True, text=True, timeout=5,
            creationflags=subprocess.CREATE_NO_WINDOW if platform.system() == "Windows" else 0,
        )
        if "Reply from" in result.stdout:
            print("OK")
        else:
            print("FAILED")
    except Exception:
        print("ERROR (could not run ping)")
    print()

    # Device configuration reminder
    print("=" * 60)
    print("  DEVICE CONFIGURATION REQUIRED:")
    print("=" * 60)
    print(f"    Server IP:   172.16.40.19")
    print(f"    ADMS Port:   8081")
    print(f"    Protocol:    HTTP")
    print(f"    Push Path:   /iclock/cdata?SN=<serial>&table=ATTLOG")
    print(f"    Heartbeat:   /iclock/getrequest?SN=<serial>")
    print()
    print("  After configuring the device, check backend logs for:")
    print("    [DEVICE CONNECTED]")
    print("    [HEARTBEAT]")
    print("    [SCAN RECEIVED]")
    print("=" * 60)

    return 0

if __name__ == "__main__":
    sys.exit(main())
