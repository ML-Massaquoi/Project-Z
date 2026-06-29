# Project Z — Progress Log

## Repository
- **Remote**: https://github.com/ML-Massaquoi/Project-Z.git
- **Branches**: `main`, `backup-before-frontend-revert`

---

## 1. Project Scaffolding

- **Backend**: FastAPI + SQLAlchemy async + Pydantic v2 project created under `backend/`
- **Frontend**: React + TypeScript + TailwindCSS + Vite project created under `frontend/`
- **Infrastructure**: Docker Compose with PostgreSQL, Redis, Nginx under `infrastructure/`
- **Alembic**: 29 migration versions created covering the full schema evolution
- **Models**: 30+ SQLAlchemy models for attendance, devices, employees, shifts, enrollment, sync, alerts, backups, etc.

---

## 2. Architecture & Modules Built

### Attendance System
- ADMS HTTP Push receiver (`POST /iclock/cdata`) — ingests real-time punch events from ZKTeco/RONASOFT devices
- Attendance engine (v1 & v2) with IN/OUT detection, shift-aware logic, grace periods, lateness/overtime calculation
- Session-based attendance with duplicate prevention
- Summary service for daily/monthly aggregation

### Device Management
- Device CRUD with auto-registration from ADMS pushes
- Device health monitoring worker (every 5 min TCP probe on port 4370)
- SDK polling worker for real-time attendance pull via pyzk
- Device sync worker — pushes employees and fingerprint templates across devices
- Device user sync — imports/exports users between devices and backend
- Device discovery service for LAN scanning
- Device provisioning service

### Employee Management
- Centralized employee profiles with department/office assignment
- Employee-device mapping (device_user_id per device)
- Employee status management (active, inactive, pending_enrollment, etc.)
- Employee number sequence generation

### Enrollment System
- **End-to-end fingerprint enrollment wizard** — works on ZMM220_TFT devices
- Enrollment sessions with lifecycle tracking
- Fingerprint template capture via pyzk SDK (TCP port 4370)
- Auto-sync of captured templates to all other devices
- Finger index selection (picks unused finger to avoid overwriting)
- WebSocket event broadcasting for real-time UI updates during enrollment

### WebSocket Realtime Layer
- Centralized WebSocket manager with room-based broadcasting
- Real-time attendance feed, device events, enrollment events, sync events
- Path: `/ws-app` (moved from `/ws` to avoid Vite HMR conflict)

### Reporting & Analytics
- Daily reports, monthly summaries, overtime/lateness reports
- CSV, Excel export support
- Department analytics with workforce planning
- Dashboard with live monitor, operational cards, activity feeds

### Security & Auth
- JWT authentication with access + refresh tokens
- RBAC authorization with roles and permissions
- Password hashing with bcrypt
- Audit logging for all critical operations
- Rate limiting middleware
- Session management with account lockout

### Sync System
- Bi-directional sync between backend and devices
- Offline sync queue for devices temporarily unreachable
- Replication engine for multi-device consistency
- Conflict resolution for employee data
- Background workers for sync, health checks, alerts, backups, data integrity

---

## 3. Enrollment Wizard — Key Fixes & Learnings

### Device Behavior (ZMM220_TFT / RONASOFT MX-710)
| Issue | Solution |
|---|---|
| `enroll_user()` returns `False` even on success | Ignore return value; verify by checking templates on device afterward |
| `disable_device` required before `enroll_user` | ZMM220_TFT needs `CMD_DISABLEDEVICE` to stop polling interference during enrollment |
| Only one concurrent TCP session per device | Use per-device `asyncio.Lock` keyed by device IP across all workers |
| 60+ second timeouts on unreachable devices | Add TCP port probe (port 4370) before attempting full SDK connection |
| Finger index already in use causes silent failure | Scan existing templates and pick first unused finger index (0-9) |

### WebSocket Fixes
| Issue | Solution |
|---|---|
| Vite HMR WebSocket conflicts at `/ws` | Changed backend WebSocket path to `/ws-app` |
| Frontend stuck "Enrolling..." after timeout | Added WebSocket status watcher that resets state on `timeout`/`failed` events |
| Countdown starts too early | Gated countdown on `enrollment.fingerprint.started` WebSocket event, not button click |

### Auto-Sync Fix
| Issue | Solution |
|---|---|
| `This session is in 'prepared' state; no further SQL can be emitted` | `_auto_sync_after_fingerprint` now creates its own fresh DB session instead of using the parent request's committed session |

---

## 4. Database Schema (PostgreSQL)

### Core Tables
- `organizations`, `offices`, `departments` — organizational hierarchy
- `devices` — biometric devices with IP, serial, location, health status
- `employees` — centralized employee profiles
- `shifts`, `shift_protocols`, `shift_pairs` — shift definitions and rules
- `attendance_logs`, `attendance_sessions` — attendance records
- `employee_device_mapping` — maps employees to device user IDs
- `fingerprint_templates` — captured biometric templates
- `face_templates` — facial recognition templates (future)
- `enrollment_sessions`, `enrollment_events` — enrollment lifecycle

### Support Tables
- `audit_logs`, `system_alerts`, `data_integrity_logs`
- `device_health_logs`, `device_activity_logs`, `device_sync_logs`, `device_sync_status`
- `offline_sync_queue`, `backup_jobs`
- `users`, `roles`, `permissions`
- `roster_entries`, `shift_assignments`, `expected_attendance`
- Various summary, reporting, and analytics tables

---

## 5. Devices in Production

| IP | Location | Status | Users |
|---|---|---|---|
| 172.16.40.12 | IT Office | Online, Healthy | 0 (cleared for testing) |
| 172.16.40.13 | MX-710 | Removed/Offline | 0 |
| 172.16.40.14 | Admin Building | Online | 728 |
| 172.16.40.10 | MX-710 | Online | 349 |

---

## 6. Current State

### Working
- Fingerprint enrollment end-to-end: device window appears → finger scanned → template verified → stored in DB
- WebSocket real-time event broadcast during enrollment
- Device health monitoring (TCP probe every 5 min)
- ADMS attendance push ingestion
- Attendance engine with shift-aware logic
- JWT auth + RBAC
- All CRUD APIs for employees, devices, shifts, departments, users

### Known Issues
1. **4 stubborn test users** on 172.16.40.12 (UIDs 999, 2006, 2018, 2019) — could not delete via TCP SDK; manual deletion from device menu recommended
2. **Device 172.16.40.13** was removed from network (offline)
3. **Dashboard "degraded" status** for previously fixed device — health worker only runs every 5 min; may still show stale status if health worker encounters SDK lock contention

### Next Steps
1. Manual cleanup of stubborn users on 172.16.40.12
2. Full end-to-end test: enroll employee → verify template on other devices → verify attendance scan
3. UI polish for enrollment wizard (error states, retry flows)
4. Production hardening: rate limiting tuning, connection pooling, monitoring dashboards

---

## 7. Tech Stack

- **Backend**: Python 3.12, FastAPI, SQLAlchemy async, Alembic, Pydantic v2, Redis
- **Frontend**: React 18, TypeScript, TailwindCSS, React Query, Zustand, Shadcn/ui
- **Infrastructure**: Docker, Docker Compose, Nginx, PostgreSQL 15
- **Device SDK**: pyzk (custom fork with ZMM220_TFT support)
- **Protocols**: ADMS HTTP Push (port 8081), TCP SDK (port 4370)

---

*Last updated: 2026-06-29*
