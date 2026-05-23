# Design Document: Dashboard UI Redesign

## Overview

This document describes the technical design for the Project Z dashboard UI redesign. The goal is to transform the current functional-but-bare interface into a production-quality dark-sidebar dashboard with rich data visualizations, interactive modals, a toast notification system, and a fully navigable responsive layout — all backed exclusively by real API data.

The redesign touches the layout shell (Sidebar, Topbar, AppLayout), the Dashboard page and all its panels, and introduces a set of reusable UI primitives (EmptyState, ConfirmModal, ExportModal, AddEmployeeModal). No new backend endpoints are required; all data comes from the existing API.

**Research findings:**
- Tailwind CSS v4 uses `@theme` blocks and CSS custom properties natively — no `tailwind.config.js` needed. Dark sidebar colors are added as new CSS custom properties in `index.css`.
- Framer Motion v11 `AnimatePresence` + `motion.aside` with `animate={{ width }}` is the correct pattern for sidebar collapse (already partially in use).
- Radix UI `@radix-ui/react-dialog` (already installed) provides the accessible Dialog primitive for all modals.
- Radix UI `@radix-ui/react-tooltip` (already installed) provides tooltip labels for collapsed sidebar icons.
- Sonner `toast()` with `duration` option controls per-severity dismiss timing; `richColors` is already enabled in AppLayout.
- React Hook Form v7 + Zod v3 (both installed) support per-step validation via `trigger()` on specific field names before advancing wizard steps.
- `react-day-picker` v9 (already installed) provides the date range picker for the Export Modal.

---

## Architecture

The application follows a layered architecture:

```
AppLayout (layout shell, WS connection, Toaster)
├── Sidebar (dark nav, collapse, mobile drawer)
├── Topbar (search, notifications, user dropdown)
└── <Outlet> (page content)
    └── Dashboard (KPI cards, charts, table, device panel)
        ├── StatCard (×5)
        ├── AttendanceOverviewChart
        ├── DepartmentDonutChart
        ├── RecentAttendanceFeed
        ├── TodayAttendanceTable
        └── DeviceStatusPanel

Shared UI primitives (components/ui/):
├── EmptyState
├── ErrorState
├── SkeletonCard / SkeletonRow
├── ConfirmModal
├── ExportModal
└── AddEmployeeModal (multi-step wizard)
```

**Data flow:**

```
WebSocket event
  → useWebSocket (AppLayout)
    → queryClient.invalidateQueries(key)
      → React Query refetch
        → component re-render with fresh data
        → (for alert.late_employee) → toast.warning(...)

User action (e.g. export click)
  → local state update (loading = true)
    → API call via client.ts
      → success: file download + toast.success + modal close
      → error: inline error message + toast.error
```

**State ownership:**
- Server state: React Query (all API data)
- Auth state: Zustand `authStore`
- UI state (sidebar collapsed, modal open, filters): local `useState` within each component
- No new Zustand stores are needed

---

## Components and Interfaces

### File Structure (new and modified files)

```
frontend/src/
  index.css                          — ADD dark sidebar CSS variables
  types/index.ts                     — ADD new interfaces (see Data Models)
  hooks/
    useWebSocket.ts                  — MODIFY: add toast for alert.late_employee
  components/
    layout/
      Sidebar.tsx                    — MODIFY: dark theme, full nav, mobile drawer
      Topbar.tsx                     — MODIFY: search input, notif badge, chat, fullscreen, user dropdown
      AppLayout.tsx                  — MODIFY: mobile sidebar state, hamburger toggle
    ui/
      EmptyState.tsx                 — NEW
      ErrorState.tsx                 — NEW
      SkeletonCard.tsx               — NEW
      SkeletonRow.tsx                — NEW
    modals/
      ConfirmModal.tsx               — NEW
      ExportModal.tsx                — NEW
      AddEmployeeModal.tsx           — NEW
  pages/
    Dashboard.tsx                    — MODIFY: full redesign with all panels
```

### Sidebar Component

**Props:** none (reads from `useAuthStore`, `useLocation`)

**Local state:**
- `collapsed: boolean` — desktop collapse state
- `mobileOpen: boolean` — mobile overlay drawer state (lifted to AppLayout via context or prop)

