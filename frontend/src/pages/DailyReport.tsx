import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Calendar, Download, RefreshCw, Building2, Clock, UserCheck, UserX,
  AlertTriangle, Sun, Moon, ChevronDown, ChevronUp, FileText,
} from 'lucide-react'
import { format } from 'date-fns'
import { dailyReportsAPI, departmentsAPI } from '@/api/client'
import { PageHeader } from '@/components/ui/PageHeader'
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
  on_time: { label: 'On Time', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  late: { label: 'Late', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
  present: { label: 'Present', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  absent: { label: 'Absent', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
  on_leave: { label: 'On Leave', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
  off_duty: { label: 'Off Duty', color: 'text-[var(--pz-text-muted)]', bg: 'bg-gray-500/10 border-gray-500/20' },
  partial: { label: 'Partial', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
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
    <div className="space-y-6 pz-slide-up">
      <PageHeader
        title="Daily Attendance Report"
        subtitle={`First scan = check-in · Last scan = check-out · ${format(new Date(), 'EEEE, MMMM d yyyy')}`}
        actions={
          <Button variant="default" size="md"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            loading={generateMutation.isPending}>
            <RefreshCw size={15} className={generateMutation.isPending ? 'animate-spin' : ''} />
            {generateMutation.isPending ? 'Generating...' : 'Generate Report'}
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2.5">
          <Calendar size={16} className="text-[var(--pz-text-muted)]" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            max={today}
            className="px-4 py-2.5 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm text-[var(--pz-text)] focus:outline-none focus:border-blue-500"
          />
        </div>
        <select
          value={selectedDept}
          onChange={(e) => setSelectedDept(e.target.value)}
          className="px-4 py-2.5 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm text-[var(--pz-text-secondary)] focus:outline-none"
        >
          <option value="">All Departments</option>
          {departments.map((d: any) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <span className="text-sm text-[var(--pz-text-muted)]">
          {reports.length} report{reports.length !== 1 ? 's' : ''} for {format(new Date(selectedDate + 'T12:00:00'), 'MMM d, yyyy')}
        </span>
      </div>

      {/* Report Cards */}
      {reportsLoading ? (
        <div className="py-20 text-center text-[var(--pz-text-muted)] text-sm">Loading reports...</div>
      ) : reports.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-20 text-center">
          <FileText size={56} className="mx-auto mb-5 text-[var(--pz-text-faint)]" />
          <p className="text-lg text-[var(--pz-text-muted)] font-medium">No reports for this date</p>
          <p className="text-sm text-[var(--pz-text-faint)] mt-2">Click "Generate Report" to create attendance report for {format(new Date(selectedDate + 'T12:00:00'), 'MMMM d, yyyy')}</p>
        </motion.div>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => {
            const isExpanded = expandedReport === report.id
            return (
              <motion.div key={report.id} layout className="pz-card overflow-hidden">
                <button
                  onClick={() => setExpandedReport(isExpanded ? null : report.id)}
                  className="w-full text-left p-5 hover:bg-[var(--pz-surface-2)]/20 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-blue-600/12 border border-blue-500/20 flex items-center justify-center">
                        <Building2 size={18} className="text-blue-400" />
                      </div>
                      <div>
                        <span className="text-base font-bold text-[var(--pz-text)]">{report.department_name}</span>
                        <p className="text-xs text-[var(--pz-text-muted)] mt-1">
                          Generated {report.generated_at ? format(new Date(report.generated_at), 'hh:mm a') : '—'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-5">
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-emerald-400 font-semibold">{report.total_present} present</span>
                        <span className="text-amber-400 font-semibold">{report.total_late} late</span>
                        <span className="text-red-400 font-semibold">{report.total_absent} absent</span>
                        <span className="text-blue-400 font-semibold">{report.total_on_leave} leave</span>
                      </div>
                      {isExpanded ? <ChevronUp size={18} className="text-[var(--pz-text-muted)]" /> : <ChevronDown size={18} className="text-[var(--pz-text-muted)]" />}
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
                      className="overflow-hidden"
                    >
                      <div className="border-t border-[var(--pz-border)] p-6">
                        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
                          <KPICard icon={UserCheck} label="Present" value={lineSummary.present} color="#10B981" />
                          <KPICard icon={Clock} label="Late" value={lineSummary.late} color="#F59E0B" />
                          <KPICard icon={UserX} label="Absent" value={lineSummary.absent} color="#EF4444" />
                          <KPICard icon={FileText} label="On Leave" value={lineSummary.onLeave} color="#3B82F6" />
                          <KPICard icon={AlertTriangle} label="Overtime" value={lineSummary.overtime} color="#F97316" />
                          <KPICard icon={Sun} label="Total Scans" value={lineSummary.totalScans} color="#8B5CF6" />
                        </div>

                        {detailLoading ? (
                          <div className="py-12 text-center text-[var(--pz-text-muted)] text-sm">Loading employee details...</div>
                        ) : lines.length === 0 ? (
                          <div className="py-12 text-center text-[var(--pz-text-muted)] text-sm">No employee data</div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-[var(--pz-border)] bg-[var(--pz-surface-2)]/40">
                                  <th className="text-left py-3 px-4 pz-section-label">Employee</th>
                                  <th className="text-left py-3 px-4 pz-section-label">Code</th>
                                  <th className="text-left py-3 px-4 pz-section-label">Shift</th>
                                  <th className="text-left py-3 px-4 pz-section-label">Check In</th>
                                  <th className="text-left py-3 px-4 pz-section-label">Check Out</th>
                                  <th className="text-left py-3 px-4 pz-section-label">Duration</th>
                                  <th className="text-left py-3 px-4 pz-section-label">Late</th>
                                  <th className="text-left py-3 px-4 pz-section-label">Overtime</th>
                                  <th className="text-left py-3 px-4 pz-section-label">Status</th>
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
                                      className="border-b border-[var(--pz-border)]/20 hover:bg-[var(--pz-surface-2)]/20"
                                    >
                                      <td className="py-3 px-4">
                                        <div className="flex items-center gap-3">
                                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-900/40 to-indigo-900/40 flex items-center justify-center text-xs font-bold text-blue-400 border border-blue-500/20">
                                            {line.employee_name?.[0] || '?'}
                                          </div>
                                          <span className="font-semibold text-[var(--pz-text-secondary)]">{line.employee_name}</span>
                                        </div>
                                      </td>
                                      <td className="py-3 px-4 text-[var(--pz-text-muted)] font-mono text-xs">{line.employee_code}</td>
                                      <td className="py-3 px-4">
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[var(--pz-text-muted)]">{line.shift_name || '—'}</span>
                                          {line.shift_start && line.shift_end && line.shift_start > line.shift_end && (
                                            <Moon size={12} className="text-indigo-400" />
                                          )}
                                        </div>
                                      </td>
                                      <td className="py-3 px-4">
                                        {line.first_scan ? (
                                          <div>
                                            <span className="text-[var(--pz-text-secondary)] font-mono text-xs">
                                              {format(new Date(line.first_scan), 'hh:mm:ss a')}
                                            </span>
                                            {line.check_in_device && (
                                              <p className="text-[11px] text-[var(--pz-text-faint)]">{line.check_in_device}</p>
                                            )}
                                          </div>
                                        ) : <span className="text-[var(--pz-text-faint)]">—</span>}
                                      </td>
                                      <td className="py-3 px-4">
                                        {line.last_scan ? (
                                          <div>
                                            <span className="text-[var(--pz-text-secondary)] font-mono text-xs">
                                              {format(new Date(line.last_scan), 'hh:mm:ss a')}
                                            </span>
                                            {line.first_scan && line.last_scan && new Date(line.last_scan).toDateString() !== new Date(line.first_scan).toDateString() && (
                                              <span className="text-[11px] text-amber-400 ml-1 font-semibold">+1d</span>
                                            )}
                                            {line.check_out_device && (
                                              <p className="text-[11px] text-[var(--pz-text-faint)]">{line.check_out_device}</p>
                                            )}
                                          </div>
                                        ) : <span className="text-[var(--pz-text-faint)]">—</span>}
                                      </td>
                                      <td className="py-3 px-4 text-[var(--pz-text-muted)] font-mono text-xs">
                                        {line.duration_minutes > 0 ? (
                                          <span>{Math.floor(line.duration_minutes / 60)}h {Math.round(line.duration_minutes % 60)}m</span>
                                        ) : '—'}
                                      </td>
                                      <td className="py-3 px-4">
                                        {line.late_minutes > 0 ? (
                                          <span className="text-amber-400 font-semibold">{Math.round(line.late_minutes)}m</span>
                                        ) : <span className="text-[var(--pz-text-faint)]">—</span>}
                                      </td>
                                      <td className="py-3 px-4">
                                        {line.overtime_minutes > 0 ? (
                                          <span className="text-orange-400 font-semibold">{Math.round(line.overtime_minutes)}m</span>
                                        ) : <span className="text-[var(--pz-text-faint)]">—</span>}
                                      </td>
                                      <td className="py-3 px-4">
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold border ${cfg.bg} ${cfg.color}`}>
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

                        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-[var(--pz-border)]/50">
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
