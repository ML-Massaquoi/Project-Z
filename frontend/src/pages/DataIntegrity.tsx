import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Shield, AlertTriangle, AlertCircle, Info, CheckCircle, RefreshCw, X } from 'lucide-react'
import { integrityAPI } from '@/api/client'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

const severityConfig: Record<string, { icon: typeof AlertTriangle; color: string; bg: string }> = {
  critical: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
  error: { icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
  warning: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
  info: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
}

const categoryLabels: Record<string, string> = {
  scan_session: 'Scan/Session',
  session_invariant: 'Session Invariant',
  summary_drift: 'Summary Drift',
  orphan_record: 'Orphan Record',
  stuck_pipeline: 'Stuck Pipeline',
  daily_report: 'Daily Report',
  general: 'General',
}

interface IntegrityFinding {
  id: string
  check_category: string
  severity: string
  check_name: string
  message: string
  affected_count: number
  affected_entity_type: string | null
  resolved: boolean
  resolved_by: string | null
  resolved_at: string | null
  resolution_note: string | null
  run_by: string | null
  run_id: string | null
  created_at: string
}

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
  kpiCard: {
    background: 'var(--pz-surface-1)',
    border: '1px solid var(--pz-border)',
    borderRadius: '12px',
    padding: '20px',
  },
}