The mobile drawer state must be accessible from both Sidebar (to close on outside tap) and AppLayout (to open via hamburger in Topbar). The cleanest approach is to lift `mobileOpen` + `setMobileOpen` to AppLayout and pass them as props to both Sidebar and Topbar.

**Navigation items (full list):**

```typescript
const mainNav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/employees', icon: Users, label: 'Employees' },
  { to: '/attendance', icon: Fingerprint, label: 'Attendance' },
  { to: '/devices', icon: Monitor, label: 'Devices' },
  { to: '/departments', icon: Building2, label: 'Departments' },
  { to: '/shifts', icon: Clock, label: 'Shifts' },
  { to: '/reports', icon: FileBarChart, label: 'Reports' },
  { to: '/calendar', icon: Calendar, label: 'Calendar' },
  { to: '/leave', icon: PalmtreeIcon, label: 'Leave Management' },
]

const adminNav = [
  { to: '/users', icon: UserCog, label: 'Users & Roles' },
  { to: '/settings', icon: Settings, label: 'Settings' },
  { to: '/audit', icon: ScrollText, label: 'Audit Logs' },
]
```

**Collapsed state tooltip:** Wrap each NavLink icon in `<Tooltip.Provider><Tooltip.Root><Tooltip.Trigger><Tooltip.Content>` from `@radix-ui/react-tooltip` when `collapsed === true`.

### Topbar Component

**Props:** `title: string`, `subtitle?: string`, `onMenuToggle: () => void`

**Local state:**
- `searchValue: string` — controlled input, max 200 chars
- `notifCount: number` — unread notification count (initially 0, future: from API)
- `dropdownOpen: boolean` — user dropdown visibility
- `isFullscreen: boolean` — tracks `document.fullscreenElement !== null`

**Fullscreen toggle:** Uses `document.requestFullscreenElement` / `document.exitFullscreen`. Listen to `document.fullscreenchange` event to sync `isFullscreen` state.

**User dropdown:** Built with `@radix-ui/react-dropdown-menu`. Items: Profile (link to `/profile`), Settings (link to `/settings`), separator, Logout (calls `authStore.logout()` then `navigate('/login')`).

**Notification badge display logic:**
```typescript
const badgeDisplay = (count: number): string =>
  count > 99 ? '99+' : count > 0 ? String(count) : ''
```

### EmptyState Component

```typescript
interface EmptyStateProps {
  icon: LucideIcon
  message: string
  hint?: string
  className?: string
}
```

Renders a centered column with the icon (muted, size 40), primary message (sm, slate-600), and optional hint (xs, slate-400).

### ErrorState Component

```typescript
interface ErrorStateProps {
  message?: string
  onRetry?: () => void
  className?: string
}
```

Renders an alert icon, error message, and a "Retry" button that calls `onRetry`.

### ConfirmModal Component

```typescript
interface ConfirmModalProps {
  open: boolean
  title: string
  description: string
  confirmLabel: string  // max 50 chars
  onConfirm: () => Promise<void>
  onCancel: () => void
  variant?: 'danger' | 'default'
}
```

Built on `@radix-ui/react-dialog`. Internal state: `loading: boolean`, `error: string | null`. On confirm click: set `loading = true`, call `onConfirm()`, on success close; on rejection set `error` message and `loading = false`. While `loading`, the cancel button and Escape key are suppressed via `onInteractOutside={(e) => e.preventDefault()}` and `onEscapeKeyDown={(e) => e.preventDefault()}`.

### ExportModal Component

```typescript
interface ExportModalProps {
  open: boolean
  onClose: () => void
}
```

Built on `@radix-ui/react-dialog`. Uses `react-hook-form` + Zod for validation.

**Form schema:**
```typescript
const exportSchema = z.object({
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  departmentId: z.string().optional(),
  format: z.enum(['xlsx', 'pdf', 'csv']),
}).refine(
  (data) => new Date(data.startDate) <= new Date(data.endDate),
  { message: 'Start date must be before or equal to end date', path: ['startDate'] }
)
```

**Default values:** `startDate = format(subDays(new Date(), 30), 'yyyy-MM-dd')`, `endDate = format(new Date(), 'yyyy-MM-dd')`.

