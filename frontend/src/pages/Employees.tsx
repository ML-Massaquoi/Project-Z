import { useState, useMemo, useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns'
import {
  Download, UserPlus, Users, CalendarClock, AlarmClockOff, Ban, Search,
  Building2, Clock, Sun, Moon, ChevronDown, ChevronUp, RefreshCw,
  UserCog, Shield, Calendar, Save, X, Plus, Edit2, Monitor, User, Mail,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { employeesAPI, departmentsAPI, shiftTemplatesAPI, shiftAssignmentsAPI, shiftProtocolsAPI, devicesAPI } from '@/api/client'
import EnrollmentWizard from '@/components/enrollment/EnrollmentWizard'
import type { Employee, Department, ShiftTemplate, ShiftProtocol, EmployeeShiftAssignment, EmployeeShiftOverride } from '@/types'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type TabKey = 'active' | 'on_leave' | 'suspended' | 'terminated'
type DrawerTab = 'profile' | 'assignment' | 'devices' | 'calendar'

interface TabDef {
  key: TabKey
  label: string
  icon: React.ReactNode
  color: string
  bg: string
}

const TABS: TabDef[] = [
  { key: 'active', label: 'Active', icon: <Users size={14} />, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  { key: 'on_leave', label: 'On Leave', icon: <CalendarClock size={14} />, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  { key: 'suspended', label: 'Suspended', icon: <AlarmClockOff size={14} />, color: 'text-orange-400', bg: 'bg-orange-500/10' },
  { key: 'terminated', label: 'Terminated', icon: <Ban size={14} />, color: 'text-red-400', bg: 'bg-red-500/10' },
]

const COLOR_MAP: Record<string, { bg: string; fg: string; border: string; icon: string }> = {
  blue: { bg: 'rgba(59,130,246,0.1)', fg: 'var(--pz-brand)', border: 'rgba(59,130,246,0.2)', icon: 'linear-gradient(135deg, #3B82F6, #2563EB)' },
  emerald: { bg: 'rgba(16,185,129,0.1)', fg: '#10B981', border: 'rgba(16,185,129,0.2)', icon: 'linear-gradient(135deg, #10B981, #059669)' },
  purple: { bg: 'rgba(124,58,237,0.1)', fg: '#7C3AED', border: 'rgba(124,58,237,0.2)', icon: 'linear-gradient(135deg, #7C3AED, #6D28D9)' },
  amber: { bg: 'rgba(245,158,11,0.1)', fg: '#F59E0B', border: 'rgba(245,158,11,0.2)', icon: 'linear-gradient(135deg, #F59E0B, #D97706)' },
  red: { bg: 'rgba(239,68,68,0.1)', fg: '#EF4444', border: 'rgba(239,68,68,0.2)', icon: 'linear-gradient(135deg, #EF4444, #DC2626)' },
  gray: { bg: 'var(--pz-surface-3)', fg: 'var(--pz-text-muted)', border: 'var(--pz-border)', icon: 'linear-gradient(135deg, #64748B, #475569)' },
}

const s = {
  page: {
    padding: '32px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '28px',
    minHeight: '100%',
    boxSizing: 'border-box' as const,
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: '24px',
    fontWeight: 700,
    color: 'var(--pz-text)',
    margin: 0,
  },
  subtitle: {
    fontSize: '14px',
    color: 'var(--pz-text-muted)',
    marginTop: '4px',
    marginBottom: 0,
  },
  actionBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 14px',
    borderRadius: '20px',
    background: 'rgba(59,130,246,0.08)',
    border: '1px solid rgba(59,130,246,0.2)',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '16px',
  },
  summaryCard: {
    background: 'var(--pz-surface-1)',
    border: '1px solid var(--pz-border)',
    borderRadius: '10px',
    padding: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
  },
  iconBox: (color: string): React.CSSProperties => ({
    width: '42px',
    height: '42px',
    borderRadius: '10px',
    background: color,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  }),
  statValue: {
    fontSize: '24px',
    fontWeight: 700,
    color: 'var(--pz-text)',
    margin: 0,
    lineHeight: 1,
  },
  statLabel: {
    fontSize: '12px',
    color: 'var(--pz-text-muted)',
    margin: '4px 0 0',
  },
  section: {
    background: 'var(--pz-surface-1)',
    border: '1px solid var(--pz-border)',
    borderRadius: '10px',
    overflow: 'hidden',
  },
  sectionHeader: {
    padding: '16px 20px',
    borderBottom: '1px solid var(--pz-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  sectionTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--pz-text)',
    margin: 0,
  },
  tableContainer: {
    overflowX: 'auto' as const,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '14px',
  },
  th: {
    padding: '12px 20px',
    textAlign: 'left' as const,
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    color: 'var(--pz-text-muted)',
    background: 'var(--pz-surface-2)',
    borderBottom: '1.5px solid var(--pz-border)',
    whiteSpace: 'nowrap' as const,
  },
  td: {
    padding: '14px 20px',
    borderBottom: '1px solid var(--pz-border)',
    color: 'var(--pz-text-secondary)',
    verticalAlign: 'middle' as const,
  },
  row: {
    cursor: 'pointer',
    transition: 'background 0.12s',
  },
  avatar: {
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    background: 'linear-gradient(135deg, var(--pz-brand), #7C3AED)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    color: '#fff',
    fontSize: '13px',
    fontWeight: 700,
  },
  emptyState: {
    padding: '48px 20px',
    textAlign: 'center' as const,
    color: 'var(--pz-text-muted)',
  },
  pill: (bg: string, fg: string, border: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 10px',
    borderRadius: '20px',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.03em',
    textTransform: 'uppercase' as const,
    background: bg,
    color: fg,
    border: `1px solid ${border}`,
  }),
  filterBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap' as const,
  },
  filterChip: (active: boolean): React.CSSProperties => ({
    padding: '5px 14px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.12s',
    background: active ? 'rgba(59,130,246,0.1)' : 'var(--pz-surface-2)',
    color: active ? 'var(--pz-brand)' : 'var(--pz-text-muted)',
    border: `1px solid ${active ? 'rgba(59,130,246,0.25)' : 'var(--pz-border)'}`,
    outline: 'none',
  }),
  paginationBar: {
    padding: '12px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTop: '1px solid var(--pz-border)',
    background: 'var(--pz-surface-2)',
  },
  paginationBtn: (disabled: boolean): React.CSSProperties => ({
    padding: '6px 10px',
    borderRadius: '6px',
    border: '1px solid var(--pz-border)',
    background: 'var(--pz-surface-1)',
    color: disabled ? 'var(--pz-text-faint)' : 'var(--pz-text-secondary)',
    cursor: disabled ? 'default' : 'pointer',
    fontSize: '12px',
    fontWeight: 600,
    transition: 'all 0.12s',
    outline: 'none',
  }),
}

function SummaryCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType
  label: string
  value: number
  color: string
}) {
  const c = COLOR_MAP[color] || COLOR_MAP.blue
  return (
    <div style={s.summaryCard}>
      <div style={s.iconBox(c.icon)}>
        <Icon size={18} style={{ color: '#fff' }} />
      </div>
      <div>
        <p style={s.statValue}>{value}</p>
        <p style={s.statLabel}>{label}</p>
      </div>
    </div>
  )
}

