# Implementation Plan: Dashboard UI Redesign

## Overview

Incremental implementation of the Project Z dashboard UI redesign. Each task builds on the previous, starting with foundational infrastructure (CSS tokens, types, test setup), then layout shell components, then dashboard panels, then modals, and finally wiring everything together. All data comes from existing API endpoints — no new backend work required.

Stack: React 18 + TypeScript + Vite + Tailwind CSS v4 + Recharts + Framer Motion + Radix UI + React Query + Zustand + Sonner.

## Tasks

- [x] 1. Set up foundations: CSS tokens, TypeScript types, test infrastructure, and utility helpers
  - [x] 1.1 Add dark sidebar CSS custom properties to `frontend/src/index.css` inside the `@theme` block
    - Add tokens: `--color-sidebar-bg`, `--color-sidebar-border`, `--color-sidebar-text`, `--color-sidebar-text-muted`, `--color-sidebar-icon`, `--color-sidebar-active-bg`, `--color-sidebar-active-text`, `--color-sidebar-hover-bg`, `--color-sidebar-user-bg`
    - Values as specified in the design (slate-900 base, slate-800 border/hover, primary blue active)
    - _Requirements: 1.1_

  - [x] 1.2 Add new TypeScript interfaces to `frontend/src/types/index.ts`
    - Add `Notification`, `ExportFormValues`, `AddEmployeeFormValues`, `LateEmployeeAlertPayload` interfaces
    - _Requirements: 2.2, 9.5, 11.1, 12.1, 13.5_

  - [x] 1.3 Add `extractErrorMessage` utility to `frontend/src/lib/utils.ts`
    - Implement the Axios error extraction helper alongside the existing `cn` helper
    - _Requirements: 9.3, 9.4_

  - [x] 1.4 Install test dependencies and configure Vitest
    - Run: `npm install --save-dev vitest @testing-library/react @testing-library/user-event fast-check jsdom`
    - Add `vitest.config.ts` (or extend `vite.config.ts`) with jsdom environment and `@testing-library/jest-dom` setup
    - Create `frontend/src/__tests__/properties/` and `frontend/src/__tests__/unit/` directories with `.gitkeep`
    - _Requirements: (test infrastructure)_


- [ ] 2. Build shared UI primitives: EmptyState, ErrorState, SkeletonCard, SkeletonRow
  - [-] 2.1 Create `frontend/src/components/ui/EmptyState.tsx`
    - Implement `EmptyStateProps` interface: `icon: LucideIcon`, `message: string`, `hint?: string`, `className?: string`
    - Render centered column: icon (muted, size 40), primary message (sm, slate-600), optional hint (xs, slate-400)
    - _Requirements: 14.2_

  - [-] 2.2 Create `frontend/src/components/ui/ErrorState.tsx`
    - Implement `ErrorStateProps` interface: `message?: string`, `onRetry?: () => void`, `className?: string`
    - Render alert icon, error message, and "Retry" button calling `onRetry`
    - _Requirements: 14.5_

  - [x] 2.3 Create `frontend/src/components/ui/SkeletonCard.tsx` and `SkeletonRow.tsx`
    - `SkeletonCard`: animated pulse placeholder matching KPI card dimensions
    - `SkeletonRow`: animated pulse placeholder for table rows (5 columns)
    - _Requirements: 3.8, 4.6, 5.6, 7.8_

  - [ ]* 2.4 Write unit tests for EmptyState and ErrorState
    - Test `EmptyState` renders correct icon, message, and hint for each per-panel config
    - Test `ErrorState` renders retry button and calls `onRetry` on click
    - File: `frontend/src/__tests__/unit/emptyState.test.tsx`, `errorState.test.tsx`
    - _Requirements: 14.2, 14.5_


