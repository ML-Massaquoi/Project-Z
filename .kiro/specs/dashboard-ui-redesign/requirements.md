# Requirements Document

## Introduction

This feature redesigns the Project Z frontend UI to match a polished target mockup. The current interface is functional but bare-bones — plain white sidebar, minimal chart styling, and no modal/notification system. The redesign transforms it into a production-quality dark-sidebar dashboard with rich data visualizations, interactive modals, a toast notification system, and a fully navigable layout — all backed exclusively by real API data from the existing backend. No mock or dummy data is permitted anywhere in the application.

The stack is React 18 + TypeScript + Vite + Tailwind CSS v4, with Recharts for charts, Framer Motion for animation, Radix UI primitives, React Query for data fetching, Zustand for state, and Sonner for toasts.

---

## Glossary

- **Dashboard**: The main `/` route page showing KPI cards, charts, recent attendance, and device status.
- **Sidebar**: The collapsible left-side navigation panel.
- **Topbar**: The fixed top header bar containing search, notifications, and user controls.
- **KPI Card**: A summary statistic card showing a metric value and its trend vs. the previous period.
- **Attendance_Overview_Chart**: The multi-line Recharts `LineChart` showing Present / Absent / Late counts over the last 7 days.
- **Department_Donut_Chart**: The Recharts `PieChart` (donut style) showing attendance distribution by department.
- **Recent_Attendance_Feed**: A scrollable list of the latest check-in/check-out events from `GET /api/v1/attendance/live`.
- **Today_Attendance_Table**: A filterable, paginated table of today's attendance sessions from `GET /api/v1/attendance/live` and `GET /api/v1/attendance/history`.
- **Device_Status_Panel**: A list of registered devices with online/offline indicators from `GET /api/v1/devices`.
- **Toast_System**: The Sonner-based notification system for success, info, warning, and error messages.
- **Confirm_Modal**: A reusable confirmation dialog (e.g., for delete actions) built on Radix UI Dialog.
- **Export_Modal**: A modal for configuring and triggering attendance report exports (date range, department, format).
- **Add_Employee_Modal**: A multi-step modal wizard for creating a new employee record.
- **WebSocket**: The `/ws` endpoint providing real-time push events for attendance and device status changes.
- **Empty_State**: A meaningful UI shown when a data set is empty, replacing any placeholder numbers.
- **Trend_Indicator**: A percentage badge on a KPI Card showing change vs. the previous period (yesterday or last month).
- **API_Client**: The existing Axios instance in `frontend/src/api/client.ts`.

---

## Requirements

### Requirement 1: Dark Sidebar Layout

**User Story:** As a user, I want a polished dark-sidebar navigation panel, so that the application feels professional and I can navigate between all sections quickly.

#### Acceptance Criteria

1. THE Sidebar SHALL render with a dark background color that meets WCAG AA contrast ratio (minimum 4.5:1) against the text and icon colors used within it.
2. THE Sidebar SHALL display a "Project Z" logo mark and brand name in the header area.
3. WHEN the user clicks the hamburger/collapse toggle button, THE Sidebar SHALL animate between expanded (260 px) and icon-only (72 px) states within 300 ms.
4. WHEN the Sidebar is collapsed, THE Sidebar SHALL display only navigation icons with Radix UI Tooltip labels on hover.
5. THE Sidebar SHALL render the following navigation items in order: Dashboard, Employees, Attendance, Devices, Departments, Shifts, Reports, Calendar, Leave Management.
6. THE Sidebar SHALL render an "ADMIN" section separator followed by: Users & Roles, Settings, Audit Logs.
7. WHEN a navigation item matches the current route, THE Sidebar SHALL apply an accent background and white text to that item.
8. THE Sidebar SHALL display the authenticated user's avatar (initials-based), full name, and role at the bottom of the navigation.
9. WHEN the user clicks the logout control in the Sidebar, THE Sidebar SHALL clear the user session and redirect to `/login`.
10. IF the viewport width is less than 768 px, THEN THE Sidebar SHALL be hidden by default.
11. WHEN the hamburger toggle is activated on a mobile viewport (< 768 px), THE Sidebar SHALL open as an overlay drawer covering the content area.
12. WHEN the user taps outside the overlay drawer on a mobile viewport, THE Sidebar SHALL close the drawer and restore the page state.

