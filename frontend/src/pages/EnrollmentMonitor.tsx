import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Fingerprint, Monitor, Clock, CheckCircle2,
  RefreshCw, ChevronDown, ChevronUp,
  UserPlus, Scan, Eye,
} from 'lucide-react'
import { enrollmentAPI } from '@/api/client'
import { eventBus } from '@/lib/eventBus'
import type { ActiveEnrollmentSession, EnrollmentEventPayload } from '@/types'

const STATUS_LABELS: Record<string, string> = {
  waiting_for_fingerprint: 'Waiting for Fingerprint',
  fingerprint_in_progress: 'Enrolling Fingerprint',
  fingerprint_captured: 'Fingerprint Captured',
  waiting_for_face: 'Waiting for Face',
  face_in_progress: 'Enrolling Face',
  face_captured: 'Face Captured',
  enrollment_complete: 'Complete',
  cancelled: 'Cancelled',
  failed: 'Failed',
}

interface EnrollmentLogEntry {
  type: string
  session_id: string
  employee_name?: string | null
  device_name?: string | null
  status: string
  fingerprint_count?: number
  face_count?: number
  timestamp: string
}

const s = {
  page: {
    padding: '32px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '28px',
    minHeight: '100%',
    boxSizing: 'border-box' as const,
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: '24px',
    fontWeight: 700,
    color: 'var(--pz-text)',
    margin: 0,
  },
  subtitle: {
    fontSize: '14px',
    color: 'var(--pz-text-muted)',
    marginTop: '4px',
    marginBottom: 0,
  },
  liveBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 14px',
    borderRadius: '20px',
    background: 'rgba(59,130,246,0.08)',
    border: '1px solid rgba(59,130,246,0.2)',
  },
  liveDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    background: 'var(--pz-brand)',
    animation: 'pulse 2s ease-in-out infinite',
  },
  liveText: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--pz-brand)',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '16px',
  },
  summaryCard: {
    background: 'var(--pz-surface-1)',
    border: '1px solid var(--pz-border)',
    borderRadius: '10px',
    padding: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
  },
  iconBox: (color: string): React.CSSProperties => ({
    width: '42px',
    height: '42px',
    borderRadius: '10px',
    background: color,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  }),
  statValue: {
    fontSize: '24px',
    fontWeight: 700,
    color: 'var(--pz-text)',
    margin: 0,
    lineHeight: 1,
  },
  statLabel: {
    fontSize: '12px',
    color: 'var(--pz-text-muted)',
    margin: '4px 0 0',
  },
  section: {
    background: 'var(--pz-surface-1)',
    border: '1px solid var(--pz-border)',
    borderRadius: '10px',
    overflow: 'hidden',
  },
  sectionHeader: {
    padding: '16px 20px',
    borderBottom: '1px solid var(--pz-border)',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  sectionTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--pz-text)',
    margin: 0,
  },
  emptyState: {
    padding: '48px 20px',
    textAlign: 'center' as const,
    color: 'var(--pz-text-muted)',
  },
  sessionRow: {
    padding: '16px 20px',
    cursor: 'pointer',
    transition: 'background 0.12s',
    borderBottom: '1px solid var(--pz-border)',
  },
  sessionRowInner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatar: {
    width: '42px',
    height: '42px',
    borderRadius: '10px',
    background: 'linear-gradient(135deg, var(--pz-brand), #7C3AED)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sessionName: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--pz-text)',
    margin: 0,
  },
  sessionMeta: {
    fontSize: '12px',
    color: 'var(--pz-text-muted)',
    margin: '3px 0 0',
    fontFamily: 'monospace',
  },
  statusPill: (bg: string, fg: string, border: string): React.CSSProperties => ({
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: '20px',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.03em',
    textTransform: 'uppercase' as const,
    background: bg,
    color: fg,
    border: `1px solid ${border}`,
    marginLeft: '10px',
    verticalAlign: 'middle',
  }),
  progressDot: (done: boolean, active: boolean): React.CSSProperties => ({
    width: '24px',
    height: '6px',
    borderRadius: '3px',
    background: done ? '#10B981' : active ? 'var(--pz-brand)' : 'var(--pz-surface-3)',
    transition: 'all 0.3s',
  }),
  metaRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    marginLeft: '16px',
  },
  metaStat: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '12px',
    color: 'var(--pz-text-muted)',
  },
  expandedPanel: {
    marginTop: '16px',
    marginLeft: '58px',
    padding: '14px',
    borderRadius: '8px',
    background: 'var(--pz-surface-2)',
    border: '1px solid var(--pz-border)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  stepPill: (done: boolean, active: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    padding: '4px 10px',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: 600,
    background: done ? 'rgba(16,185,129,0.1)' : active ? 'rgba(59,130,246,0.1)' : 'var(--pz-surface-3)',
    color: done ? '#10B981' : active ? 'var(--pz-brand)' : 'var(--pz-text-muted)',
    border: `1px solid ${done ? 'rgba(16,185,129,0.25)' : active ? 'rgba(59,130,246,0.25)' : 'var(--pz-border)'}`,
  }),
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
  },
  infoLabel: {
    fontSize: '11px',
    color: 'var(--pz-text-muted)',
    marginBottom: '2px',
  },
  infoValue: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--pz-text)',
    margin: 0,
  },
  eventRow: {
    padding: '10px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '12px',
    borderBottom: '1px solid var(--pz-border)',
  },
  eventDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: 'var(--pz-brand)',
    flexShrink: 0,
  },
  eventTime: {
    fontSize: '12px',
    color: 'var(--pz-text-muted)',
    width: '72px',
    flexShrink: 0,
    fontFamily: 'monospace',
  },
  eventLog: {
    maxHeight: '320px',
    overflowY: 'auto' as const,
  },
}