- [x] 3. Redesign Sidebar component with dark theme, full nav, and mobile drawer
  - [x] 3.1 Modify `frontend/src/components/layout/Sidebar.tsx` — dark theme and full navigation list
    - Replace `bg-white` with `bg-[var(--color-sidebar-bg)]` and update all color tokens per design spec
    - Add all `mainNav` and `adminNav` items with correct icons from `lucide-react`
    - Add "Project Z" logo/brand in header area
    - Add user profile area at bottom (avatar initials, full name, role) reading from `useAuthStore`
    - Add logout control calling `authStore.logout()` then `navigate('/login')`
    - _Requirements: 1.1, 1.2, 1.5, 1.6, 1.8, 1.9_

  - [x] 3.2 Add sidebar collapse animation and Radix Tooltip labels
    - Wire `collapsed: boolean` local state to `motion.aside` with `animate={{ width: collapsed ? 72 : 260 }}` and `transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}`
    - Add `AnimatePresence` + `motion.span` for nav label fade-in/out
    - Wrap each icon in `@radix-ui/react-tooltip` when `collapsed === true`
    - Add collapse toggle button
    - _Requirements: 1.3, 1.4_

  - [x] 3.3 Add active route styling to nav items
    - Apply `bg-[var(--color-sidebar-active-bg)] text-[var(--color-sidebar-active-text)]` when `NavLink` `isActive` is true
    - Apply `hover:bg-[var(--color-sidebar-hover-bg)]` for inactive items
    - _Requirements: 1.7_

  - [ ]* 3.4 Write property test for active navigation item styling (Property 1)
    - **Property 1: Active navigation item styling**
    - For any nav item `to` path and any current route, active styles are applied iff paths match
    - File: `frontend/src/__tests__/properties/sidebar.property.test.ts`
    - **Validates: Requirements 1.7**

  - [x] 3.5 Add mobile overlay drawer to Sidebar and lift `mobileOpen` state to AppLayout
    - Add `mobileOpen: boolean` + `setMobileOpen` props to Sidebar
    - Implement `AnimatePresence` backdrop (`motion.div`, opacity 0→1) and fixed drawer (`motion.aside`, x: -260→0)
    - Close drawer on outside tap (`onClick` on backdrop)
    - Hide desktop sidebar on mobile (`hidden md:flex`); show mobile drawer only on `< md`
    - _Requirements: 1.10, 1.11, 1.12, 15.6, 15.7, 15.8_


- [x] 4. Redesign Topbar and update AppLayout
  - [x] 4.1 Modify `frontend/src/components/layout/AppLayout.tsx`
    - Add `mobileOpen: boolean` + `setMobileOpen` local state
    - Pass `mobileOpen`, `setMobileOpen` as props to `<Sidebar>` and `onMenuToggle` to `<Topbar>`
    - Add `pageTitles` entries for `/calendar`, `/leave`, `/users`, `/audit`
    - _Requirements: 1.11, 2.9_

  - [x] 4.2 Modify `frontend/src/components/layout/Topbar.tsx` — search, notifications, fullscreen, user dropdown
    - Add `onMenuToggle: () => void` prop; render hamburger button (`flex md:hidden`) calling it
    - Add controlled search input (max 200 chars) with `searchValue` local state
    - Add notification bell with badge using `badgeDisplay` logic (`count > 99 ? '99+' : count > 0 ? String(count) : ''`)
    - Add fullscreen toggle button; sync `isFullscreen` state via `document.fullscreenchange` listener
    - Add user avatar, name, role (hidden on mobile: `hidden md:block`)
    - Hide clock widget on `< lg` (`hidden lg:flex`); hide search label on `< md` (`hidden md:inline`)
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 2.9, 15.9_

  - [x] 4.3 Add Radix DropdownMenu for user account controls in Topbar
    - Build with `@radix-ui/react-dropdown-menu`; items: Profile (`/profile`), Settings (`/settings`), separator, Logout
    - Logout calls `authStore.logout()` then `navigate('/login')`
    - _Requirements: 2.7, 2.8_

  - [ ]* 4.4 Write property tests for notification badge display and search input limit (Properties 2 & 3)
    - **Property 2: Notification badge display** — `badgeDisplay(n)` returns `"99+"` when `n > 99`, `String(n)` when `0 < n ≤ 99`, `""` when `n === 0`
    - **Property 3: Search input character limit** — any input > 200 chars is capped at 200
    - File: `frontend/src/__tests__/properties/topbar.property.test.ts`
    - **Validates: Requirements 2.1, 2.2, 2.3**


