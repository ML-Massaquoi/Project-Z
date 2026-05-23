You are a Principal Product Designer, Senior Frontend Architect, and Enterprise UX Engineer.

Your task is to design and implement the FULL enterprise UI/UX system for:

\# Project Z  
A real-time biometric attendance and workforce management platform.

\====================================================  
\# VERY IMPORTANT REQUIREMENT  
\====================================================

THIS SYSTEM MUST NEVER USE:  
\- mock data  
\- dummy data  
\- fake placeholders  
\- hardcoded attendance  
\- simulated API responses

ALL UI DATA MUST COME DIRECTLY FROM:  
\- backend APIs  
\- PostgreSQL database  
\- realtime WebSocket events

NO EXCEPTIONS.

The frontend must be fully integrated with:  
\- FastAPI backend  
\- PostgreSQL  
\- realtime WebSockets

EVERY table, card, dashboard metric, chart, modal, and report must load REAL DATA ONLY.

\====================================================  
\# DESIGN GOAL  
\====================================================

Design a:  
\- clean  
\- modern  
\- enterprise-grade  
\- premium  
\- highly polished  
\- visually impressive  
\- professional  
\- realtime HR platform UI

The UI must feel like:  
\- Linear  
\- Stripe Dashboard  
\- Notion  
\- Framer  
\- modern enterprise SaaS systems

The system should feel:  
\- fast  
\- elegant  
\- futuristic  
\- minimal  
\- premium  
\- organized  
\- highly responsive

\====================================================  
\# DESIGN LANGUAGE  
\====================================================

\# Primary Color  
Modern Professional Blue:  
\#2563EB

\# Secondary Color  
Choose elegant complementary shades:  
\- Indigo  
\- Slate  
\- Soft cyan accents

\# Background  
Pure clean white:  
\#FFFFFF

\# Neutral Colors  
Use:  
\- light gray surfaces  
\- subtle borders  
\- soft shadows  
\- minimal noise

\====================================================  
\# UI STYLE REQUIREMENTS  
\====================================================

The UI MUST:  
\- use glassmorphism subtly where appropriate  
\- use smooth transitions  
\- use modern animations  
\- use elegant hover states  
\- use modern typography  
\- use clean spacing  
\- use responsive layouts  
\- use professional iconography  
\- use modern loading states  
\- use skeleton loaders  
\- use shimmer effects  
\- use modern dropdowns  
\- use advanced tables  
\- use elegant charts  
\- use clean status badges  
\- use animated counters  
\- use realtime indicators

\====================================================  
\# REQUIRED UI TECHNOLOGY STACK  
\====================================================

Frontend Stack:  
\- React  
\- TypeScript  
\- TailwindCSS  
\- Framer Motion  
\- Zustand  
\- React Query  
\- Axios

Component/UI Libraries:  
\- shadcn/ui  
\- Radix UI  
\- Lucide Icons

Charts:  
\- Recharts

Tables:  
\- TanStack Table

Forms:  
\- React Hook Form  
\- Zod validation

\====================================================  
\# MODAL SYSTEM REQUIREMENTS  
\====================================================

Create MODERN ENTERPRISE MODALS.

Use:  
\- glassmorphism effects  
\- smooth blur backgrounds  
\- animated open/close transitions  
\- scalable modal architecture  
\- keyboard accessibility  
\- elegant spacing

Modal types required:  
\- Create Employee Modal  
\- Edit Employee Modal  
\- Device Details Modal  
\- Attendance Details Modal  
\- Shift Configuration Modal  
\- Confirmation Modal  
\- Export Modal

Modal behavior:  
\- animated entrance  
\- animated exit  
\- ESC close support  
\- backdrop blur  
\- responsive mobile support

\====================================================  
\# TOAST NOTIFICATION SYSTEM  
\====================================================

Use modern enterprise toast notifications.

Recommended:  
\- Sonner  
OR  
\- React Hot Toast

Toast styles:  
\- elegant minimal  
\- animated slide  
\- modern blur background  
\- success animations  
\- warning states  
\- error states  
\- realtime attendance notifications

Examples:  
\- Employee checked in  
\- Device connected  
\- Attendance exported  
\- Employee updated  
\- Device offline warning

\====================================================  
\# ALERT / CONFIRMATION SYSTEM  
\====================================================

Use MODERN SWEET ALERT STYLE confirmations.

Recommended:  
\- SweetAlert2 customized theme  
OR  
\- custom Radix confirmation dialogs

Requirements:  
\- elegant animations  
\- professional styling  
\- no ugly browser alerts  
\- smooth transitions  
\- dark overlay blur  
\- modern buttons

Examples:  
\- Delete employee  
\- Remove device  
\- Export report  
\- Reset attendance  
\- Logout confirmation

\====================================================  
\# TABLE DESIGN REQUIREMENTS  
\====================================================

All tables must be:  
\- modern  
\- enterprise-grade  
\- searchable  
\- sortable  
\- paginated  
\- filterable  
\- exportable

Features:  
\- sticky headers  
\- column visibility toggle  
\- row selection  
\- advanced filtering  
\- realtime updates  
\- smooth loading states

\====================================================  
\# DASHBOARD REQUIREMENTS  
\====================================================

The dashboard must look:  
\- executive-level  
\- realtime  
\- visually premium