const COLOR_MAP: Record<string, { bg: string; fg: string; border: string; icon: string }> = {
  blue: { bg: 'rgba(59,130,246,0.1)', fg: 'var(--pz-brand)', border: 'rgba(59,130,246,0.2)', icon: 'linear-gradient(135deg, #3B82F6, #2563EB)' },
  emerald: { bg: 'rgba(16,185,129,0.1)', fg: '#10B981', border: 'rgba(16,185,129,0.2)', icon: 'linear-gradient(135deg, #10B981, #059669)' },
  purple: { bg: 'rgba(124,58,237,0.1)', fg: '#7C3AED', border: 'rgba(124,58,237,0.2)', icon: 'linear-gradient(135deg, #7C3AED, #6D28D9)' },
  green: { bg: 'rgba(34,197,94,0.1)', fg: '#22C55E', border: 'rgba(34,197,94,0.2)', icon: 'linear-gradient(135deg, #22C55E, #16A34A)' },
}

const STATUS_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  waiting_for_fingerprint: { bg: 'rgba(59,130,246,0.1)', fg: 'var(--pz-brand)', border: 'rgba(59,130,246,0.2)' },
  fingerprint_in_progress: { bg: 'rgba(245,158,11,0.1)', fg: '#F59E0B', border: 'rgba(245,158,11,0.2)' },
  fingerprint_captured: { bg: 'rgba(16,185,129,0.1)', fg: '#10B981', border: 'rgba(16,185,129,0.2)' },
  waiting_for_face: { bg: 'rgba(124,58,237,0.1)', fg: '#7C3AED', border: 'rgba(124,58,237,0.2)' },
  face_in_progress: { bg: 'rgba(124,58,237,0.1)', fg: '#7C3AED', border: 'rgba(124,58,237,0.2)' },
  face_captured: { bg: 'rgba(16,185,129,0.1)', fg: '#10B981', border: 'rgba(16,185,129,0.2)' },
  enrollment_complete: { bg: 'rgba(34,197,94,0.1)', fg: '#22C55E', border: 'rgba(34,197,94,0.2)' },
  cancelled: { bg: 'var(--pz-surface-3)', fg: 'var(--pz-text-muted)', border: 'var(--pz-border)' },
  failed: { bg: 'rgba(239,68,68,0.1)', fg: '#EF4444', border: 'rgba(239,68,68,0.2)' },
}