**Department list:** Fetched via `useQuery(['departments'])` → `departmentsAPI.list()`. On error, show inline error in the selector and disable Export.

**Export action:** Calls `reportsAPI.attendance({ start_date, end_date, department_id, format })` with `responseType: 'blob'`. On success: create object URL, trigger `<a>` click for download, revoke URL, close modal, `toast.success(...)`. On error: set inline error, `toast.error(...)`.

### AddEmployeeModal Component

```typescript
interface AddEmployeeModalProps {
  open: boolean
  onClose: () => void
}
```

Built on `@radix-ui/react-dialog`. Four-step wizard with step indicator.

**Step schemas (Zod):**
```typescript
const step1Schema = z.object({
  full_name: z.string().min(1).max(255),
  employee_code: z.string().min(1).max(50),
  email: z.string().email(),
  phone: z.string().max(50).optional(),
})

const step2Schema = z.object({
  position: z.string().min(1),
  department_id: z.string().min(1, 'Department is required'),
  status: z.enum(['active', 'inactive', 'suspended', 'terminated']),
})

const step3Schema = z.object({
  shift_id: z.string().optional(),
})

const step4Schema = z.object({
  documents: z.array(z.instanceof(File))
    .max(5, 'Maximum 5 files allowed')
    .refine(
      (files) => files.every(f => f.size <= 10 * 1024 * 1024),
      'Each file must be 10 MB or less'
    )
    .refine(
      (files) => files.every(f => ['application/pdf','image/jpeg','image/png'].includes(f.type)),
      'Only PDF, JPG, JPEG, and PNG files are allowed'
    )
    .optional(),
})
```

**Step navigation:** Use `form.trigger(fieldNamesForStep)` before advancing. On Back, decrement step without re-validating. All steps share one `useForm` instance so data persists across steps.

**Submit:** On step 4 "Submit", call `employeesAPI.create(formData)`. On 409: navigate to step 1, set error on `employee_code` field via `form.setError`. On other error: show error on step 4, `toast.error`. On success: close modal, `toast.success`, `queryClient.invalidateQueries(['employees'])`.

**Dismiss:** `onOpenChange` set to close + `form.reset()` to discard all data.

### Dashboard Panel Components

Each panel is extracted into its own component for clarity and testability:

**StatCard** — receives pre-fetched data as props; no internal queries.

**AttendanceOverviewChart** — reads from `useQuery(['dashboard-charts'])`. Renders `<LineChart>` with three `<Line>` elements. Shows `<SkeletonCard>` while loading, `<ErrorState>` on error, `<EmptyState>` when `attendance_overview.length === 0`.

**DepartmentDonutChart** — reads from same `['dashboard-charts']` query (shared, no duplicate fetch). Renders `<PieChart>` donut. Custom tooltip formatter rounds percentage to 1 decimal: `(value, name, props) => [props.payload.percentage.toFixed(1) + '%', name]`.

**RecentAttendanceFeed** — `useQuery(['attendance-live'], { refetchInterval: 15000 })`. Renders up to 8 items. Shows `<EmptyState>` with `Fingerprint` icon when empty.

**TodayAttendanceTable** — `useQuery(['attendance-live'])` (shared with feed). Local state for filters: `{ department: string, status: 'all'|'in'|'out', date: string }`. Export buttons call `reportsAPI.attendance` directly (no modal needed for quick export from table; the full Export Modal is for the Reports page). Shows `<SkeletonRow>` while loading, `<EmptyState>` when filtered result is empty.

**DeviceStatusPanel** — `useQuery(['devices'], { refetchInterval: 30000 })`. Filters to `is_active === true` client-side. Shows `<EmptyState>` with `Monitor` icon when empty.

---

## Data Models

### New TypeScript interfaces to add to `types/index.ts`

```typescript
// Notification shape (for future API integration)
export interface Notification {
  id: string
  message: string
  read: boolean
  created_at: string
}

// Export modal form values
export interface ExportFormValues {
  startDate: string
  endDate: string
  departmentId?: string
  format: 'xlsx' | 'pdf' | 'csv'
}

// Add employee wizard form values
export interface AddEmployeeFormValues {
  // Step 1
  full_name: string
  employee_code: string
  email: string
  phone?: string
  // Step 2
  position: string
  department_id: string
  status: 'active' | 'inactive' | 'suspended' | 'terminated'
  // Step 3
  shift_id?: string
  // Step 4
  documents?: File[]
}

// WS late employee alert payload
export interface LateEmployeeAlertPayload {
  employee_name: string
  employee_code: string
  late_minutes: number
}
```

