# **📘 PROJECT Z — FULL SYSTEM DOCUMENTATION (PRE-CODING SPEC)**

## **Real-Time Biometric Attendance & Workforce Platform**

---

# **1\. PROJECT OVERVIEW**

Project Z is an enterprise-grade real-time attendance and workforce management system that integrates with biometric devices (RONASOFT / ZKTeco-compatible, ZMM220\_TFT platform).

The system captures attendance via ADMS push protocol and centralizes all workforce data into a backend-controlled system.

---

# **2\. CORE SYSTEM PRINCIPLE**

## **IMPORTANT ARCHITECTURAL RULE**

Biometric devices are NOT the source of truth.

They are only:

Authentication Terminals

The backend is:

The authoritative HR \+ Attendance system  
---

# **3\. HIGH-LEVEL SYSTEM FLOW**

Fingerprint Scan  
     ↓  
Biometric Device (RONASOFT / ZKTeco)  
     ↓  
ADMS HTTP Push (Port 8081\)  
     ↓  
FastAPI Backend (Project Z)  
     ↓  
Attendance Engine  
     ↓  
PostgreSQL Database  
     ↓  
WebSocket Realtime Layer  
     ↓  
React HR Dashboard  
---

# **4\. HARDWARE CONTEXT**

## **Device Specs**

* Platform: ZMM220\_TFT  
* Network: Ethernet LAN  
* Protocols:  
  * ADMS (HTTP Push)  
  * TCP SDK (Port 4370\)

## **Device IP Examples**

* 172.16.40.12 (IT Office)  
* 172.16.40.13 (HR Office)

---

# **5\. COMMUNICATION METHODS**

## **5.1 PRIMARY METHOD — ADMS PUSH (REQUIRED)**

* Port: 8081  
* Protocol: HTTP POST  
* Purpose: Real-time attendance events

### **Endpoint:**

POST /iclock/cdata  
---

## **5.2 SECONDARY METHOD — SDK (OPTIONAL)**

* Port: 4370  
* Purpose:  
  * user sync  
  * device management  
  * historical imports

---

# **6\. SYSTEM ARCHITECTURE**

Devices (ADMS)  
    ↓  
FastAPI Receiver  
    ↓  
Attendance Engine  
    ↓  
PostgreSQL  
    ↓  
WebSocket Layer  
    ↓  
React Dashboard  
---

# **7\. TECH STACK (FINAL DECISION)**

## **Backend**

* FastAPI (Python 3.12)  
* PostgreSQL  
* SQLAlchemy (async)  
* Redis  
* WebSockets

## **Frontend**

* React  
* TypeScript  
* TailwindCSS  
* React Query  
* Zustand  
* shadcn/ui  
* Radix UI

## **Infrastructure**

* Docker  
* Docker Compose  
* Nginx

## **Device Integration**

* ADMS HTTP Push  
* pyzk SDK (optional)

---

# **8\. CORE MODULES**

## **8.1 DEVICE MANAGEMENT MODULE**

Responsibilities:

* register biometric devices  
* store IP address  
* map to office/department  
* track online/offline status

### **Device represents:**

Physical location, NOT employees  
---

## **8.2 EMPLOYEE MANAGEMENT MODULE**

Responsibilities:

* employee records  
* department assignment  
* shift assignment  
* device-user mapping

### **Important:**

Use existing device users initially (NO re-enrollment).

---

## **8.3 ATTENDANCE INGESTION MODULE**

Responsibilities:

* receive ADMS data  
* parse raw payload  
* validate device identity  
* store raw logs  
* deduplicate events

---

## **8.4 ATTENDANCE ENGINE (CORE LOGIC)**

Responsibilities:

* IN/OUT detection  
* shift validation  
* late detection  
* overtime calculation  
* missing checkout handling

---

## **8.5 REALTIME MODULE**

* WebSockets  
* live dashboard updates  
* instant HR notifications

---

## **8.6 REPORTING MODULE**

* daily attendance reports  
* monthly summaries  
* overtime reports  
* department analytics

Export formats:

* PDF  
* Excel  
* CSV

---

# **9\. DATABASE DESIGN**

## **Core Tables**

### **employees**

* id (UUID)  
* employee\_code  
* name  
* department\_id  
* shift\_id

---

### **devices**