---

### Requirement 2: Top Bar

**User Story:** As a user, I want a feature-rich top bar, so that I can search, receive notifications, and access my account controls without leaving the current page.

#### Acceptance Criteria

1. THE Topbar SHALL display a global search input that accepts free-text queries up to 200 characters, and WHEN the user submits the query, THE Topbar SHALL navigate to a filtered search results view.
2. THE Topbar SHALL display a notifications bell icon with a numeric badge showing the count of unread notifications, capped at display "99+" when the count exceeds 99.
3. WHEN all notifications are marked as read, THE Topbar SHALL remove the badge from the notifications bell icon.
4. THE Topbar SHALL display a chat/message icon that, WHEN clicked, opens a messages panel.
5. THE Topbar SHALL display a fullscreen toggle button that calls the browser Fullscreen API, and the icon SHALL reflect the current fullscreen state (enter vs. exit).
6. THE Topbar SHALL display the authenticated user's avatar, full name, and role.
7. WHEN the user clicks the user avatar area, THE Topbar SHALL show a dropdown menu with exactly: Profile, Settings, and Logout options.
8. WHEN the user clicks Logout in the dropdown, THE Topbar SHALL clear the user session and redirect to `/login`.
9. THE Topbar SHALL remain sticky at the top of the viewport during scroll.

---

### Requirement 3: KPI Stat Cards

**User Story:** As a manager, I want KPI stat cards at the top of the dashboard, so that I can see the most important workforce metrics at a glance with trend context.

#### Acceptance Criteria

1. THE Dashboard SHALL display five KPI Cards: Total Employees, Present Today, Late Today, Absent Today, and Active Devices.
2. WHEN the Dashboard mounts, THE Dashboard SHALL fetch KPI data from `GET /api/v1/dashboard/stats` via the API_Client.
3. THE KPI Card SHALL display the metric's current numeric value formatted with locale-appropriate thousands separators.
4. THE KPI Card SHALL display a Trend_Indicator badge showing the percentage change vs. the previous period as returned by the `trends` object in the API response.
5. IF the trend value is positive, THEN THE KPI Card SHALL render the Trend_Indicator with a green upward-arrow style.
6. IF the trend value is negative, THEN THE KPI Card SHALL render the Trend_Indicator with a red downward-arrow style.
7. IF the trend value is zero or absent, THEN THE KPI Card SHALL omit the Trend_Indicator badge.
8. WHILE the stats API call is in-flight, THE Dashboard SHALL render skeleton placeholder cards in place of the KPI Cards.
9. IF the stats API call fails, THEN THE Dashboard SHALL display an inline error state on the KPI Cards section with a retry action.
10. THE Dashboard SHALL refetch KPI stats automatically every 30 seconds.
11. WHEN a WebSocket event of type `attendance.created`, `employee.checked_in`, or `employee.checked_out` is received, THE Dashboard SHALL immediately invalidate and refetch the `dashboard-stats` query.

---

### Requirement 4: Attendance Overview Chart

**User Story:** As a manager, I want a multi-line attendance chart for the current week, so that I can spot attendance trends across days.

#### Acceptance Criteria

1. THE Dashboard SHALL display an Attendance_Overview_Chart showing Present, Absent, and Late counts for each of the last 7 days (today − 6 to today inclusive).
2. WHEN the Dashboard mounts, THE Dashboard SHALL fetch chart data from `GET /api/v1/dashboard/charts` via the API_Client.
3. THE Attendance_Overview_Chart SHALL render three distinct lines: Present (blue), Absent (slate/grey), and Late (amber).
4. THE Attendance_Overview_Chart SHALL display a legend identifying each line by color and label.
5. THE Attendance_Overview_Chart SHALL display a "This Week" period label in the card header.
6. WHILE the charts API call is in-flight, THE Dashboard SHALL render a skeleton placeholder in place of the Attendance_Overview_Chart.
7. IF the charts API returns an empty `attendance_overview` array, THEN THE Attendance_Overview_Chart SHALL display an Empty_State message "No attendance data for this week" instead of an empty chart area.
8. IF the charts API call fails, THEN THE Attendance_Overview_Chart SHALL display an inline error state with a retry action.
9. THE Dashboard SHALL refetch chart data automatically every 60 seconds, replacing stale data with the fresh response.

