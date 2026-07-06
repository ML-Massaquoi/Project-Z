#!/bin/bash
# ============================================
# Project Z - Fix Docker Network Issues
# ============================================
# Run this on the WSL2 Ubuntu server at /opt/project-z/
# It fixes DNS resolution and network issues for Docker containers
# ============================================

set -e

echo "============================================"
echo " Project Z - Docker Network Fix"
echo "============================================"
echo ""

# Step 1: Check current network state
echo "[1/6] Checking current Docker network state..."
docker network ls | grep projectz-network || echo "  Network 'projectz-network' not found - will be created by compose"
echo ""

# Step 2: Check if containers are running
echo "[2/6] Checking running containers..."
docker ps --filter "name=projectz" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""

# Step 3: Check DNS resolution inside the backend container
echo "[3/6] Testing DNS resolution from backend container..."
BACKEND_CONTAINER=$(docker ps --filter "name=projectz-backend" --format "{{.Names}}")
if [ -n "$BACKEND_CONTAINER" ]; then
    echo "  Testing 'postgres' resolution..."
    docker exec $BACKEND_CONTAINER sh -c "getent hosts postgres 2>/dev/null || nslookup postgres 2>/dev/null || echo '  FAILED - DNS not resolving postgres'"
    
    echo "  Testing 'redis' resolution..."
    docker exec $BACKEND_CONTAINER sh -c "getent hosts redis 2>/dev/null || nslookup redis 2>/dev/null || echo '  FAILED - DNS not resolving redis'"
    
    echo "  Testing Google DNS (external connectivity)..."
    docker exec $BACKEND_CONTAINER sh -c "getent hosts google.com 2>/dev/null || echo '  External DNS may not work'"
else
    echo "  Backend container not running"
fi
echo ""

# Step 4: Check Docker DNS configuration
echo "[4/6] Checking Docker daemon DNS config..."
if [ -f /etc/docker/daemon.json ]; then
    echo "  Current daemon.json:"
    cat /etc/docker/daemon.json
else
    echo "  No /etc/docker/daemon.json found - using defaults"
fi
echo ""

# Step 5: Check WSL2 DNS resolution
echo "[5/6] Checking WSL2 DNS..."
echo "  WSL2 resolv.conf:"
cat /etc/resolv.conf 2>/dev/null || echo "  No resolv.conf found"
echo ""
echo "  WSL2 hosts file:"
cat /etc/hosts | head -20
echo ""

# Step 6: Apply fixes
echo "[6/6] Applying fixes..."
echo ""

# Fix 1: Ensure Docker DNS is configured
if [ ! -f /etc/docker/daemon.json ]; then
    echo "  Creating /etc/docker/daemon.json with DNS settings..."
    sudo mkdir -p /etc/docker
    cat << 'EOF' | sudo tee /etc/docker/daemon.json
{
  "dns": ["8.8.8.8", "8.8.4.4", "1.1.1.1"],
  "dns-opts": ["attempts:5", "timeout:3"],
  "iptables": true,
  "ip-forward": true
}
EOF
    echo "  DNS config written. Restarting Docker..."
    sudo service docker restart || sudo systemctl restart docker
    echo "  Docker restarted. Wait 10s for daemon to initialize..."
    sleep 10
else
    echo "  daemon.json exists. Checking if DNS is configured..."
    if grep -q "dns" /etc/docker/daemon.json; then
        echo "  DNS already configured in daemon.json"
    else
        echo "  WARNING: daemon.json exists but may not have DNS configured"
        echo "  Consider adding: \"dns\": [\"8.8.8.8\", \"8.8.4.4\"]"
    fi
fi
echo ""

# Fix 2: Ensure WSL2 has proper DNS
echo "  Ensuring WSL2 has proper DNS resolution..."
if ! grep -q "8.8.8.8" /etc/resolv.conf 2>/dev/null; then
    echo "  Note: WSL2 may auto-generate resolv.conf. If DNS issues persist,"
    echo "  create /etc/wsl.conf with:"
    echo "    [network]"
    echo "    generateResolvConf = false"
    echo "  Then manually set /etc/resolv.conf"
fi
echo ""

# Fix 3: Recreate the Docker network if needed
echo "  Checking if projectz-network needs to be recreated..."
if docker network ls --filter "name=projectz-network" --format "{{.Name}}" | grep -q "projectz-network"; then
    echo "  Network exists. Checking if containers can communicate..."
    # Test connectivity between containers
    if [ -n "$BACKEND_CONTAINER" ]; then
        docker exec $BACKEND_CONTAINER sh -c "ping -c 1 -W 2 postgres >/dev/null 2>&1 && echo '  ✓ Backend can reach postgres' || echo '  ✗ Backend CANNOT reach postgres'"
        docker exec $BACKEND_CONTAINER sh -c "ping -c 1 -W 2 redis >/dev/null 2>&1 && echo '  ✓ Backend can reach redis' || echo '  ✗ Backend CANNOT reach redis'"
    fi
else
    echo "  Network does not exist - will be created when compose starts"
fi

echo ""
echo "============================================"
echo "  Diagnostic Complete!"
echo "============================================"
echo ""
echo "  If DNS resolution fails, the most common fix is:"
echo "  1. sudo mkdir -p /etc/docker && sudo tee /etc/docker/daemon.json << 'EOF'"
echo "  { \"dns\": [\"8.8.8.8\", \"8.8.4.4\"] }"
echo "  EOF"
echo "  2. sudo service docker restart"
echo "  3. docker compose down && docker compose up -d"
echo ""
echo "  If port forwarding fails from Windows:"
echo "  1. Run setup-wsl-portproxy.bat as Administrator on Windows"
echo "  2. This forwards 172.16.40.19:8000 → WSL2:8000 → Docker:8000"
echo ""