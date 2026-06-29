import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Sun, Moon, Home, Plane, Calendar } from 'lucide-react'
import type { EmployeeCalendar, EmployeeCalendarDay } from '@/types'

const LABEL_CONFIG: Record<string, { bg: string; text: string; border: string; icon?: React.ReactNode }> = {
  D: { bg: 'bg-amber-500/10', text: 'text-[var(--pz-warning-500)]', border: 'border-amber-500/20', icon: <Sun size={12} /> },
  N: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20', icon: <Moon size={12} /> },
  OFF: { bg: 'bg-gray-500/5', text: 'text-[var(--pz-text-muted)]', border: 'border-gray-500/10', icon: <Home size={12} /> },
  LV: { bg: 'bg-blue-500/10', text: 'text-[var(--pz-accent)]', border: 'border-blue-200', icon: <Plane size={12} /> },
  '—': { bg: 'bg-gray-500/5', text: 'text-[var(--pz-text-muted)]', border: 'border-gray-500/10' },
}

const STATUS_DOT: Record<string, string> = {
  present: 'bg-emerald-400',
  late: 'bg-amber-400',
  absent: 'bg-red-400',
  on_time: 'bg-emerald-400',
  early_arrival: 'bg-emerald-400',
}

interface Props {
  calendar?: EmployeeCalendar
  year: number
  month: number
  loading?: boolean
  onMonthChange: (year: number, month: number) => void
}

export function MonthlyRosterCalendar({ calendar, year, month, loading, onMonthChange }: Props) {
  const days = calendar?.calendar ?? []
  const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' })

  const prevMonth = () => {
    if (month === 1) onMonthChange(year - 1, 12)
    else onMonthChange(year, month - 1)
  }
  const nextMonth = () => {
    if (month === 12) onMonthChange(year + 1, 1)
    else onMonthChange(year, month + 1)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Calendar size={15} className="text-[var(--pz-accent)]" />
          <h3 className="pz-section-label">
            {calendar?.employee?.full_name ? `${calendar.employee.full_name}'s Schedule` : 'Shift Calendar'}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-1.5 rounded-md hover:bg-[var(--pz-surface-2)] text-[var(--pz-text-muted)] hover:text-[var(--pz-text)] transition-colors">
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs font-semibold text-[var(--pz-text)] min-w-[120px] text-center">
            {monthName} {year}
          </span>
          <button onClick={nextMonth} className="p-1.5 rounded-md hover:bg-[var(--pz-surface-2)] text-[var(--pz-text-muted)] hover:text-[var(--pz-text)] transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-4">
        {[
          { label: 'Day', config: LABEL_CONFIG.D },
          { label: 'Night', config: LABEL_CONFIG.N },
          { label: 'Off', config: LABEL_CONFIG.OFF },
          { label: 'Leave', config: LABEL_CONFIG.LV },
        ].map(({ label, config }) => (
          <div key={label} className="flex items-center gap-1.5 text-[10px] text-[var(--pz-text-muted)]">
            <span className={`w-5 h-5 rounded flex items-center justify-center border ${config.bg} ${config.text} ${config.border}`}>
              {config.icon}
            </span>
            {label}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      {loading ? (
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="pz-skeleton h-16 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-1.5">
          {/* Day headers */}
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
            <div key={d} className="text-center text-[10px] font-semibold text-[var(--pz-text-muted)] py-1">
              {d}
            </div>
          ))}

          {/* Empty cells for offset */}
          {days.length > 0 && Array.from({ length: (new Date(year, month - 1, 1).getDay() + 6) % 7 }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}

          {/* Day cells */}
          {days.map((day, i) => {
            const config = LABEL_CONFIG[day.label] || LABEL_CONFIG['—']
            return (
              <motion.div
                key={day.date}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.01 }}
                className={`relative p-2 rounded-lg border transition-all ${
                  day.is_today
                    ? 'border-blue-500/50 bg-blue-500/5 ring-1 ring-blue-500/20'
                    : `${config.border} ${config.bg}`
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[10px] font-semibold ${day.is_today ? 'text-[var(--pz-accent)]' : 'text-[var(--pz-text-muted)]'}`}>
                    {new Date(day.date).getDate()}
                  </span>
                  {day.attendance_status && STATUS_DOT[day.attendance_status] && (
                    <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[day.attendance_status]}`} />
                  )}
                </div>
                <div className={`flex items-center gap-1 text-[11px] font-bold ${config.text}`}>
                  {config.icon}
                  {day.label}
                </div>
                {day.leave_type && (
                  <p className="text-[8px] text-[var(--pz-accent)] mt-0.5 capitalize">{day.leave_type}</p>
                )}
                {day.check_in && (
                  <p className="text-[8px] text-[var(--pz-text-muted)] mt-0.5 font-mono">
                    {new Date(day.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
