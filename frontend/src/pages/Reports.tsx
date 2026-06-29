import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  FileBarChart, Calendar, Clock, UserX, TrendingUp,
  Download, Fingerprint, ArrowRight, Users, Search, BarChart3,
} from 'lucide-react'
import { reportsAPI } from '@/api/client'
import { format } from 'date-fns'
import { PageHeader } from '@/components/ui/PageHeader'
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
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        subtitle="Generate and export workforce reports"
        breadcrumbs={[{ label: 'Intelligence' }, { label: 'Reports' }]}
      />

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
            <label className="pz-label text-[10px]">From</label>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              className="px-2.5 py-1.5 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm text-[var(--pz-text)] focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="pz-label text-[10px]">To</label>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              className="px-2.5 py-1.5 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-sm text-[var(--pz-text)] focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="pz-label text-[10px]">Format</label>
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
            className="pz-card pz-card--interactive p-6 group cursor-pointer"
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
                <h3 className="pz-card-title">{report.title}</h3>
              </div>
              <ArrowRight size={14} className="text-[var(--pz-text-faint)] group-hover:text-[var(--pz-text-tertiary)] transition-colors mt-1" />
            </div>
            <p className="text-sm text-[var(--pz-text-tertiary)] leading-relaxed">{report.description}</p>
            <div className="mt-4 pt-4 border-t border-[var(--pz-border)] flex items-center justify-between">
              {report.needsRange ? (
                <span className="text-xs text-[var(--pz-text-muted)] font-mono">
                  {dateRange.start} \u2192 {dateRange.end}
                </span>
              ) : (
                <span className="text-xs text-[var(--pz-text-muted)] font-mono">{dateRange.start}</span>
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
