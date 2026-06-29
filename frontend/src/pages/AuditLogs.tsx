import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ScrollText, Download, ArrowRight, User, Globe, Server } from 'lucide-react'
import { auditAPI } from '@/api/client'
import { format } from 'date-fns'
import { PageHeader } from '@/components/ui/PageHeader'
import { FilterBar } from '@/components/ui/FilterBar'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DataTable, type ColumnDef } from '@/components/ui/data-table/DataTable'
import { DetailDrawer } from '@/components/ui/DetailDrawer'
import { Button } from '@/components/ui/button'

interface AuditLogEntry {
  id: string
  action: string
  entity_type: string
  entity_id?: string
  user_id?: string
  username?: string
  user_full_name?: string
  details?: Record<string, unknown>
  previous_value?: Record<string, unknown> | null
  new_value?: Record<string, unknown> | null
  ip_address?: string
  user_agent?: string
  endpoint?: string
  request_method?: string
  created_at?: string
  timestamp?: string
  [key: string]: unknown
}

const actionColors: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
  create: 'success',
  update: 'warning',
  delete: 'danger',
  login: 'info',
  logout: 'info',
  export: 'info',
  deactivate: 'warning',
  login_failed: 'danger',
  change_password: 'warning',
  bulk_assign_department: 'info',
  bulk_assign_shift: 'info',
}

const methodColors: Record<string, string> = {
  POST: 'text-[var(--pz-success-500)]',
  PUT: 'text-[var(--pz-warning-500)]',
  DELETE: 'text-[var(--pz-danger-500)]',
  PATCH: 'text-purple-400',
}

function ValueDiff({ previous, current }: { previous: Record<string, unknown> | null | undefined; current: Record<string, unknown> | null | undefined }) {
  if (!previous && !current) return <span className="text-[var(--pz-text-muted)] text-xs">No data</span>

  const allKeys = new Set([
    ...Object.keys(previous || {}),
    ...Object.keys(current || {}),
  ])

  const changedKeys = Array.from(allKeys).filter(key => {
    const p = previous?.[key]
    const c = current?.[key]
    return JSON.stringify(p) !== JSON.stringify(c)
  })

  if (changedKeys.length === 0) {
    return <span className="text-[var(--pz-text-muted)] text-xs">No changes detected</span>
  }

  return (
    <div className="space-y-1">
      {changedKeys.map(key => {
        const pVal = previous?.[key]
        const cVal = current?.[key]
        return (
          <div key={key} className="flex items-start gap-2 text-xs">
            <span className="text-[var(--pz-text-muted)] font-mono min-w-[100px] shrink-0 pt-0.5">{key}</span>
            <span className="text-[var(--pz-danger-500)] line-through break-all">{String(pVal ?? '—')}</span>
            <ArrowRight size={10} className="text-[var(--pz-text-muted)] mt-0.5 shrink-0" />
            <span className="text-[var(--pz-success-500)] break-all">{String(cVal ?? '—')}</span>
          </div>
        )
      })}
    </div>
  )
}

