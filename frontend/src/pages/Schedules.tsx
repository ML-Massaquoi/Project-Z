import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Calendar, ChevronLeft, ChevronRight, Building2, Clock } from 'lucide-react'
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns'
import { departmentsAPI, shiftProtocolsAPI } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardHeaderIcon, CardTitle, CardBody } from '@/components/ui/card'
import { SkeletonCard } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { Department, ShiftProtocol } from '@/types'

export default function Schedules() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(new Date())

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const startDay = getDay(monthStart)

  const { data: departments, isLoading } = useQuery({
    queryKey: ['schedules-departments'],
    queryFn: () => departmentsAPI.list(),
    select: (d) => d.data as Department[],
  })

  const { data: protocols } = useQuery({
    queryKey: ['schedules-protocols'],
    queryFn: () => shiftProtocolsAPI.list(),
    select: (d) => d.data as ShiftProtocol[],
  })

  const depts = departments || []
  const protos = protocols || []

  const getProtocol = (id: string | null) => protos.find(p => p.id === id) || null

  const getDeptShiftForDate = (dept: Department, date: Date): { type: string; label: string } | null => {
    const protocol = getProtocol(dept.shift_protocol_id ?? null)
    if (!protocol) return null
    if (protocol.protocol_type === 'fixed') {
      const dayNum = date.getDay() === 0 ? 7 : date.getDay()
      return protocol.working_days?.includes(dayNum) ? { type: 'morning', label: 'M' } : { type: 'off', label: '—' }
    }
    if (protocol.protocol_type === 'rotating' && protocol.rotation_shifts?.length) {
      const refDate = new Date('2024-01-01')
      const daysSinceRef = Math.floor((date.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24))
      const shift = protocol.rotation_shifts[daysSinceRef % protocol.rotation_shifts.length]
      if (shift === 'day') return { type: 'morning', label: 'M' }
      if (shift === 'night') return { type: 'night', label: 'N' }
      return { type: 'off', label: '—' }
    }
    return null
  }

  const workingDeptsOnSelected = useMemo(() =>
    depts.filter(d => {
      const s = getDeptShiftForDate(d, selectedDate)
      return s && s.type !== 'off'
    }), [depts, selectedDate])

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-header-group">
          <h1>Workforce Schedules</h1>
          <p>Monthly shift calendar · {format(currentMonth, 'MMMM yyyy')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setCurrentMonth(new Date())}>
            Today
          </Button>
        </div>
      </div>

      <div className="ops-grid ops-grid-4" style={{ gridTemplateColumns: '1fr 280px' }}>
        {/* Calendar */}
        <Card>
          <CardHeader>
            <CardHeaderIcon><Calendar size={16} className="text-brand-600" /></CardHeaderIcon>
            <CardTitle>
              <div className="flex items-center gap-2">
                <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1 rounded hover:bg-bg-subtle"><ChevronLeft size={16} /></button>
                <span className="text-base">{format(currentMonth, 'MMMM yyyy')}</span>
                <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1 rounded hover:bg-bg-subtle"><ChevronRight size={16} /></button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-7 gap-px bg-border-subtle rounded-lg overflow-hidden">
              {dayNames.map((d) => (
                <div key={d} className="bg-bg-subtle p-2 text-center text-[10px] font-semibold text-fg-muted uppercase tracking-wider">
                  {d}
                </div>
              ))}
              {Array.from({ length: startDay }).map((_, i) => (
                <div key={`e-${i}`} className="bg-surface p-2 min-h-[90px]" />
              ))}
              {days.map((day) => {
                const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
                const isSelected = format(day, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd')
                const working = depts.filter(d => {
                  const s = getDeptShiftForDate(d, day)
                  return s && s.type !== 'off'
                })
                return (
                  <div key={day.toISOString()} onClick={() => setSelectedDate(day)}
                    className={cn(
                      'bg-surface p-2 min-h-[90px] cursor-pointer transition-colors hover:bg-bg-subtle/50',
                      isSelected && 'ring-2 ring-brand-500 ring-inset',
                    )}>
                    <div className={cn('text-xs font-medium mb-1', isToday ? 'text-brand-600 font-bold' : 'text-fg-primary')}>
                      {format(day, 'd')}
                    </div>
                    {working.length > 0 && (
                      <div className="space-y-0.5">
                        {working.slice(0, 2).map((d) => (
                          <div key={d.id} className="text-[9px] bg-brand-50 text-brand-700 rounded px-1 py-0.5 truncate leading-tight">
                            {d.name}
                          </div>
                        ))}
                        {working.length > 2 && (
                          <div className="text-[9px] text-fg-muted">+{working.length - 2}</div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CardBody>
        </Card>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Selected Day */}
          <Card>
            <CardHeader>
              <CardHeaderIcon><Clock size={16} className="text-brand-600" /></CardHeaderIcon>
              <CardTitle>{format(selectedDate, 'EEEE, MMM d')}</CardTitle>
            </CardHeader>
            <CardBody>
              {workingDeptsOnSelected.length === 0 ? (
                <p className="text-xs text-fg-muted">No departments scheduled</p>
              ) : (
                <div className="space-y-1.5">
                  {workingDeptsOnSelected.map((d) => {
                    const shift = getDeptShiftForDate(d, selectedDate)
                    return (
                      <div key={d.id} className="flex items-center justify-between p-2 rounded-lg bg-bg-subtle">
                        <div className="flex items-center gap-2">
                          <Building2 size={12} className="text-fg-muted" />
                          <span className="text-xs text-fg-primary">{d.name}</span>
                        </div>
                        <Badge variant={shift?.type === 'off' ? 'danger' : 'success'} size="sm">
                          {shift?.label || '—'}
                        </Badge>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardBody>
          </Card>

          {/* Active Protocols */}
          <Card>
            <CardHeader>
              <CardHeaderIcon><Calendar size={16} className="text-brand-600" /></CardHeaderIcon>
              <CardTitle>Active Protocols ({protos.length})</CardTitle>
            </CardHeader>
            <CardBody>
              {protos.length === 0 ? (
                <p className="text-xs text-fg-muted">No protocols configured</p>
              ) : (
                <div className="space-y-2">
                  {protos.slice(0, 6).map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-xs">
                      <span className="text-fg-secondary">{p.name}</span>
                      <span className="font-mono text-fg-muted">
                        {p.protocol_type === 'fixed' ? `${p.working_hours_start || '—'}-${p.working_hours_end || '—'}` : `${p.days_on || '?'}on/${p.days_off || '?'}off`}
                      </span>
                    </div>
                  ))}
                  {protos.length > 6 && (
                    <p className="text-xs text-fg-muted text-center pt-1">+{protos.length - 6} more</p>
                  )}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}