### Existing types that need minor additions

`WSEvent.data` is currently `Record<string, unknown>`. The `alert.late_employee` handler needs to cast it to `LateEmployeeAlertPayload`. No structural change needed — just a type assertion in `useWebSocket.ts`.

---

## Dark Sidebar CSS Variable Strategy

The sidebar transitions from `bg-white` to a dark theme. Rather than hardcoding dark colors in the component, new CSS custom properties are added to `index.css` inside the `@theme` block:

```css
@theme {
  /* ... existing tokens ... */

  /* Dark Sidebar tokens */
  --color-sidebar-bg: #0F172A;          /* slate-900 */
  --color-sidebar-border: #1E293B;      /* slate-800 */
  --color-sidebar-text: #CBD5E1;        /* slate-300 — body text */
  --color-sidebar-text-muted: #64748B;  /* slate-500 — section labels */
  --color-sidebar-icon: #94A3B8;        /* slate-400 — inactive icons */
  --color-sidebar-active-bg: #2563EB;   /* primary — active item bg */
  --color-sidebar-active-text: #FFFFFF; /* white — active item text */
  --color-sidebar-hover-bg: #1E293B;    /* slate-800 — hover state */
  --color-sidebar-user-bg: #1E293B;     /* slate-800 — user profile area */
}
```

**WCAG AA compliance:** `#CBD5E1` (slate-300) on `#0F172A` (slate-900) yields a contrast ratio of approximately 10.7:1, well above the 4.5:1 minimum. Active items use white on `#2563EB` (primary blue) at approximately 5.9:1.

**Sidebar component changes:**
- Replace `bg-white` → `bg-[var(--color-sidebar-bg)]`
- Replace `border-[var(--color-border)]` → `border-[var(--color-sidebar-border)]`
- Replace `text-[var(--color-slate-600)]` → `text-[var(--color-sidebar-text)]`
- Replace `hover:bg-[var(--color-slate-50)]` → `hover:bg-[var(--color-sidebar-hover-bg)]`
- Section labels: `text-[var(--color-sidebar-text-muted)]`
- User profile area: `bg-[var(--color-sidebar-user-bg)]`
- Scrollbar thumb in sidebar: override with a darker color via a scoped CSS rule

---

## Animation Approach (Framer Motion)

### Sidebar collapse animation

```typescript
// Sidebar width animation — already uses motion.aside
<motion.aside
  animate={{ width: collapsed ? 72 : 260 }}
  transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }} // cubic-bezier ease-in-out
>
```

### Mobile overlay drawer

```typescript
// Backdrop
<AnimatePresence>
  {mobileOpen && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 bg-black/50 z-40 md:hidden"
      onClick={() => setMobileOpen(false)}
    />
  )}
</AnimatePresence>

// Drawer panel
<motion.aside
  initial={{ x: -260 }}
  animate={{ x: mobileOpen ? 0 : -260 }}
  transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
  className="fixed left-0 top-0 h-screen w-[260px] z-50 md:hidden"
>
```

### Nav item label fade

```typescript
<AnimatePresence mode="wait">
  {!collapsed && (
    <motion.span
      initial={{ opacity: 0, width: 0 }}
      animate={{ opacity: 1, width: 'auto' }}
      exit={{ opacity: 0, width: 0 }}
      transition={{ duration: 0.2 }}
    >
      {item.label}
    </motion.span>
  )}
</AnimatePresence>
```

### Dashboard panel entrance

```typescript
// Staggered entrance for KPI cards
const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } }
}
const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } }
}
```

### Modal animation

Radix Dialog handles its own enter/exit. Augment with Framer Motion on the `DialogContent` inner wrapper:

```typescript
<motion.div
  initial={{ opacity: 0, scale: 0.96, y: 8 }}
  animate={{ opacity: 1, scale: 1, y: 0 }}
  exit={{ opacity: 0, scale: 0.96, y: 8 }}
  transition={{ duration: 0.2 }}
>
```

---