export default function DataIntegrity() {
  const [filterSeverity, setFilterSeverity] = useState<string>('')
  const [filterResolved, setFilterResolved] = useState<boolean | undefined>(undefined)
  const queryClient = useQueryClient()

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['integrity-stats'],
    queryFn: async () => (await integrityAPI.stats()).data,
    refetchInterval: 60000,
  })

  const { data: findingsData, isLoading: findingsLoading } = useQuery({
    queryKey: ['integrity-findings', filterSeverity, filterResolved],
    queryFn: async () => {
      const params: Record<string, unknown> = { limit: 200 }
      if (filterSeverity) params.severity = filterSeverity
      if (filterResolved !== undefined) params.resolved = filterResolved
      return (await integrityAPI.findings(params)).data
    },
    refetchInterval: 60000,
  })

  const runMutation = useMutation({
    mutationFn: () => integrityAPI.run(),
    onSuccess: (data) => {
      const result = data.data
      toast.success(`Integrity check complete: ${result.findings_count} findings`)
      queryClient.invalidateQueries({ queryKey: ['integrity-stats'] })
      queryClient.invalidateQueries({ queryKey: ['integrity-findings'] })
    },
    onError: () => toast.error('Integrity check failed'),
  })

  const resolveMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => integrityAPI.resolve(id, note),
    onSuccess: () => {
      toast.success('Finding resolved')
      queryClient.invalidateQueries({ queryKey: ['integrity-stats'] })
      queryClient.invalidateQueries({ queryKey: ['integrity-findings'] })
    },
  })

  const findings: IntegrityFinding[] = findingsData?.items ?? []
  const unresolved = findings.filter(f => !f.resolved)
  const resolved = findings.filter(f => f.resolved)

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h1 style={s.headerTitle}>Data Integrity</h1>
          <p style={s.headerSubtitle}>Automated consistency checks across attendance data</p>
        </div>
        <Button variant="default" size="md"
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending}
          loading={runMutation.isPending}>
          <RefreshCw size={15} className={runMutation.isPending ? 'animate-spin' : ''} />
          Run Integrity Check
        </Button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
        {/* Total Unresolved */}
        <div style={s.kpiCard}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${(stats?.total_unresolved ?? 0) > 0 ? '#F59E0B' : '#10B981'}15, ${(stats?.total_unresolved ?? 0) > 0 ? '#F59E0B' : '#10B981'}05)`, border: `1px solid ${(stats?.total_unresolved ?? 0) > 0 ? '#F59E0B' : '#10B981'}25` }}>
            <Shield size={20} color={(stats?.total_unresolved ?? 0) > 0 ? '#F59E0B' : '#10B981'} />
          </div>
          <div style={{ marginTop: '12px' }}>
            {statsLoading ? (
              <div style={{ height: '28px', width: '60px', background: 'var(--pz-surface-3)', borderRadius: '6px' }} />
            ) : (
              <p style={{ fontSize: '24px', fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>{stats?.total_unresolved ?? 0}</p>
            )}
            <p style={{ fontSize: '12px', color: 'var(--pz-text-muted)', margin: 0, marginTop: '4px' }}>Total Unresolved</p>
          </div>
        </div>

        {/* Errors / Critical */}
        <div style={s.kpiCard}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #EF444415, #EF444405)', border: '1px solid #EF444425' }}>
            <AlertCircle size={20} color="#EF4444" />
          </div>
          <div style={{ marginTop: '12px' }}>
            {statsLoading ? (
              <div style={{ height: '28px', width: '60px', background: 'var(--pz-surface-3)', borderRadius: '6px' }} />
            ) : (
              <p style={{ fontSize: '24px', fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>{(stats?.unresolved_by_severity?.error ?? 0) + (stats?.unresolved_by_severity?.critical ?? 0)}</p>
            )}
            <p style={{ fontSize: '12px', color: 'var(--pz-text-muted)', margin: 0, marginTop: '4px' }}>Errors / Critical</p>
          </div>
        </div>

        {/* Warnings */}
        <div style={s.kpiCard}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #F59E0B15, #F59E0B05)', border: '1px solid #F59E0B25' }}>
            <AlertTriangle size={20} color="#F59E0B" />
          </div>
          <div style={{ marginTop: '12px' }}>
            {statsLoading ? (
              <div style={{ height: '28px', width: '60px', background: 'var(--pz-surface-3)', borderRadius: '6px' }} />
            ) : (
              <p style={{ fontSize: '24px', fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>{stats?.unresolved_by_severity?.warning ?? 0}</p>
            )}
            <p style={{ fontSize: '12px', color: 'var(--pz-text-muted)', margin: 0, marginTop: '4px' }}>Warnings</p>
          </div>
        </div>

        {/* Resolved (24h) */}
        <div style={s.kpiCard}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #10B98115, #10B98105)', border: '1px solid #10B98125' }}>
            <CheckCircle size={20} color="#10B981" />
          </div>
          <div style={{ marginTop: '12px' }}>
            {statsLoading ? (
              <div style={{ height: '28px', width: '60px', background: 'var(--pz-surface-3)', borderRadius: '6px' }} />
            ) : (
              <p style={{ fontSize: '24px', fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>{stats?.resolved_last_24h ?? 0}</p>
            )}
            <p style={{ fontSize: '12px', color: 'var(--pz-text-muted)', margin: 0, marginTop: '4px' }}>Resolved (24h)</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value)}
          className="px-3 py-2 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-xs font-semibold text-[var(--pz-text-secondary)]"
        >
          <option value="">All Severities</option>
          <option value="critical">Critical</option>
          <option value="error">Error</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
        <select
          value={filterResolved === undefined ? '' : filterResolved ? 'resolved' : 'unresolved'}
          onChange={(e) => {
            if (e.target.value === '') setFilterResolved(undefined)
            else setFilterResolved(e.target.value === 'resolved')
          }}
          className="px-3 py-2 rounded-xl bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-xs font-semibold text-[var(--pz-text-secondary)]"
        >
          <option value="">All Status</option>
          <option value="unresolved">Unresolved</option>
          <option value="resolved">Resolved</option>
        </select>
        <span className="text-xs" style={{ color: 'var(--pz-text-muted)' }}>
          {findings.length} findings
        </span>
      </div>

      {/* Findings List */}
      {findingsLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 rounded-xl bg-[var(--pz-surface-1)] animate-pulse" />
          ))}
        </div>
      ) : findings.length === 0 ? (
        <div className="text-center py-16">
          <Shield size={40} className="mx-auto" style={{ color: 'var(--pz-text-faint)', marginBottom: '12px' }} />
          <p className="text-sm" style={{ color: 'var(--pz-text-muted)', margin: 0 }}>No integrity findings</p>
          <p className="text-xs" style={{ color: 'var(--pz-text-faint)', marginTop: '4px', margin: 0 }}>Run an integrity check to scan for issues</p>
        </div>
      ) : (
        <div className="space-y-2">
          {findings.map((finding) => {
            const config = severityConfig[finding.severity] || severityConfig.info
            const Icon = config.icon
            return (
              <div
                key={finding.id}
                className={`p-4 rounded-xl border flex items-start gap-4 ${config.bg} ${finding.resolved ? 'opacity-50' : ''}`}
              >
                <Icon size={18} className={`${config.color} mt-0.5 flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] font-bold uppercase tracking-wider bg-black/30 px-1.5 py-0.5 rounded">
                      {finding.severity}
                    </span>
                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--pz-text-muted)' }}>
                      {categoryLabels[finding.check_category] || finding.check_category}
                    </span>
                    <span className="text-[9px] font-mono" style={{ color: 'var(--pz-text-faint)' }}>
                      {format(new Date(finding.created_at), 'MMM d, HH:mm')}
                    </span>
                    {finding.resolved && (
                      <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                        RESOLVED
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--pz-text-secondary)', margin: 0 }}>{finding.check_name}</p>
                  <p className="text-xs" style={{ color: 'var(--pz-text-tertiary)', margin: 0, marginTop: '2px' }}>{finding.message}</p>
                  {finding.affected_count > 0 && (
                    <p className="text-[10px]" style={{ color: 'var(--pz-text-faint)', marginTop: '4px', margin: 0 }}>
                      Affected: {finding.affected_count} {finding.affected_entity_type || 'records'}
                    </p>
                  )}
                  {finding.resolved && finding.resolution_note && (
                    <p className="text-[10px]" style={{ color: 'rgba(52,211,153,0.7)', marginTop: '4px', margin: 0 }}>
                      Resolution: {finding.resolution_note}
                    </p>
                  )}
                </div>
                {!finding.resolved && (
                  <button
                    onClick={() => resolveMutation.mutate({ id: finding.id })}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--pz-surface-2)] hover:bg-[var(--pz-surface-3)] border border-[var(--pz-border)] text-[10px] font-bold text-[var(--pz-text-muted)] hover:text-[var(--pz-text-secondary)] transition-colors flex-shrink-0"
                  >
                    <CheckCircle size={10} /> Resolve
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
