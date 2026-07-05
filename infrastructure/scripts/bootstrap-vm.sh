#!/bin/bash
# ============================================
# Project Z - One-Shot VM Bootstrap
# Run this on a fresh Ubuntu 22.04 VM to
# deploy the full stack.
#
# Usage: curl -fsSL https://raw.githubusercontent.com/ML-Massaquoi/Project-Z/main/infrastructure/scripts/bootstrap-vm.sh | bash
# ============================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  Project Z - VM Bootstrap${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# ── Collect config ──────────────────────────
read -rp "VM IP address (e.g. 172.16.40.50): " VM_IP
read -rp "Organization name [Your Organization]: " ORG_NAME
ORG_NAME="${ORG_NAME:-Your Organization}"
read -rp "Timezone [Africa/Freetown]: " TIMEZONE
TIMEZONE="${TIMEZONE:-Africa/Freetown}"

# Generate secrets
POSTGRES_PASSWORD=$(openssl rand -base64 32)
SECRET_KEY=$(openssl rand -base64 64)
ADMIN_PASSWORD=$(openssl rand -base64 16)

echo ""
echo -e "${YELLOW}Generated secrets (save these!):${NC}"
echo -e "  POSTGRES_PASSWORD: ${CYAN}$POSTGRES_PASSWORD${NC}"
echo -e "  SECRET_KEY:        ${CYAN}$SECRET_KEY${NC}"
echo -e "  ADMIN_PASSWORD:    ${CYAN}$ADMIN_PASSWORD${NC}"
echo ""

# ── Install Docker ──────────────────────────
echo -e "${YELLOW}[1/5] Installing Docker...${NC}"
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"

# ── Clone repo ──────────────────────────────
echo -e "${YELLOW}[2/5] Cloning Project Z...${NC}"
sudo mkdir -p /opt/project-z
sudo chown "$USER:$USER" /opt/project-z
git clone https://github.com/ML-Massaquoi/Project-Z.git /opt/project-z
cd /opt/project-z

# ── Create .env ─────────────────────────────
echo -e "${YELLOW}[3/5] Creating environment config...${NC}"
cat > docker/.env << EOF
APP_ENV=production
DEBUG=false

POSTGRES_DB=projectz
POSTGRES_USER=projectz
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

REDIS_URL=redis://redis:6379/0

SECRET_KEY=${SECRET_KEY}
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7

ORG_NAME=${ORG_NAME}
ORG_COUNTRY=Sierra Leone
TIMEZONE=${TIMEZONE}

DUPLICATE_SCAN_WINDOW_SECONDS=60
DEFAULT_GRACE_PERIOD_MINUTES=15

DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_PASSWORD=${ADMIN_PASSWORD}
DEFAULT_ADMIN_EMAIL=admin@projectz.local

VITE_API_BASE_URL=http://${VM_IP}
VITE_WS_URL=ws://${VM_IP}/ws
EOF

# ── Generate SSL certs ──────────────────────
echo -e "${YELLOW}[4/5] Generating self-signed SSL certificates...${NC}"
bash infrastructure/scripts/generate-certs.sh

# ── Launch ──────────────────────────────────
echo -e "${YELLOW}[5/5] Building and starting services...${NC}"
docker compose --profile production up -d --build

# ── Verify ──────────────────────────────────
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "  Frontend:  ${CYAN}https://${VM_IP}${NC}"
echo -e "  Backend:   ${CYAN}https://${VM_IP}/api/v1${NC}"
echo -e "  API Docs:  ${CYAN}https://${VM_IP}/docs${NC}"
echo -e "  ADMS Port: ${CYAN}http://${VM_IP}:8081${NC}"
echo ""
echo -e "  Admin login: ${CYAN}admin${NC} / ${CYAN}${ADMIN_PASSWORD}${NC}"
echo ""
echo -e "  ── Device Configuration ──"
echo -e "  ADMS Server: ${CYAN}http://${VM_IP}:8081${NC}"
echo -e "  ADMS Path:   ${CYAN}/iclock/cdata${NC}"
echo ""

# ── Health check ────────────────────────────
echo -e "${YELLOW}Running health check...${NC}"
sleep 10
if curl -sf http://localhost:8000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Backend is healthy${NC}"
else
    echo -e "${RED}✗ Backend health check failed — check 'docker compose logs backend'${NC}"
fi

echo ""
echo -e "${YELLOW}Useful commands:${NC}"
echo -e "  View logs:      ${CYAN}docker compose logs -f backend${NC}"
echo -e "  Restart:        ${CYAN}docker compose --profile production restart${NC}"
echo -e "  Update & reload:${CYAN}git pull && docker compose --profile production up -d --build${NC}"
echo -e "  Stop:           ${CYAN}docker compose --profile production down${NC}"
echo ""
echo -e "${YELLOW}IMPORTANT: Log out and back in for Docker group to take effect.${NC}"
echo -e "${YELLOW}Or run: newgrp docker${NC}"