## Modal Management Pattern

All modals are controlled from their parent via `open: boolean` + `onClose: () => void` props. No global modal store is needed at this stage.

**Usage pattern:**

```typescript
// In a parent page/component
const [exportOpen, setExportOpen] = useState(false)
const [confirmOpen, setConfirmOpen] = useState(false)
const [addEmployeeOpen, setAddEmployeeOpen] = useState(false)

// Render
<ExportModal open={exportOpen} onClose={() => setExportOpen(false)} />
<ConfirmModal
  open={confirmOpen}
  title="Delete Employee"
  description="This action cannot be undone."
  confirmLabel="Delete"
  variant="danger"
  onConfirm={handleDelete}
  onCancel={() => setConfirmOpen(false)}
/>
<AddEmployeeModal open={addEmployeeOpen} onClose={() => setAddEmployeeOpen(false)} />
```

**Focus management:** Radix Dialog handles focus trap and restoration automatically. No additional focus management code is needed.

**Scroll lock:** Radix Dialog applies `overflow: hidden` to `<body>` when open. No additional scroll lock needed.

**Z-index layering:**
- Sidebar (desktop): `z-50`
- Mobile sidebar backdrop: `z-40`
- Mobile sidebar drawer: `z-50`
- Topbar: `z-40`
- Modals (Radix Dialog portal): `z-50` (Radix default)
- Toasts (Sonner): `z-[9999]` (Sonner default)

---

## Error State and Empty State Component Design

### EmptyState

Displayed when an API returns an empty collection and the request succeeded.

```
┌─────────────────────────────┐
│                             │
│         [Icon 40px]         │
│                             │
│    Primary message text     │
│  Secondary hint text (xs)   │
│                             │
└─────────────────────────────┘
```

Per-panel configuration:

| Panel | Icon | Message | Hint |
|---|---|---|---|
| Attendance Overview Chart | `BarChart2` | "No attendance data for this week" | "Data appears once devices push records" |
| Department Donut Chart | `PieChart` | "No department attendance data for today" | "Assign employees to departments to see breakdown" |
| Recent Attendance Feed | `Fingerprint` | "No attendance records yet" | "Records appear when devices push data" |
| Today's Attendance Table | `Table2` | "No attendance records match the selected filters" | "Try adjusting the filters above" |
| Device Status Panel | `Monitor` | "No devices registered" | "Devices auto-register when they connect" |

### ErrorState

Displayed when an API call fails (network error, 5xx, etc.).

```
┌─────────────────────────────┐
│  ⚠ Something went wrong     │
│  [error message]            │
│                             │
│       [Retry button]        │
└─────────────────────────────┘
```

The `onRetry` prop calls `queryClient.refetchQueries(queryKey)` or the panel's `refetch` function from `useQuery`.

### Loading vs Empty vs Error — mutual exclusion

Each panel follows this render priority:
1. `isLoading` → render skeleton
2. `isError` → render `<ErrorState onRetry={refetch} />`
3. `data` is empty → render `<EmptyState />`
4. `data` has items → render content

---

## Responsive Breakpoint Strategy

Tailwind CSS v4 breakpoints used throughout:

| Breakpoint | Min width | Usage |
|---|---|---|
| (default) | 0px | Mobile: 2-col KPI grid, hidden sidebar |
| `sm` | 640px | — |
| `md` | 768px | Sidebar visible (desktop mode), topbar clock shown |
| `lg` | 1024px | Charts row 3-col grid |
| `xl` | 1280px | KPI cards 5-col grid |

### KPI Cards grid

```html
<div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
```

### Charts row

```html
<div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
  <!-- Attendance Overview: lg:col-span-2 -->
  <!-- Department Donut: lg:col-span-1 -->
</div>
```

### Bottom row

```html
<div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
  <!-- Today's Table: lg:col-span-2 -->
  <!-- Device Panel: lg:col-span-1 -->
</div>
```

### Sidebar responsive behavior

```typescript
// AppLayout
const [mobileOpen, setMobileOpen] = useState(false)

// Sidebar renders two variants:
// 1. Desktop: motion.aside with hidden class on mobile (hidden md:flex)
// 2. Mobile: fixed overlay drawer controlled by mobileOpen state
```

### Topbar responsive behavior

