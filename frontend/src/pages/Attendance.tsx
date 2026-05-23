import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Fingerprint, Calendar } from 'lucide-react'
import { attendanceAPI } from '@/api/client'
import { format } from 'date-fns'
import type { AttendanceLog, AttendanceSession } from '@/types'

export default function Attendance() {
  const [tab, setTab] = useState<'live' | 'history'>('live')
  const [historyDate, setHistoryDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [historyPage, setHistoryPage] = useState(1)

  const { data: liveData, isLoading: liveLoading } = useQuery({
    queryKey: ['attendance-live'],
    queryFn: async () => (await attendanceAPI.live({ limit: 50 })).data,
    refetchInterval: 10000,
    enabled: tab === 'live',
  })

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['attendance-history', historyDate, historyPage],
    queryFn: async () => (await attendanceAPI.history({ target_date: historyDate, page: historyPage, per_page: 20 })).data,
    enabled: tab === 'history',
  })

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      on_time: 'bg-emerald-50 text-emerald-700', late: 'bg-amber-50 text-amber-700',
      early_departure: 'bg-orange-50 text-orange-600', absent: 'bg-red-50 text-red-600',
    }
    return map[status] || 'bg-slate-100 text-slate-500'
  }

  return (
    <div className="animate-fade-in">
      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-[var(--color-slate-100)] rounded-xl w-fit mb-6">
        {(['live', 'history'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === t ? 'bg-white text-[var(--color-slate-800)] shadow-sm' : 'text-[var(--color-slate-500)] hover:text-[var(--color-slate-700)]'}`}>
            {t === 'live' ? '🔴 Live Feed' : '📋 History'}
          </button>
        ))}
      </div>

      {tab === 'live' ? (
        /* ── Live Feed ───────────────────────────────────── */
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
            <h3 className="font-semibold text-[var(--color-slate-700)]">Live Attendance Feed</h3>
            <div className="flex items-center gap-2 text-xs text-emerald-600">
              <span className="w-2 h-2 rounded-full bg-emerald-500 pulse-dot" /> Real-time
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--color-slate-50)]">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-[var(--color-slate-400)] uppercase">Employee</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-[var(--color-slate-400)] uppercase">Department</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-[var(--color-slate-400)] uppercase">Direction</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-[var(--color-slate-400)] uppercase">Time</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-[var(--color-slate-400)] uppercase">Device</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-[var(--color-slate-400)] uppercase">Verify</th>
                </tr>
              </thead>
              <tbody>
                {liveLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-[var(--color-slate-50)]">
                      {Array.from({ length: 6 }).map((_, j) => <td key={j} className="py-3 px-4"><div className="skeleton h-4 w-20" /></td>)}
                    </tr>
                  ))
                ) : liveData?.items?.length ? (
                  liveData.items.map((log: AttendanceLog, i: number) => (
                    <motion.tr key={log.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }} className="border-b border-[var(--color-slate-50)] hover:bg-[var(--color-slate-50)] transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center">
                            <span className="text-xs font-semibold text-[var(--color-primary)]">{log.employee_name?.[0]}</span>
                          </div>
                          <div>
                            <p className="font-medium text-[var(--color-slate-700)] text-sm">{log.employee_name}</p>
                            <p className="text-[10px] text-[var(--color-slate-400)]">{log.employee_code}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-[var(--color-slate-500)]">{log.department_name || '—'}</td>
                      <td className="py-3 px-4"><span className={log.punch_direction === 'in' ? 'badge-in' : 'badge-out'}>{log.punch_direction?.toUpperCase()}</span></td>
                      <td className="py-3 px-4 text-[var(--color-slate-500)]">{format(new Date(log.timestamp), 'hh:mm:ss a')}</td>
                      <td className="py-3 px-4 text-[var(--color-slate-400)] text-xs font-mono">{log.device_ip || log.device_name}</td>
                      <td className="py-3 px-4 text-[var(--color-slate-400)] text-xs capitalize">{log.verify_type}</td>
                    </motion.tr>
                  ))
                ) : (
                  <tr><td colSpan={6} className="py-16 text-center text-[var(--color-slate-400)]">
                    <Fingerprint size={40} className="mx-auto mb-3 opacity-20" />
                    <p className="font-medium">No live attendance data</p>
                    <p className="text-xs mt-1">Records appear in real-time as employees scan</p>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── History ─────────────────────────────────────── */
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
            <h3 className="font-semibold text-[var(--color-slate-700)]">Attendance Sessions</h3>
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-[var(--color-slate-400)]" />
              <input type="date" value={historyDate} onChange={(e) => { setHistoryDate(e.target.value); setHistoryPage(1) }} className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-sm bg-white" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--color-slate-50)]">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-[var(--color-slate-400)] uppercase">Employee</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-[var(--color-slate-400)] uppercase">Department</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-[var(--color-slate-400)] uppercase">Check In</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-[var(--color-slate-400)] uppercase">Check Out</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-[var(--color-slate-400)] uppercase">Duration</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-[var(--color-slate-400)] uppercase">Status</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-[var(--color-slate-400)] uppercase">Late</th>
                </tr>
              </thead>
              <tbody>
                {historyLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-[var(--color-slate-50)]">{Array.from({ length: 7 }).map((_, j) => <td key={j} className="py-3 px-4"><div className="skeleton h-4 w-16" /></td>)}</tr>
                  ))
                ) : historyData?.items?.length ? (
                  historyData.items.map((s: AttendanceSession) => (
                    <tr key={s.id} className="border-b border-[var(--color-slate-50)] hover:bg-[var(--color-slate-50)] transition-colors">
                      <td className="py-3 px-4 font-medium text-[var(--color-slate-700)]">{s.employee_name}</td>
                      <td className="py-3 px-4 text-[var(--color-slate-500)]">{s.department_name || '—'}</td>
                      <td className="py-3 px-4 text-[var(--color-slate-500)]">{s.check_in ? format(new Date(s.check_in), 'hh:mm a') : '—'}</td>
                      <td className="py-3 px-4 text-[var(--color-slate-500)]">{s.check_out ? format(new Date(s.check_out), 'hh:mm a') : '—'}</td>
                      <td className="py-3 px-4 text-[var(--color-slate-500)]">{s.duration_minutes ? `${Math.round(s.duration_minutes)} min` : '—'}</td>
                      <td className="py-3 px-4"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(s.status)}`}>{s.status.replace('_', ' ')}</span></td>
                      <td className="py-3 px-4 text-[var(--color-slate-400)]">{s.late_minutes ? `${s.late_minutes} min` : '—'}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={7} className="py-16 text-center text-[var(--color-slate-400)]">No attendance sessions for this date</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {historyData && historyData.pages > 1 && (
            <div className="flex items-center justify-center gap-1 py-3 border-t border-[var(--color-border)]">
              {Array.from({ length: Math.min(historyData.pages, 5) }, (_, i) => i + 1).map((p) => (
                <button key={p} onClick={() => setHistoryPage(p)} className={`w-8 h-8 rounded-lg text-sm font-medium ${p === historyPage ? 'bg-[var(--color-primary)] text-white' : 'hover:bg-[var(--color-slate-50)] text-[var(--color-slate-500)]'}`}>{p}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
