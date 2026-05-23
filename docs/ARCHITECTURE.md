# Project Z — Architecture Documentation

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ENTERPRISE LAN                            │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐                         │
│  │ RONASOFT      │  │ RONASOFT      │  ... more devices      │
│  │ 172.16.40.12  │  │ 172.16.40.13  │                         │
│  │ (IT Office)   │  │ (HR Office)   │                         │
│  └──────┬───────┘  └──────┬───────┘                         │
│         │ ADMS Push        │ ADMS Push                       │
│         │ Port 8081        │ Port 8081                        │
│         └────────┬─────────┘                                 │
│                  ▼                                            │
│  ┌───────────────────────────────────────────────────┐      │
│  │                  NGINX (Port 80/443)                │      │
│  │  /iclock/* → Backend    /api/* → Backend           │      │
│  │  /ws      → WebSocket   /*     → Frontend          │      │
│  └───────────────────┬───────────────────────────┘          │
│                      ▼                                       │
│  ┌─────────────────────────────────────────────┐            │
│  │           FastAPI Backend (Port 8000)         │            │
│  │                                               │            │
│  │  ┌─────────────┐  ┌──────────────────────┐   │            │
│  │  │ ADMS        │  │ REST API             │   │            │
│  │  │ Receiver    │  │ /api/v1/*            │   │            │
│  │  └──────┬──────┘  └──────────┬───────────┘   │            │
│  │         ▼                    ▼                │            │
│  │  ┌────────────────────────────────────────┐   │            │
│  │  │         Service Layer                   │   │            │
│  │  │  AttendanceEngine | DeviceService       │   │            │
│  │  │  EmployeeService  | AuthService         │   │            │
│  │  │  ReportService    | WebSocketService    │   │            │
│  │  └──────────────────┬─────────────────────┘   │            │
│  │                     ▼                         │            │
│  │  ┌────────────────────────────────────────┐   │            │
│  │  │         Repository Layer                │   │            │
│  │  │  Async CRUD | Query Builders           │   │            │
│  │  └──────────────────┬─────────────────────┘   │            │
│  └─────────────────────┼─────────────────────────┘           │
│                        ▼                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐    │
│  │ PostgreSQL   │  │ Redis        │  │ WebSocket       │    │
│  │ Port 5432    │  │ Port 6379    │  │ /ws             │    │
│  │              │  │              │  │                 │    │
│  │ • employees  │  │ • sessions   │  │ • attendance    │    │
│  │ • attendance │  │ • cache      │  │ • device status │    │
│  │ • devices    │  │ • pub/sub    │  │ • alerts        │    │
│  │ • shifts     │  │              │  │                 │    │
│  │ • audit_logs │  │              │  │                 │    │
│  └──────────────┘  └──────────────┘  └────────┬────────┘    │
│                                                ▼             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           React Frontend (Port 3000)                  │    │
│  │                                                       │    │
│  │  Dashboard | Employees | Devices | Attendance         │    │
│  │  Reports   | Settings  | Login                        │    │
│  │                                                       │    │
│  │  React Query + Zustand + WebSocket + Recharts         │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### Attendance Ingestion Flow

1. Employee scans fingerprint on biometric device
2. Device sends HTTP POST to `/iclock/cdata?SN={serial}&table=ATTLOG`
3. ADMS Receiver parses the payload
4. Raw payload stored in `raw_attendance_payloads` for debugging
5. Attendance Engine processes the event:
   - Check duplicate (within 60-second window) → reject if duplicate
   - Map device_user_id to employee_id via `employee_device_mapping`
   - Determine IN/OUT based on existing sessions
   - Create `attendance_log` record
   - Create or update `attendance_session` record
   - Calculate lateness/overtime against shift schedule
6. WebSocket broadcasts event to all connected clients
7. Dashboard updates in real-time

### Authentication Flow

1. User sends credentials to `POST /api/v1/auth/login`
2. Backend validates against `users` table (bcrypt hash comparison)
3. JWT access token (30 min) + refresh token (7 days) issued
4. Frontend stores tokens, attaches to all API requests
5. Middleware validates JWT on every protected endpoint
6. RBAC checks user role permissions for each action

## Database Schema

### Entity Relationship

```
organizations 1──N offices 1──N departments
                    │
                    │ 1──N devices
                    │
departments 1──N employees N──1 shifts
                    │
                    │ 1──N attendance_logs
                    │ 1──N attendance_sessions
                    │ N──N employee_device_mapping
                    │
users N──1 roles
```

## Security Model

| Layer | Protection |
|-------|-----------|
| Transport | HTTPS via Nginx (production) |
| Authentication | JWT (HS256) with refresh tokens |
| Authorization | RBAC with permission-based access |
| Input | Pydantic v2 validation |
| Rate Limiting | Nginx rate limiting (30r/s API, 100r/s ADMS) |
| Audit | All mutations logged in audit_logs |
| Device | Serial number validation on ADMS endpoints |
| Passwords | bcrypt hashing |

## Technology Decisions

| Decision | Rationale |
|----------|-----------|
| Async SQLAlchemy | High concurrency for multiple device connections |
| Redis pub/sub | Multi-worker WebSocket event distribution |
| Repository pattern | Clean separation of data access from business logic |
| UUID primary keys | Distributed-safe, no sequential guessing |
| ADMS push (not pull) | Real-time events, device-initiated communication |
| TanStack Table | Enterprise-grade table features (sort, filter, paginate) |
| Zustand over Redux | Simpler API, less boilerplate, better TypeScript support |