export default function EnrollmentMonitor() {
  const queryClient = useQueryClient()
  const [liveEvents, setLiveEvents] = useState<EnrollmentLogEntry[]>([])
  const [expandedSession, setExpandedSession] = useState<string | null>(null)
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)

  const { data: activeSessionsData, isLoading } = useQuery({
    queryKey: ['enrollment', 'active'],
    queryFn: async () => (await enrollmentAPI.getActiveSessions()).data,
    refetchInterval: 5000,
  })

  const sessions: ActiveEnrollmentSession[] = activeSessionsData?.sessions || []

  useEffect(() => {
    const unsub = eventBus.subscribe('enrollment.event', (event) => {
      const data = event.data as unknown as EnrollmentEventPayload
      const entry: EnrollmentLogEntry = {
        type: data.type,
        session_id: data.session_id,
        employee_name: data.employee_name,
        device_name: data.device_name,
        status: data.status,
        fingerprint_count: data.fingerprint_count,
        face_count: data.face_count,
        timestamp: new Date().toISOString(),
      }
      setLiveEvents(prev => [entry, ...prev].slice(0, 100))
      queryClient.invalidateQueries({ queryKey: ['enrollment', 'active'] })
    })
    return unsub
  }, [queryClient])

  const getStepIndex = (status: string): number => {
    const steps = [
      'waiting_for_fingerprint', 'fingerprint_in_progress', 'fingerprint_captured',
      'waiting_for_face', 'face_in_progress', 'face_captured', 'enrollment_complete',
    ]
    return steps.indexOf(status)
  }

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.headerRow}>
        <div>
          <h1 style={s.title}>Enrollment Monitor</h1>
          <p style={s.subtitle}>
            Real-time biometric enrollment tracking across all devices
          </p>
        </div>
        <div style={s.liveBadge}>
          <span style={s.liveDot} />
          <span style={s.liveText}>
            {sessions.length} Active Session{sessions.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={s.summaryGrid}>
        <SummaryCard
          icon={UserPlus}
          label="Active Enrollments"
          value={sessions.length}
          color="blue"
        />
        <SummaryCard
          icon={Fingerprint}
          label="Fingerprints Captured"
          value={sessions.filter(s => ['fingerprint_captured', 'face_in_progress', 'face_captured', 'enrollment_complete'].includes(s.status)).length}
          color="emerald"
        />
        <SummaryCard
          icon={Scan}
          label="Face Captured"
          value={sessions.filter(s => ['face_captured', 'enrollment_complete'].includes(s.status)).length}
          color="purple"
        />
        <SummaryCard
          icon={CheckCircle2}
          label="Completed Today"
          value={liveEvents.filter(e => e.type === 'enrollment_completed').length}
          color="green"
        />
      </div>

      {/* Active Sessions */}
      <div style={s.section}>
        <div style={s.sectionHeader}>
          <Monitor size={18} style={{ color: 'var(--pz-brand)' }} />
          <h2 style={s.sectionTitle}>Active Enrollment Sessions</h2>
        </div>

        {isLoading ? (
          <div style={s.emptyState}>
            <RefreshCw size={24} style={{ opacity: 0.4, margin: '0 auto 8px', animation: 'spin 1s linear infinite' }} />
            <p style={{ margin: 0 }}>Loading sessions...</p>
          </div>
        ) : sessions.length === 0 ? (
          <div style={s.emptyState}>
            <Fingerprint size={40} style={{ opacity: 0.2, margin: '0 auto 12px' }} />
            <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--pz-text-secondary)', margin: '0 0 4px' }}>
              No Active Enrollments
            </p>
            <p style={{ fontSize: '13px', margin: 0 }}>
              Sessions will appear here when enrollment begins
            </p>
          </div>
        ) : (
          <div>
            {sessions.map((session) => {
              const isExpanded = expandedSession === session.session_id
              const statusColor = STATUS_COLORS[session.status] || STATUS_COLORS.cancelled
              const currentStep = getStepIndex(session.status)

              return (
                <div
                  key={session.session_id}
                  style={{
                    ...s.sessionRow,
                    background: hoveredRow === session.session_id ? 'var(--pz-surface-2)' : 'transparent',
                  }}
                  onMouseEnter={() => setHoveredRow(session.session_id)}
                  onMouseLeave={() => setHoveredRow(null)}
                  onClick={() => setExpandedSession(isExpanded ? null : session.session_id)}
                >
                  <div style={s.sessionRowInner}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: 0 }}>
                      <div style={s.avatar}>
                        <UserPlus size={18} style={{ color: '#fff' }} />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                          <p style={s.sessionName}>
                            {session.employee_name || session.employee_code || 'Unknown'}
                          </p>
                          <span style={s.statusPill(statusColor.bg, statusColor.fg, statusColor.border)}>
                            {STATUS_LABELS[session.status] || session.status}
                          </span>
                        </div>
                        <p style={s.sessionMeta}>
                          {session.device_name} ({session.device_ip}) &middot; {session.employee_code}
                        </p>
                      </div>
                    </div>

                    <div style={s.metaRight}>
                      {/* Progress bar */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {['Fingerprint', 'Face', 'Done'].map((label, i) => {
                          const isComplete = currentStep > (i === 0 ? 3 : i === 1 ? 5 : 6)
                          const isActive = i === 0
                            ? currentStep >= 1 && currentStep <= 3
                            : i === 1
                            ? currentStep >= 4 && currentStep <= 5
                            : currentStep === 6
                          return (
                            <div key={label} style={s.progressDot(isComplete, isActive)} />
                          )
                        })}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={s.metaStat}>
                          <Fingerprint size={12} /> {session.fingerprint_count}
                        </span>
                        <span style={s.metaStat}>
                          <Eye size={12} /> {session.face_count}
                        </span>
                      </div>

                      {isExpanded
                        ? <ChevronUp size={16} style={{ color: 'var(--pz-text-muted)' }} />
                        : <ChevronDown size={16} style={{ color: 'var(--pz-text-muted)' }} />
                      }
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div style={s.expandedPanel}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {[
                          { label: 'Fingerprint Enroll', steps: [1, 2, 3] },
                          { label: 'Face Enroll', steps: [4, 5] },
                          { label: 'Complete', steps: [6] },
                        ].map(({ label, steps }, i) => {
                          const isComplete = steps.some(st => currentStep > st)
                          const isActive = steps.some(st => currentStep === st)
                          return (
                            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <div style={s.stepPill(isComplete, isActive)}>
                                {isComplete ? <CheckCircle2 size={10} /> : isActive ? <RefreshCw size={10} style={{ animation: 'spin 1s linear infinite' }} /> : <Clock size={10} />}
                                {label}
                              </div>
                              {i < 2 && <span style={{ color: 'var(--pz-text-muted)', fontSize: '12px' }}>&rarr;</span>}
                            </div>
                          )
                        })}
                      </div>

                      <div style={s.infoGrid}>
                        <div>
                          <p style={s.infoLabel}>Started at</p>
                          <p style={s.infoValue}>{session.started_at ? new Date(session.started_at).toLocaleTimeString() : '-'}</p>
                        </div>
                        <div>
                          <p style={s.infoLabel}>Fingerprint Status</p>
                          <p style={s.infoValue}>{session.fingerprint_status}</p>
                        </div>
                        <div>
                          <p style={s.infoLabel}>Face Status</p>
                          <p style={s.infoValue}>{session.face_status}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Live Event Log */}
      <div style={s.section}>
        <div style={s.sectionHeader}>
          <Clock size={18} style={{ color: '#F59E0B' }} />
          <h2 style={s.sectionTitle}>Live Enrollment Events</h2>
        </div>
        <div style={s.eventLog}>
          {liveEvents.length === 0 ? (
            <div style={{ ...s.emptyState, padding: '32px 20px' }}>
              <p style={{ margin: 0 }}>Waiting for enrollment events...</p>
            </div>
          ) : (
            <div>
              {liveEvents.map((event, i) => (
                <div key={i} style={s.eventRow}>
                  <span style={s.eventDot} />
                  <span style={s.eventTime}>
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                  <span style={{
                    fontWeight: 600,
                    color: event.type === 'enrollment_completed' ? '#10B981'
                      : event.type === 'enrollment_cancelled' ? '#EF4444'
                      : 'var(--pz-text-secondary)',
                  }}>
                    {event.type.replace(/_/g, ' ')}
                  </span>
                  <span style={{ color: 'var(--pz-text-secondary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                    {event.employee_name || 'Unknown'}
                  </span>
                  {event.device_name && (
                    <span style={{ color: 'var(--pz-text-muted)', flexShrink: 0 }}>
                      on {event.device_name}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType
  label: string
  value: number
  color: string
}) {
  const c = COLOR_MAP[color] || COLOR_MAP.blue
  return (
    <div style={s.summaryCard}>
      <div style={s.iconBox(c.icon)}>
        <Icon size={18} style={{ color: '#fff' }} />
      </div>
      <div>
        <p style={s.statValue}>{value}</p>
        <p style={s.statLabel}>{label}</p>
      </div>
    </div>
  )
}