- Search input: always visible
- Search label text ("Search anything..."): `hidden md:inline`
- Clock widget: `hidden lg:flex`
- User name/role text: `hidden md:block`
- Hamburger menu button: `flex md:hidden` (only on mobile)

### Table horizontal scroll

```html
<div class="overflow-x-auto">
  <table class="w-full min-w-[600px]">
```

---

## WebSocket Integration (Updated)

The existing `useWebSocket.ts` handles query invalidation correctly. The only missing piece is the `alert.late_employee` toast. Updated handler:

```typescript
case 'alert.late_employee': {
  const payload = msg.data as LateEmployeeAlertPayload
  queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
  toast.warning(
    `${payload.employee_name} (${payload.employee_code}) is ${payload.late_minutes} minutes late`,
    { duration: 6000 }
  )
  break
}
```

The `toast` import comes from `sonner`. This is the only change needed to `useWebSocket.ts`.

**Query invalidation map (complete):**

| WS Event | Invalidated Query Keys |
|---|---|
| `attendance.created` | `['attendance-live']`, `['dashboard-stats']`, `['dashboard-charts']` |
| `employee.checked_in` | `['attendance-live']`, `['dashboard-stats']`, `['dashboard-charts']` |
| `employee.checked_out` | `['attendance-live']`, `['dashboard-stats']`, `['dashboard-charts']` |
| `device.status` | `['devices']`, `['dashboard-stats']` |
| `device.registered` | `['devices']`, `['dashboard-stats']` |
| `alert.late_employee` | `['dashboard-stats']` + warning toast |

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Active navigation item styling

*For any* navigation item in the sidebar and any current route path, if the item's `to` path matches the current route, the rendered NavLink element should have the active background and text color applied; if it does not match, the active styles should be absent.

**Validates: Requirements 1.7**

---

### Property 2: Notification badge display

*For any* non-negative integer notification count `n`, the badge display function should return `"99+"` when `n > 99`, the string representation of `n` when `0 < n <= 99`, and an empty string (no badge) when `n === 0`.

**Validates: Requirements 2.2, 2.3**

---

### Property 3: Search input character limit

*For any* string input to the global search field, if the string length exceeds 200 characters, the input value should be capped at 200 characters and the excess should not be submitted.

**Validates: Requirements 2.1**

---

### Property 4: KPI value formatting

*For any* non-negative integer metric value returned by the dashboard stats API, the displayed string should equal `value.toLocaleString()` — containing locale-appropriate thousands separators and no rounding.

**Validates: Requirements 3.3**

---

### Property 5: Trend indicator rendering

*For any* trend value `t` from the API response: if `t > 0`, the trend badge should be rendered with green upward-arrow styling and display `Math.abs(t) + "%"`; if `t < 0`, it should be rendered with red downward-arrow styling and display `Math.abs(t) + "%"`; if `t === 0` or `t` is absent, no trend badge should be rendered.

**Validates: Requirements 3.4, 3.5, 3.6, 3.7**

---

### Property 6: WebSocket event → query invalidation routing

*For any* WebSocket event of type `attendance.created`, `employee.checked_in`, or `employee.checked_out`, the query keys `['attendance-live']`, `['dashboard-stats']`, and `['dashboard-charts']` should all be invalidated. *For any* WebSocket event of type `device.status` or `device.registered`, the query keys `['devices']` and `['dashboard-stats']` should be invalidated. No other query keys should be invalidated by these events.

**Validates: Requirements 3.11, 6.5, 8.6, 13.3, 13.4**

---

### Property 7: Department percentage rounding

*For any* department breakdown entry with a `percentage` value `p`, the displayed percentage string in both the legend and the tooltip should equal `p.toFixed(1) + "%"` — rounded to exactly one decimal place.

**Validates: Requirements 5.3, 5.4**

---

### Property 8: Recent attendance feed limit

*For any* collection of attendance log entries returned by the live attendance API, the Recent Attendance Feed should display exactly `Math.min(entries.length, 8)` items, and those items should be the ones with the most recent timestamps (ordered descending).

**Validates: Requirements 6.1**

---

### Property 9: Attendance timestamp formatting

