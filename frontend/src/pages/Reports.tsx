import { useState } from 'react'
import { motion } from 'framer-motion'
import { FileBarChart, Download, Calendar, Loader2 } from 'lucide-react'
import { reportsAPI, departmentsAPI } from '@/api/client'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { format, subDays } from 'date-fns'
import type { Department } from '@/types'

export default function Reports() {
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [deptFilter, setDeptFilter] = useState('')
  const [exportFormat, setExportFormat] = useState('excel')
  const [generating, setGenerating] = useState(false)

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => (await departmentsAPI.list()).data,
  })

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const params: Record<string, unknown> = { start_date: startDate, end_date: endDate, format: exportFormat }
      if (deptFilter) params.department_id = deptFilter

      const response = await reportsAPI.attendance(params)
      const blob = new Blob([response.data])
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url

      const ext = exportFormat === 'excel' ? 'xlsx' : exportFormat
      a.download = `attendance_report_${startDate}_${endDate}.${ext}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success('Report downloaded successfully')
    } catch (err) {
      toast.error('Failed to generate report')
    } finally {
      setGenerating(false)
    }
  }

  const presets = [
    { label: 'Today', fn: () => { const d = format(new Date(), 'yyyy-MM-dd'); setStartDate(d); setEndDate(d) } },
    { label: 'This Week', fn: () => { setStartDate(format(subDays(new Date(), 6), 'yyyy-MM-dd')); setEndDate(format(new Date(), 'yyyy-MM-dd')) } },
    { label: 'This Month', fn: () => { const now = new Date(); setStartDate(format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd')); setEndDate(format(now, 'yyyy-MM-dd')) } },
    { label: 'Last 30 Days', fn: () => { setStartDate(format(subDays(new Date(), 29), 'yyyy-MM-dd')); setEndDate(format(new Date(), 'yyyy-MM-dd')) } },
  ]

  return (
    <div className="animate-fade-in max-w-3xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-900/50 text-blue-400"><FileBarChart size={24} /></div>
          <div>
            <h2 className="text-xl font-bold text-slate-100">Attendance Report</h2>
            <p className="text-sm text-slate-400">Generate and export attendance data</p>
          </div>
        </div>

        {/* Date Presets */}
        <div className="flex flex-wrap gap-2 mb-6">
          {presets.map((p) => (
            <button key={p.label} onClick={p.fn} className="px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800 text-sm text-slate-300 hover:bg-blue-950/40 hover:text-blue-400 hover:border-blue-900/50 transition-all font-medium">
              {p.label}
            </button>
          ))}
        </div>

        <div className="space-y-5">
          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1.5">
                <Calendar size={14} className="inline mr-1" />Start Date
              </label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-800 text-sm bg-slate-950 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1.5">
                <Calendar size={14} className="inline mr-1" />End Date
              </label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-800 text-sm bg-slate-950 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
            </div>
          </div>

          {/* Department */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1.5">Department (Optional)</label>
            <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-800 text-sm bg-slate-950 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
              <option value="">All Departments</option>
              {(departments as Department[] || []).map((d: Department) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          {/* Format */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Export Format</label>
            <div className="flex gap-3">
              {[
                { value: 'excel', label: 'Excel (.xlsx)', icon: '📊' },
                { value: 'csv', label: 'CSV (.csv)', icon: '📄' },
                { value: 'pdf', label: 'PDF (.pdf)', icon: '📕' },
              ].map((f) => (
                <button key={f.value} type="button" onClick={() => setExportFormat(f.value)} className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-2 text-sm font-medium transition-all ${exportFormat === f.value ? 'border-blue-500 bg-blue-950/40 text-blue-400' : 'border-slate-800 bg-slate-900/20 text-slate-400 hover:border-slate-700 hover:text-slate-200'}`}>
                  <span>{f.icon}</span>{f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Generate */}
          <button
            id="generate-report-btn"
            onClick={handleGenerate}
            disabled={generating}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-secondary)] text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-blue-950/20 mt-4"
          >
            {generating ? (
              <><Loader2 size={18} className="animate-spin" /> Generating Report...</>
            ) : (
              <><Download size={18} /> Generate & Download</>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
