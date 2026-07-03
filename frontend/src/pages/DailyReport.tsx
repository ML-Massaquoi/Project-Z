import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Calendar, Download, RefreshCw, Building2, Clock, UserCheck, UserX,
  AlertTriangle, Sun, Moon, ChevronDown, ChevronUp, FileText,
} from 'lucide-react'
import { format } from 'date-fns'
import { dailyReportsAPI, departmentsAPI } from '@/api/client'
import { KPICard } from '@/components/ui/KPICard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface ReportLine {
  id: string
  employee_id: string
  employee_code: string
  employee_name: string
  department_name: string
  position: string | null
  shift_name: string | null
  shift_start: string | null
  shift_end: string | null
  first_scan: string | null
  last_scan: string | null
  total_scans: number
  check_in: string | null
  check_out: string | null
  late_minutes: number
  overtime_minutes: number
  early_departure_minutes: number
  duration_minutes: number
  status: string
  check_in_device: string | null
  check_out_device: string | null
}

interface Report {
  id: string
  report_date: string
  department_id: string
  department_name: string
  total_expected: number
  total_present: number
  total_late: number
  total_absent: number
  total_on_leave: number
  total_overtime: number
  total_early_departure: number
  generated_at: string | null
  is_final: boolean
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  on_time: { label: 'On Time', color: 'var(--pz-success)', bg: 'rgba(16,185,129,0.1)' },
  late: { label: 'Late', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
  present: { label: 'Present', color: 'var(--pz-success)', bg: 'rgba(16,185,129,0.1)' },
  absent: { label: 'Absent', color: 'var(--pz-danger)', bg: 'rgba(239,68,68,0.1)' },
  on_leave: { label: 'On Leave', color: 'var(--pz-accent)', bg: 'rgba(59,130,246,0.1)' },
  off_duty: { label: 'Off Duty', color: 'var(--pz-text-muted)', bg: 'rgba(107,114,128,0.1)' },
  partial: { label: 'Partial', color: '#F97316', bg: 'rgba(249,115,22,0.1)' },
}

const s = {
  page: { display: 'flex', flexDirection: 'column' as const, gap: '28px', padding: '32px', flex: 1 },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerLeft: { display: 'flex', flexDirection: 'column' as const, gap: '4px' },
  headerTitle: { fontSize: '22px', fontWeight: 700, color: 'var(--pz-text)', margin: 0, letterSpacing: '-0.02em' },
  headerSubtitle: { fontSize: '13px', color: 'var(--pz-text-muted)', margin: 0 },
  filters: { display: 'flex', flexWrap: 'wrap' as const, alignItems: 'center', gap: '16px' },
  filterGroup: { display: 'flex', alignItems: 'center', gap: '10px' },
  filterInput: { padding: '10px 16px', borderRadius: '12px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '14px', color: 'var(--pz-text)', outline: 'none' },
  filterSelect: { padding: '10px 16px', borderRadius: '12px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '14px', color: 'var(--pz-text-secondary)', outline: 'none' },
  filterInfo: { fontSize: '14px', color: 'var(--pz-text-muted)' },
  emptyIcon: { margin: '0 auto 20px', color: 'var(--pz-text-faint)' },
  emptyTitle: { fontSize: '18px', color: 'var(--pz-text-muted)', fontWeight: 500, margin: 0 },
  emptySub: { fontSize: '14px', color: 'var(--pz-text-faint)', marginTop: '8px' },
  reportList: { display: 'flex', flexDirection: 'column' as const, gap: '16px' },
  card: { background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', borderRadius: '10px', overflow: 'hidden' },
  cardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  cardClickable: { width: '100%', textAlign: 'left' as const, padding: '20px', background: 'none', border: 'none', cursor: 'pointer' },
  deptIcon: { width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  deptName: { fontSize: '16px', fontWeight: 700, color: 'var(--pz-text)', margin: 0 },
  deptMeta: { fontSize: '12px', color: 'var(--pz-text-muted)', marginTop: '4px' },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px' },
  emptyDetail: { padding: '48px 0', textAlign: 'center' as const, color: 'var(--pz-text-muted)', fontSize: '14px' },
  tableWrap: { overflowX: 'auto' as const },
  table: { width: '100%', fontSize: '14px', borderCollapse: 'collapse' as const },
  th: { textAlign: 'left' as const, padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  td: { padding: '12px 16px' },
  employeeCell: { display: 'flex', alignItems: 'center', gap: '12px' },
  avatar: { width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, rgba(59,130,246,0.4), rgba(99,102,241,0.4))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: 'var(--pz-accent)', border: '1px solid rgba(59,130,246,0.2)' },
  employeeName: { fontWeight: 600, color: 'var(--pz-text-secondary)' },
  code: { color: 'var(--pz-text-muted)', fontFamily: 'monospace', fontSize: '12px' },
  shiftCell: { display: 'flex', alignItems: 'center', gap: '6px' },
  scanTime: { color: 'var(--pz-text-secondary)', fontFamily: 'monospace', fontSize: '12px' },
  scanDevice: { fontSize: '11px', color: 'var(--pz-text-faint)', margin: 0 },
  duration: { color: 'var(--pz-text-muted)', fontFamily: 'monospace', fontSize: '12px' },
  lateVal: { color: '#F59E0B', fontWeight: 600 },
  overtimeVal: { color: '#F97316', fontWeight: 600 },
  dash: { color: 'var(--pz-text-faint)' },
  statusPill: (bg: string, color: string) => ({
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    padding: '4px 10px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: 600,
    border: '1px solid',
    background: bg,
    color: color,
    borderColor: bg,
  }),
  exportBar: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.05)' },
}

export default function DailyReportPage() {
  const queryClient = useQueryClient()
  const today = format(new Date(), 'yyyy-MM-dd')
  const [selectedDate, setSelectedDate] = useState(today)
  const [selectedDept, setSelectedDept] = useState('')
  const [expandedReport, setExpandedReport] = useState<string | null>(null)

  const { data: deptsData } = useQuery({
    queryKey: ['departments-list'],
    queryFn: async () => (await departmentsAPI.list()).data,
  })
  const departments = Array.isArray(deptsData) ? deptsData : deptsData?.items ?? []

  const { data: reportsData, isLoading: reportsLoading, refetch: refetchReports } = useQuery({
    queryKey: ['daily-reports', selectedDate, selectedDept],
    queryFn: async () => {
      try {
        const resp = await dailyReportsAPI.getByDate(selectedDate, selectedDept || undefined)
        return resp.data
      } catch (err: any) {
        if (err.response?.status === 404) return null
        throw err
      }
    },
  })

  const { data: reportDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['daily-report-detail', expandedReport],
    queryFn: async () => (await dailyReportsAPI.getById(expandedReport!)).data,
    enabled: !!expandedReport,
  })

  const generateMutation = useMutation({
    mutationFn: async () => {
      const resp = await dailyReportsAPI.generate({
        report_date: selectedDate,
        department_id: selectedDept || undefined,
      })
      return resp.data
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Report generated')
      refetchReports()
      if (expandedReport) queryClient.invalidateQueries({ queryKey: ['daily-report-detail', expandedReport] })
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to generate'),
  })

  const handleExport = async (reportId: string, fmt: string) => {
    try {
      const resp = await dailyReportsAPI.export(reportId, fmt)
      const blob = new Blob([resp.data])
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `daily_report_${selectedDate}.${fmt === 'excel' ? 'xlsx' : 'csv'}`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Export downloaded')
    } catch {
      toast.error('Export failed')
    }
  }

  const reports: Report[] = reportsData?.reports ?? []
  const lines: ReportLine[] = reportDetail?.lines ?? []
  const activeReport = reports.find(r => r.id === expandedReport)

  const lineSummary = {
    present: lines.filter(l => l.status === 'on_time' || l.status === 'present' || l.status === 'late').length,
    late: lines.filter(l => l.status === 'late').length,
    absent: lines.filter(l => l.status === 'absent').length,
    onLeave: lines.filter(l => l.status === 'on_leave').length,
    overtime: lines.filter(l => l.overtime_minutes > 0).length,
    totalScans: lines.reduce((sum, l) => sum + l.total_scans, 0),
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h1 style={s.headerTitle}>Daily Attendance Report</h1>
          <p style={s.headerSubtitle}>
            First scan = check-in · Last scan = check-out · {format(new Date(), 'EEEE, MMMM d yyyy')}
          </p>
        </div>
        <Button variant="default" size="md"
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          loading={generateMutation.isPending}>
          <RefreshCw size={15} className={generateMutation.isPending ? 'animate-spin' : ''} />
          {generateMutation.isPending ? 'Generating...' : 'Generate Report'}
        </Button>
      </div>

      {/* Filters */}
      <div style={s.filters}>
        <div style={s.filterGroup}>
          <Calendar size={16} style={{ color: 'var(--pz-text-muted)' }} />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            max={today}
            style={s.filterInput}
          />
        </div>
        <select
          value={selectedDept}
          onChange={(e) => setSelectedDept(e.target.value)}
          style={s.filterSelect}
        >
          <option value="">All Departments</option>
          {departments.map((d: any) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <span style={s.filterInfo}>
          {reports.length} report{reports.length !== 1 ? 's' : ''} for {format(new Date(selectedDate + 'T12:00:00'), 'MMM d, yyyy')}
        </span>
      </div>

      {/* Report Cards */}
      {reportsLoading ? (
        <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--pz-text-muted)', fontSize: '14px' }}>Loading reports...</div>
      ) : reports.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '80px 0', textAlign: 'center' }}>
          <FileText size={56} style={s.emptyIcon} />
          <p style={s.emptyTitle}>No reports for this date</p>
          <p style={s.emptySub}>Click "Generate Report" to create attendance report for {format(new Date(selectedDate + 'T12:00:00'), 'MMMM d, yyyy')}</p>
        </motion.div>
      ) : (
        <div style={s.reportList}>
          {reports.map((report) => {
            const isExpanded = expandedReport === report.id
            return (
              <motion.div key={report.id} layout style={s.card}>
                <button
                  onClick={() => setExpandedReport(isExpanded ? null : report.id)}
                  style={s.cardClickable}
                >
                  <div style={s.cardHeader}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={s.deptIcon}>
                        <Building2 size={18} style={{ color: 'var(--pz-accent)' }} />
                      </div>
                      <div>
                        <p style={s.deptName}>{report.department_name}</p>
                        <p style={s.deptMeta}>
                          Generated {report.generated_at ? format(new Date(report.generated_at), 'hh:mm a') : '—'}
                        </p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '14px' }}>
                        <span style={{ color: 'var(--pz-success)', fontWeight: 600 }}>{report.total_present} present</span>
                        <span style={{ color: '#F59E0B', fontWeight: 600 }}>{report.total_late} late</span>
                        <span style={{ color: 'var(--pz-danger)', fontWeight: 600 }}>{report.total_absent} absent</span>
                        <span style={{ color: 'var(--pz-accent)', fontWeight: 600 }}>{report.total_on_leave} leave</span>
                      </div>
                      {isExpanded
                        ? <ChevronUp size={18} style={{ color: 'var(--pz-text-muted)' }} />
                        : <ChevronDown size={18} style={{ color: 'var(--pz-text-muted)' }} />
                      }
                    </div>
                  </div>
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div style={{ borderTop: '1px solid var(--pz-border)', padding: '24px' }}>
                        <div style={s.kpiGrid}>
                          <KPICard icon={UserCheck} label="Present" value={lineSummary.present} color="#10B981" />
                          <KPICard icon={Clock} label="Late" value={lineSummary.late} color="#F59E0B" />
                          <KPICard icon={UserX} label="Absent" value={lineSummary.absent} color="#EF4444" />
                          <KPICard icon={FileText} label="On Leave" value={lineSummary.onLeave} color="#3B82F6" />
                          <KPICard icon={AlertTriangle} label="Overtime" value={lineSummary.overtime} color="#F97316" />
                          <KPICard icon={Sun} label="Total Scans" value={lineSummary.totalScans} color="#8B5CF6" />
                        </div>

                        {detailLoading ? (
                          <div style={s.emptyDetail}>Loading employee details...</div>
                        ) : lines.length === 0 ? (
                          <div style={s.emptyDetail}>No employee data</div>
                        ) : (
                          <div style={s.tableWrap}>
                            <table style={s.table}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid var(--pz-border)', background: 'rgba(255,255,255,0.025)' }}>
                                  <th style={s.th}>Employee</th>
                                  <th style={s.th}>Code</th>
                                  <th style={s.th}>Shift</th>
                                  <th style={s.th}>Check In</th>
                                  <th style={s.th}>Check Out</th>
                                  <th style={s.th}>Duration</th>
                                  <th style={s.th}>Late</th>
                                  <th style={s.th}>Overtime</th>
                                  <th style={s.th}>Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {lines.map((line, i) => {
                                  const cfg = STATUS_CONFIG[line.status] || STATUS_CONFIG.absent
                                  return (
                                    <motion.tr
                                      key={line.id}
                                      initial={{ opacity: 0, x: -4 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      transition={{ delay: i * 0.01 }}
                                      style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                                    >
                                      <td style={s.td}>
                                        <div style={s.employeeCell}>
                                          <div style={s.avatar}>
                                            {line.employee_name?.[0] || '?'}
                                          </div>
                                          <span style={s.employeeName}>{line.employee_name}</span>
                                        </div>
                                      </td>
                                      <td style={s.td}><span style={s.code}>{line.employee_code}</span></td>
                                      <td style={s.td}>
                                        <div style={s.shiftCell}>
                                          <span style={{ color: 'var(--pz-text-muted)' }}>{line.shift_name || '—'}</span>
                                          {line.shift_start && line.shift_end && line.shift_start > line.shift_end && (
                                            <Moon size={12} style={{ color: '#818CF8' }} />
                                          )}
                                        </div>
                                      </td>
                                      <td style={s.td}>
                                        {line.first_scan ? (
                                          <div>
                                            <span style={s.scanTime}>
                                              {format(new Date(line.first_scan), 'hh:mm:ss a')}
                                            </span>
                                            {line.check_in_device && (
                                              <p style={s.scanDevice}>{line.check_in_device}</p>
                                            )}
                                          </div>
                                        ) : <span style={s.dash}>—</span>}
                                      </td>
                                      <td style={s.td}>
                                        {line.last_scan ? (
                                          <div>
                                            <span style={s.scanTime}>
                                              {format(new Date(line.last_scan), 'hh:mm:ss a')}
                                            </span>
                                            {line.first_scan && line.last_scan && new Date(line.last_scan).toDateString() !== new Date(line.first_scan).toDateString() && (
                                              <span style={{ fontSize: '11px', color: '#F59E0B', marginLeft: '4px', fontWeight: 600 }}>+1d</span>
                                            )}
                                            {line.check_out_device && (
                                              <p style={s.scanDevice}>{line.check_out_device}</p>
                                            )}
                                          </div>
                                        ) : <span style={s.dash}>—</span>}
                                      </td>
                                      <td style={s.td}>
                                        <span style={s.duration}>
                                          {line.duration_minutes > 0 ? (
                                            <span>{Math.floor(line.duration_minutes / 60)}h {Math.round(line.duration_minutes % 60)}m</span>
                                          ) : '—'}
                                        </span>
                                      </td>
                                      <td style={s.td}>
                                        {line.late_minutes > 0 ? (
                                          <span style={s.lateVal}>{Math.round(line.late_minutes)}m</span>
                                        ) : <span style={s.dash}>—</span>}
                                      </td>
                                      <td style={s.td}>
                                        {line.overtime_minutes > 0 ? (
                                          <span style={s.overtimeVal}>{Math.round(line.overtime_minutes)}m</span>
                                        ) : <span style={s.dash}>—</span>}
                                      </td>
                                      <td style={s.td}>
                                        <span style={s.statusPill(cfg.bg, cfg.color)}>
                                          {cfg.label}
                                        </span>
                                      </td>
                                    </motion.tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}

                        <div style={s.exportBar}>
                          <Button variant="outline" size="md" onClick={() => handleExport(report.id, 'csv')}>
                            <Download size={14} />
                            CSV
                          </Button>
                          <Button variant="outline" size="md" onClick={() => handleExport(report.id, 'excel')}>
                            <Download size={14} />
                            Excel
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
