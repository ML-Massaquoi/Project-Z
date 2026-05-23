You are a Principal Software Engineer and System Architect.

Your task is to design and implement a production-grade enterprise biometric attendance management platform called:

\# Project Z

The system must integrate with existing biometric attendance devices that are:  
\- RONASOFT branded  
\- ZKTeco-compatible  
\- running platform: ZMM220\_TFT

The devices support:  
\- ADMS push mode  
\- TCP SDK protocol  
\- Ethernet LAN communication

Current device configuration:  
\- ADMS enabled  
\- ADMS Port: 8081  
\- TCP SDK Port: 4370  
\- Example device IPs:  
  \- 172.16.40.12  
  \- 172.16.40.13

The system will run entirely on a local enterprise LAN initially.

\====================================================  
\# PROJECT GOAL  
\====================================================

Build a centralized real-time attendance management platform that:

1\. Receives realtime attendance events from biometric devices via ADMS  
2\. Stores attendance centrally  
3\. Supports multiple offices/departments  
4\. Provides realtime HR dashboards  
5\. Supports future payroll integration  
6\. Scales to many devices and employees  
7\. Uses the biometric devices only as authentication terminals

\====================================================  
\# IMPORTANT ARCHITECTURAL PRINCIPLES  
\====================================================

The biometric devices are NOT the source of truth.

The backend database is the authoritative HR and attendance database.

Devices are treated as:  
\- distributed authentication terminals

The backend handles:  
\- attendance logic  
\- reporting  
\- employee management  
\- shifts  
\- analytics  
\- realtime dashboards

\====================================================  
\# REQUIRED TECH STACK  
\====================================================

Backend:  
\- Python 3.12  
\- FastAPI  
\- SQLAlchemy  
\- Alembic  
\- PostgreSQL  
\- Redis  
\- WebSockets

Frontend:  
\- React  
\- TypeScript  
\- TailwindCSS  
\- React Query  
\- Zustand

Infrastructure:  
\- Docker  
\- Docker Compose  
\- Nginx

Device Integration:  
\- ADMS HTTP Push  
\- pyzk SDK integration for TCP 4370 support

\====================================================  
\# SYSTEM ARCHITECTURE  
\====================================================

Biometric Devices  
        ↓  
ADMS HTTP Push  
        ↓  
FastAPI Attendance Receiver  
        ↓  
Attendance Engine  
        ↓  
PostgreSQL Database  
        ↓  
WebSocket Realtime Layer  
        ↓  
React HR Dashboard

\====================================================  
\# REQUIRED CORE MODULES  
\====================================================

\# 1\. Attendance Receiver Module

Implement:  
POST /iclock/cdata

Requirements:  
\- Receive ADMS attendance events  
\- Parse incoming device payloads  
\- Identify device serial numbers  
\- Handle malformed payloads  
\- Store raw payloads for debugging  
\- Return proper device responses

The system must support:  
\- realtime attendance ingestion  
\- multiple simultaneous devices  
\- retry-safe ingestion

\====================================================  
\# 2\. Device Management Module

Features:  
\- auto-register devices  
\- store:  
  \- serial number  
  \- IP address  
  \- office  
  \- department  
  \- last seen timestamp  
  \- online/offline status

Devices represent locations, NOT employee ownership.

\====================================================  
\# 3\. Employee Management Module

Requirements:  
\- import existing users from devices  
\- support device\_user\_id mapping  
\- centralized employee profiles

Employee fields:  
\- id  
\- employee\_code  
\- full\_name  
\- department\_id  
\- shift\_id  
\- status  
\- created\_at

Do NOT centrally manage fingerprint templates in MVP.

Fingerprint templates remain on devices initially.

\====================================================  
\# 4\. Attendance Engine

Implement logic for:  
\- duplicate prevention  
\- attendance normalization  
\- IN/OUT detection  
\- lateness calculation  
\- overtime detection  
\- missing checkout handling

The engine must support:  
\- multiple scans per day  
\- shift-aware attendance  
\- configurable grace periods

\====================================================  
\# 5\. Realtime Dashboard Module

Features:  
\- live attendance feed  
\- currently present employees  
\- late employees  
\- absent employees  
\- office filters  
\- department filters  
\- active devices monitor

Use WebSockets for realtime updates.