Required sections:  
\- realtime attendance feed  
\- employees currently present  
\- late employees  
\- absent employees  
\- active devices  
\- office statistics  
\- department statistics  
\- attendance trends  
\- attendance heatmaps

\====================================================  
\# REALTIME UI REQUIREMENTS  
\====================================================

Use WebSockets throughout the system.

Realtime updates required for:  
\- attendance logs  
\- device status  
\- active employees  
\- notifications  
\- dashboard metrics

The UI should update instantly WITHOUT refresh.

\====================================================  
\# EXPORT SYSTEM REQUIREMENTS  
\====================================================

Implement PROFESSIONAL export systems.

Support:  
\- PDF export  
\- Excel export  
\- CSV export

Use:  
\- jsPDF  
\- ExcelJS

\====================================================  
\# EXPORT FEATURES  
\====================================================

Allow exporting:  
\- attendance reports  
\- employee lists  
\- lateness reports  
\- overtime reports  
\- department reports

\====================================================  
\# EXPORT UX REQUIREMENTS  
\====================================================

When exporting:  
\- show export modal  
\- allow date selection  
\- allow department filters  
\- allow format selection  
\- show loading progress  
\- show success toast

\====================================================  
\# LOCAL FILE SAVING REQUIREMENTS  
\====================================================

Exports MUST save directly to:  
\- user's desktop downloads  
\- local browser download flow

NO server-side fake export simulation.

Use REAL generated files from REAL backend data.

\====================================================  
\# REPORT DESIGN REQUIREMENTS  
\====================================================

Generated PDFs must look:  
\- professional  
\- corporate  
\- branded  
\- printable

Include:  
\- company logo  
\- report metadata  
\- generated timestamps  
\- table summaries  
\- signatures area if needed

\====================================================  
\# NAVIGATION DESIGN  
\====================================================

Sidebar:  
\- collapsible  
\- animated  
\- modern icons  
\- active indicators  
\- smooth transitions

Topbar:  
\- notifications  
\- realtime clock  
\- user menu  
\- quick search  
\- profile dropdown

\====================================================  
\# REQUIRED PAGES  
\====================================================

\# Authentication  
\- Login  
\- Forgot Password

\# Dashboard  
\- Realtime overview

\# Employees  
\- Employee management  
\- Employee details  
\- Employee attendance history

\# Devices  
\- Device management  
\- Device status monitoring

\# Attendance  
\- Live attendance  
\- Attendance history  
\- Attendance analytics

\# Reports  
\- Export center  
\- Attendance reports  
\- Department reports

\# Settings  
\- Departments  
\- Shifts  
\- Offices  
\- Roles  
\- Permissions

\====================================================  
\# RESPONSIVE DESIGN REQUIREMENTS  
\====================================================

The system MUST work perfectly on:  
\- desktop  
\- laptop  
\- tablet

Priority:  
Desktop-first enterprise experience.

\====================================================  
\# LOADING EXPERIENCE  
\====================================================

Use:  
\- skeleton loaders  
\- shimmer effects  
\- animated placeholders  
\- optimistic updates where safe

DO NOT:  
\- show empty white pages  
\- freeze during loading

\====================================================  
\# UI/UX QUALITY REQUIREMENTS  
\====================================================

The interface must:  
\- feel premium  
\- feel modern  
\- feel enterprise-ready  
\- avoid clutter  
\- avoid outdated admin styles  
\- avoid Bootstrap-looking UI  
\- avoid generic templates

\====================================================  
\# ACCESSIBILITY REQUIREMENTS  
\====================================================

Support:  
\- keyboard navigation  
\- focus states  
\- proper contrast  
\- screen reader compatibility

\====================================================  
\# BACKEND INTEGRATION REQUIREMENTS  
\====================================================

The frontend must integrate ONLY with REAL backend APIs.

Implement:  
\- API services layer  
\- React Query caching  
\- centralized API handling  
\- realtime websocket handling

\====================================================  
\# FORBIDDEN IMPLEMENTATION  
\====================================================

DO NOT USE:  
\- mock JSON files  
\- fake arrays  
\- placeholder attendance  
\- dummy employee lists  
\- temporary frontend-only state pretending to be backend data

EVERYTHING MUST BE DATABASE DRIVEN.

\====================================================  
\# REQUIRED OUTPUT  
\====================================================

Generate:  
1\. Full UI/UX architecture  
2\. Complete design system  
3\. Color system  
4\. Typography system  
5\. Component architecture  
6\. Modal system architecture  
7\. Toast system architecture  
8\. Dashboard layouts  
9\. Page layouts  
10\. Realtime UI flows  
11\. Export system implementation  
12\. File download handling  
13\. Frontend folder structure  
14\. Tailwind configuration  
15\. Animation system  
16\. Responsive strategy  
17\. Accessibility strategy  
18\. API integration architecture  
19\. WebSocket integration architecture  
20\. Production-ready frontend implementation

\====================================================  
\# FINAL REQUIREMENT  
\====================================================

Project Z must feel like:  
\- a premium enterprise SaaS platform  
\- modern HR intelligence software  
\- realtime operations dashboard  
\- highly polished production software

The final UI must be:  
\- clean  
\- elegant  
\- futuristic  
\- professional  
\- minimal  
\- responsive  
\- realtime  
\- visually impressive

while remaining:  
\- practical  
\- efficient  
\- maintainable  
\- scalable  
\- production-ready.