---

### Requirement 5: Attendance by Department Chart

**User Story:** As a manager, I want a donut chart showing attendance distribution by department, so that I can identify which departments have the most or least attendance today.

#### Acceptance Criteria

1. THE Dashboard SHALL display a Department_Donut_Chart showing today's attendance count per department.
2. THE Department_Donut_Chart SHALL use the `department_breakdown` array from `GET /api/v1/dashboard/charts`.
3. THE Department_Donut_Chart SHALL render each department as a distinct colored segment with a matching legend entry showing department name, count, and percentage rounded to one decimal place.
4. WHEN the user hovers over a segment, THE Department_Donut_Chart SHALL display a tooltip showing department name, count, and percentage rounded to one decimal place.
5. IF the `department_breakdown` array is empty, THEN THE Department_Donut_Chart SHALL display an Empty_State message "No department attendance data for today" instead of an empty chart.
6. WHILE the charts API call is in-flight, THE Dashboard SHALL render a skeleton placeholder in place of the Department_Donut_Chart.
7. IF the charts API call fails, THEN THE Department_Donut_Chart SHALL display an inline error state with a retry action.

---

### Requirement 6: Recent Attendance Feed

**User Story:** As a supervisor, I want a real-time feed of recent check-ins and check-outs on the dashboard, so that I can monitor who is arriving or leaving right now.

#### Acceptance Criteria

1. THE Dashboard SHALL display a Recent_Attendance_Feed showing the 8 most recent attendance log entries ordered by timestamp descending.
2. WHEN the Dashboard mounts, THE Dashboard SHALL fetch data from `GET /api/v1/attendance/live` with a limit of 8 records via the API_Client.
3. EACH entry in the Recent_Attendance_Feed SHALL display: employee avatar (initials-based), employee full name, department name, IN/OUT badge, timestamp formatted as `hh:mm a`, and device name with IP address as fallback.
4. THE Recent_Attendance_Feed SHALL refetch automatically every 15 seconds.
5. WHEN a WebSocket event of type `attendance.created`, `employee.checked_in`, or `employee.checked_out` is received, THE Recent_Attendance_Feed SHALL immediately invalidate and refetch the `attendance-live` query.
6. IF the live attendance API returns zero records, THEN THE Recent_Attendance_Feed SHALL display an Empty_State with a fingerprint icon and the message "No attendance records yet — records appear when devices push data."
7. THE Recent_Attendance_Feed SHALL include a "View All" link navigating to `/attendance`.
8. IF the live attendance API call fails, THEN THE Recent_Attendance_Feed SHALL display an inline error state with a retry action.

---

### Requirement 7: Today's Attendance Table

**User Story:** As an HR administrator, I want a filterable attendance table on the dashboard, so that I can quickly review and export today's attendance without navigating away.

#### Acceptance Criteria

1. THE Dashboard SHALL display a Today_Attendance_Table showing today's attendance sessions.
2. THE Today_Attendance_Table SHALL fetch data from `GET /api/v1/attendance/live` via the API_Client.
3. THE Today_Attendance_Table SHALL display columns: Employee (avatar + name), Department, Status (IN/OUT badge), Time, and Device.
4. THE Today_Attendance_Table SHALL provide filter controls for: Department (select), Status (select: All / IN / OUT), and Date (date picker defaulting to today).
5. THE Today_Attendance_Table SHALL provide export action buttons: Excel, PDF, CSV, and Print.
6. WHEN the user clicks an export button, THE Today_Attendance_Table SHALL call `GET /api/v1/reports/attendance` with the current filter parameters and the selected format, then trigger a file download.
7. IF the filtered result set is empty, THEN THE Today_Attendance_Table SHALL display an Empty_State row with the message "No attendance records match the selected filters."
8. WHILE data is loading, THE Today_Attendance_Table SHALL render skeleton rows.

---

### Requirement 8: Device Status Panel

