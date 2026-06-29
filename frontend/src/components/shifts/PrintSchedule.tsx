import { useMemo, useRef } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns'
import type { Department, ShiftProtocol, Employee } from '@/types'
import { cn } from '@/lib/utils'

// ── Helpers ────────────────────────────────────────────────

function getShiftForDay(protocol: ShiftProtocol | null, date: Date): string {
  if (!protocol) return 'off'
  
  if (protocol.protocol_type === 'fixed') {
    const dayNum = date.getDay() === 0 ? 7 : date.getDay()
    return protocol.working_days?.includes(dayNum) ? 'morning' : 'off'
  }
  
  if (protocol.protocol_type === 'rotating' && protocol.rotation_shifts?.length) {
    const refDate = new Date('2024-01-01')
    const daysSinceRef = Math.floor((date.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24))
    const idx = daysSinceRef % protocol.rotation_shifts.length
    return protocol.rotation_shifts[idx]
  }
  
  return 'off'
}

function getShiftLabel(shift: string): string {
  switch (shift) {
    case 'morning':
    case 'day':
      return 'M'
    case 'night':
      return 'N'
    default:
      return '—'
  }
}

function getShiftColor(shift: string): string {
  switch (shift) {
    case 'morning':
    case 'day':
      return 'bg-blue-100 text-blue-700'
    case 'night':
      return 'bg-indigo-100 text-indigo-700'
    default:
      return 'bg-gray-100 text-gray-400'
  }
}

// ── Print Schedule Component ───────────────────────────────

interface PrintScheduleProps {
  department: Department
  employees: Employee[]
  protocol: ShiftProtocol | null
  month: Date
}