*For any* valid ISO 8601 timestamp string from an attendance log entry, the formatted time displayed in the feed and table should match the pattern `hh:mm a` (e.g., "09:30 AM", "02:15 PM") — a 12-hour clock with leading zeros and AM/PM suffix.

**Validates: Requirements 6.3**

---

### Property 10: Device display label and badge

*For any* device object, if `device.name` is null or an empty string, the displayed label should be `device.serial_number`; otherwise it should be `device.name`. Additionally, if `device.is_online` is `true`, the badge should render with green "Online" styling; if `false`, with grey "Offline" styling.

**Validates: Requirements 8.3, 8.4, 8.5**

---

### Property 11: Export filter parameters passthrough

*For any* valid combination of filter values `{ startDate, endDate, departmentId, format }` in the export modal or table export, when the export action is triggered, `reportsAPI.attendance` should be called with exactly those parameter values — no transformation, no omission of provided values.

**Validates: Requirements 7.6, 11.5**

---

### Property 12: Export date range validation

*For any* pair of date strings `(startDate, endDate)`, the Export button should be enabled if and only if both fields are non-empty and `new Date(startDate) <= new Date(endDate)`. For any pair where `startDate > endDate` or either is empty, the button should be disabled and a validation message should be visible.

**Validates: Requirements 11.4**

---

### Property 13: Export modal default date range

*For any* moment the Export Modal is opened, the default `startDate` should be exactly 30 days before the current date (formatted as `yyyy-MM-dd`) and the default `endDate` should be the current date (formatted as `yyyy-MM-dd`).

**Validates: Requirements 11.1**

---

### Property 14: Wizard step validation gate

*For any* wizard step and any form state where at least one required field for that step is invalid (empty, too long, wrong format, or violates a constraint), clicking "Next" should not advance the step counter, and inline field-level error messages should be displayed for all failing fields.

**Validates: Requirements 12.3, 12.4, 12.6, 12.9**

---

### Property 15: Wizard back navigation preserves data

*For any* wizard step `n > 1` and any data entered in steps 1 through `n`, clicking "Back" should decrement the step counter to `n - 1` and all previously entered field values should remain unchanged in the form state.

**Validates: Requirements 12.5**

---

### Property 16: Late employee toast content

*For any* `alert.late_employee` WebSocket event payload containing `employee_name`, `employee_code`, and `late_minutes`, the displayed warning toast message should contain all three values from the payload.

**Validates: Requirements 9.5, 13.5**

---

### Property 17: Panel state mutual exclusion

*For any* dashboard panel, at any given moment exactly one of the following states should be rendered: (a) skeleton loading UI when the query is in-flight, (b) error state with retry when the query has failed, (c) empty state when the query succeeded with an empty collection, or (d) data content when the query succeeded with non-empty data. No two states should be rendered simultaneously.

**Validates: Requirements 14.2, 14.3, 14.4, 14.5**

---

### Property 18: KPI grid responsive column count

*For any* viewport width `w`, the KPI cards grid should apply: 5 columns when `w >= 1280px`, 3 columns when `768px <= w < 1280px`, and 2 columns when `w < 768px`. No other column count should be applied at any viewport width.

**Validates: Requirements 15.3, 15.4, 15.5**

---

## Error Handling

### API error handling strategy

All API calls follow this pattern:

```typescript
const { data, isLoading, isError, refetch } = useQuery({
  queryKey: [...],
  queryFn: async () => {
    const res = await someAPI.method()
    return res.data
  },
  retry: 2,           // React Query retries twice before marking isError
  staleTime: 0,       // Always refetch on mount
})
```

For mutations (create employee, export):

```typescript
try {
  const res = await employeesAPI.create(payload)
  toast.success(`Employee ${payload.full_name} added successfully`)
  queryClient.invalidateQueries({ queryKey: ['employees'] })
  onClose()
} catch (err) {
  const message = axios.isAxiosError(err)
    ? err.response?.data?.detail ?? 'An unexpected error occurred. Please try again.'
    : 'An unexpected error occurred. Please try again.'

  if (axios.isAxiosError(err) && err.response?.status === 409) {
    form.setError('employee_code', { message: 'Employee code already exists' })
    setStep(1)
  } else {
    setSubmitError(message)
    toast.error(message)
  }
}
```

### Error message extraction