- [x] 5. Checkpoint — layout shell complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement KPI StatCard component and Dashboard stats section
  - [x] 6.1 Create `frontend/src/pages/dashboard/StatCard.tsx`
    - Props: `icon: LucideIcon`, `label: string`, `value: number`, `change?: number`, `color: string`, `delay: number`
    - Display value with `value.toLocaleString()`
    - Render trend badge: green upward arrow when `change > 0`, red downward arrow when `change < 0`, omit when `change === 0` or absent
    - Apply Framer Motion entrance animation (`cardVariants` with `delay` prop)
    - _Requirements: 3.3, 3.4, 3.5, 3.6, 3.7_

  - [ ]* 6.2 Write property tests for KPI value formatting and trend indicator (Properties 4 & 5)
    - **Property 4: KPI value formatting** — any non-negative integer displays as `value.toLocaleString()`
    - **Property 5: Trend indicator rendering** — positive → green upward badge `Math.abs(t)%`; negative → red downward badge; zero/absent → no badge
    - File: `frontend/src/__tests__/properties/statCard.property.test.ts`
    - **Validates: Requirements 3.3, 3.4, 3.5, 3.6, 3.7**

  - [x] 6.3 Wire KPI cards into `frontend/src/pages/Dashboard.tsx` with React Query
    - Add `useQuery({ queryKey: ['dashboard-stats'], queryFn: ..., refetchInterval: 30000, staleTime: 0, retry: 2 })`
    - Render 5 `<StatCard>` components in staggered `motion.div` container (`containerVariants` / `cardVariants`)
    - Grid: `grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4`
    - Show `<SkeletonCard>` ×5 while loading; `<ErrorState onRetry={refetch}>` on error
    - _Requirements: 3.1, 3.2, 3.8, 3.9, 3.10, 14.1, 14.3, 14.4, 15.3, 15.4, 15.5_

  - [ ]* 6.4 Write property test for KPI grid responsive column count (Property 18)
    - **Property 18: KPI grid responsive column count** — 5 cols at ≥1280px, 3 cols at 768–1279px, 2 cols at <768px
    - File: `frontend/src/__tests__/properties/responsiveGrid.property.test.ts`
    - **Validates: Requirements 15.3, 15.4, 15.5**


- [ ] 7. Implement Attendance Overview Chart and Department Donut Chart
  - [x] 7.1 Create `frontend/src/pages/dashboard/AttendanceOverviewChart.tsx`
    - `useQuery({ queryKey: ['dashboard-charts'], queryFn: ..., refetchInterval: 60000, staleTime: 0, retry: 2 })`
    - Render Recharts `<LineChart>` with three `<Line>` elements: Present (blue), Absent (slate), Late (amber)
    - Include legend and "This Week" period label in card header
    - Show `<SkeletonCard>` while loading; `<ErrorState onRetry={refetch}>` on error; `<EmptyState icon={BarChart2} message="No attendance data for this week" hint="Data appears once devices push records">` when `attendance_overview.length === 0`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 14.2, 14.4, 14.5_

  - [ ] 7.2 Create `frontend/src/pages/dashboard/DepartmentDonutChart.tsx`
    - Reuse the `['dashboard-charts']` query (no duplicate fetch — same query key)
    - Render Recharts `<PieChart>` donut with colored segments and legend (name, count, percentage to 1 dp)
    - Custom tooltip formatter: `(value, name, props) => [props.payload.percentage.toFixed(1) + '%', name]`
    - Show `<SkeletonCard>` while loading; `<ErrorState onRetry={refetch}>` on error; `<EmptyState icon={PieChart} message="No department attendance data for today" hint="Assign employees to departments to see breakdown">` when empty
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 14.2, 14.4, 14.5_

  - [ ]* 7.3 Write property test for department percentage rounding (Property 7)
    - **Property 7: Department percentage rounding** — any `percentage` value `p` displays as `p.toFixed(1) + "%"` in legend and tooltip
    - File: `frontend/src/__tests__/properties/departmentChart.property.test.ts`
    - **Validates: Requirements 5.3, 5.4**

  - [~] 7.4 Add charts row to `Dashboard.tsx`
    - Grid: `grid-cols-1 lg:grid-cols-3 gap-4`; `AttendanceOverviewChart` spans `lg:col-span-2`, `DepartmentDonutChart` spans `lg:col-span-1`
    - _Requirements: 4.1, 5.1, 15.1, 15.2_