const columns: ColumnDef<AuditLogEntry, unknown>[] = [
  {
    accessorKey: 'created_at',
    header: 'Time',
    cell: ({ getValue }) => {
      const val = getValue() as string
      if (!val) return <span className="text-[var(--pz-text-muted)] font-mono text-xs">—</span>
      return (
        <span className="text-[var(--pz-text-secondary)] font-mono tabular-nums text-xs">
          {format(new Date(val), 'MMM d, HH:mm:ss')}
        </span>
      )
    },
    size: 150,
  },
  {
    accessorKey: 'action',
    header: 'Action',
    cell: ({ getValue }) => {
      const action = getValue() as string
      const status = actionColors[action.toLowerCase()] || 'info'
      return <StatusBadge status={status} size="xs" dot={false}>{action}</StatusBadge>
    },
    size: 130,
  },
  {
    accessorKey: 'request_method',
    header: 'Method',
    cell: ({ getValue }) => {
      const method = getValue() as string
      if (!method) return <span className="text-[var(--pz-text-muted)] text-xs">—</span>
      return (
        <span className={`text-xs font-mono font-bold ${methodColors[method] || 'text-[var(--pz-text-muted)]'}`}>
          {method}
        </span>
      )
    },
    size: 70,
  },
  {
    accessorKey: 'username',
    header: 'User',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-[var(--pz-surface-2)] border border-[var(--pz-border)] flex items-center justify-center">
          <span className="text-[9px] font-bold text-[var(--pz-text-muted)]">{(row.original.username || '?')[0]?.toUpperCase()}</span>
        </div>
        <span className="text-[var(--pz-text)] text-xs font-medium">{row.original.username || 'System'}</span>
      </div>
    ),
    size: 140,
  },
  {
    accessorKey: 'entity_type',
    header: 'Entity',
    cell: ({ row }) => (
      <span className="text-[var(--pz-text-muted)] text-xs capitalize">
        {row.original.entity_type?.replace(/_/g, ' ') || '—'}
        {row.original.entity_id && <span className="text-[var(--pz-text-muted)] font-mono ml-1">#{String(row.original.entity_id).slice(0, 8)}</span>}
      </span>
    ),
  },
  {
    accessorKey: 'endpoint',
    header: 'Endpoint',
    cell: ({ getValue }) => {
      const endpoint = getValue() as string
      if (!endpoint) return <span className="text-[var(--pz-text-muted)] text-xs">—</span>
      return <span className="text-[var(--pz-text-muted)] font-mono text-[10px] truncate max-w-[200px] block">{endpoint}</span>
    },
    size: 200,
  },
  {
    accessorKey: 'ip_address',
    header: 'IP',
    cell: ({ getValue }) => <span className="text-[var(--pz-text-muted)] font-mono text-[11px]">{(getValue() as string) || '—'}</span>,
    size: 120,
  },
]