* id  
* serial\_number  
* ip\_address  
* office\_id  
* department\_id  
* last\_seen

---

### **attendance\_logs**

* id  
* employee\_id  
* device\_id  
* timestamp  
* verify\_type  
* raw\_payload

---

### **attendance\_sessions**

(important for IN/OUT logic)

* id  
* employee\_id  
* check\_in  
* check\_out  
* duration

---

### **departments**

* id  
* name

---

### **shifts**

* id  
* start\_time  
* end\_time

---

### **employee\_device\_mapping**

* employee\_id  
* device\_user\_id  
* device\_id

---

### **raw\_attendance\_payloads**

* id  
* payload  
* device\_serial  
* received\_at

---

# **10\. ATTENDANCE FLOW RULES**

## **Event Types**

* Check-in  
* Check-out  
* Break scan (optional)  
* Duplicate scan

---

## **Processing Rules**

### **Duplicate Prevention:**

Ignore identical scans within short time window (e.g. 30–60 sec)

### **IN/OUT Logic:**

* first scan \= IN  
* second scan \= OUT  
* shift-aware override supported

---

# **11\. MULTI-DEVICE STRATEGY**

Each device belongs to:

* office  
* department  
* location

BUT employees are independent.

---

Example:

Device 172.16.40.12 → IT Office  
Device 172.16.40.13 → HR Office

Employees can scan anywhere.

---

# **12\. EMPLOYEE ID STRATEGY**

## **RECOMMENDED APPROACH**

Use existing device user IDs initially.

Then map them to backend employee IDs.

---

# **13\. REALTIME DESIGN**

## **WebSocket Events**

* attendance.created  
* employee.checked\_in  
* employee.checked\_out  
* device.status  
* alert.late\_employee

---

# **14\. API STRUCTURE**

## **Attendance**

* POST /iclock/cdata  
* GET /attendance/live  
* GET /attendance/history

## **Employees**

* GET /employees  
* POST /employees

## **Devices**

* GET /devices  
* POST /devices

---

# **15\. UI SYSTEM REQUIREMENTS**

## **Design Style:**

* clean white background  
* primary blue (\#2563EB)  
* slate \+ indigo accents

## **UI Principles:**

* minimal  
* modern SaaS style  
* enterprise dashboard aesthetic

---

## **Required UI Features**

### **Modals**

* employee create/edit  
* device details  
* attendance details  
* export modal

### **Toasts**

* realtime notifications  
* success/error alerts

### **Alerts**

* delete confirmations  
* export confirmations

---

# **16\. EXPORT SYSTEM**

Supports:

* PDF  
* Excel  
* CSV

Features:

* filter by date  
* filter by department  
* download to local machine

---

# **17\. SECURITY MODEL**

* JWT authentication  
* RBAC roles  
* audit logs  
* device validation  
* rate limiting

---

# **18\. DEPLOYMENT ARCHITECTURE**

## **Dockerized services:**

* backend  
* frontend  
* postgres  
* redis  
* nginx

---

# **19\. DEVELOPMENT STRATEGY (CRITICAL)**

## **MUST FOLLOW ORDER:**

### **Phase 1 — Core Pipeline**

* ADMS receiver  
* database storage  
* websocket broadcast

### **Phase 2 — Employee system**

* employee module  
* device mapping

### **Phase 3 — UI dashboard**

* live attendance UI  
* reports

### **Phase 4 — advanced features**

* payroll  
* analytics  
* multi-tenant SaaS

---

# **20\. FORBIDDEN IN MVP**

DO NOT BUILD:

* mock data  
* fake dashboards  
* payroll system  
* facial recognition  
* fingerprint syncing system  
* mobile app

---

# **21\. SUCCESS CRITERIA**

Project Z is successful when:

* real fingerprint scan appears in backend instantly  
* HR sees live attendance updates  
* multiple devices work simultaneously  
* data is consistent and reliable  
* reports are accurate

---

# **22\. FINAL ARCHITECTURAL PRINCIPLE**

Devices \= Authentication Layer  
Backend \= Intelligence Layer  
Frontend \= Visualization Layer  
---

# **END OF DOCUMENT**

This document is the **MASTER SPECIFICATION** for Claude.

It must be used as the ONLY source of truth for implementation.

All development must strictly follow this architecture without deviation.

