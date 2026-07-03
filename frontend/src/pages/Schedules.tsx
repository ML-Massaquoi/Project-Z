import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Calendar, ChevronLeft, ChevronRight, Building2, Clock } from 'lucide-react'
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns'
import { departmentsAPI, shiftProtocolsAPI } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Section, sectionIcon } from '@/components/ui/CardSection'
import type { Department, ShiftProtocol } from '@/types'

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
  layout: {
    display: 'grid',
    gridTemplateColumns: '1fr 280px',
    gap: '16px',
    alignItems: 'start',
  },
  dayGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '1px',
    background: 'var(--pz-border)',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  dayHeader: {
    padding: '6px',
    textAlign: 'center' as const,
    fontSize: '10px',
    fontWeight: 600,
    color: 'var(--pz-text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    background: 'var(--pz-surface-2)',
  },
  emptyCell: {
    background: 'var(--pz-surface-1)',
    padding: '8px',
    minHeight: '80px',
  },
  dayCell: (isSelected: boolean, isToday: boolean) => ({
    background: 'var(--pz-surface-1)',
    padding: '8px',
    minHeight: '80px',
    cursor: 'pointer',
    transition: 'all 0.1s ease',
    border: isSelected ? '1px solid var(--pz-accent)' : 'none',
    borderRadius: isSelected ? '6px' : 0,
  }),
  dayNumber: (isToday: boolean) => ({
    fontSize: '12px',
    fontWeight: isToday ? 700 : 500,
    color: isToday ? 'var(--pz-accent)' : 'var(--pz-text-secondary)',
    marginBottom: '4px',
  }),
  deptChip: {
    fontSize: '9px',
    background: 'rgba(59,130,246,0.1)',
    color: '#60A5FA',
    borderRadius: '4px',
    padding: '1px 4px',
    marginBottom: '2px',
    overflow: 'hidden',
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
    lineHeight: '1.4',
  },
  sidebarCard: {
    background: 'var(--pz-surface-1)',
    border: '1px solid var(--pz-border)',
    borderRadius: '10px',
    padding: '20px',
  },
  sidebarTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--pz-text)',
    margin: 0,
  },
  sidebarRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 10px',
    borderRadius: '8px',
    background: 'rgba(255,255,255,0.02)',
  },
  protoRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '12px',
    padding: '4px 0',
  },
  pill: (type: string) => ({
    fontSize: '9px',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '20px',
    background: type === 'off' ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
    color: type === 'off' ? '#EF4444' : '#10B981',
  }),
}

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
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h1 style={s.headerTitle}>Workforce Schedules</h1>
          <p style={s.headerSubtitle}>Monthly shift calendar · {format(currentMonth, 'MMMM yyyy')}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setCurrentMonth(new Date())}>
          Today
        </Button>
      </div>

      <div style={s.layout}>
        <Section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={sectionIcon('#3B82F6')}>
                <Calendar size={16} color="#3B82F6" />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} style={{ padding: '4px', borderRadius: '6px', border: 'none', background: 'var(--pz-surface-2)', color: 'var(--pz-text-secondary)', cursor: 'pointer' }}>
                  <ChevronLeft size={16} />
                </button>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--pz-text)', minWidth: '140px', textAlign: 'center' }}>
                  {format(currentMonth, 'MMMM yyyy')}
                </span>
                <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} style={{ padding: '4px', borderRadius: '6px', border: 'none', background: 'var(--pz-surface-2)', color: 'var(--pz-text-secondary)', cursor: 'pointer' }}>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>

          <div style={s.dayGrid}>
            {dayNames.map((d) => (
              <div key={d} style={s.dayHeader}>{d}</div>
            ))}
            {Array.from({ length: startDay }).map((_, i) => (
              <div key={`e-${i}`} style={s.emptyCell} />
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
                  style={s.dayCell(isSelected, isToday)}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--pz-surface-1)' }}
                >
                  <div style={s.dayNumber(isToday)}>{format(day, 'd')}</div>
                  {working.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {working.slice(0, 2).map((d) => (
                        <div key={d.id} style={s.deptChip}>{d.name}</div>
                      ))}
                      {working.length > 2 && (
                        <div style={{ fontSize: '9px', color: 'var(--pz-text-muted)' }}>+{working.length - 2}</div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={s.sidebarCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <div style={sectionIcon('#3B82F6')}>
                <Clock size={16} color="#3B82F6" />
              </div>
              <h3 style={s.sidebarTitle}>{format(selectedDate, 'EEEE, MMM d')}</h3>
            </div>
            {workingDeptsOnSelected.length === 0 ? (
              <p style={{ fontSize: '12px', color: 'var(--pz-text-muted)' }}>No departments scheduled</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {workingDeptsOnSelected.map((d) => {
                  const shift = getDeptShiftForDate(d, selectedDate)
                  return (
                    <div key={d.id} style={s.sidebarRow}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Building2 size={12} color="var(--pz-text-muted)" />
                        <span style={{ fontSize: '12px', color: 'var(--pz-text-secondary)' }}>{d.name}</span>
                      </div>
                      <span style={s.pill(shift?.type || '')}>{shift?.label || '—'}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div style={s.sidebarCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <div style={sectionIcon('#3B82F6')}>
                <Calendar size={16} color="#3B82F6" />
              </div>
              <h3 style={s.sidebarTitle}>Active Protocols ({protos.length})</h3>
            </div>
            {protos.length === 0 ? (
              <p style={{ fontSize: '12px', color: 'var(--pz-text-muted)' }}>No protocols configured</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {protos.slice(0, 6).map((p) => (
                  <div key={p.id} style={s.protoRow}>
                    <span style={{ color: 'var(--pz-text-secondary)' }}>{p.name}</span>
                    <span style={{ fontFamily: 'monospace', color: 'var(--pz-text-muted)' }}>
                      {p.protocol_type === 'fixed' ? `${p.working_hours_start || '—'}-${p.working_hours_end || '—'}` : `${p.days_on || '?'}on/${p.days_off || '?'}off`}
                    </span>
                  </div>
                ))}
                {protos.length > 6 && (
                  <p style={{ fontSize: '11px', color: 'var(--pz-text-muted)', textAlign: 'center', paddingTop: '4px' }}>+{protos.length - 6} more</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