- [ ] 8. Implement Recent Attendance Feed
  - [~] 8.1 Create `frontend/src/pages/dashboard/RecentAttendanceFeed.tsx`
    - `useQuery({ queryKey: ['attendance-live'], queryFn: () => attendanceAPI.live({ limit: 8 }), refetchInterval: 15000, staleTime: 0, retry: 2 })`
    - Render up to 8 items ordered by timestamp descending: employee avatar (initials), full name, department, IN/OUT badge, timestamp formatted as `hh:mm a`, device name (fallback to IP)
    - Show `<SkeletonRow>` while loading; `<ErrorState onRetry={refetch}>` on error; `<EmptyState icon={Fingerprint} message="No attendance records yet" hint="Records appear when devices push data">` when empty
    - Include "View All" link to `/attendance`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 6.7, 6.8, 14.2, 14.4, 14.5_

  - [ ]* 8.2 Write property tests for attendance feed limit and timestamp formatting (Properties 8 & 9)
    - **Property 8: Recent attendance feed limit** — displays exactly `Math.min(entries.length, 8)` items, most recent first
    - **Property 9: Attendance timestamp formatting** — any valid ISO 8601 timestamp displays as `hh:mm a` pattern
    - File: `frontend/src/__tests__/properties/attendanceFeed.property.test.ts`
    - **Validates: Requirements 6.1, 6.3**


- [ ] 9. Implement Today's Attendance Table
  - [~] 9.1 Create `frontend/src/pages/dashboard/TodayAttendanceTable.tsx`
    - Reuse `['attendance-live']` query (shared with feed, no duplicate fetch)
    - Columns: Employee (avatar + name), Department, Status (IN/OUT badge), Time, Device
    - Local filter state: `{ department: string, status: 'all' | 'in' | 'out', date: string }` (date defaults to today)
    - Render Department select, Status select, and Date picker filter controls
    - Show `<SkeletonRow>` ×5 while loading; `<EmptyState icon={Table2} message="No attendance records match the selected filters" hint="Try adjusting the filters above">` when filtered result is empty
    - Wrap table in `<div className="overflow-x-auto"><table className="w-full min-w-[600px]">` for horizontal scroll
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.7, 7.8, 14.2, 14.4, 15.10_

  - [~] 9.2 Add export action buttons to TodayAttendanceTable
    - Render Excel, PDF, CSV, and Print buttons
    - Each button calls `reportsAPI.attendance({ ...currentFilters, format })` with `responseType: 'blob'`, creates object URL, triggers `<a>` download, revokes URL
    - Show loading state on active button; `toast.success` on success; `toast.error` on failure
    - _Requirements: 7.5, 7.6_


- [ ] 10. Implement Device Status Panel
  - [ ] 10.1 Create `frontend/src/pages/dashboard/DeviceStatusPanel.tsx`
    - `useQuery({ queryKey: ['devices'], queryFn: devicesAPI.list, refetchInterval: 30000, staleTime: 0, retry: 2 })`
    - Filter to `is_active === true` client-side
    - Display label: `device.name || device.serial_number`, followed by IP address
    - Render green "Online" badge when `is_online === true`; grey "Offline" badge when `is_online === false`
    - Show `<SkeletonRow>` while loading; `<ErrorState onRetry={refetch}>` on error; `<EmptyState icon={Monitor} message="No devices registered" hint="Devices auto-register when they connect">` when empty
    - Include "View All" link to `/devices`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.7, 8.8, 8.9, 8.10, 14.2, 14.4, 14.5_

  - [ ]* 10.2 Write property test for device display label and badge (Property 10)
    - **Property 10: Device display label and badge** — null/empty `name` → shows `serial_number`; `is_online` true → green "Online"; false → grey "Offline"
    - File: `frontend/src/__tests__/properties/devicePanel.property.test.ts`
    - **Validates: Requirements 8.3, 8.4, 8.5**

  - [ ] 10.3 Add bottom row to `Dashboard.tsx`
    - Grid: `grid-cols-1 lg:grid-cols-3 gap-4`; `TodayAttendanceTable` spans `lg:col-span-2`, `DeviceStatusPanel` spans `lg:col-span-1`
    - _Requirements: 7.1, 8.1, 15.1, 15.2_


