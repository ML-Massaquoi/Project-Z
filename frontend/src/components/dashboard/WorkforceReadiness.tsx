import { useEffect } from 'react'
import { AlertCircle, Clock, ShieldAlert, UserX, Users, Activity } from 'lucide-react'
import { useWorkforceStore } from '@/stores/workforceStore'

export function WorkforceReadiness() {
  const { metrics, initializeBusSubscription } = useWorkforceStore()

  // Initialize Event Bus subscriptions
  useEffect(() => {
    const unsubscribe = initializeBusSubscription()
    return () => unsubscribe()
  }, [initializeBusSubscription])

  // Calculate understaffed state warnings
  const understaffedCount = metrics.understaffed_departments.length
  const criticalCount = metrics.missing_critical_staff.length

  return (
    <div className="space-y-4">
      {/* Expected Workforce Header */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[#1F2937]/30 border border-slate-800 p-3 rounded-lg flex items-center gap-3">
          <div className="p-2 rounded bg-blue-950/30 text-blue-400">
            <Users size={16} />
          </div>
          <div>
            <p className="text-[10px] uppercase text-gray-400 font-semibold tracking-wider">Scheduled Today</p>
            <p className="text-lg font-bold text-gray-100 font-mono tracking-tight">{metrics.expected_count || 120}</p>
          </div>
        </div>

        <div className="bg-[#1F2937]/30 border border-slate-800 p-3 rounded-lg flex items-center gap-3">
          <div className="p-2 rounded bg-emerald-950/30 text-emerald-400">
            <Activity size={16} />
          </div>
          <div>
            <p className="text-[10px] uppercase text-gray-400 font-semibold tracking-wider">Active Staff</p>
            <p className="text-lg font-bold text-gray-100 font-mono tracking-tight">{metrics.present_count || 94}</p>
          </div>
        </div>

        <div className="bg-[#1F2937]/30 border border-slate-800 p-3 rounded-lg flex items-center gap-3">
          <div className="p-2 rounded bg-amber-950/30 text-amber-400">
            <AlertCircle size={16} />
          </div>
          <div>
            <p className="text-[10px] uppercase text-gray-400 font-semibold tracking-wider">Understaffed Depts</p>
            <p className="text-lg font-bold text-amber-400 font-mono tracking-tight">{understaffedCount}</p>
          </div>
        </div>

        <div className="bg-[#1F2937]/30 border border-slate-800 p-3 rounded-lg flex items-center gap-3">
          <div className="p-2 rounded bg-red-950/30 text-red-400">
            <ShieldAlert size={16} />
          </div>
          <div>
            <p className="text-[10px] uppercase text-gray-400 font-semibold tracking-wider">Critical Absences</p>
            <p className="text-lg font-bold text-red-400 font-mono tracking-tight">{criticalCount}</p>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Col: Understaffed & Shift Transitions */}
        <div className="space-y-4 lg:col-span-2">
          {/* Understaffed Warning Panel */}
          <div className="bg-[#1F2937]/20 border border-slate-800 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <ShieldAlert size={16} className="text-amber-500" />
              <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Department Readiness Check</h3>
            </div>

            {understaffedCount === 0 ? (
              <p className="text-xs text-emerald-400 font-semibold bg-emerald-950/20 px-3 py-2 rounded border border-emerald-500/20">
                ✓ All departments staffing meets nominal levels (&gt;85% readiness).
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {metrics.understaffed_departments.map((dept) => (
                  <div key={dept.department_id} className="p-2.5 rounded bg-amber-950/10 border border-amber-500/25 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-200">{dept.name}</span>
                    <span className="text-xs font-mono font-bold text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded">
                      {Math.round(dept.percent)}% Staffed
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Missing Critical Staff List */}
          <div className="bg-[#1F2937]/20 border border-slate-800 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <UserX size={16} className="text-red-500" />
              <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Missing Critical Personnel</h3>
            </div>

            {criticalCount === 0 ? (
              <p className="text-xs text-gray-500 font-medium">No critical staffing alerts reported.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] text-gray-400 uppercase tracking-wider">
                      <th className="py-2">Staff Code</th>
                      <th className="py-2">Name</th>
                      <th className="py-2">Position</th>
                      <th className="py-2">Department</th>
                      <th className="py-2 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.missing_critical_staff.map((staff) => (
                      <tr key={staff.id} className="border-b border-slate-800/30">
                        <td className="py-2 font-mono text-gray-300 font-semibold">{staff.employee_code}</td>
                        <td className="py-2 text-gray-200 font-semibold">{staff.full_name}</td>
                        <td className="py-2 text-gray-400">{staff.position}</td>
                        <td className="py-2 text-gray-400">{staff.department_name}</td>
                        <td className="py-2 text-right">
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase ${
                            staff.status === 'absent'
                              ? 'bg-red-950/20 text-red-400 border-red-500/20'
                              : 'bg-amber-950/20 text-amber-400 border-amber-500/20'
                          }`}>
                            {staff.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Overtime & Shift Transitions */}
        <div className="space-y-4">
          {/* Overtime Escalations */}
          <div className="bg-[#1F2937]/20 border border-slate-800 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock size={16} className="text-blue-400" />
              <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Overtime Warnings</h3>
            </div>

            {metrics.overtime_escalations.length === 0 ? (
              <p className="text-xs text-gray-500">No shift overrides or overtime violations detected.</p>
            ) : (
              <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                {metrics.overtime_escalations.map((item, idx) => (
                  <div key={idx} className="p-2 rounded bg-slate-800/30 border border-slate-800 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-gray-200">{item.employee_name}</p>
                      <p className="text-[9px] text-gray-500">{item.shift_name}</p>
                    </div>
                    <span className="text-[10px] font-bold font-mono text-red-400 bg-red-950/30 border border-red-500/20 px-2 py-0.5 rounded">
                      +{item.overtime_minutes}m OT
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Shift Transitions */}
          <div className="bg-[#1F2937]/20 border border-slate-800 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Users size={16} className="text-indigo-400" />
              <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Roster Transitions</h3>
            </div>

            {metrics.shift_transitions.length === 0 ? (
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center text-gray-400 border-b border-slate-800/30 py-1.5">
                  <span>Morning Ramp Duty (06:00)</span>
                  <span className="text-emerald-400 font-mono">14 Active</span>
                </div>
                <div className="flex justify-between items-center text-gray-400 border-b border-slate-800/30 py-1.5">
                  <span>Cargo Shift A (08:00)</span>
                  <span className="text-emerald-400 font-mono">22 Active</span>
                </div>
                <div className="flex justify-between items-center text-gray-400 py-1.5">
                  <span>Aviation Security B (14:00)</span>
                  <span className="text-gray-500 font-mono">Scheduled</span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {metrics.shift_transitions.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs text-gray-300 py-1.5 border-b border-slate-800/30">
                    <span>{item.shift_name} ({item.time})</span>
                    <span className={item.status === 'starting' ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
                      {item.count} {item.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
