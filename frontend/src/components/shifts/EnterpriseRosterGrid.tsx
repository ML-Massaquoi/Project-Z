import { useRef } from 'react'
import { ChevronLeft, ChevronRight, Download } from 'lucide-react'

/* ── Types ────────────────────────────────────────── */

export interface GridDay {
  date: string; day_name: string; day_number: string
}

export interface GridScheduleCell {
  assignment: string; shift_start: string | null; shift_end: string | null
}

export interface GridEmployee {
  id: string; name: string; code: string
}

export interface GridGroup {
  name: string; pair_id: string | null; slot_index: number | null
  employees: GridEmployee[]; schedule: GridScheduleCell[]
}

export interface GridWeek {
  label: string; start_date: string; end_date: string
  days: GridDay[]; groups: GridGroup[]
}

export interface GridDepartment {
  id: string; name: string; protocol_type: 'rotating' | 'fixed'
}

export interface RosterGridData {
  department: GridDepartment; year: number; month: number
  weeks: GridWeek[]
  unpaired: {
    employee_id: string; employee_code: string; employee_name: string
    schedule: GridScheduleCell[]
  }[]
}

interface Props {
  data?: RosterGridData
  loading?: boolean
  month: Date
  onMonthChange: (d: Date) => void
  onExport?: (fmt: 'csv' | 'excel' | 'pdf') => void
}

/* ── Cell color config ────────────────────────────── */

const CELL_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  DAY:     { bg: 'rgba(59,130,246,0.12)',  text: '#93C5FD', border: 'rgba(59,130,246,0.25)' },
  NIGHT:   { bg: 'rgba(139,92,246,0.12)',  text: '#A78BFA', border: 'rgba(139,92,246,0.25)' },
  OFF:     { bg: 'rgba(113,113,122,0.1)',  text: '#A1A1AA', border: 'rgba(113,113,122,0.15)' },
  LEAVE:   { bg: 'rgba(16,185,129,0.12)',  text: '#34D399', border: 'rgba(16,185,129,0.25)' },
  HOLIDAY: { bg: 'rgba(245,158,11,0.12)',  text: '#FBBF24', border: 'rgba(245,158,11,0.25)' },
  ADMIN:   { bg: 'rgba(59,130,246,0.08)',  text: '#93C5FD', border: 'rgba(59,130,246,0.15)' },
}

/* ── Component ────────────────────────────────────── */