- [ ] 11. Checkpoint — all dashboard panels complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Implement WebSocket `alert.late_employee` toast and verify query invalidation map
  - [ ] 12.1 Modify `frontend/src/hooks/useWebSocket.ts` — add late employee toast
    - Import `toast` from `sonner` and `LateEmployeeAlertPayload` from `@/types`
    - In the `alert.late_employee` case: cast `msg.data` to `LateEmployeeAlertPayload`, call `toast.warning(\`${payload.employee_name} (${payload.employee_code}) is ${payload.late_minutes} minutes late\`, { duration: 6000 })`
    - _Requirements: 9.5, 13.5_

  - [ ]* 12.2 Write property test for WebSocket event → query invalidation routing (Property 6)
    - **Property 6: WebSocket event → query invalidation routing** — attendance events invalidate `['attendance-live']`, `['dashboard-stats']`, `['dashboard-charts']`; device events invalidate `['devices']`, `['dashboard-stats']`; no extra keys invalidated
    - File: `frontend/src/__tests__/properties/websocket.property.test.ts`
    - **Validates: Requirements 3.11, 6.5, 8.6, 13.3, 13.4**

  - [ ]* 12.3 Write property test for late employee toast content (Property 16)
    - **Property 16: Late employee toast content** — any `alert.late_employee` payload with `employee_name`, `employee_code`, `late_minutes` produces a warning toast containing all three values
    - File: `frontend/src/__tests__/properties/toastSystem.property.test.ts`
    - **Validates: Requirements 9.5, 13.5**


- [ ] 13. Implement ConfirmModal
  - [ ] 13.1 Create `frontend/src/components/modals/ConfirmModal.tsx`
    - Built on `@radix-ui/react-dialog`
    - Props: `open`, `title`, `description`, `confirmLabel` (max 50 chars), `onConfirm: () => Promise<void>`, `onCancel`, `variant?: 'danger' | 'default'`
    - Internal state: `loading: boolean`, `error: string | null`
    - On confirm: set `loading = true`, call `onConfirm()`, on success close; on rejection set `error` and `loading = false`
    - While loading: suppress cancel button, Escape key, and outside click via `onInteractOutside={(e) => e.preventDefault()}` and `onEscapeKeyDown={(e) => e.preventDefault()}`
    - Apply Framer Motion entrance animation on inner wrapper
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [ ]* 13.2 Write unit tests for ConfirmModal async flows
    - Test: confirm resolves → modal closes; confirm rejects → error shown, modal stays open; loading state disables cancel and Escape
    - File: `frontend/src/__tests__/unit/confirmModal.test.tsx`
    - _Requirements: 10.3, 10.5, 10.6, 10.7_


- [ ] 14. Implement ExportModal
  - [ ] 14.1 Create `frontend/src/components/modals/ExportModal.tsx`
    - Built on `@radix-ui/react-dialog` with `react-hook-form` + Zod (`exportSchema`)
    - Default values: `startDate = format(subDays(new Date(), 30), 'yyyy-MM-dd')`, `endDate = format(new Date(), 'yyyy-MM-dd')`
    - Department list via `useQuery(['departments'])` → `departmentsAPI.list()`; on error show inline error and disable Export
    - Format selector: Excel (`.xlsx`), PDF, CSV
    - Disable Export button and show validation message when `startDate > endDate` or either is empty
    - Export action: call `reportsAPI.attendance({ ... })` with `responseType: 'blob'`, create object URL, trigger download, revoke URL, close modal, `toast.success`; on error: inline error + `toast.error`
    - Show loading spinner on Export button while in-flight
    - Apply Framer Motion entrance animation
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10_

  - [ ]* 14.2 Write property tests for export filter passthrough, date range validation, and default dates (Properties 11, 12, 13)
    - **Property 11: Export filter parameters passthrough** — any valid `{ startDate, endDate, departmentId, format }` is passed to `reportsAPI.attendance` unchanged
    - **Property 12: Export date range validation** — Export enabled iff both dates non-empty and `startDate <= endDate`
    - **Property 13: Export modal default date range** — on open, `startDate` is exactly 30 days before today, `endDate` is today
    - File: `frontend/src/__tests__/properties/exportModal.property.test.ts`
    - **Validates: Requirements 11.1, 11.4, 11.5**