function EmployeeRow({ employee, onSelect, onHover, isHovered }: {
  employee: Employee
  onSelect: () => void
  onHover: (id: string | null) => void
  isHovered: boolean
}) {
  const statusColor =
    employee.status === 'active' ? COLOR_MAP.emerald :
    employee.status === 'inactive' ? COLOR_MAP.amber :
    employee.status === 'suspended' ? COLOR_MAP.amber :
    employee.status === 'terminated' ? COLOR_MAP.red :
    COLOR_MAP.gray

  return (
    <tr
      style={{
        ...s.row,
        background: isHovered ? 'var(--pz-surface-2)' : 'transparent',
      }}
      onMouseEnter={() => onHover(employee.id)}
      onMouseLeave={() => onHover(null)}
      onClick={onSelect}
    >
      <td style={s.td}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={s.avatar}>
            {employee.full_name?.[0] || '?'}
          </div>
          <div>
            <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--pz-text)', margin: 0 }}>
              {employee.full_name}
            </p>
            <p style={{ fontSize: '12px', color: 'var(--pz-text-muted)', fontFamily: 'monospace', margin: '2px 0 0' }}>
              {employee.employee_code}
            </p>
          </div>
        </div>
      </td>
      <td style={s.td}>
        <span style={{ color: 'var(--pz-text-secondary)', fontSize: '13px' }}>
          {employee.department_name || '\u2014'}
        </span>
      </td>
      <td style={s.td}>
        <span style={{ color: 'var(--pz-text-tertiary)', fontSize: '13px' }}>
          {employee.position || '\u2014'}
        </span>
      </td>
      <td style={s.td}>
        {employee.shift_name ? (
          <span style={s.pill('rgba(245,158,11,0.1)', '#F59E0B', 'rgba(245,158,11,0.25)')}>
            {employee.shift_name}
          </span>
        ) : (
          <span style={{ color: 'var(--pz-text-faint)', fontSize: '13px' }}>\u2014</span>
        )}
      </td>
      <td style={s.td}>
        {employee.employment_type ? (
          <span style={s.pill('rgba(124,58,237,0.1)', '#7C3AED', 'rgba(124,58,237,0.25)')}>
            {employee.employment_type.replace(/_/g, ' ')}
          </span>
        ) : (
          <span style={{ color: 'var(--pz-text-faint)', fontSize: '13px' }}>\u2014</span>
        )}
      </td>
      <td style={s.td}>
        <span style={{
          ...s.pill(statusColor.bg, statusColor.fg, statusColor.border),
          textTransform: 'capitalize' as const,
          letterSpacing: 'normal',
        }}>
          {employee.status}
        </span>
      </td>
      <td style={s.td}>
        <span style={{ color: 'var(--pz-text-muted)', fontSize: '12px', fontFamily: 'monospace' }}>
          {format(new Date(employee.created_at), 'MMM yyyy')}
        </span>
      </td>
    </tr>
  )
}

