// ── New enterprise dashboard primitives (named exports) ─────
export { MetricCard }           from './MetricCard'
export type { MetricCardProps } from './MetricCard'

export { StatusCard }           from './StatusCard'
export type { StatusCardProps } from './StatusCard'

export { AlertCard }            from './AlertCard'
export type { AlertCardProps }  from './AlertCard'

export { ChartCard }            from './ChartCard'
export type { ChartCardProps }  from './ChartCard'

export { ActivityCard }              from './ActivityCard'
export type { ActivityCardProps, ActivityItem } from './ActivityCard'

export { TrendCard }            from './TrendCard'
export type { TrendCardProps }  from './TrendCard'

export { DeviceCard }           from './DeviceCard'
export type { DeviceCardProps } from './DeviceCard'

// ── Existing components — named exports ──────────────────────
export { AlertDrawer }              from './AlertDrawer'
export { WorkforceReadiness }       from './WorkforceReadiness'
export { ShiftCoverageWidget }      from './ShiftCoverageWidget'
export { UpcomingChangesWidget }    from './UpcomingChangesWidget'
export { LiveScanFeed }             from './LiveScanFeed'
export { DepartmentActivityPanel }  from './DepartmentActivityPanel'
export { DuplicateScanPanel }       from './DuplicateScanPanel'
export { StatsCard }                from './StatsCard'
export { UnknownUserPanel }         from './UnknownUserPanel'
export { DepartmentTotalsBar }      from './DepartmentGrid'

// ── Existing components — default exports ────────────────────
export { default as AttendanceTable }   from './AttendanceTable'
export { default as DepartmentGrid }    from './DepartmentGrid'
export { default as SystemHeader }      from './SystemHeader'
