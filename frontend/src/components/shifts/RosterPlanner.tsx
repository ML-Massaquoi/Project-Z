import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, Download, Sun, Moon, Home, Plane } from 'lucide-react'
import type { DepartmentRoster } from '@/types'

const LABEL_CONFIG: Record<string, { bg: string; text: string; border: string; icon?: React.ReactNode }> = {
  D: { bg: 'bg-amber-500/10', text: 'text-[var(--pz-warning-500)]', border: 'border-amber-500/20', icon: <Sun size={12} /> },
  N: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20', icon: <Moon size={12} /> },
  OFF: { bg: 'bg-gray-500/5', text: 'text-[var(--pz-text-muted)]', border: 'border-gray-500/10', icon: <Home size={12} /> },
  LV: { bg: 'bg-blue-500/10', text: 'text-[var(--pz-accent)]', border: 'border-blue-500/20', icon: <Plane size={12} /> },
  '—': { bg: 'bg-gray-500/5', text: 'text-[var(--pz-text-muted)]', border: 'border-gray-500/10' },
}

interface Props {
  roster?: DepartmentRoster
  year: number
  month: number
  onMonthChange: (year: number, month: number) => void
  onExport?: () => void
  onDayClick?: (employeeId: string, employeeName: string, date: string, currentLabel: string) => void
}

export function RosterPlanner({ roster, year, month, onMonthChange, onExport, onDayClick }: Props) {
  const employees = roster?.employees ?? []
  const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' })

  const prevMonth = () => {
    if (month === 1) onMonthChange(year - 1, 12)
    else onMonthChange(year, month - 1)
  }
  const nextMonth = () => {
    if (month === 12) onMonthChange(year + 1, 1)
    else onMonthChange(year, month + 1)
  }

  const daysInMonth = new Date(year, month, 0).getDate()
  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="pz-card overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-[var(--pz-border)]">
        <div className="flex items-center gap-4">
          <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-[var(--pz-surface-2)] text-[var(--pz-text-muted)] hover:text-[var(--pz-text)] transition-colors">
            <ChevronLeft size={18} />
          </button>
          <span className="text-base font-bold text-[var(--pz-text)]">
            {monthName} {year}
          </span>
          <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-[var(--pz-surface-2)] text-[var(--pz-text-muted)] hover:text-[var(--pz-text)] transition-colors">
            <ChevronRight size={18} />
          </button>
        </div>
        {onExport && (
          <button
            onClick={onExport}
            className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-[var(--pz-surface-2)] hover:bg-[var(--pz-surface-3)] border border-[var(--pz-border)] text-xs font-semibold text-gray-300 transition-all"
          >
            <Download size={14} />
            Export Excel
          </button>
        )}
      </div>

      {/* Roster Grid */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--pz-border)] bg-[var(--pz-surface-2)]/50">
              <th className="text-left py-3 px-4 text-[var(--pz-text-muted)] font-semibold sticky left-0 bg-[var(--pz-surface-2)]/50 min-w-[200px] z-10">
                Employee
              </th>
              {dayNumbers.map(d => {
                const date = new Date(year, month - 1, d)
                const isWeekend = date.getDay() === 0 || date.getDay() === 6
                return (
                  <th
                    key={d}
                    className={`text-center py-3 px-1.5 min-w-[40px] font-semibold ${
                      isWeekend ? 'text-amber-500/60' : 'text-[var(--pz-text-muted)]'
                    }`}
                  >
                    <div className="text-sm">{d}</div>
                    <div className="text-[9px] font-normal text-[var(--pz-text-muted)]">
                      {date.toLocaleDateString('en', { weekday: 'short' }).slice(0, 2)}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {employees.map((emp, i) => (
              <motion.tr
                key={emp.employee_id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.01 }}
                className="border-b border-[var(--pz-border)]/20 hover:bg-[var(--pz-surface-2)]/20 transition-colors"
              >
                <td className="py-3 px-4 sticky left-0 bg-[var(--pz-surface)]">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center text-[10px] font-bold text-[var(--pz-accent)] border border-blue-200">
                      {emp.full_name?.[0] || '?'}
                    </div>
                    <div>
                      <span className="font-semibold text-sm text-[var(--pz-text)]">{emp.full_name}</span>
                      <p className="text-[10px] text-[var(--pz-text-muted)]">{emp.employee_code}</p>
                    </div>
                  </div>
                </td>
                {emp.daily.map((day, j) => {
                  const config = LABEL_CONFIG[day.label] || LABEL_CONFIG['—']
                  return (
                    <td key={j} className="text-center py-2 px-1">
                      <button
                        type="button"
                        onClick={() => onDayClick?.(emp.employee_id, emp.full_name, day.date, day.label)}
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border text-[10px] font-bold ${config.bg} ${config.text} ${config.border} ${onDayClick ? 'cursor-pointer hover:ring-2 hover:ring-blue-500/50 hover:brightness-125 active:scale-95 transition-all' : ''}`}
                        title={onDayClick ? `Click to change ${day.label} for ${emp.full_name} on ${day.date}` : `${day.label}`}
                      >
                        {config.icon ? <span className="scale-90">{config.icon}</span> : day.label}
                      </button>
                    </td>
                  )
                })}
              </motion.tr>
            ))}
            {!employees.length && (
              <tr>
                <td colSpan={daysInMonth + 1} className="py-16 text-center text-[var(--pz-text-muted)]">
                  <p className="text-xs">No roster data available</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </motion.div>
  )
}