**User Story:** As an IT administrator, I want a device status panel on the dashboard, so that I can see at a glance which biometric terminals are online or offline.

#### Acceptance Criteria

1. THE Dashboard SHALL display a Device_Status_Panel listing all active (`is_active = true`) registered devices.
2. WHEN the Dashboard mounts, THE Dashboard SHALL fetch device data from `GET /api/v1/devices` via the API_Client.
3. IF a device's `name` field is null or empty, THEN THE Device_Status_Panel SHALL display the device's serial number as its label, followed by the IP address.
4. IF a device's `is_online` field is `true`, THEN THE Device_Status_Panel SHALL render a green "Online" badge for that device.
5. IF a device's `is_online` field is `false`, THEN THE Device_Status_Panel SHALL render a grey "Offline" badge for that device.
6. WHEN a WebSocket event of type `device.status` or `device.registered` is received, THE Device_Status_Panel SHALL invalidate and refetch the `devices` query within 2 seconds of receiving the event.
7. IF the devices API returns zero active records, THEN THE Device_Status_Panel SHALL display an Empty_State with a monitor icon and the message "No devices registered — devices auto-register when they connect."
8. THE Device_Status_Panel SHALL include a "View All" link navigating to `/devices`.
9. THE Dashboard SHALL refetch device data automatically every 30 seconds.
10. IF the devices API call fails, THEN THE Device_Status_Panel SHALL display an inline error state with a retry action.

---

### Requirement 9: Toast Notification System

**User Story:** As a user, I want contextual toast notifications for system events, so that I receive immediate feedback on actions and real-time alerts without interrupting my workflow.

#### Acceptance Criteria

1. THE Toast_System SHALL support four severity levels: success, info, warning, and error.
2. WHEN a user action completes successfully, THE Toast_System SHALL display a success toast whose message includes the action name and the subject entity (e.g., "Employee Maria Santos added successfully").
3. WHEN a user action fails and the API response contains a parseable error message, THE Toast_System SHALL display an error toast showing that error message.
4. IF the API response does not contain a parseable error message, THEN THE Toast_System SHALL display an error toast with the message "An unexpected error occurred. Please try again."
5. WHEN a WebSocket event of type `alert.late_employee` is received, THE Toast_System SHALL display a warning toast containing the employee name, employee code, and number of minutes late from the event payload.
6. THE Toast_System SHALL render toasts in the top-right corner of the viewport.
7. THE Toast_System SHALL auto-dismiss non-error toasts after 4 seconds.
8. IF a toast is of severity error, THEN THE Toast_System SHALL auto-dismiss it after 6 seconds.
9. EACH toast SHALL include a manual close button.
10. THE Toast_System SHALL use the existing Sonner `<Toaster>` component already mounted in `AppLayout`.

---

### Requirement 10: Confirm Action Modal

**User Story:** As an administrator, I want a confirmation dialog before destructive actions, so that I do not accidentally delete employees or other records.

#### Acceptance Criteria

1. THE Confirm_Modal SHALL be a reusable component built on the Radix UI `Dialog` primitive, accepting: `title`, `description`, `confirmLabel` (maximum 50 characters), `onConfirm`, and `onCancel` props.
2. WHEN a destructive action is triggered (e.g., delete employee), THE Confirm_Modal SHALL open and display the provided title and description.
3. WHEN the user clicks the confirm button, THE Confirm_Modal SHALL call `onConfirm` and only close the modal after `onConfirm` resolves successfully.
4. WHEN the user clicks cancel or presses Escape, THE Confirm_Modal SHALL call `onCancel` and close without performing any action.
5. WHILE the confirm action is in-flight (async), THE Confirm_Modal SHALL disable the confirm button and show a loading indicator.
6. WHILE the confirm action is in-flight (async), THE Confirm_Modal SHALL ignore cancel button clicks and Escape key presses without closing or calling `onCancel`.
7. IF the `onConfirm` async action rejects or throws an error, THEN THE Confirm_Modal SHALL remain open, remove the loading indicator, re-enable the confirm button, and display an error message indicating the action failed.

---

### Requirement 11: Export Attendance Report Modal