export default function AuditLogs() {
  const [searchValue, setSearchValue] = useState('')
  const [filterValues, setFilterValues] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page, searchValue, filterValues],
    queryFn: async () => (await auditAPI.list({
      page,
      per_page: 20,
      search: searchValue || undefined,
      action: filterValues.action || undefined,
      entity_type: filterValues.entity_type || undefined,
      request_method: filterValues.method || undefined,
      username: filterValues.username || undefined,
    })).data,
  })

  const { data: actionTypes } = useQuery({
    queryKey: ['audit-actions'],
    queryFn: async () => (await auditAPI.getActions()).data,
  })

  const { data: entityTypes } = useQuery({
    queryKey: ['audit-entity-types'],
    queryFn: async () => (await auditAPI.getEntityTypes()).data,
  })

  const logs: AuditLogEntry[] = data?.items ?? []

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      const params: Record<string, string> = {}
      if (filterValues.action) params.action = filterValues.action
      if (filterValues.entity_type) params.entity_type = filterValues.entity_type
      if (filterValues.username) params.username = filterValues.username

      const response = await auditAPI.export({ ...params, format })
      const blob = new Blob([response.data])
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit_logs_${new Date().toISOString().split('T')[0]}.${format}`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch {
      // silent
    }
  }

  return (
    <div className="space-y-5 pz-slide-up">
      <PageHeader
        title="Audit Logs"
        subtitle="Complete system audit trail with before/after comparison"
        breadcrumbs={[{ label: 'Administration' }, { label: 'Audit Logs' }]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="md" onClick={() => handleExport('csv')}>
              <Download size={14} />
              CSV
            </Button>
            <Button variant="outline" size="md" onClick={() => handleExport('json')}>
              <Download size={14} />
              JSON
            </Button>
          </div>
        }
      />

      <DataTable
        data={logs}
        columns={columns}
        loading={isLoading}
        onRowClick={(log) => setSelectedLog(log)}
        totalRows={data?.total}
        totalPages={data?.pages}
        currentPage={page}
        onPageChange={setPage}
        toolbar={
          <FilterBar
            searchValue={searchValue}
            onSearchChange={(v) => { setSearchValue(v); setPage(1) }}
            searchPlaceholder="Search by user, action, entity..."
            filters={[
              {
                id: 'action',
                label: 'Action',
                type: 'select',
                options: (actionTypes?.items || []).map((a: string) => ({ value: a, label: a })),
              },
              {
                id: 'entity_type',
                label: 'Entity',
                type: 'select',
                options: (entityTypes?.items || []).map((e: string) => ({ value: e, label: e })),
              },
              {
                id: 'method',
                label: 'Method',
                type: 'select',
                options: [
                  { value: 'POST', label: 'POST' },
                  { value: 'PUT', label: 'PUT' },
                  { value: 'DELETE', label: 'DELETE' },
                  { value: 'PATCH', label: 'PATCH' },
                ],
              },
              {
                id: 'username',
                label: 'User',
                type: 'select',
                options: [],
              },
            ]}
            filterValues={filterValues}
            onFilterChange={(id, value) => { setFilterValues(prev => ({ ...prev, [id]: value })); setPage(1) }}
            onClearAll={() => { setFilterValues({}); setPage(1) }}
          />
        }
      />

      <DetailDrawer
        open={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title={selectedLog ? `${selectedLog.action} · ${selectedLog.entity_type || ''}` : ''}
        subtitle={selectedLog ? format(new Date(selectedLog.created_at || selectedLog.timestamp || ''), 'MMMM d, yyyy HH:mm:ss') : ''}
        width={700}
      >
        {selectedLog && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Action + Method header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', paddingBottom: '20px', borderBottom: '1px solid var(--pz-border)' }}>
              <div style={{ padding: '14px', borderRadius: '6px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', flexShrink: 0 }}>
                <ScrollText size={22} style={{ color: 'var(--pz-accent)' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <StatusBadge status={actionColors[selectedLog.action.toLowerCase()] || 'info'} size="md" dot={false}>
                  {selectedLog.action}
                </StatusBadge>
                {selectedLog.request_method && (
                  <span className={`text-xs font-mono font-bold ${methodColors[selectedLog.request_method] || 'text-[var(--pz-text-muted)]'}`}>
                    {selectedLog.request_method}
                  </span>
                )}
              </div>
            </div>

            {/* Event details table */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Event Details</h4>
              <div style={{ border: '1px solid var(--pz-border)', borderRadius: '6px', overflow: 'hidden' }}>
                {([
                  ['Action', selectedLog.action],
                  ['Entity Type', selectedLog.entity_type || '—'],
                  ['Entity ID', selectedLog.entity_id || '—'],
                  ['User', selectedLog.username || 'System'],
                  ['IP Address', selectedLog.ip_address || '—'],
                  ['Endpoint', selectedLog.endpoint || '—'],
                  ['Timestamp', format(new Date(selectedLog.created_at || selectedLog.timestamp || ''), 'MMM d, yyyy HH:mm:ss')],
                  ...(selectedLog.user_agent ? [['User Agent', selectedLog.user_agent]] : []),
                ] as [string, string][]).map(([label, value], i, arr) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '44px', paddingBlock: '8px', paddingInline: '14px', borderBottom: i < arr.length - 1 ? '1px solid var(--pz-border)' : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--pz-text-muted)', flexShrink: 0, marginRight: '16px' }}>{label}</span>
                    <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--pz-text-secondary)', fontFamily: 'monospace', textAlign: 'right', maxWidth: '340px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={value}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Change comparison diff */}
            {(selectedLog.previous_value || selectedLog.new_value) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Change Comparison</h4>
                <div style={{ border: '1px solid var(--pz-border)', borderRadius: '6px', padding: '16px', background: 'var(--pz-surface-2)' }}>
                  <ValueDiff previous={selectedLog.previous_value} current={selectedLog.new_value} />
                </div>
              </div>
            )}

            {/* Additional details JSON */}
            {selectedLog.details && Object.keys(selectedLog.details).length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Additional Details</h4>
                <pre style={{ fontSize: '11px', color: 'var(--pz-text-muted)', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', borderRadius: '6px', padding: '16px', overflowX: 'auto', fontFamily: 'monospace', maxHeight: '200px', margin: 0 }}>
                  {JSON.stringify(selectedLog.details, null, 2)}
                </pre>
              </div>
            )}

            {/* Previous / New state */}
            {selectedLog.previous_value && Object.keys(selectedLog.previous_value).length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Previous State</h4>
                <pre style={{ fontSize: '11px', color: 'var(--pz-text-muted)', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', borderRadius: '6px', padding: '16px', overflowX: 'auto', fontFamily: 'monospace', maxHeight: '200px', margin: 0 }}>
                  {JSON.stringify(selectedLog.previous_value, null, 2)}
                </pre>
              </div>
            )}

            {selectedLog.new_value && Object.keys(selectedLog.new_value).length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>New State</h4>
                <pre style={{ fontSize: '11px', color: 'var(--pz-text-muted)', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', borderRadius: '6px', padding: '16px', overflowX: 'auto', fontFamily: 'monospace', maxHeight: '200px', margin: 0 }}>
                  {JSON.stringify(selectedLog.new_value, null, 2)}
                </pre>
              </div>
            )}

          </div>
        )}
      </DetailDrawer>
    </div>
  )
}
