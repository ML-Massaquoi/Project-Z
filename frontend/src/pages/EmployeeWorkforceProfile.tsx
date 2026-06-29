import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Calendar, Clock, UserCheck, AlertTriangle,
  Sun, Moon, Briefcase, TrendingUp, Award,
} from 'lucide-react'
import { format } from 'date-fns'
import { workforceAPI } from '@/api/client'
import { PageHeader } from '@/components/ui/PageHeader'
import { MonthlyRosterCalendar } from '@/components/shifts/MonthlyRosterCalendar'
import type { EmployeeProfile, EmployeeCalendar } from '@/types'

const SHIFT_COLORS: Record<string, string> = {
  D: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  N: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  OFF: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  LV: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  '—': 'bg-gray-500/10 text-gray-600 border-gray-500/20',
}

export default function EmployeeWorkforceProfile() {
  const { empId } = useParams<{ empId: string }>()
  const navigate = useNavigate()
  const [calMonth, setCalMonth] = useState(() => ({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
  }))

  const { data: profile, isLoading: profileLoading } = useQuery<EmployeeProfile>({
    queryKey: ['emp-profile', empId],
    queryFn: async () => (await workforceAPI.employeeProfile(empId!)).data,
    enabled: !!empId,
  })

  const { data: calendar, isLoading: calLoading } = useQuery<EmployeeCalendar>({
    queryKey: ['emp-calendar', empId, calMonth],
    queryFn: async () => (await workforceAPI.employeeCalendar(empId!, calMonth.year, calMonth.month)).data,
    enabled: !!empId,
  })

  const emp = profile?.employee
  const summary = profile?.attendance_summary
  const assignment = profile?.current_assignment

  return (
    <div className="space-y-5 pz-slide-up">
      <PageHeader
        title={emp?.full_name || 'Employee'}
        subtitle={`Workforce Profile · ${emp?.employee_code || ''}`}
        breadcrumbs={[
          { label: 'Workforce', href: '/departments' },
          { label: emp?.full_name || 'Employee' },
        ]}
        actions={
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--pz-surface-2)] hover:bg-[var(--pz-surface-3)] border border-[var(--pz-border)] text-xs font-semibold text-gray-300 transition-all"
          >
            <ArrowLeft size={14} />
            Back
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left Column: Info + Assignment */}
        <div className="space-y-5">
          {/* Employee Info */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="pz-card p-5"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-lg font-bold text-white">
                {emp?.full_name?.[0] || '?'}
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">{emp?.full_name}</h3>
                <p className="text-[10px] text-gray-400 font-mono">{emp?.employee_code}</p>
              </div>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Department</span>
                <span className="text-gray-200 font-medium">{emp?.department_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Designation</span>
                <span className="text-gray-200">{emp?.position || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Phone</span>
                <span className="text-gray-200">{emp?.phone || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <span className={`font-semibold ${emp?.status === 'active' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {emp?.status}
                </span>
              </div>
            </div>
          </motion.div>

          {/* Attendance Summary */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="pz-card p-5"
          >
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={15} className="text-blue-400" />
              <h3 className="pz-section-label">This Month</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                <p className="text-[10px] text-gray-500 mb-1">Present</p>
                <p className="text-lg font-bold text-emerald-400">{summary?.present_this_month ?? 0}</p>
              </div>
              <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
                <p className="text-[10px] text-gray-500 mb-1">Late</p>
                <p className="text-lg font-bold text-amber-400">{summary?.late_this_month ?? 0}</p>
              </div>
              <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/10">
                <p className="text-[10px] text-gray-500 mb-1">Absences</p>
                <p className="text-lg font-bold text-red-400">{summary?.absences_this_month ?? 0}</p>
              </div>
              <div className="p-3 rounded-lg bg-indigo-500/5 border border-indigo-500/10">
                <p className="text-[10px] text-gray-500 mb-1">OT Hours</p>
                <p className="text-lg font-bold text-indigo-400">{summary?.overtime_hours ?? 0}</p>
              </div>
            </div>
          </motion.div>

          {/* Current Assignment */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="pz-card p-5"
          >
            <div className="flex items-center gap-2 mb-4">
              <Briefcase size={15} className="text-blue-400" />
              <h3 className="pz-section-label">Current Assignment</h3>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--pz-surface-2)]/50 border border-[var(--pz-border)]">
                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  {assignment?.current_shift_label === 'N' ? (
                    <Moon size={14} className="text-indigo-400" />
                  ) : (
                    <Sun size={14} className="text-amber-400" />
                  )}
                </div>
                <div>
                  <p className="text-[10px] text-gray-500">Current Shift</p>
                  <p className="text-xs font-semibold text-gray-200">{assignment?.current_shift}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--pz-surface-2)]/50 border border-[var(--pz-border)]">
                <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <Clock size={14} className="text-blue-400" />
                </div>
                <div>
                  <p className="text-[10px] text-gray-500">Next Shift</p>
                  <p className="text-xs font-semibold text-gray-200">{assignment?.next_shift}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--pz-surface-2)]/50 border border-[var(--pz-border)]">
                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <Calendar size={14} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-[10px] text-gray-500">Next Working Day</p>
                  <p className="text-xs font-semibold text-gray-200">
                    {assignment?.next_working_day
                      ? format(new Date(assignment.next_working_day), 'EEE, MMM d')
                      : '—'}
                  </p>
                </div>
              </div>

              <div className="mt-2 p-2 rounded bg-[var(--pz-surface-2)]/30 text-center">
                <span className="text-[10px] text-gray-500">Roster Type: </span>
                <span className="text-[10px] font-semibold text-blue-400 capitalize">{assignment?.roster_type}</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Right Column: Calendar */}
        <div className="lg:col-span-2">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="pz-card p-5"
          >
            <MonthlyRosterCalendar
              calendar={calendar}
              year={calMonth.year}
              month={calMonth.month}
              loading={calLoading}
              onMonthChange={(y, m) => setCalMonth({ year: y, month: m })}
            />
          </motion.div>
        </div>
      </div>
    </div>
  )
}