**User Story:** As an HR administrator, I want an export modal with configurable options, so that I can generate attendance reports for specific date ranges, departments, and file formats.

#### Acceptance Criteria

1. THE Export_Modal SHALL provide a date range selector with start date (defaulting to 30 days prior to today) and end date (defaulting to today) fields in YYYY-MM-DD format.
2. THE Export_Modal SHALL provide a department selector populated from `GET /api/v1/departments` (with an "All Departments" option as the default).
3. THE Export_Modal SHALL provide a format selector with options: Excel (`.xlsx`), PDF, and CSV.
4. IF the start date is after the end date, or either date field is empty, THEN THE Export_Modal SHALL disable the Export button and display an inline validation message.
5. WHEN the user clicks "Export" with valid inputs, THE Export_Modal SHALL call `GET /api/v1/reports/attendance` with the selected parameters and trigger a browser file download.
6. WHILE the export request is in-flight, THE Export_Modal SHALL disable the Export button and show a loading spinner.
7. WHEN the export completes successfully, THE Export_Modal SHALL close and THE Toast_System SHALL display a success toast.
8. IF the export request fails, THEN THE Export_Modal SHALL display an inline error message indicating the failure reason and THE Toast_System SHALL display an error toast.
9. IF the department list API call fails, THEN THE Export_Modal SHALL display an inline error in the department selector and disable the Export button until the list is successfully loaded.
10. THE Export_Modal SHALL be built on the Radix UI `Dialog` primitive.

---

### Requirement 12: Add New Employee Multi-Step Modal

**User Story:** As an HR administrator, I want a multi-step modal to add new employees, so that I can enter all required information in a structured, guided flow without a full-page navigation.

#### Acceptance Criteria

1. THE Add_Employee_Modal SHALL be a four-step wizard built on the Radix UI `Dialog` primitive with steps: (1) Personal Info, (2) Work Info, (3) Shift & Schedule, (4) Documents.
2. THE Add_Employee_Modal SHALL display a step progress indicator showing the current step number and step name.
3. WHEN the user completes a step and clicks "Next", THE Add_Employee_Modal SHALL validate the current step's fields using React Hook Form + Zod before advancing.
4. IF validation fails on the current step, THEN THE Add_Employee_Modal SHALL display inline field-level error messages without advancing.
5. WHEN the user clicks "Back", THE Add_Employee_Modal SHALL return to the previous step without losing entered data.
6. THE Personal Info step SHALL collect: full name (required, max 255 characters), employee code (required, max 50 characters), email (required, valid email format), and phone number (optional, max 50 characters).
7. THE Work Info step SHALL collect: position/job title (required), department (required, populated from `GET /api/v1/departments` filtered to `is_active = true`), and employment status (required, one of: active / inactive / suspended / terminated).
8. THE Shift & Schedule step SHALL collect: assigned shift (optional, populated from `GET /api/v1/shifts` filtered to `is_active = true`).
9. THE Documents step SHALL provide a file upload area accepting PDF, JPG, JPEG, and PNG files, with a maximum of 5 files and a maximum size of 10 MB per file.
10. WHEN the user completes the final step and clicks "Submit", THE Add_Employee_Modal SHALL call `POST /api/v1/employees` with the collected data.
11. WHEN the API call succeeds, THE Add_Employee_Modal SHALL close, THE Toast_System SHALL display a success toast, and the employees list query SHALL be invalidated.
12. IF the API call returns a 409 conflict on `employee_code`, THEN THE Add_Employee_Modal SHALL navigate back to step 1 and display an inline error on the employee code field.
13. IF the API call fails for any reason other than a 409 conflict, THEN THE Add_Employee_Modal SHALL display an error message on the final step and THE Toast_System SHALL display an error toast.
14. WHEN the user presses Escape or activates the modal dismiss control, THE Add_Employee_Modal SHALL close and discard all entered data.

---

### Requirement 13: Real-Time WebSocket Integration

**User Story:** As a user, I want the dashboard to update automatically when attendance events occur, so that I always see current data without manually refreshing.

#### Acceptance Criteria