export function PrintSchedule({ department, employees, protocol, month }: PrintScheduleProps) {
  const monthStart = startOfMonth(month)
  const monthEnd = endOfMonth(month)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <div className="print-schedule" id="print-schedule">
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-xl font-bold text-black">Freetown International Airport</h1>
        <h2 className="text-lg font-semibold text-gray-700">{department.name} - Shift Schedule</h2>
        <p className="text-sm text-gray-500">{format(month, 'MMMM yyyy')}</p>
        {protocol && (
          <p className="text-xs text-gray-400 mt-1">
            Protocol: {protocol.name} | {protocol.protocol_type === 'fixed' 
              ? `${protocol.working_hours_start} - ${protocol.working_hours_end}`
              : `${protocol.days_on} on / ${protocol.days_off} off`
            }
          </p>
        )}
      </div>

      {/* Schedule Table */}
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-gray-300 p-2 text-left font-semibold">Employee</th>
            <th className="border border-gray-300 p-2 text-left font-semibold">Code</th>
            {days.map((day, idx) => {
              const isWeekend = day.getDay() === 0 || day.getDay() === 6
              return (
                <th 
                  key={idx} 
                  className={cn(
                    'border border-gray-300 p-1 text-center font-semibold min-w-[28px]',
                    isWeekend ? 'bg-gray-200' : ''
                  )}
                >
                  <div className="text-[9px] text-gray-500">{dayNames[(day.getDay() + 6) % 7]}</div>
                  <div>{day.getDate()}</div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {employees.map((emp) => (
            <tr key={emp.id} className="hover:bg-gray-50">
              <td className="border border-gray-300 p-2 font-medium">{emp.full_name}</td>
              <td className="border border-gray-300 p-2 text-gray-500 font-mono">{emp.employee_code}</td>
              {days.map((day, idx) => {
                // Use employee's protocol if set, otherwise department protocol
                const empProtocol = emp.shift_protocol_id ? protocol : protocol
                const shift = getShiftForDay(empProtocol, day)
                const shiftLabel = getShiftLabel(shift)
                const shiftColor = getShiftColor(shift)
                const isWeekend = day.getDay() === 0 || day.getDay() === 6
                const isToday = day.toDateString() === new Date().toDateString()
                
                return (
                  <td 
                    key={idx} 
                    className={cn(
                      'border border-gray-300 p-1 text-center font-semibold',
                      isWeekend ? 'bg-gray-50' : '',
                      isToday ? 'ring-2 ring-blue-500 ring-inset' : ''
                    )}
                  >
                    <span className={cn(
                      'inline-block w-5 h-5 rounded text-[10px] leading-5',
                      shiftColor
                    )}>
                      {shiftLabel}
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Legend */}
      <div className="mt-4 flex items-center gap-6 text-xs text-gray-500">
        <span className="font-semibold">Legend:</span>
        <span><span className="inline-block w-4 h-4 rounded bg-blue-100 text-blue-700 text-[9px] leading-4 text-center font-bold mr-1">M</span> Morning Shift</span>
        <span><span className="inline-block w-4 h-4 rounded bg-indigo-100 text-indigo-700 text-[9px] leading-4 text-center font-bold mr-1">N</span> Night Shift</span>
        <span><span className="inline-block w-4 h-4 rounded bg-gray-100 text-gray-400 text-[9px] leading-4 text-center font-bold mr-1">—</span> Off Day</span>
      </div>

      {/* Footer */}
      <div className="mt-6 pt-4 border-t border-gray-200 text-xs text-gray-400">
        <p>Generated by Project Z Attendance System | {format(new Date(), 'dd MMM yyyy HH:mm')}</p>
        <p>Freetown International Airport, Sierra Leone</p>
      </div>
    </div>
  )
}

// ── Export Functions ────────────────────────────────────────

export function printSchedule() {
  const content = document.getElementById('print-schedule')
  if (!content) return

  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    alert('Please allow popups to print the schedule')
    return
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Shift Schedule</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
        .print-schedule { max-width: 100%; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; }
        th { background: #f3f4f6; font-weight: bold; }
        .text-center { text-align: center; }
        .font-bold { font-weight: bold; }
        .font-semibold { font-weight: 600; }
        .font-mono { font-family: monospace; }
        .text-xs { font-size: 10px; }
        .text-sm { font-size: 12px; }
        .text-lg { font-size: 16px; }
        .text-xl { font-size: 18px; }
        .text-gray-400 { color: #9ca3af; }
        .text-gray-500 { color: #6b7280; }
        .text-gray-700 { color: #374151; }
        .bg-gray-50 { background: #f9fafb; }
        .bg-gray-100 { background: #f3f4f6; }
        .bg-gray-200 { background: #e5e7eb; }
        .bg-blue-100 { background: #dbeafe; }
        .text-blue-700 { color: #1d4ed8; }
        .bg-indigo-100 { background: #e0e7ff; }
        .text-indigo-700 { color: #4338ca; }
        .bg-gray-100 { background: #f3f4f6; }
        .text-gray-400 { color: #9ca3af; }
        .text-black { color: #000; }
        .text-center { text-align: center; }
        .text-left { text-align: left; }
        .font-medium { font-weight: 500; }
        .font-semibold { font-weight: 600; }
        .font-bold { font-weight: 700; }
        .mb-1 { margin-bottom: 4px; }
        .mb-2 { margin-bottom: 8px; }
        .mb-4 { margin-bottom: 16px; }
        .mb-6 { margin-bottom: 24px; }
        .mt-1 { margin-top: 4px; }
        .mt-4 { margin-top: 16px; }
        .mt-6 { margin-top: 24px; }
        .p-1 { padding: 4px; }
        .p-2 { padding: 8px; }
        .pt-4 { padding-top: 16px; }
        .border-t { border-top: 1px solid #e5e7eb; }
        .flex { display: flex; }
        .items-center { align-items: center; }
        .gap-1 { gap: 4px; }
        .gap-6 { gap: 24px; }
        .inline-block { display: inline-block; }
        .w-4 { width: 16px; }
        .h-4 { height: 16px; }
        .w-5 { width: 20px; }
        .h-5 { height: 20px; }
        .leading-4 { line-height: 16px; }
        .leading-5 { line-height: 20px; }
        .rounded { border-radius: 4px; }
        .text-center { text-align: center; }
        .text-left { text-align: left; }
        .text-right { text-align: right; }
        .font-bold { font-weight: 700; }
        .font-semibold { font-weight: 600; }
        .font-medium { font-weight: 500; }
        .font-mono { font-family: monospace; }
        .text-xs { font-size: 10px; }
        .text-sm { font-size: 12px; }
        .text-lg { font-size: 16px; }
        .text-xl { font-size: 18px; }
        .text-black { color: #000; }
        .text-gray-400 { color: #9ca3af; }
        .text-gray-500 { color: #6b7280; }
        .text-gray-700 { color: #374151; }
        .bg-gray-50 { background: #f9fafb; }
        .bg-gray-100 { background: #f3f4f6; }
        .bg-gray-200 { background: #e5e7eb; }
        .bg-blue-100 { background: #dbeafe; }
        .text-blue-700 { color: #1d4ed8; }
        .bg-indigo-100 { background: #e0e7ff; }
        .text-indigo-700 { color: #4338ca; }
        .border-gray-300 { border-color: #d1d5db; }
        .border-gray-200 { border-color: #e5e7eb; }
        .border-t-gray-200 { border-top-color: #e5e7eb; }
        .border-gray-300 { border-color: #d1d5db; }
        .hover\:bg-gray-50:hover { background: #f9fafb; }
        .min-w-\[28px\] { min-width: 28px; }
        .mb-3 { margin-bottom: 12px; }
        .mt-3 { margin-top: 12px; }
        .font-semibold { font-weight: 600; }
        .ring-2 { box-shadow: 0 0 0 2px #3b82f6; }
        .ring-blue-500 { box-shadow: 0 0 0 2px #3b82f6; }
        .ring-inset { box-shadow: inset 0 0 0 2px #3b82f6; }
      </style>
    </head>
    <body>
      ${content.innerHTML}
    </body>
    </html>
  `)
  
  printWindow.document.close()
  printWindow.focus()
  
  setTimeout(() => {
    printWindow.print()
  }, 500)
}

export function downloadScheduleCSV(
  department: Department,
  employees: Employee[],
  protocol: ShiftProtocol | null,
  month: Date
) {
  const monthStart = startOfMonth(month)
  const monthEnd = endOfMonth(month)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  // CSV Header
  let csv = 'Employee,Code'
  days.forEach(day => {
    csv += `,${dayNames[(day.getDay() + 6) % 7]} ${day.getDate()}`
  })
  csv += '\n'

  // Employee rows
  employees.forEach(emp => {
    csv += `"${emp.full_name}","${emp.employee_code}"`
    days.forEach(day => {
      const shift = getShiftForDay(protocol, day)
      const label = getShiftLabel(shift)
      csv += `,"${label}"`
    })
    csv += '\n'
  })

  // Create and download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `shift-schedule-${department.name.replace(/\s+/g, '-')}-${format(month, 'yyyy-MM')}.csv`
  link.click()
  URL.revokeObjectURL(link.href)
}