\====================================================  
\# 6\. Reporting Module

Generate:  
\- daily attendance reports  
\- monthly summaries  
\- overtime reports  
\- lateness reports  
\- department analytics

Support:  
\- CSV export  
\- Excel export  
\- PDF export

\====================================================  
\# REQUIRED DATABASE DESIGN  
\====================================================

Create production-grade PostgreSQL schema.

Core tables:

\# organizations  
\# offices  
\# departments  
\# devices  
\# employees  
\# shifts  
\# attendance\_logs  
\# attendance\_sessions  
\# employee\_device\_mapping  
\# raw\_attendance\_payloads  
\# audit\_logs  
\# users  
\# roles

Use UUID primary keys.

\====================================================  
\# DEVICE COMMUNICATION REQUIREMENTS  
\====================================================

\# ADMS Push  
Primary realtime communication method.

Device pushes attendance to:  
POST /iclock/cdata

\# SDK Support  
Use pyzk for:  
\- importing users  
\- syncing attendance history  
\- future remote device management

SDK communication uses:  
TCP port 4370

\====================================================  
\# SECURITY REQUIREMENTS  
\====================================================

Implement:  
\- JWT authentication  
\- RBAC authorization  
\- audit logging  
\- secure password hashing  
\- device validation  
\- rate limiting  
\- HTTPS-ready deployment

Do NOT expose:  
\- TCP 4370 publicly

\====================================================  
\# MULTI-OFFICE SUPPORT  
\====================================================

The system must support:  
\- multiple offices  
\- multiple departments  
\- multiple devices  
\- centralized dashboards

Example:  
172.16.40.12 → IT Office  
172.16.40.13 → HR Office

Employees may scan on any device.

Attendance records must always store:  
\- employee\_id  
\- device\_id  
\- timestamp

\====================================================  
\# IMPORTANT MVP DECISIONS  
\====================================================

Use existing users already stored on devices.

Do NOT require re-enrollment.

Import users from devices into backend.

The backend becomes the long-term source of truth.

\====================================================  
\# DEVELOPMENT STRATEGY  
\====================================================

Build vertically.

FIRST IMPLEMENT:  
Device → Attendance Receiver → Database → WebSocket → Dashboard

Do NOT begin with:  
\- payroll  
\- mobile apps  
\- facial recognition  
\- fingerprint template synchronization

\====================================================  
\# REQUIRED PROJECT STRUCTURE  
\====================================================

Generate clean enterprise-grade architecture.

Required structure:

project-z/  
│  
├── backend/  
├── frontend/  
├── infrastructure/  
├── docker/  
├── docs/  
└── scripts/

\====================================================  
\# BACKEND STRUCTURE  
\====================================================

backend/  
│  
├── app/  
│   ├── api/  
│   ├── attendance/  
│   ├── devices/  
│   ├── employees/  
│   ├── websocket/  
│   ├── database/  
│   ├── core/  
│   ├── services/  
│   ├── models/  
│   ├── schemas/  
│   ├── repositories/  
│   └── utils/

\====================================================  
\# REQUIRED OUTPUT  
\====================================================

Generate:

1\. Full backend architecture  
2\. Full frontend architecture  
3\. Database schema  
4\. SQLAlchemy models  
5\. FastAPI project structure  
6\. Docker Compose setup  
7\. ADMS attendance receiver implementation  
8\. WebSocket realtime architecture  
9\. Device registration flow  
10\. Attendance engine design  
11\. API specification  
12\. Authentication system  
13\. Deployment architecture  
14\. Development roadmap  
15\. Production best practices  
16\. Logging strategy  
17\. Error handling strategy  
18\. Testing strategy

\====================================================  
\# CODING REQUIREMENTS  
\====================================================

Code must be:  
\- production-grade  
\- scalable  
\- modular  
\- clean architecture  
\- enterprise-ready  
\- strongly typed  
\- documented

Use:  
\- async SQLAlchemy  
\- Pydantic v2  
\- repository pattern  
\- service layer architecture  
\- dependency injection

\====================================================  
\# FINAL IMPORTANT REQUIREMENT  
\====================================================

This is NOT a prototype.

Design and implement Project Z as a real enterprise-grade attendance infrastructure platform intended for long-term production use.