1. THE AppLayout SHALL maintain exactly one active WebSocket connection to `/ws` per authenticated session.
2. WHEN the WebSocket connection is lost or encounters an error, THE AppLayout SHALL attempt to reconnect automatically with a 3-second delay.
3. WHEN a WebSocket event of type `attendance.created`, `employee.checked_in`, or `employee.checked_out` is received, THE Dashboard SHALL invalidate the `attendance-live`, `dashboard-stats`, and `dashboard-charts` React Query cache keys.
4. WHEN a WebSocket event of type `device.status` or `device.registered` is received, THE Dashboard SHALL invalidate the `devices` and `dashboard-stats` React Query cache keys.
5. WHEN a WebSocket event of type `alert.late_employee` is received, THE Dashboard SHALL invalidate the `dashboard-stats` cache key and THE Toast_System SHALL display a warning toast containing the employee name, employee code, and late minutes from the event payload.
6. THE WebSocket connection SHALL be established once at the `AppLayout` level and exactly one connection SHALL be active regardless of page navigation within the authenticated session.

---

### Requirement 14: Empty States

**User Story:** As a user, I want meaningful empty-state UI when data is unavailable, so that I understand the system state and am not confused by blank panels or zero-filled cards.

#### Acceptance Criteria

1. THE Dashboard SHALL never display hardcoded or mock numeric values; all displayed values SHALL originate from API responses.
2. WHEN an API response returns an empty collection, THE corresponding UI panel SHALL display an Empty_State component with a relevant icon, a primary message, and a secondary hint message.
3. THE KPI Cards SHALL display `0` when the API returns zero or null for a metric.
4. WHILE any API call is in-flight, THE corresponding panel SHALL display a loading skeleton and SHALL NOT display an Empty_State.
5. IF an API call fails, THEN THE corresponding panel SHALL display an error state (not an Empty_State) with a retry action.
6. IF the `attendance_overview` array is empty, THEN THE Attendance_Overview_Chart SHALL display an Empty_State with a chart icon and the message "No attendance data available for this period."
7. IF the `department_breakdown` array is empty, THEN THE Department_Donut_Chart SHALL display an Empty_State with a pie-chart icon and the message "No department attendance data for today."
8. IF the live attendance API returns zero records, THEN THE Recent_Attendance_Feed SHALL display an Empty_State with a fingerprint icon and the message "No attendance records yet — records appear when devices push data."
9. IF the devices API returns zero active records, THEN THE Device_Status_Panel SHALL display an Empty_State with a monitor icon and the message "No devices registered — devices auto-register when they connect."
10. IF the filtered attendance result set is empty, THEN THE Today_Attendance_Table SHALL display an Empty_State with a table icon and the message "No attendance records match the selected filters."

---

### Requirement 15: Responsive Layout

**User Story:** As a user accessing the dashboard on different screen sizes, I want the layout to adapt gracefully, so that the application is usable on both desktop and tablet viewports.

#### Acceptance Criteria

1. IF the viewport width is ≥ 1280 px, THEN THE Dashboard layout SHALL use a multi-column CSS grid.
2. IF the viewport width is < 1280 px and ≥ 768 px, THEN THE Dashboard layout SHALL collapse to a reduced-column or single-column stack.
3. IF the viewport width is ≥ 1280 px, THEN THE KPI Cards row SHALL display 5 columns.
4. IF the viewport width is ≥ 768 px and < 1280 px, THEN THE KPI Cards row SHALL display 3 columns.
5. IF the viewport width is < 768 px, THEN THE KPI Cards row SHALL display 2 columns.
6. IF the viewport width is < 768 px, THEN THE Sidebar SHALL be hidden by default.
7. WHEN the hamburger toggle is activated on a mobile viewport (< 768 px), THE Sidebar SHALL open as an overlay drawer.
8. WHEN the user activates the close control or taps outside the overlay drawer, THE Sidebar SHALL close and restore the page state.
9. THE Topbar SHALL remain fully functional on all viewport sizes; the clock widget and search input label SHALL be hidden on viewports < 768 px, while the search input field, navigation controls, and user account controls SHALL remain visible and interactive.
10. WHILE a table's content width exceeds the available viewport width, THE table SHALL be horizontally scrollable without clipping or hiding any table columns.