- [ ] 15. Implement AddEmployeeModal multi-step wizard
  - [ ] 15.1 Create `frontend/src/components/modals/AddEmployeeModal.tsx` — step indicator and shared form instance
    - Built on `@radix-ui/react-dialog`
    - Single `useForm` instance shared across all 4 steps so data persists
    - Step progress indicator showing current step number and step name
    - Local `step: number` state (1–4)
    - On dismiss (`onOpenChange` close): call `form.reset()` to discard all data
    - Apply Framer Motion entrance animation on inner wrapper
    - _Requirements: 12.1, 12.2, 12.14_

  - [ ] 15.2 Implement Step 1 (Personal Info) and Step 2 (Work Info) with Zod validation
    - Step 1 fields: `full_name` (required, max 255), `employee_code` (required, max 50), `email` (required, valid email), `phone` (optional, max 50)
    - Step 2 fields: `position` (required), `department_id` (required, from `GET /api/v1/departments?is_active=true`), `status` (required enum)
    - "Next" calls `form.trigger(fieldNamesForStep)` before advancing; show inline errors on failure
    - "Back" decrements step without re-validating
    - _Requirements: 12.3, 12.4, 12.5, 12.6, 12.7_

  - [ ] 15.3 Implement Step 3 (Shift & Schedule) and Step 4 (Documents) with submit logic
    - Step 3: `shift_id` (optional, from `GET /api/v1/shifts?is_active=true`)
    - Step 4: file upload area accepting PDF, JPG, JPEG, PNG; max 5 files; max 10 MB each; Zod validation
    - Submit: call `employeesAPI.create(formData)`; on success: close + `toast.success` + `queryClient.invalidateQueries(['employees'])`; on 409: `form.setError('employee_code', ...)` + `setStep(1)`; on other error: inline error on step 4 + `toast.error`
    - _Requirements: 12.8, 12.9, 12.10, 12.11, 12.12, 12.13_

  - [ ]* 15.4 Write property tests for wizard step validation gate and back navigation (Properties 14 & 15)
    - **Property 14: Wizard step validation gate** — any form state with at least one invalid required field for the current step: "Next" does not advance, inline errors shown for all failing fields
    - **Property 15: Wizard back navigation preserves data** — for any step `n > 1` and any entered data, "Back" decrements step to `n-1` and all field values remain unchanged
    - File: `frontend/src/__tests__/properties/addEmployeeModal.property.test.ts`
    - **Validates: Requirements 12.3, 12.4, 12.5, 12.6, 12.9**


- [ ] 16. Verify panel state mutual exclusion across all dashboard panels
  - [ ] 16.1 Audit each dashboard panel component for correct loading/error/empty/data render priority
    - For each panel (StatCards, AttendanceOverviewChart, DepartmentDonutChart, RecentAttendanceFeed, TodayAttendanceTable, DeviceStatusPanel): verify render order is (1) skeleton when `isLoading`, (2) `<ErrorState>` when `isError`, (3) `<EmptyState>` when data is empty, (4) content otherwise
    - Fix any panel that renders two states simultaneously
    - _Requirements: 14.2, 14.3, 14.4, 14.5_

  - [ ]* 16.2 Write property test for panel state mutual exclusion (Property 17)
    - **Property 17: Panel state mutual exclusion** — for any panel, exactly one of (skeleton, error, empty, content) is rendered at any given moment; no two states co-exist
    - File: `frontend/src/__tests__/properties/panelState.property.test.ts`
    - **Validates: Requirements 14.2, 14.3, 14.4, 14.5**

- [ ] 17. Final checkpoint — full integration
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- Checkpoints at tasks 5, 11, and 17 ensure incremental validation
- Property tests (18 total) validate universal correctness properties using fast-check
- Unit tests validate specific interaction flows and edge cases
- The `['dashboard-charts']` query is shared between `AttendanceOverviewChart` and `DepartmentDonutChart` — React Query deduplicates the fetch automatically
- The `['attendance-live']` query is shared between `RecentAttendanceFeed` and `TodayAttendanceTable` — same deduplication applies
- No new backend endpoints are needed; all data comes from existing API


## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3"] },
    { "id": 2, "tasks": ["2.4", "3.1", "4.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "4.2"] },
    { "id": 4, "tasks": ["3.4", "3.5", "4.3"] },
    { "id": 5, "tasks": ["4.4", "6.1"] },
    { "id": 6, "tasks": ["6.2", "6.3"] },
    { "id": 7, "tasks": ["6.4", "7.1", "7.2"] },
    { "id": 8, "tasks": ["7.3", "7.4", "8.1"] },
    { "id": 9, "tasks": ["8.2", "9.1", "10.1"] },
    { "id": 10, "tasks": ["9.2", "10.2", "10.3"] },
    { "id": 11, "tasks": ["12.1"] },
    { "id": 12, "tasks": ["12.2", "12.3", "13.1"] },
    { "id": 13, "tasks": ["13.2", "14.1"] },
    { "id": 14, "tasks": ["14.2", "15.1"] },
    { "id": 15, "tasks": ["15.2"] },
    { "id": 16, "tasks": ["15.3"] },
    { "id": 17, "tasks": ["15.4", "16.1"] },
    { "id": 18, "tasks": ["16.2"] }
  ]
}
```
