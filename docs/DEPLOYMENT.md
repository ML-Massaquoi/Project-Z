# Project Z — Deployment Guide

## Development Environment

### Prerequisites

- Docker Desktop (Windows/Mac) or Docker Engine (Linux)
- Docker Compose v2
- Python 3.12+ (for local backend development)
- Node.js 18+ (for local frontend development)
- Git

### Quick Start (Docker)

```bash
# 1. Clone the repository
git clone <repo-url> project-z
cd project-z

# 2. Copy environment file
cp docker/.env.example docker/.env
# Edit docker/.env with your settings

# 3. Start all services
cd docker
docker compose up -d

# 4. Verify services
docker compose ps

# 5. Access the application
# Frontend:  http://localhost:3000
# Backend:   http://localhost:8000
# API Docs:  http://localhost:8000/docs
# ADMS:      http://localhost:8081
```

### Local Development (Hybrid)

Run databases in Docker, application locally for hot-reload:

```bash
# 1. Start infrastructure only
cd docker
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# 2. Backend setup
cd ../backend
python -m venv .venv
.venv\Scripts\activate       # Windows
# source .venv/bin/activate  # Linux/Mac
pip install -r requirements.txt

# Set environment variables
set DATABASE_URL=postgresql+asyncpg://projectz:projectz_secret@localhost:5432/projectz
set REDIS_URL=redis://localhost:6379/0
set SECRET_KEY=projectz-dev-secret-key

# Run migrations & seed
alembic upgrade head
python scripts/seed_admin.py

# Start backend
uvicorn app.main:app --reload --port 8000

# 3. Frontend setup (new terminal)
cd frontend
npm install
npm run dev
```

---

## Production Deployment

### Server Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 2 cores | 4 cores |
| RAM | 4 GB | 8 GB |
| Disk | 20 GB | 50 GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |

### Production Setup

```bash
# 1. Copy environment file and configure
cp docker/.env.example docker/.env

# IMPORTANT: Update these in docker/.env:
# - SECRET_KEY: Generate a strong random key
# - POSTGRES_PASSWORD: Strong database password
# - DEFAULT_ADMIN_PASSWORD: Strong admin password
# - APP_ENV=production
# - DEBUG=false

# 2. Start with production profile
cd docker
docker compose --profile production up -d

# 3. Set up SSL (optional but recommended)
# Configure SSL certificates in nginx.conf
```

### Biometric Device Configuration

Configure each RONASOFT/ZKTeco device:

1. Go to device menu → Communication → ADMS
2. Enable ADMS
3. Set server address: `http://{server-ip}:8081`
4. Set ADMS path: `/iclock/cdata`
5. Set ADMS port: `8081`
6. Save and restart device

The device will automatically:
- Send a GET handshake to `/iclock/cdata?SN={serial}&options=all`
- Push attendance events via POST to `/iclock/cdata`

### Monitoring

```bash
# View logs
docker compose logs -f backend
docker compose logs -f postgres

# Check health
curl http://localhost:8000/api/v1/health

# Check device connections
curl http://localhost:8000/api/v1/devices -H "Authorization: Bearer <token>"
```

### Backup Strategy

```bash
# Database backup
docker compose exec postgres pg_dump -U projectz projectz > backup_$(date +%Y%m%d).sql

# Database restore
docker compose exec -T postgres psql -U projectz projectz < backup_20240101.sql
```

---

## Network Configuration

### Firewall Rules

| Port | Protocol | Source | Purpose |
|------|----------|--------|---------|
| 80 | TCP | Internal LAN | Web UI (Nginx) |
| 443 | TCP | Internal LAN | Web UI (HTTPS) |
| 8081 | TCP | Device subnet | ADMS receiver |
| 5432 | TCP | Localhost only | PostgreSQL |
| 6379 | TCP | Localhost only | Redis |

### Device Network

Ensure biometric devices can reach the server on port 8081:
- Devices: 172.16.40.x subnet
- Server: Must be reachable from device subnet
- Protocol: HTTP (devices don't support HTTPS natively)