export default function Employees() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchValue, setSearchValue] = useState('')
  const [activeTab, setActiveTab] = useState<TabKey>('active')
  const [page, setPage] = useState(1)
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [selectedDept, setSelectedDept] = useState<string>('all')
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('profile')
  const [showAddModal, setShowAddModal] = useState(false)
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)
  const calendarDate = useMemo(() => new Date(), [])

  const { data: deptsData } = useQuery({
    queryKey: ['departments-list'],
    queryFn: async () => (await departmentsAPI.list()).data,
  })
  const departmentsList: Department[] = Array.isArray(deptsData) ? deptsData : deptsData?.items ?? []

  const { data: templatesData } = useQuery({
    queryKey: ['shift-templates-list'],
    queryFn: async () => (await shiftTemplatesAPI.list()).data,
  })
  const shiftTemplates: ShiftTemplate[] = Array.isArray(templatesData) ? templatesData : templatesData?.items ?? []

  const { data: protocolsData } = useQuery({
    queryKey: ['shift-protocols-list'],
    queryFn: async () => (await shiftProtocolsAPI.list()).data,
  })
  const shiftProtocols: ShiftProtocol[] = Array.isArray(protocolsData) ? protocolsData : protocolsData?.items ?? []

  const { data: assignmentsData } = useQuery({
    queryKey: ['employee-assignments', selectedEmployee?.id],
    queryFn: async () => (await shiftAssignmentsAPI.listAssignments({ employee_id: selectedEmployee?.id })).data,
    enabled: !!selectedEmployee,
  })
  const employeeAssignments: EmployeeShiftAssignment[] = Array.isArray(assignmentsData) ? assignmentsData : assignmentsData?.items ?? []

  const { data: overridesData } = useQuery({
    queryKey: ['employee-overrides', selectedEmployee?.id],
    queryFn: async () => (await shiftAssignmentsAPI.listOverrides({ employee_id: selectedEmployee?.id })).data,
    enabled: !!selectedEmployee,
  })
  const employeeOverrides: EmployeeShiftOverride[] = Array.isArray(overridesData) ? overridesData : overridesData?.items ?? []

  const { data, isLoading } = useQuery({
    queryKey: ['employees', page, searchValue, activeTab, selectedDept],
    queryFn: async () => (await employeesAPI.list({
      page,
      per_page: 20,
      search: searchValue || undefined,
      status: activeTab === 'on_leave' ? 'inactive' : activeTab !== 'active' ? activeTab : undefined,
      department_id: selectedDept !== 'all' ? selectedDept : undefined,
      only_enrolled: true,
    })).data,
  })

  const { data: deptData } = useQuery({
    queryKey: ['departments-list'],
    queryFn: async () => (await departmentsAPI.list()).data,
  })

  const departments: Department[] = Array.isArray(deptData) ? deptData : deptData?.items ?? []

  const employees: Employee[] = data?.items ?? []
  const totalEmployees = data?.total ?? 0
  const totalPages = data?.pages ?? 1

  const countByStatus = useMemo(() => {
    if (!data?.items) return { active: 0, on_leave: 0, suspended: 0, terminated: 0 }
    const all = data.items as Employee[]
    return {
      active: all.filter(e => e.status === 'active').length,
      on_leave: all.filter(e => e.status === 'inactive').length,
      suspended: all.filter(e => e.status === 'suspended').length,
      terminated: all.filter(e => e.status === 'terminated').length,
    }
  }, [data])

  const handleExport = async () => {
    try {
      const response = await employeesAPI.list({ per_page: 10000 })
      const blob = new Blob([JSON.stringify(response.data.items, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `employees-export-${format(new Date(), 'yyyy-MM-dd')}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Employee data exported')
    } catch {
      toast.error('Failed to export employees')
    }
  }

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.headerRow}>
        <div>
          <h1 style={s.title}>Employees</h1>
          <p style={s.subtitle}>{totalEmployees} total employees in the workforce</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--pz-text-muted)', pointerEvents: 'none' }} />
            <input
              value={searchValue}
              onChange={(e) => { setSearchValue(e.target.value); setPage(1) }}
              placeholder="Search employees..."
              style={{
                width: '220px',
                padding: '8px 12px 8px 36px',
                borderRadius: '8px',
                border: '1px solid var(--pz-border)',
                background: 'var(--pz-surface-2)',
                fontSize: '13px',
                color: 'var(--pz-text)',
                outline: 'none',
              }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--pz-brand)'}
              onBlur={e => e.currentTarget.style.borderColor = 'var(--pz-border)'}
            />
            {searchValue && (
              <button
                onClick={() => setSearchValue('')}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--pz-text-muted)', cursor: 'pointer', padding: '2px' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            )}
          </div>
          <button
            onClick={handleExport}
            style={{
              ...s.filterChip(false),
              display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            <Download size={14} />
            Export
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              background: 'var(--pz-brand)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              transition: 'opacity 0.12s',
            }}
          >
            <UserPlus size={15} />
            Add Employee
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={s.summaryGrid}>
        <SummaryCard icon={Users} label="Total Workforce" value={totalEmployees} color="blue" />
        <SummaryCard icon={UserPlus} label="Active" value={countByStatus.active} color="emerald" />
        <SummaryCard icon={CalendarClock} label="On Leave" value={countByStatus.on_leave} color="amber" />
        <SummaryCard icon={Ban} label="Terminated" value={countByStatus.terminated} color="red" />
      </div>

      {/* Employee Table Section */}
      <div style={s.section}>
        <div style={s.sectionHeader}>
          <div style={s.sectionTitleRow}>
            <Users size={18} style={{ color: 'var(--pz-brand)' }} />
            <h2 style={s.sectionTitle}>Employee Directory</h2>
          </div>
          <div style={s.filterBar}>
            <button
              style={s.filterChip(selectedDept === 'all')}
              onClick={() => { setSelectedDept('all'); setPage(1) }}
            >
              All
            </button>
            {departmentsList.slice(0, 7).map(dept => (
              <button
                key={dept.id}
                style={s.filterChip(selectedDept === dept.id)}
                onClick={() => { setSelectedDept(dept.id); setPage(1) }}
              >
                {dept.name}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div style={s.tableContainer}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Employee</th>
                <th style={s.th}>Department</th>
                <th style={s.th}>Position</th>
                <th style={s.th}>Shift</th>
                <th style={s.th}>Type</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Joined</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} style={s.td}>
                        <div style={{ height: '14px', width: `${40 + (i * 7 + j) * 3}%`, maxWidth: '80%', borderRadius: '4px', background: 'var(--pz-surface-3)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div style={s.emptyState}>
                      <Users size={40} style={{ opacity: 0.2, margin: '0 auto 12px', display: 'block' }} />
                      <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--pz-text-secondary)', margin: '0 0 4px' }}>
                        {searchValue ? 'No matching employees' : 'No employees yet'}
                      </p>
                      <p style={{ fontSize: '13px', margin: 0, color: 'var(--pz-text-muted)' }}>
                        {searchValue ? 'Try adjusting your search terms' : 'Add your first employee to get started'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                employees.map((employee) => (
                  <EmployeeRow
                    key={employee.id}
                    employee={employee}
                    onSelect={() => setSelectedEmployee(employee)}
                    onHover={setHoveredRow}
                    isHovered={hoveredRow === employee.id}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={s.paginationBar}>
            <span style={{ fontSize: '13px', color: 'var(--pz-text-muted)' }}>
              Page {page} of {totalPages} &middot; {totalEmployees} total
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button style={s.paginationBtn(page <= 1)} disabled={page <= 1} onClick={() => setPage(1)}>
                <ChevronDown size={14} style={{ transform: 'rotate(90deg)' }} />
              </button>
              <button style={s.paginationBtn(page <= 1)} disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                <ChevronDown size={14} style={{ transform: 'rotate(90deg)' }} />
              </button>
              <span style={{ fontSize: '13px', color: 'var(--pz-text-secondary)', fontWeight: 700, margin: '0 8px', fontFamily: 'monospace' }}>
                {page} / {totalPages}
              </span>
              <button style={s.paginationBtn(page >= totalPages)} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronDown size={14} style={{ transform: 'rotate(-90deg)' }} />
              </button>
              <button style={s.paginationBtn(page >= totalPages)} disabled={page >= totalPages} onClick={() => setPage(totalPages)}>
                <ChevronDown size={14} style={{ transform: 'rotate(-90deg)' }} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Employee Detail Drawer */}
      <AnimatePresence>
        {selectedEmployee && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={() => { setSelectedEmployee(null); setDrawerTab('profile') }}
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-0 bottom-0 w-[520px] bg-[var(--pz-surface-1)] border-l border-[var(--pz-border)] shadow-2xl overflow-y-auto"
            >
              {/* Header */}
              <div className="sticky top-0 z-10 bg-[var(--pz-surface-1)] border-b border-[var(--pz-border)] px-6 py-4">
                <div className="flex items-center justify-between mb-3">
                  <button
                    onClick={() => { setSelectedEmployee(null); setDrawerTab('profile') }}
                    className="text-xs font-semibold text-[var(--pz-text-muted)] hover:text-[var(--pz-text-secondary)] transition-colors"
                  >
                    ← Back
                  </button>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600/20 to-indigo-600/20 border border-blue-500/20 flex items-center justify-center shrink-0">
                    <span className="text-xl font-bold text-blue-400">{selectedEmployee.full_name?.[0]}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-bold text-[var(--pz-text)] truncate">{selectedEmployee.full_name}</h2>
                    <p className="text-xs text-[var(--pz-text-muted)]">
                      {selectedEmployee.position || selectedEmployee.department_name || '—'}
                      {selectedEmployee.employment_type && ` · ${selectedEmployee.employment_type.replace(/_/g, ' ')}`}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <StatusBadge status={selectedEmployee.status as 'active' | 'inactive'} size="xs">
                        {selectedEmployee.status}
                      </StatusBadge>
                      <span className="text-[10px] font-mono text-[var(--pz-text-faint)]">{selectedEmployee.employee_code}</span>
                      {selectedEmployee.employee_number && (
                        <span className="text-[10px] font-mono text-[var(--pz-text-faint)]">#{selectedEmployee.employee_number}</span>
                      )}
                    </div>
                  </div>
                </div>
                {/* Tabs */}
                <div className="flex gap-1 mt-4">
                  {([
                    { key: 'profile' as DrawerTab, label: 'Profile', icon: <UserCog size={14} /> },
                    { key: 'assignment' as DrawerTab, label: 'Assignment', icon: <Shield size={14} /> },
                    { key: 'devices' as DrawerTab, label: 'Devices', icon: <Building2 size={14} /> },
                    { key: 'calendar' as DrawerTab, label: 'Schedule', icon: <Calendar size={14} /> },
                  ]).map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setDrawerTab(tab.key)}
                      className={cn(
                        'flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all flex-1 justify-center',
                        drawerTab === tab.key
                          ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                          : 'bg-[var(--pz-surface-2)] text-[var(--pz-text-muted)] hover:text-[var(--pz-text-secondary)]'
                      )}
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-6">
                {drawerTab === 'profile' && <EmployeeProfileTab employee={selectedEmployee} departmentsList={departmentsList} queryClient={queryClient} onEdit={() => setEditingEmployee(selectedEmployee)} />}
                {drawerTab === 'assignment' && <EmployeeAssignmentTab employee={selectedEmployee} shiftTemplates={shiftTemplates} protocols={shiftProtocols} assignments={employeeAssignments} overrides={employeeOverrides} queryClient={queryClient} />}
                {drawerTab === 'devices' && <EmployeeDevicesTab employee={selectedEmployee} queryClient={queryClient} />}
                {drawerTab === 'calendar' && <EmployeeCalendarTab employee={selectedEmployee} assignments={employeeAssignments} overrides={employeeOverrides} shiftTemplates={shiftTemplates} />}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Enrollment Wizard */}
      <EnrollmentWizard
        open={showAddModal}
        onClose={() => {
          setShowAddModal(false)
          queryClient.invalidateQueries({ queryKey: ['employees'] })
        }}
      />

      {/* Edit Employee Modal */}
      <EditEmployeeModal
        employee={editingEmployee}
        departments={departments}
        onClose={() => setEditingEmployee(null)}
        queryClient={queryClient}
      />
    </div>
  )
}

/* ── Edit Employee Modal ────────────────────────────────── */

function EditEmployeeModal({
  employee,
  departments,
  onClose,
  queryClient,
}: {
  employee: Employee | null
  departments: Department[]
  onClose: () => void
  queryClient: ReturnType<typeof useQueryClient>
}) {
  const [fullName, setFullName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [gender, setGender] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [position, setPosition] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [employmentType, setEmploymentType] = useState('')
  const [dateJoined, setDateJoined] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (employee) {
      setFullName(employee.full_name || '')
      setFirstName(employee.first_name || '')
      setLastName(employee.last_name || '')
      setMiddleName(employee.middle_name || '')
      setGender(employee.gender || '')
      setEmail(employee.email || '')
      setPhone(employee.phone || '')
      setPosition(employee.position || '')
      setDepartmentId(employee.department_id || '')
      setEmploymentType(employee.employment_type || '')
      setDateJoined(employee.date_joined || '')
      setStatus(employee.status || 'active')
    }
  }, [employee])

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => employeesAPI.update(employee!.id, data),
    onSuccess: () => {
      toast.success('Employee updated successfully')
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      onClose()
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || 'Failed to update employee'),
  })

  const handleSave = () => {
    const data: Record<string, unknown> = {}
    if (fullName.trim()) data.full_name = fullName.trim()
    if (firstName.trim()) data.first_name = firstName.trim()
    if (lastName.trim()) data.last_name = lastName.trim()
    if (middleName.trim()) data.middle_name = middleName.trim()
    if (gender) data.gender = gender
    if (email.trim()) data.email = email.trim()
    if (phone.trim()) data.phone = phone.trim()
    if (position.trim()) data.position = position.trim()
    data.department_id = departmentId || null
    if (employmentType) data.employment_type = employmentType
    if (dateJoined) data.date_joined = dateJoined
    if (status) data.status = status
    updateMutation.mutate(data)
  }

  return (
    <Modal
      open={!!employee}
      onClose={onClose}
      title="Edit Employee"
      description={employee ? `${employee.employee_code} — ${employee.full_name}` : ''}
      size="lg"
      onConfirm={handleSave}
      confirmLabel="Save Changes"
      confirmLoading={updateMutation.isPending}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'linear-gradient(135deg, var(--pz-brand), #7C3AED)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <User size={14} style={{ color: '#fff' }} />
          </div>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>Personal Information</h3>
        </div>
        <Input
          label="Full Name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="e.g. Mohamed Kamara"
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
          <Input
            label="First Name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="First name"
          />
          <Input
            label="Last Name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Last name"
          />
          <Input
            label="Middle Name"
            value={middleName}
            onChange={(e) => setMiddleName(e.target.value)}
            placeholder="Middle name"
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Gender</label>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              style={{ height: '44px', padding: '0 14px', borderRadius: '8px', border: '1px solid var(--pz-border)', background: 'var(--pz-surface-1)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', width: '100%' }}
            >
              <option value="">Not set</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e.g. mohamed@airport.com"
          />
          <Input
            label="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. +232 77 123456"
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'linear-gradient(135deg, #F59E0B, #D97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Building2 size={14} style={{ color: '#fff' }} />
          </div>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>Employment Details</h3>
        </div>
        <Input
          label="Position"
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          placeholder="e.g. IT Technician"
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Department</label>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              style={{ height: '44px', padding: '0 14px', borderRadius: '8px', border: '1px solid var(--pz-border)', background: 'var(--pz-surface-1)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', width: '100%' }}
            >
              <option value="">No Department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Employment Type</label>
            <select
              value={employmentType}
              onChange={(e) => setEmploymentType(e.target.value)}
              style={{ height: '44px', padding: '0 14px', borderRadius: '8px', border: '1px solid var(--pz-border)', background: 'var(--pz-surface-1)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', width: '100%' }}
            >
              <option value="">Not set</option>
              <option value="full_time">Full Time</option>
              <option value="part_time">Part Time</option>
              <option value="contract">Contract</option>
              <option value="intern">Intern</option>
              <option value="temporary">Temporary</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{ height: '44px', padding: '0 14px', borderRadius: '8px', border: '1px solid var(--pz-border)', background: 'var(--pz-surface-1)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none', width: '100%' }}
            >
              <option value="active">Active</option>
              <option value="inactive">On Leave</option>
              <option value="suspended">Suspended</option>
              <option value="terminated">Terminated</option>
              <option value="retired">Retired</option>
            </select>
          </div>
        </div>
        <Input
          label="Date Joined"
          type="date"
          value={dateJoined}
          onChange={(e) => setDateJoined(e.target.value)}
        />
      </div>
    </Modal>
  )
}

/* ── Employee Profile Tab ─────────────────────────────────── */

function EmployeeProfileTab({
  employee,
  departmentsList,
  queryClient,
  onEdit,
}: {
  employee: Employee
  departmentsList: Department[]
  queryClient: ReturnType<typeof useQueryClient>
  onEdit: () => void
}) {
  const [deptId, setDeptId] = useState(employee.department_id || '')

  const updateDeptMut = useMutation({
    mutationFn: (id: string) => employeesAPI.update(employee.id, { department_id: id || null }),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ['employees'] })
      toast.success('Department updated')
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to update'),
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-[var(--pz-text-secondary)] uppercase tracking-wider">Personal Info</h4>
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--pz-surface-2)] hover:bg-[var(--pz-surface-3)] text-[var(--pz-text-secondary)] text-xs font-bold transition-colors border border-[var(--pz-border)]"
        >
          <Edit2 size={12} />
          Edit
        </button>
      </div>
      <div>
        <div className="space-y-1">
          {[
            { label: 'Employee Code', value: employee.employee_code },
            { label: 'Employee Number', value: employee.employee_number || '—' },
            { label: 'First Name', value: employee.first_name || '—' },
            { label: 'Last Name', value: employee.last_name || '—' },
            { label: 'Gender', value: employee.gender ? employee.gender.charAt(0).toUpperCase() + employee.gender.slice(1) : '—' },
            { label: 'Email', value: employee.email || '—' },
            { label: 'Phone', value: employee.phone || '—' },
            { label: 'Position', value: employee.position || '—' },
            { label: 'Employment Type', value: employee.employment_type ? employee.employment_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—' },
            { label: 'Date Joined', value: employee.date_joined ? format(new Date(employee.date_joined), 'MMMM d, yyyy') : '—' },
            { label: 'Joined System', value: format(new Date(employee.created_at), 'MMMM d, yyyy') },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-2.5 px-4 rounded-xl bg-[var(--pz-surface-2)]/50">
              <span className="text-xs text-[var(--pz-text-muted)] font-medium">{label}</span>
              <span className="text-sm text-[var(--pz-text-secondary)] font-semibold">{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-xs font-bold text-[var(--pz-text-secondary)] uppercase tracking-wider mb-3">Department Assignment</h4>
        <div className="p-4 rounded-xl bg-[var(--pz-surface-2)]/50 border border-[var(--pz-border)] space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-[var(--pz-text-muted)] mb-1 block">Current Department</label>
            <select
              value={deptId}
              onChange={(e) => setDeptId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-xs text-[var(--pz-text)] focus:outline-none focus:border-blue-500/50"
            >
              <option value="">— No department —</option>
              {departmentsList.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => updateDeptMut.mutate(deptId)}
            disabled={updateDeptMut.isPending || deptId === (employee.department_id || '')}
            className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors disabled:opacity-50"
          >
            {updateDeptMut.isPending ? 'Saving...' : 'Update Department'}
          </button>
        </div>
      </div>

      <div>
        <h4 className="text-xs font-bold text-[var(--pz-text-secondary)] uppercase tracking-wider mb-3">Current Status</h4>
        <div className="flex items-center gap-3">
          <span className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-bold',
            employee.status === 'active' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' :
            employee.status === 'inactive' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20' :
            'bg-red-500/15 text-red-400 border border-red-500/20'
          )}>
            {employee.status}
          </span>
          {employee.shift_name && (
            <span className="px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/15 text-xs font-bold">
              <Clock size={12} className="inline mr-1 -mt-0.5" />
              {employee.shift_name}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Employee Devices Tab ─────────────────────────────────── */

function EmployeeDevicesTab({
  employee,
  queryClient,
}: {
  employee: Employee
  queryClient: ReturnType<typeof useQueryClient>
}) {
  const [showAssignModal, setShowAssignModal] = useState(false)

  const { data: assignedData, isLoading } = useQuery({
    queryKey: ['employee-devices', employee.id],
    queryFn: async () => (await devicesAPI.getEmployeeDevices(employee.id)).data,
  })

  const { data: allDevicesData } = useQuery({
    queryKey: ['devices-list'],
    queryFn: async () => (await devicesAPI.list()).data,
  })

  const assignedDevices: any[] = assignedData?.items ?? assignedData ?? []
  const allDevices: any[] = allDevicesData?.items ?? allDevicesData ?? []
  const unassignedDevices = allDevices.filter(
    (d: any) => !assignedDevices.some((a: any) => a.device_id === d.id)
  )

  const removeMutation = useMutation({
    mutationFn: (deviceId: string) => {
      const newIds = assignedDevices.filter((a: any) => a.device_id !== deviceId).map((a: any) => a.device_id)
      return devicesAPI.assignEmployeeDevices(employee.id, newIds)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-devices', employee.id] })
      toast.success('Device removed')
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || 'Failed to remove device'),
  })

  const assignMutation = useMutation({
    mutationFn: (deviceIds: string[]) => {
      const currentIds = assignedDevices.map((a: any) => a.device_id)
      return devicesAPI.assignEmployeeDevices(employee.id, [...currentIds, ...deviceIds])
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-devices', employee.id] })
      setShowAssignModal(false)
      toast.success('Device(s) assigned')
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || 'Failed to assign device'),
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-[var(--pz-text-secondary)] uppercase tracking-wider">
          Assigned Devices
        </h4>
        <button
          onClick={() => setShowAssignModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors"
        >
          <Plus size={12} />
          Assign Device
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map(i => (
            <div key={i} className="h-16 rounded-xl bg-[var(--pz-surface-2)]/50 animate-pulse" />
          ))}
        </div>
      ) : assignedDevices.length === 0 ? (
        <div className="p-6 rounded-xl bg-[var(--pz-surface-2)]/50 border border-[var(--pz-border)] text-center">
          <Building2 size={24} className="mx-auto text-[var(--pz-text-muted)] mb-2" />
          <p className="text-sm text-[var(--pz-text-muted)]">No devices assigned</p>
          <p className="text-xs text-[var(--pz-text-faint)] mt-1">Assign devices to control where this employee's biometrics are synced</p>
        </div>
      ) : (
        <div className="space-y-2">
          {assignedDevices.map((assignment: any) => (
            <div
              key={assignment.device_id}
              className="flex items-center justify-between p-3 rounded-xl bg-[var(--pz-surface-2)]/50 border border-[var(--pz-border)]"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${assignment.is_online ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-[var(--pz-surface-3)] border border-[var(--pz-border)]'}`}>
                  <Monitor size={14} className={assignment.is_online ? 'text-emerald-400' : 'text-[var(--pz-text-muted)]'} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--pz-text-secondary)]">{assignment.device_name || assignment.serial_number}</p>
                  <p className="text-[10px] text-[var(--pz-text-muted)] font-mono">{assignment.ip_address} · {assignment.serial_number}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={assignment.is_online ? 'online' : 'offline'} size="xs" />
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  assignment.sync_status === 'synced' ? 'bg-emerald-500/15 text-emerald-400' :
                  assignment.sync_status === 'failed' ? 'bg-red-500/15 text-red-400' :
                  'bg-amber-500/15 text-amber-400'
                }`}>
                  {assignment.sync_status || 'pending'}
                </span>
                <button
                  onClick={() => removeMutation.mutate(assignment.device_id)}
                  disabled={removeMutation.isPending}
                  className="p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--pz-text-muted)] hover:text-red-400 transition-colors"
                  title="Remove device"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Assign Device Modal */}
      <Modal
        open={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        title="Assign Devices"
        description={`Select devices to assign to ${employee.full_name}`}
        size="md"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px' }}>
          {unassignedDevices.length === 0 ? (
            <p style={{ fontSize: '14px', color: 'var(--pz-text-muted)', textAlign: 'center', padding: '16px 0' }}>All devices are already assigned</p>
          ) : (
            unassignedDevices.map((device: any) => (
              <label
                key={device.id}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '12px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', cursor: 'pointer', transition: 'all 0.12s' }}
              >
                <input
                  type="checkbox"
                  style={{ borderRadius: '4px', border: '1px solid var(--pz-border)' }}
                  data-device-id={device.id}
                />
                <div style={{ padding: '6px', borderRadius: '8px', background: device.is_online ? 'rgba(16, 185, 129, 0.1)' : 'var(--pz-surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Monitor size={12} style={{ color: device.is_online ? '#10B981' : 'var(--pz-text-muted)' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--pz-text-secondary)', margin: 0 }}>{device.name || `Device ${device.serial_number?.slice(-6)}`}</p>
                  <p style={{ fontSize: '10px', color: 'var(--pz-text-muted)', fontFamily: 'monospace', margin: 0 }}>{device.ip_address}</p>
                </div>
                <StatusBadge status={device.is_online ? 'online' : 'offline'} size="xs" />
              </label>
            ))
          )}
        </div>
        {unassignedDevices.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--pz-border)' }}>
            <Button variant="outline" onClick={() => setShowAssignModal(false)}>Cancel</Button>
            <Button
              onClick={() => {
                const checkboxes = document.querySelectorAll('input[data-device-id]:checked')
                const ids = Array.from(checkboxes).map((el) => el.getAttribute('data-device-id')!)
                if (ids.length > 0) assignMutation.mutate(ids)
              }}
              loading={assignMutation.isPending}
            >
              Assign Selected
            </Button>
          </div>
        )}
      </Modal>
    </div>
  )
}

/* ── Employee Assignment Tab ──────────────────────────────── */

function EmployeeAssignmentTab({
  employee,
  shiftTemplates,
  protocols,
  assignments,
  overrides,
  queryClient,
}: {
  employee: Employee
  shiftTemplates: ShiftTemplate[]
  protocols: ShiftProtocol[]
  assignments: EmployeeShiftAssignment[]
  overrides: EmployeeShiftOverride[]
  queryClient: ReturnType<typeof useQueryClient>
}) {
  const currentAssignment = assignments[0]
  const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  // Determine current selection: protocol or template
  const [selectedProtocol, setSelectedProtocol] = useState(currentAssignment?.shift_protocol_id || '')
  const [selectedTemplate, setSelectedTemplate] = useState(
    (!currentAssignment?.shift_protocol_id ? currentAssignment?.shift_template_id : '') || ''
  )
  const [assignmentType, setAssignmentType] = useState<'auto' | 'protocol' | 'custom'>(
    currentAssignment?.shift_protocol_id ? 'protocol' : currentAssignment?.shift_template_id ? 'custom' : 'auto'
  )
  const [workingDays, setWorkingDays] = useState<number[]>(currentAssignment?.working_days || [1, 2, 3, 4, 5])
  const [confirmOpen, setConfirmOpen] = useState(false)

  const selectedProto = protocols.find(p => p.id === selectedProtocol)
  const selectedTpl = shiftTemplates.find(t => t.id === selectedTemplate)

  const hasChanges = assignmentType === 'protocol'
    ? selectedProtocol !== (currentAssignment?.shift_protocol_id || '')
    : assignmentType === 'custom'
      ? selectedTemplate !== (currentAssignment?.shift_template_id || '')
      : !!currentAssignment // switching back to auto = delete assignment

  const assignMut = useMutation({
    mutationFn: (data: { protocolId?: string; templateId?: string; workingDays: number[]; deleteAssignment: boolean }) => {
      if (data.deleteAssignment && currentAssignment) {
        return shiftAssignmentsAPI.deleteAssignment(currentAssignment.id)
      }
      const wd = data.workingDays.length > 0 && data.workingDays.length < 7 ? data.workingDays : null
      if (currentAssignment) {
        return shiftAssignmentsAPI.updateAssignment(currentAssignment.id, {
          shift_protocol_id: data.protocolId || null,
          shift_template_id: data.templateId || null,
          working_days: wd,
        })
      }
      return shiftAssignmentsAPI.createAssignment({
        employee_id: employee.id,
        shift_protocol_id: data.protocolId || null,
        shift_template_id: data.templateId || null,
        rotation_templates: [],
        working_days: wd,
      })
    },
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ['employee-assignments', employee.id] })
      toast.success('Shift assignment updated')
      setConfirmOpen(false)
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to assign'),
  })

  const toggleDay = (day: number) => {
    setWorkingDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    )
  }

  const handleConfirm = () => {
    if (assignmentType === 'auto') {
      assignMut.mutate({ workingDays: [], deleteAssignment: true })
    } else if (assignmentType === 'protocol') {
      assignMut.mutate({ protocolId: selectedProtocol || undefined, workingDays, deleteAssignment: false })
    } else {
      assignMut.mutate({ templateId: selectedTemplate || undefined, workingDays, deleteAssignment: false })
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h4 className="text-xs font-bold text-[var(--pz-text-secondary)] uppercase tracking-wider mb-3">Shift Assignment</h4>
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 mb-3">
          <p className="text-[11px] text-amber-400 font-semibold">
            ⚠ Warning: This overrides the department's default shift protocol for this specific employee.
          </p>
          <p className="text-[10px] text-amber-400/70 mt-1">
            Attendance calculations, lateness detection, and overtime rules will follow the selected assignment instead of the department protocol. Use with caution.
          </p>
        </div>

        {/* Assignment Type Selector */}
        <div className="p-4 rounded-xl bg-[var(--pz-surface-2)]/50 border border-[var(--pz-border)] space-y-4">
          {/* Auto — department protocol */}
          <label className="flex items-start gap-3 p-3 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] cursor-pointer hover:border-blue-500/30 transition-colors">
            <input type="radio" name="assign-type" checked={assignmentType === 'auto'} onChange={() => setAssignmentType('auto')} className="mt-0.5 accent-blue-600" />
            <div>
              <p className="text-sm font-semibold text-[var(--pz-text)]">Auto — department protocol</p>
              <p className="text-[10px] text-[var(--pz-text-muted)] mt-0.5">Employee follows the department's default shift protocol. No override.</p>
            </div>
          </label>

          {/* Protocol-based assignments */}
          {protocols.filter(p => p.is_active).map(p => {
            const isRotating = p.protocol_type === 'rotating'
            const patternColors: Record<string, string> = { day: 'bg-amber-400', night: 'bg-emerald-500', off: 'bg-[var(--pz-surface-3)]' }
            const patternLetters: Record<string, string> = { day: 'D', night: 'N', off: '' }
            return (
            <label key={p.id} className={cn(
              'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors',
              assignmentType === 'protocol' && selectedProtocol === p.id
                ? 'bg-blue-600/5 border-blue-500/40'
                : 'bg-[var(--pz-surface-2)] border-[var(--pz-border)] hover:border-blue-500/30'
            )}>
              <input
                type="radio" name="assign-type"
                checked={assignmentType === 'protocol' && selectedProtocol === p.id}
                onChange={() => { setAssignmentType('protocol'); setSelectedProtocol(p.id); setSelectedTemplate('') }}
                className="mt-0.5 accent-blue-600"
              />
              <div className="flex-1 space-y-2">
                {/* Header */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--pz-text)]">{p.name}</span>
                  <span className={cn(
                    'text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider',
                    isRotating
                      ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                      : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  )}>
                    {p.protocol_type}
                  </span>
                </div>

                {/* Description */}
                <p className="text-[10px] text-[var(--pz-text-muted)]">
                  {isRotating
                    ? `${p.days_on || '?'}on / ${p.days_off || '?'}off · ${p.day_shift_start || '?'}–${p.day_shift_end || '?'} day · ${p.night_shift_start || '?'}–${p.night_shift_end || '?'} night`
                    : `${p.working_hours_start || '?'}–${p.working_hours_end || '?'} · ${p.working_days?.length || 5} day/week`
                  }
                </p>

                {/* Rotation Pattern Preview */}
                {isRotating && p.rotation_shifts && p.rotation_shifts.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <div className="flex gap-[2px]">
                      {p.rotation_shifts.slice(0, 8).map((s: string, i: number) => (
                        <div
                          key={i}
                          className={cn(
                            'w-5 h-5 rounded-[3px] flex items-center justify-center text-[7px] font-bold',
                            patternColors[s] || 'bg-[var(--pz-surface-3)]',
                            s === 'off' ? 'text-[var(--pz-text-muted)]' : 'text-white'
                          )}
                        >
                          {patternLetters[s] || ''}
                        </div>
                      ))}
                    </div>
                    <span className="text-[8px] text-[var(--pz-text-muted)]">↻ {p.rotation_shifts.length}-day cycle</span>
                  </div>
                )}

                {/* Legend for rotating */}
                {isRotating && (
                  <div className="flex items-center gap-3 text-[9px] text-[var(--pz-text-muted)]">
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400" /> Day</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Night</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[var(--pz-surface-3)]" /> Off</span>
                  </div>
                )}

                {/* Working days for fixed */}
                {!isRotating && p.working_days && (
                  <div className="flex gap-1">
                    {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d, i) => {
                      const isWorking = p.working_days!.includes(i + 1)
                      return (
                        <span key={d} className={cn(
                          'w-6 h-5 rounded-[3px] flex items-center justify-center text-[8px] font-bold',
                          isWorking
                            ? 'bg-amber-400/20 text-amber-400 border border-amber-400/30'
                            : 'bg-[var(--pz-surface-2)] text-[var(--pz-text-muted)] border border-[var(--pz-border)]'
                        )}>
                          {d[0]}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            </label>
            )
          })}

          {/* Custom template override */}
          <div className="p-3 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] space-y-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="radio" name="assign-type" checked={assignmentType === 'custom'} onChange={() => setAssignmentType('custom')} className="mt-0.5 accent-blue-600" />
              <span className="text-sm font-semibold text-[var(--pz-text)]">Custom template override</span>
            </label>
            {assignmentType === 'custom' && (
              <div className="ml-7">
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-xs text-[var(--pz-text)] focus:outline-none focus:border-blue-500/50"
                >
                  <option value="">Select a shift template</option>
                  {shiftTemplates.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.start_time}–{t.end_time})</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <button
            onClick={() => setConfirmOpen(true)}
            disabled={
              assignMut.isPending ||
              !hasChanges ||
              (assignmentType === 'custom' && !selectedTemplate) ||
              (assignmentType === 'protocol' && !selectedProtocol)
            }
            className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors disabled:opacity-50"
          >
            {assignMut.isPending ? 'Saving...' : assignmentType === 'auto' && currentAssignment ? 'Remove Override' : currentAssignment ? 'Update Override' : 'Apply Override'}
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={assignmentType === 'auto' ? 'Remove Assignment Override' : 'Confirm Shift Override'}
        size="sm"
        description={assignmentType === 'auto' ? 'Revert employee to department protocol' : 'This changes how attendance is calculated for this employee'}
        footer={
          <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
            <button
              onClick={() => setConfirmOpen(false)}
              style={{ flex: 1, padding: '12px 20px', borderRadius: '12px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '14px', fontWeight: 600, color: 'var(--pz-text-secondary)', cursor: 'pointer', transition: 'background 0.12s' }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={assignMut.isPending}
              style={{
                flex: 1,
                padding: '12px 20px',
                borderRadius: '12px',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 600,
                border: 'none',
                cursor: assignMut.isPending ? 'default' : 'pointer',
                transition: 'background 0.12s',
                opacity: assignMut.isPending ? 0.5 : 1,
                background: assignmentType === 'auto' ? '#DC2626' : '#D97706',
              }}
            >
              {assignMut.isPending ? 'Saving...' : assignmentType === 'auto' ? 'Remove Override' : 'Confirm Override'}
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '16px' }}>
          <div style={{ padding: '12px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
            <p style={{ fontSize: '12px', fontWeight: 700, color: '#F59E0B', margin: '0 0 4px 0' }}>⚠ Repercussions</p>
            <ul style={{ fontSize: '11px', color: 'rgba(245, 158, 11, 0.8)', margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {assignmentType === 'auto' ? (
                <li>Employee will revert to the department's default shift protocol</li>
              ) : (
                <>
                  <li>Employee will no longer follow the department's shift protocol</li>
                  <li>IN/OUT detection, lateness, and overtime will use the override rules</li>
                  <li>Department-level protocol changes will NOT affect this employee</li>
                  <li>Manual review required to revert back to department protocol</li>
                </>
              )}
            </ul>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '8px', background: 'var(--pz-surface-2)' }}>
              <span style={{ color: 'var(--pz-text-muted)' }}>Employee</span>
              <span style={{ fontWeight: 600, color: 'var(--pz-text)' }}>{employee.full_name}</span>
            </div>
            {assignmentType === 'protocol' && selectedProto && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '8px', background: 'var(--pz-surface-2)' }}>
                  <span style={{ color: 'var(--pz-text-muted)' }}>Protocol</span>
                  <span style={{ fontWeight: 600, color: 'var(--pz-text)' }}>{selectedProto.name} ({selectedProto.protocol_type})</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '8px', background: 'var(--pz-surface-2)' }}>
                  <span style={{ color: 'var(--pz-text-muted)' }}>Pattern</span>
                  <span style={{ fontWeight: 600, color: 'var(--pz-text)' }}>
                    {selectedProto.protocol_type === 'rotating'
                      ? `${selectedProto.days_on || '?'} on / ${selectedProto.days_off || '?'} off`
                      : `${selectedProto.working_hours_start || '?'}–${selectedProto.working_hours_end || '?'}`
                    }
                  </span>
                </div>
              </>
            )}
            {assignmentType === 'custom' && selectedTpl && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '8px', background: 'var(--pz-surface-2)' }}>
                <span style={{ color: 'var(--pz-text-muted)' }}>Override Template</span>
                <span style={{ fontWeight: 600, color: 'var(--pz-text)' }}>{selectedTpl.name} ({selectedTpl.start_time}–{selectedTpl.end_time})</span>
              </div>
            )}
            {currentAssignment && assignmentType !== 'auto' && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '8px', background: 'var(--pz-surface-2)' }}>
                <span style={{ color: 'var(--pz-text-muted)' }}>Current Override</span>
                <span style={{ fontWeight: 600, color: 'var(--pz-text)' }}>Active</span>
              </div>
            )}
          </div>
          {/* Working Days Selector (only for protocol/custom) */}
          {assignmentType !== 'auto' && (
            <div style={{ padding: '12px', borderRadius: '12px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)' }}>
              <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px', display: 'block' }}>
                Apply on which days?
              </label>
              <div style={{ display: 'flex', gap: '6px' }}>
                {DAYS_SHORT.map((day, idx) => (
                  <button
                    key={day}
                    onClick={() => toggleDay(idx + 1)}
                    style={{
                      flex: 1,
                      padding: '8px 0',
                      borderRadius: '8px',
                      fontSize: '9px',
                      fontWeight: 700,
                      border: '1px solid',
                      cursor: 'pointer',
                      transition: 'all 0.12s',
                      ...(workingDays.includes(idx + 1)
                        ? { background: 'var(--pz-brand)', color: '#fff', borderColor: 'var(--pz-brand)' }
                        : { background: 'var(--pz-surface-2)', borderColor: 'var(--pz-border)', color: 'var(--pz-text-muted)' }
                      ),
                    }}
                  >
                    {day[0]}
                  </button>
                ))}
              </div>
              {workingDays.length === 0 && (
                <p style={{ fontSize: '9px', color: '#F59E0B', margin: '6px 0 0' }}>No days selected — assignment will not apply to any day</p>
              )}
              {workingDays.length === 7 && (
                <p style={{ fontSize: '9px', color: 'var(--pz-text-muted)', margin: '6px 0 0' }}>All days — employee works every day including weekends</p>
              )}
            </div>
          )}
        </div>
      </Modal>

      {overrides.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-[var(--pz-text-secondary)] uppercase tracking-wider mb-3">Date-Specific Overrides</h4>
          <div className="space-y-2">
            {overrides.map(o => (
              <div key={o.id} className="p-3 rounded-xl bg-[var(--pz-surface-2)]/50 border border-[var(--pz-border)]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--pz-text)]">
                    {o.start_date} → {o.end_date}
                  </span>
                  <span className="text-[10px] text-[var(--pz-text-muted)] font-mono">
                    {shiftTemplates.find(t => t.id === o.shift_template_id)?.name || o.shift_template_id.slice(0, 8)}
                  </span>
                </div>
                {o.reason && (
                  <p className="text-[10px] text-[var(--pz-text-muted)] mt-1">{o.reason}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Employee Schedule Calendar Tab ────────────────────────── */

function EmployeeCalendarTab({
  employee,
  assignments,
  overrides,
  shiftTemplates,
}: {
  employee: Employee
  assignments: EmployeeShiftAssignment[]
  overrides: EmployeeShiftOverride[]
  shiftTemplates: ShiftTemplate[]
}) {
  const today = new Date()
  const monthStart = startOfMonth(today)
  const monthEnd = endOfMonth(today)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const startPadding = getDay(monthStart)

  const assignment = assignments[0]
  const overrideMap = new Map<string, string>()
  overrides.forEach(o => {
    const s = new Date(o.start_date)
    const e = new Date(o.end_date)
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      overrideMap.set(format(d, 'yyyy-MM-dd'), o.shift_template_id)
    }
  })

  const getDayShift = (date: Date): { type: string; label: string } | null => {
    const key = format(date, 'yyyy-MM-dd')
    const overrideTplId = overrideMap.get(key)
    if (overrideTplId) {
      const tpl = shiftTemplates.find(t => t.id === overrideTplId)
      return tpl ? { type: 'override', label: tpl.name } : { type: 'override', label: 'Custom' }
    }
    return null
  }

  return (
    <div className="space-y-5">
      <div>
        <h4 className="text-xs font-bold text-[var(--pz-text-secondary)] uppercase tracking-wider mb-1">
          {format(today, 'MMMM yyyy')}
        </h4>
        <p className="text-[11px] text-[var(--pz-text-muted)]">
          {employee.full_name}'s shift schedule. Overrides and assignments shown below.
        </p>
      </div>

      {/* Calendar Grid */}
      <div className="rounded-xl border border-[var(--pz-border)] overflow-hidden">
        <div className="grid grid-cols-7 bg-[var(--pz-surface-2)]/80">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="py-2 text-center text-[10px] font-bold text-[var(--pz-text-muted)] uppercase tracking-wider">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: startPadding }).map((_, i) => (
            <div key={`pad-${i}`} className="h-14 border-b border-r border-[var(--pz-border)] bg-[var(--pz-surface-1)]/50" />
          ))}
          {days.map((date) => {
            const shift = getDayShift(date)
            const isToday = format(date, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')
            return (
              <div
                key={date.toISOString()}
                className={cn(
                  'h-14 border-b border-r border-[var(--pz-border)] p-1.5 relative group cursor-default',
                  isToday && 'bg-blue-500/[0.03]'
                )}
              >
                <span className={cn(
                  'text-[10px] font-semibold',
                  isToday ? 'text-blue-400' : 'text-[var(--pz-text-muted)]'
                )}>
                  {date.getDate()}
                </span>
                {shift && (
                  <div className={cn(
                    'mt-0.5 px-1.5 py-0.5 rounded text-[8px] font-bold truncate',
                    shift.type === 'override' ? 'bg-green-500/15 text-green-400 border border-green-500/20' :
                    'bg-zinc-500/15 text-zinc-400'
                  )}>
                    {shift.label}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        <span className="flex items-center gap-1.5 text-[10px] text-[var(--pz-text-muted)]">
          <span className="w-3 h-3 rounded bg-zinc-500/30" /> Off / Unassigned
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-[var(--pz-text-muted)]">
          <span className="w-3 h-3 rounded bg-green-500/30" /> Override
        </span>
      </div>

      {overrides.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-[var(--pz-text-secondary)] uppercase tracking-wider mb-2">Active Overrides</h4>
          <div className="space-y-1">
            {overrides.map(o => (
              <div key={o.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--pz-surface-2)]/50 border border-[var(--pz-border)]">
                <span className="text-[11px] font-semibold text-[var(--pz-text)]">
                  {o.start_date} – {o.end_date}
                </span>
                <span className="text-[10px] text-green-400 font-mono">
                  {shiftTemplates.find(t => t.id === o.shift_template_id)?.name || 'Custom'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