export function EnterpriseRosterGrid({ data, loading, month, onMonthChange, onExport }: Props) {
  const printRef = useRef<HTMLDivElement>(null)
  const isRotating = data?.department?.protocol_type === 'rotating'

  return (
    <div ref={printRef} className="enterprise-roster">
      {/* ── Header ─────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '20px', flexWrap: 'wrap', gap: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--pz-border)', background: 'var(--pz-surface-1)', color: 'var(--pz-text-muted)', cursor: 'pointer' }}>
            <ChevronLeft size={16} />
          </button>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--pz-text)', margin: 0, minWidth: '160px', textAlign: 'center' }}>
            {month.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </h2>
          <button onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--pz-border)', background: 'var(--pz-surface-1)', color: 'var(--pz-text-muted)', cursor: 'pointer' }}>
            <ChevronRight size={16} />
          </button>
        </div>
        {onExport && (
          <div style={{ display: 'flex', gap: '4px' }}>
            {(['csv', 'excel', 'pdf'] as const).map(fmt => (
              <button key={fmt} onClick={() => onExport(fmt)}
                style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', borderRadius: '8px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', cursor: 'pointer' }}>
                <Download size={12} /> {fmt === 'excel' ? 'xlsx' : fmt.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Loading ────────────────────────────────── */}
      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center' }}>
          <div className="skeleton" style={{ height: '400px', borderRadius: '12px' }} />
        </div>
      ) : !data?.weeks?.length ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--pz-text-muted)' }}>
          <p style={{ fontSize: '14px', fontWeight: 600 }}>No roster data for {month.toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
          <p style={{ fontSize: '12px', marginTop: '4px' }}>Generate a roster in Roster Management first.</p>
        </div>
      ) : (
        <>
          {/* ── Department info bar ─────────────────── */}
          <div style={{ marginBottom: '16px', fontSize: '12px', color: 'var(--pz-text-muted)' }}>
            <strong style={{ color: 'var(--pz-text)' }}>{data.department.name}</strong>
            {' \u00B7 '}{isRotating ? 'Rotating Protocol' : 'Fixed Schedule'}
            {' \u00B7 '}{data.unpaired?.length ?? 0} unpaired staff
          </div>

          {/* ── Weekly sections ─────────────────────── */}
          {data.weeks.map((week, wi) => (
            <div key={wi} className="roster-week" style={{ marginBottom: '24px' }}>
              {/* Week header */}
              <div style={{
                padding: '8px 12px', borderRadius: '8px 8px 0 0',
                background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)',
                borderBottom: 'none', fontSize: '13px', fontWeight: 700, color: 'var(--pz-text)',
              }}>
                {week.label}: {formatDateRange(week.start_date, week.end_date)}
              </div>

              {/* Grid table */}
              <div style={{ overflowX: 'auto', border: '1px solid var(--pz-border)', borderRadius: '0 0 8px 8px' }}>
                <table className="roster-grid-table" style={{
                  width: '100%', borderCollapse: 'collapse', fontSize: '11px',
                  minWidth: week.days.length * 80 + 180,
                }}>
                  <thead>
                    <tr style={{ background: 'var(--pz-surface-2)' }}>
                      <th style={{ position: 'sticky', left: 0, zIndex: 2, textAlign: 'left', padding: '10px 12px', fontWeight: 700, minWidth: '160px', color: 'var(--pz-text-muted)', borderRight: '1px solid var(--pz-border)', background: 'var(--pz-surface-2)' }}>
                        Team / Employee
                      </th>
                      {week.days.map((day, di) => {
                        const dt = new Date(day.date + 'T12:00:00')
                        const isWeekend = dt.getDay() === 0 || dt.getDay() === 6
                        const isToday = day.date === new Date().toISOString().slice(0, 10)
                        return (
                          <th key={di} style={{
                            textAlign: 'center', padding: '8px 4px', minWidth: '72px',
                            color: isToday ? 'var(--pz-accent)' : isWeekend ? 'var(--pz-text-muted)' : 'var(--pz-text-secondary)',
                            fontWeight: 600, borderLeft: '1px solid var(--pz-border)',
                          }}>
                            <div style={{ fontSize: '10px', fontWeight: 400, opacity: 0.7 }}>{day.day_name.slice(0, 3)}</div>
                            <div style={{ fontSize: '14px', fontWeight: 700 }}>{day.day_number}</div>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {/* ── Rotation groups ────────────── */}
                    {(week.groups ?? []).map((grp, gi) => (
                      <tr key={grp.name || gi} style={{
                        borderTop: '1px solid var(--pz-border)',
                        background: gi % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                      }}>
                        <td style={{
                          position: 'sticky', left: 0, zIndex: 1, padding: '8px 12px',
                          borderRight: '1px solid var(--pz-border)',
                          background: gi % 2 === 0 ? 'var(--pz-surface-1)' : 'var(--pz-surface-2)',
                        }}>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--pz-text)', marginBottom: '2px' }}>
                            {grp.name}
                          </div>
                          {grp.employees.map(emp => (
                            <div key={emp.id} style={{ fontSize: '10px', color: 'var(--pz-text-muted)', lineHeight: 1.5 }}>
                              {emp.name}
                            </div>
                          ))}
                        </td>
                        {grp.schedule.map((cell, ci) => {
                          const cs = CELL_STYLE[cell.assignment] || CELL_STYLE.OFF
                          const isDay = cell.assignment === 'DAY'
                          const isNight = cell.assignment === 'NIGHT'
                          return (
                            <td key={ci} style={{
                              textAlign: 'center', padding: '6px 2px',
                              borderLeft: '1px solid var(--pz-border)',
                              background: cs.bg,
                              borderBottom: '1px solid rgba(255,255,255,0.03)',
                            }}>
                              {isDay || isNight ? (
                                <div style={{ lineHeight: 1.3 }}>
                                  <div style={{ fontSize: '10px', fontWeight: 700, color: cs.text }}>{cell.shift_start || '--:--'}</div>
                                  <div style={{ fontSize: '9px', color: cs.text, opacity: 0.7 }}>{cell.shift_end || '--:--'}</div>
                                </div>
                              ) : (
                                <span style={{ fontSize: '10px', fontWeight: 700, color: cs.text }}>
                                  {cell.assignment === 'LEAVE' ? 'LV' :
                                   cell.assignment === 'HOLIDAY' ? 'HD' :
                                   cell.assignment === 'ADMIN' ? 'ADM' : 'OFF'}
                                </span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}

                    {/* ── Unpaired staff section ─────── */}
                    {data.unpaired?.length > 0 && (
                      <>
                        <tr style={{ background: 'var(--pz-surface-2)' }}>
                          <td colSpan={week.days.length + 1} style={{
                            padding: '8px 12px', fontSize: '11px', fontWeight: 700,
                            color: 'var(--pz-text-muted)', borderTop: '2px solid var(--pz-border)',
                          }}>
                            Fixed Staff
                          </td>
                        </tr>
                        {data.unpaired.map((up, ui) => {
                          const weekStartIdx = wi * 7
                          const weekSchedule = up.schedule.slice(weekStartIdx, weekStartIdx + week.days.length)
                          return (
                            <tr key={up.employee_id || ui} style={{ borderTop: '1px solid var(--pz-border)' }}>
                              <td style={{
                                position: 'sticky', left: 0, zIndex: 1, padding: '8px 12px',
                                borderRight: '1px solid var(--pz-border)', background: 'var(--pz-surface-1)',
                              }}>
                                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text)' }}>{up.employee_name}</div>
                                <div style={{ fontSize: '9px', color: 'var(--pz-text-muted)' }}>{up.employee_code}</div>
                              </td>
                              {weekSchedule.map((cell, ci) => {
                                const cs = CELL_STYLE[cell.assignment] || CELL_STYLE.OFF
                                const isDay = cell.assignment === 'ADMIN' || cell.assignment === 'DAY'
                                return (
                                  <td key={ci} style={{
                                    textAlign: 'center', padding: '6px 2px',
                                    borderLeft: '1px solid var(--pz-border)',
                                    background: cs.bg,
                                  }}>
                                    {isDay ? (
                                      <div style={{ lineHeight: 1.3 }}>
                                        <div style={{ fontSize: '10px', fontWeight: 700, color: cs.text }}>{cell.shift_start || '--:--'}</div>
                                        <div style={{ fontSize: '9px', color: cs.text, opacity: 0.7 }}>{cell.shift_end || '--:--'}</div>
                                      </div>
                                    ) : (
                                      <span style={{ fontSize: '10px', fontWeight: 700, color: cs.text }}>OFF</span>
                                    )}
                                  </td>
                                )
                              })}
                            </tr>
                          )
                        })}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}

      {/* ── Print styles ────────────────────────────── */}
      <style>{`
        @media print {
          body { background: #fff !important; }
          .enterprise-roster { padding: 0 !important; }
          .roster-week { page-break-inside: avoid; break-inside: avoid; }
          .roster-grid-table { font-size: 8px !important; }
          .roster-grid-table th,
          .roster-grid-table td { padding: 4px !important; }
          @page { size: A3 landscape; margin: 12mm; }
        }
      `}</style>
    </div>
  )
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end + 'T12:00:00')
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  return `${s.toLocaleDateString('en', opts)} \u2013 ${e.toLocaleDateString('en', opts)}`
}
