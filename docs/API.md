# Project Z — API Documentation

## Base URL

```
http://localhost:8000/api/v1
```

## Authentication

All endpoints (except login and ADMS) require JWT Bearer token:

```
Authorization: Bearer <access_token>
```

---

## Auth Endpoints

### POST /auth/login
Login with credentials.

**Request Body:**
```json
{
  "username": "admin",
  "password": "@linux@kali@DYDY21"
}
```

**Response:**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer",
  "user": {
    "id": "uuid",
    "username": "admin",
    "email": "admin@projectz.local",
    "role": "super_admin"
  }
}
```

### POST /auth/refresh
Refresh access token.

**Request Body:**
```json
{
  "refresh_token": "eyJ..."
}
```

---

## Dashboard Endpoints

### GET /dashboard/stats
Get real-time dashboard statistics.

**Response:**
```json
{
  "total_employees": 1248,
  "present_today": 856,
  "late_today": 67,
  "absent_today": 325,
  "active_devices": 16,
  "online_devices": 14,
  "trends": {
    "employees_change": 12.5,
    "present_change": 8.3,
    "late_change": 3.1,
    "absent_change": -2.4
  }
}
```

---

## Employee Endpoints

### GET /employees
List employees with pagination.

**Query Params:**
- `page` (int, default: 1)
- `per_page` (int, default: 20)
- `search` (string, optional)
- `department_id` (UUID, optional)
- `status` (string: active/inactive, optional)

### POST /employees
Create new employee.

**Request Body:**
```json
{
  "employee_code": "EMP12345",
  "full_name": "Maria Santos",
  "email": "maria.santos@company.com",
  "phone": "+232 912 345 6789",
  "department_id": "uuid",
  "shift_id": "uuid",
  "status": "active"
}
```

### GET /employees/{id}
Get employee details.

### PUT /employees/{id}
Update employee.

### DELETE /employees/{id}
Delete employee.

### GET /employees/{id}/attendance
Get employee attendance history.

---

## Device Endpoints

### GET /devices
List all devices.

### GET /devices/{id}
Get device details.

### PUT /devices/{id}
Update device (assign office, department).

---

## Attendance Endpoints

### GET /attendance/live
Get live attendance feed (latest N records).

**Query Params:**
- `limit` (int, default: 50)
- `department_id` (UUID, optional)
- `office_id` (UUID, optional)

### GET /attendance/history
Get historical attendance with filters.

**Query Params:**
- `page` (int, default: 1)
- `per_page` (int, default: 20)
- `date` (string: YYYY-MM-DD, optional)
- `start_date` (string, optional)
- `end_date` (string, optional)
- `employee_id` (UUID, optional)
- `department_id` (UUID, optional)
- `status` (string: in/out/late, optional)

---

## Department Endpoints

### GET /departments
### POST /departments
### PUT /departments/{id}
### DELETE /departments/{id}

---

## Shift Endpoints

### GET /shifts
### POST /shifts
### PUT /shifts/{id}
### DELETE /shifts/{id}

---

## Office Endpoints

### GET /offices
### POST /offices
### PUT /offices/{id}
### DELETE /offices/{id}

---

## Report Endpoints

### GET /reports/attendance
Generate attendance report.

**Query Params:**
- `start_date` (string: YYYY-MM-DD, required)
- `end_date` (string: YYYY-MM-DD, required)
- `department_id` (UUID, optional)
- `format` (string: pdf/excel/csv, default: excel)

**Response:** File download

### GET /reports/department
Generate department report.

---

## ADMS Endpoint (Device Communication)

### GET /iclock/cdata
Device handshake/options request.

**Query Params:**
- `SN` (string: device serial number)
- `options` (string: "all")

**Response:** Plain text device configuration

### POST /iclock/cdata
Receive attendance data from device.

**Query Params:**
- `SN` (string: device serial number)
- `table` (string: "ATTLOG")
- `Stamp` (string: timestamp)

**Request Body:** Tab-separated attendance records

**Response:** `OK`

---

## WebSocket

### WS /ws
Real-time event stream.

**Events:**
```json
{"event": "attendance.created", "data": {...}}
{"event": "employee.checked_in", "data": {...}}
{"event": "employee.checked_out", "data": {...}}
{"event": "device.status", "data": {...}}
{"event": "alert.late_employee", "data": {...}}
```