```typescript
function extractErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) return detail[0]?.msg ?? 'Validation error'
  }
  return 'An unexpected error occurred. Please try again.'
}
```

This utility is placed in `src/lib/utils.ts` alongside the existing `cn` helper.

### Toast severity and duration

| Severity | Sonner call | Duration |
|---|---|---|
| Success | `toast.success(msg)` | 4000ms (default) |
| Info | `toast.info(msg)` | 4000ms (default) |
| Warning | `toast.warning(msg, { duration: 6000 })` | 6000ms |
| Error | `toast.error(msg, { duration: 6000 })` | 6000ms |

---

## Testing Strategy

### Dual testing approach

Unit tests verify specific examples, edge cases, and error conditions. Property-based tests verify universal properties across all inputs. Both are necessary for comprehensive coverage.

### Property-based testing library

**Vitest** (via `@vitest/ui` or plain `vitest`) is the test runner for this project (standard for Vite projects). **fast-check** is the property-based testing library for TypeScript/JavaScript.

Install: `npm install --save-dev vitest @testing-library/react @testing-library/user-event fast-check jsdom`

Each property test runs a minimum of **100 iterations** via fast-check's default configuration.

### Property test file locations

```
frontend/src/
  __tests__/
    properties/
      sidebar.property.test.ts        — Property 1 (active nav)
      topbar.property.test.ts         — Properties 2, 3
      statCard.property.test.ts       — Properties 4, 5
      websocket.property.test.ts      — Property 6
      departmentChart.property.test.ts — Property 7
      attendanceFeed.property.test.ts — Properties 8, 9
      devicePanel.property.test.ts    — Property 10
      exportModal.property.test.ts    — Properties 11, 12, 13
      addEmployeeModal.property.test.ts — Properties 14, 15
      toastSystem.property.test.ts    — Property 16
      panelState.property.test.ts     — Property 17
      responsiveGrid.property.test.ts — Property 18
    unit/
      confirmModal.test.tsx
      emptyState.test.tsx
      errorState.test.tsx
```

### Property test tagging format

Each property test is tagged with a comment:

```typescript
// Feature: dashboard-ui-redesign, Property 5: Trend indicator rendering
test.prop([fc.integer({ min: -1000, max: 1000 })])('trend indicator', (trend) => {
  // ...
})
```

### Unit test focus areas

Unit tests cover:
- ConfirmModal async confirm/cancel/error flows (specific interaction sequences)
- ExportModal department list error state
- AddEmployeeModal 409 conflict navigation to step 1
- EmptyState renders correct icon and messages per panel
- Topbar user dropdown items (Profile, Settings, Logout)
- Sidebar logout action clears session and redirects
- Mobile sidebar opens/closes on toggle and outside tap

### Integration test focus areas

- Dashboard mounts and fetches all three API endpoints on load
- WebSocket `alert.late_employee` event triggers toast (requires WS mock)
- Export download triggers file blob download (requires API mock)

### Example property test (Property 5)

```typescript
// Feature: dashboard-ui-redesign, Property 5: Trend indicator rendering
import { describe, test, expect } from 'vitest'
import * as fc from 'fast-check'
import { render, screen } from '@testing-library/react'
import StatCard from '@/pages/dashboard/StatCard'
import { Users } from 'lucide-react'

describe('StatCard trend indicator', () => {
  test.prop([fc.integer({ min: 1, max: 500 })])(
    'positive trend renders green upward badge',
    (trend) => {
      render(<StatCard icon={Users} label="Test" value={100} change={trend} color="#2563EB" delay={0} />)
      const badge = screen.getByText(`${trend}%`)
      expect(badge.className).toContain('text-emerald')
    }
  )

  test.prop([fc.integer({ min: -500, max: -1 })])(
    'negative trend renders red downward badge',
    (trend) => {
      render(<StatCard icon={Users} label="Test" value={100} change={trend} color="#2563EB" delay={0} />)
      const badge = screen.getByText(`${Math.abs(trend)}%`)
      expect(badge.className).toContain('text-red')
    }
  )

  test('zero trend renders no badge', () => {
    render(<StatCard icon={Users} label="Test" value={100} change={0} color="#2563EB" delay={0} />)
    expect(screen.queryByText(/%/)).toBeNull()
  })
})
```
