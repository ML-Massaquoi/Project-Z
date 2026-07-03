import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  FileBarChart, Calendar, Clock, UserX, TrendingUp,
  Download, Fingerprint, ArrowRight, Users, Search, BarChart3,
} from 'lucide-react'
import { reportsAPI } from '@/api/client'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface ReportType {
  id: string
  title: string
  description: string
  icon: React.ElementType
  color: string
  needsRange: boolean
}

const reportTypes: ReportType[] = [
  { id: 'daily', title: 'Daily Attendance', description: 'Full attendance snapshot for a specific date including check-in/out times, duration, and status.', icon: Calendar, color: '#3B82F6', needsRange: false },
  { id: 'lateness', title: 'Lateness Report', description: 'All late arrivals with grace period analysis and lateness duration breakdown.', icon: Clock, color: '#F59E0B', needsRange: true },
  { id: 'absences', title: 'Absence Report', description: 'Employees who were absent for a given date range with pattern analysis.', icon: UserX, color: '#EF4444', needsRange: true },
  { id: 'overtime', title: 'Overtime Report', description: 'Overtime hours beyond shift schedule with department breakdown.', icon: TrendingUp, color: '#6366F1', needsRange: true },
  { id: 'movement', title: 'Movement Log', description: 'Raw biometric scan log with device, direction, and verification details.', icon: Fingerprint, color: '#06B6D4', needsRange: true },
  { id: 'shiftCompliance', title: 'Shift Compliance', description: 'How closely employees adhere to their assigned shift schedules over time.', icon: BarChart3, color: '#EC4899', needsRange: true },
  { id: 'unknownScans', title: 'Unknown Scans', description: 'Scan events from unrecognized users needing resolution.', icon: Search, color: '#F97316', needsRange: true },
]

const s = {
  page: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '28px',
    padding: '32px',
    flex: 1,
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerLeft: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  headerTitle: {
    fontSize: '22px',
    fontWeight: 700,
    color: 'var(--pz-text)',
    margin: 0,
    letterSpacing: '-0.02em',
  },
  headerSubtitle: {
    fontSize: '13px',
    color: 'var(--pz-text-muted)',
    margin: 0,
  },
  reportCard: {
    background: 'var(--pz-surface-1)',
    border: '1px solid var(--pz-border)',
    borderRadius: '10px',
    padding: '24px',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  reportCardTitle: {
    fontSize: '15px',
    fontWeight: 700,
    color: 'var(--pz-text)',
    margin: 0,
    letterSpacing: '-0.01em',
  },
}

export default function Reports() {
  const [searchValue, setSearchValue] = useState('')
  const [selectedReport, setSelectedReport] = useState<ReportType | null>(null)
  const [dateRange, setDateRange] = useState({
    start: format(new Date(), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd'),
  })
  const [exportFormat, setExportFormat] = useState('csv')
  const [generating, setGenerating] = useState(false)

  const filtered = reportTypes.filter(r => {
    if (!searchValue.trim()) return true
    const q = searchValue.toLowerCase()
    return r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)
  })

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleGenerate = async (report: ReportType) => {
    setGenerating(true)
    try {
      const ext = exportFormat === 'excel' ? 'xlsx' : exportFormat
      const filename = `report_${report.id}_${dateRange.start}.${ext}`

      let blob: Blob | undefined

      switch (report.id) {
        case 'daily':
          blob = (await reportsAPI.daily({ date: dateRange.start, format: exportFormat })).data
          break
        case 'lateness':
          blob = (await reportsAPI.lateness({ start: dateRange.start, end: dateRange.end, format: exportFormat })).data
          break
        case 'absences':
          blob = (await reportsAPI.absences({ start: dateRange.start, end: dateRange.end, format: exportFormat })).data
          break
        case 'overtime':
          blob = (await reportsAPI.overtime({ start: dateRange.start, end: dateRange.end, format: exportFormat })).data
          break
        case 'movement':
          blob = (await reportsAPI.movement({ start: dateRange.start, end: dateRange.end, format: exportFormat })).data
          break
        case 'shiftCompliance':
          blob = (await reportsAPI.shiftCompliance({ start: dateRange.start, end: dateRange.end, format: exportFormat })).data
          break
        case 'unknownScans':
          blob = (await reportsAPI.unknownScans({ start: dateRange.start, end: dateRange.end, format: exportFormat })).data
          break
      }

      if (blob) {
        downloadBlob(blob, filename)
        toast.success(`${report.title} downloaded`)
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to generate report')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h1 style={s.headerTitle}>Reports</h1>
          <p style={s.headerSubtitle}>Generate and export workforce reports</p>
        </div>
      </div>

      {/* Search & Controls */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--pz-text-muted)]" />
          <input
            type="text"
            placeholder="Search reports..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm text-[var(--pz-text)] placeholder:text-[var(--pz-text-muted)] focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--pz-surface-2)]/50 border border-[var(--pz-border)]">
          <div className="flex items-center gap-2">
            <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--pz-text-muted)' }}>From</label>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              className="px-2.5 py-1.5 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm text-[var(--pz-text)] focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--pz-text-muted)' }}>To</label>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              className="px-2.5 py-1.5 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm text-[var(--pz-text)] focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--pz-text-muted)' }}>Format</label>
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm text-[var(--pz-text)] focus:outline-none focus:border-blue-500"
            >
              <option value="csv">CSV</option>
              <option value="excel">Excel</option>
            </select>
          </div>
        </div>
      </div>

      {/* Report Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((report, i) => (
          <motion.div
            key={report.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => setSelectedReport(report)}
            className="group"
            style={{
              ...s.reportCard,
            }}
          >
            <div className="flex items-start gap-3 mb-3">
              <div
                className="p-2.5 rounded-xl flex-shrink-0 border"
                style={{
                  backgroundColor: `${report.color}12`,
                  borderColor: `${report.color}25`,
                }}
              >
                <report.icon size={20} style={{ color: report.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 style={s.reportCardTitle}>{report.title}</h3>
              </div>
              <ArrowRight size={14} style={{ color: 'var(--pz-text-faint)', marginTop: '4px', flexShrink: 0 }} />
            </div>
            <p className="text-sm" style={{ color: 'var(--pz-text-tertiary)', lineHeight: '1.625', margin: 0 }}>{report.description}</p>
            <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--pz-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {report.needsRange ? (
                <span className="text-xs font-mono" style={{ color: 'var(--pz-text-muted)' }}>
                  {dateRange.start} → {dateRange.end}
                </span>
              ) : (
                <span className="text-xs font-mono" style={{ color: 'var(--pz-text-muted)' }}>{dateRange.start}</span>
              )}
              <Button
                variant="default"
                size="sm"
                onClick={(e) => { e.stopPropagation(); handleGenerate(report) }}
                disabled={generating}
                loading={generating}
              >
                <Download size={12} />
                {generating ? 'Generating...' : 'Export'}
              </Button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
