import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Clock, Search, Building2, Users, UserCheck, UserX, AlertTriangle, Info, Trash2, Edit3, Shield, Lightbulb } from 'lucide-react'
import { departmentsAPI, analyticsAPI, shiftProtocolsAPI, officesAPI, schedulingAPI } from '@/api/client'
import { format } from 'date-fns'
import type { Department } from '@/types'
import { MetricRing } from '@/components/ui/MetricRing'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DetailDrawer } from '@/components/ui/DetailDrawer'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/button'
import { useDeptSummaryStore } from '@/stores/deptSummaryStore'
import { Section, SectionHeader } from '@/components/ui/CardSection'
import { toast } from 'sonner'

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
  summaryRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: '12px',
  },
  summaryCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    background: 'var(--pz-surface-1)',
    border: '1px solid var(--pz-border)',
    borderRadius: '10px',
    padding: '20px',
  },
  summaryIcon: (bg: string) => ({
    width: '42px',
    height: '42px',
    borderRadius: '10px',
    background: bg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  }),
  summaryValue: {
    fontSize: '20px',
    fontWeight: 700,
    color: 'var(--pz-text)',
    margin: 0,
    lineHeight: 1.1,
  },
  summaryLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--pz-text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    margin: '2px 0 0 0',
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '16px',
  },
  deptCard: {
    background: 'var(--pz-surface-1)',
    border: '1px solid var(--pz-border)',
    borderRadius: '10px',
    padding: '20px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  deptCardBody: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: '16px',
  },
  infoRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: '52px',
    paddingBlock: '12px',
    paddingInline: '16px',
    borderBottom: '1px solid var(--pz-border)',
  },
  infoLabel: {
    fontSize: '12px',
    color: 'var(--pz-text-muted)',
    flexShrink: 0,
  },
  infoValue: {
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--pz-text-secondary)',
    textAlign: 'right' as const,
    maxWidth: '260px',
  },
  filterChips: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap' as const,
  },
  chip: (active: boolean) => ({
    padding: '6px 14px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: 600,
    border: active ? '1px solid var(--pz-accent)' : '1px solid var(--pz-border)',
    background: active ? 'var(--pz-accent)' : 'var(--pz-surface-1)',
    color: active ? '#fff' : 'var(--pz-text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  }),
}

const summaryCards = [
  { key: 'total', icon: Building2, bg: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(99,102,241,0.2))', color: 'var(--pz-accent)', label: 'Total Departments', valueKey: '' },
  { key: 'active', icon: Users, bg: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(52,211,153,0.2))', color: '#10B981', label: 'Active', valueKey: '' },
  { key: 'present', icon: UserCheck, bg: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(5,150,105,0.2))', color: '#10B981', label: 'Present Today', valueKey: '' },
  { key: 'late', icon: AlertTriangle, bg: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(251,191,36,0.2))', color: '#F59E0B', label: 'Late Today', valueKey: '' },
  { key: 'absent', icon: UserX, bg: 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(248,113,113,0.2))', color: '#EF4444', label: 'Absent Today', valueKey: '' },
]

export default function Departments() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchValue, setSearchValue] = useState('')
  const [selectedDept, setSelectedDept] = useState<Department | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingDept, setEditingDept] = useState<Department | null>(null)
  const [deletingDept, setDeletingDept] = useState<Department | null>(null)

  // Active protocol per department
  const { data: activeProtocolsData } = useQuery({
    queryKey: ['active-dept-protocols', selectedDept?.id],
    queryFn: () => schedulingAPI.activeProtocol(selectedDept!.id),
    enabled: !!selectedDept,
    select: (d) => d.data as { id: string; protocol_id: string; protocol_name?: string; effective_date: string; end_date?: string } | null,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => departmentsAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] })
      setDeletingDept(null)
      setSelectedDept(null)
      toast.success('Department deleted')
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to delete'),
  })
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const today = format(new Date(), 'yyyy-MM-dd')

  const { data, isLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => (await departmentsAPI.list()).data,
  })

  const departments: Department[] = Array.isArray(data) ? data : data?.items ?? []

  const { data: summaries } = useQuery({
    queryKey: ['dept-summaries', today],
    queryFn: async () => (await analyticsAPI.getDepartmentsSummary(today)).data,
    refetchInterval: 60000,
  })

  useEffect(() => {
    if (summaries) {
      useDeptSummaryStore.getState().setDepartments(summaries)
    }
  }, [summaries])

  const deptSummaries = useDeptSummaryStore((s) => s.departments)

  const totals = useMemo(() => {
    const vals = Object.values(deptSummaries || {})
    return {
      total: departments.length,
      active: departments.filter(d => d.is_active).length,
      present: vals.reduce((a, s) => a + (s.present_count || 0), 0),
      late: vals.reduce((a, s) => a + (s.late_count || 0), 0),
      absent: vals.reduce((a, s) => a + (s.absent_count || 0), 0),
    }
  }, [departments, deptSummaries])

  const filtered = departments.filter(d => {
    if (statusFilter !== 'all' && (statusFilter === 'active') !== d.is_active) return false
    if (!searchValue.trim()) return true
    const q = searchValue.toLowerCase()
    return d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q)
  })

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h1 style={s.headerTitle}>Departments</h1>
          <p style={s.headerSubtitle}>Organizational structure · {departments.length} departments</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--pz-text-faint)', pointerEvents: 'none' }} />
            <input
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search departments..."
              style={{
                height: '36px',
                width: '220px',
                paddingLeft: '34px',
                paddingRight: '12px',
                fontSize: '13px',
                background: 'var(--pz-surface-1)',
                border: '1px solid var(--pz-border)',
                borderRadius: '8px',
                color: 'var(--pz-text)',
                outline: 'none',
              }}
            />
          </div>
          <Button variant="default" size="md" onClick={() => setShowAddModal(true)}>
            <Plus size={15} />
            Add Department
          </Button>
        </div>
      </div>

      {/* Summary Row */}
      <div style={s.summaryRow}>
        {summaryCards.map(({ key, icon: Icon, bg, color, label }) => (
          <div key={key} style={s.summaryCard}>
            <div style={s.summaryIcon(bg)}>
              <Icon size={18} color={color} />
            </div>
            <div>
              <p style={s.summaryValue}>{totals[key as keyof typeof totals]}</p>
              <p style={s.summaryLabel}>{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Section */}
      <Section>
        <SectionHeader
          icon={<Building2 size={18} />}
          title="All Departments"
          action={
            <div style={s.filterChips}>
              {(['all', 'active', 'inactive'] as const).map(f => (
                <button key={f} onClick={() => setStatusFilter(f)} style={s.chip(statusFilter === f)}>
                  {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          }
        />
        {isLoading ? (
          <div style={s.cardGrid}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ ...s.deptCard, cursor: 'default' }}>
                <div className="pz-skeleton" style={{ height: '16px', width: '140px', borderRadius: '6px' }} />
                <div className="pz-skeleton" style={{ height: '12px', width: '90px', borderRadius: '6px', marginTop: '8px' }} />
                <div className="pz-skeleton" style={{ height: '72px', width: '72px', borderRadius: '50%', margin: '16px auto 0' }} />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--pz-text-muted)' }}>
            <Building2 size={36} style={{ opacity: 0.3, margin: '0 auto 12px' }} />
            <p style={{ fontSize: '14px', fontWeight: 600 }}>No departments found</p>
            <p style={{ fontSize: '12px', marginTop: '4px' }}>Try a different search or add a new department</p>
          </div>
        ) : (
          <div style={s.cardGrid}>
            {filtered.map((dept, i) => {
              const summary = deptSummaries[dept.id]
              const readiness = summary && summary.expected_count > 0
                ? Math.round((summary.present_count / summary.expected_count) * 100)
                : null
              return (
                <motion.div
                  key={dept.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => navigate(`/departments/${dept.id}`)}
                  style={s.deptCard}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--pz-accent)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--pz-border)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div>
                      <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>{dept.name}</h3>
                      <p style={{ fontSize: '12px', color: 'var(--pz-text-muted)', fontFamily: 'monospace', margin: '4px 0 0' }}>{dept.code}</p>
                      {dept.office_name && (
                        <p style={{ fontSize: '12px', color: 'var(--pz-text-muted)', margin: '2px 0 0' }}>{dept.office_name}</p>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingDept(dept) }}
                        title="Edit department"
                        style={{ width: '28px', height: '28px', borderRadius: '6px', border: 'none', background: 'transparent', color: 'var(--pz-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--pz-surface-2)'; (e.currentTarget as HTMLElement).style.color = 'var(--pz-accent)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--pz-text-muted)' }}
                      >
                        <Edit3 size={13} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeletingDept(dept) }}
                        title="Delete department"
                        style={{ width: '28px', height: '28px', borderRadius: '6px', border: 'none', background: 'transparent', color: 'var(--pz-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.1)'; (e.currentTarget as HTMLElement).style.color = 'var(--pz-danger-500)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--pz-text-muted)' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <div style={s.deptCardBody}>
                    <div style={{ flexShrink: 0 }}>
                      {readiness !== null ? (
                        <MetricRing value={readiness} size={72} strokeWidth={5} color="auto" />
                      ) : (
                        <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: '14px', color: 'var(--pz-text-muted)' }}>—</span>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px 20px', textAlign: 'right' }}>
                      <div>
                        <p style={{ fontSize: '11px', color: 'var(--pz-text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.06em', margin: 0 }}>Headcount</p>
                        <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--pz-text)', margin: '2px 0 0' }}>{dept.employee_count}</p>
                      </div>
                      {summary && (
                        <>
                          <div>
                            <p style={{ fontSize: '11px', color: 'var(--pz-text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.06em', margin: 0 }}>Present</p>
                            <p style={{ fontSize: '15px', fontWeight: 700, color: '#10B981', margin: '2px 0 0' }}>{summary.present_count}</p>
                          </div>
                          <div>
                            <p style={{ fontSize: '11px', color: 'var(--pz-text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.06em', margin: 0 }}>Late</p>
                            <p style={{ fontSize: '15px', fontWeight: 700, color: '#F59E0B', margin: '2px 0 0' }}>{summary.late_count}</p>
                          </div>
                          <div>
                            <p style={{ fontSize: '11px', color: 'var(--pz-text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.06em', margin: 0 }}>Absent</p>
                            <p style={{ fontSize: '15px', fontWeight: 700, color: '#EF4444', margin: '2px 0 0' }}>{summary.absent_count}</p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  {dept.head_name && (
                    <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--pz-border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--pz-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--pz-border)' }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--pz-text-muted)' }}>{dept.head_name[0]}</span>
                      </div>
                      <span style={{ fontSize: '12px', color: 'var(--pz-text-muted)' }}>Head: {dept.head_name}</span>
                    </div>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}
      </Section>

      {/* Detail Drawer */}
      <DetailDrawer
        open={!!selectedDept}
        onClose={() => setSelectedDept(null)}
        title={selectedDept?.name || ''}
        subtitle={selectedDept ? `${selectedDept.code} · ${selectedDept.office_name || 'No Office'}` : ''}
        width={700}
      >
        {selectedDept && (() => {
          const summary = deptSummaries[selectedDept.id]
          const readiness = summary && summary.expected_count > 0
            ? Math.round((summary.present_count / summary.expected_count) * 100) : null
          const activeProto = activeProtocolsData
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
              <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: '20px', borderBottom: '1px solid var(--pz-border)' }}>
                {readiness !== null ? (
                  <MetricRing value={readiness} size={120} strokeWidth={8} color="auto" label="Readiness" />
                ) : (
                  <p style={{ fontSize: '14px', color: 'var(--pz-text-muted)' }}>No readiness data</p>
                )}
              </div>
              {summary && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                  {[
                    { label: 'Expected', value: summary.expected_count, color: '#3B82F6' },
                    { label: 'Present', value: summary.present_count, color: '#10B981' },
                    { label: 'Late', value: summary.late_count, color: '#F59E0B' },
                    { label: 'Absent', value: summary.absent_count, color: '#EF4444' },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ padding: '16px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', borderRadius: '10px', textAlign: 'center' }}>
                      <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, marginBottom: '6px' }}>{label}</p>
                      <p style={{ fontSize: '24px', fontWeight: 700, color, margin: 0 }}>{value}</p>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '8px',
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(129,140,248,0.2))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Info size={14} color="var(--pz-accent)" />
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Information</span>
                </div>
                <div style={{ border: '1px solid var(--pz-border)', borderRadius: '10px', overflow: 'hidden' }}>
                  {([
                    ['Code', selectedDept.code],
                    ['Office', selectedDept.office_name || '\u2014'],
                    ['Head', selectedDept.head_name || '\u2014'],
                    ['Headcount', String(selectedDept.employee_count)],
                    ['Status', selectedDept.is_active ? 'Active' : 'Inactive'],
                    ['Protocol', activeProto?.protocol_name || '\u2014'],
                    ['Description', selectedDept.description || '\u2014'],
                    ['Created', format(new Date(selectedDept.created_at), 'MMM d, yyyy')],
                  ] as const).map(([label, value], i, arr) => (
                    <div key={label} style={{ ...s.infoRow, borderBottom: i < arr.length - 1 ? '1px solid var(--pz-border)' : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                      <span style={s.infoLabel}>{label}</span>
                      <span style={s.infoValue}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '12px', paddingTop: '8px', borderTop: '1px solid var(--pz-border)' }}>
                <button
                  onClick={() => { setEditingDept(selectedDept); setSelectedDept(null) }}
                  style={{ flex: 1, padding: '12px', borderRadius: '12px', background: 'var(--pz-accent)', color: '#fff', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.15s' }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.opacity = '0.9')}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = '1')}
                >
                  <Edit3 size={15} /> Edit Department
                </button>
                <button
                  onClick={() => { setDeletingDept(selectedDept); setSelectedDept(null) }}
                  style={{ padding: '12px 20px', borderRadius: '12px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-danger-500)', color: 'var(--pz-danger-500)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.15s' }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--pz-danger-50)')}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'var(--pz-surface-2)')}
                >
                  <Trash2 size={15} /> Delete
                </button>
              </div>
            </div>
          )
        })()}
      </DetailDrawer>

      {/* Add Department Modal */}
      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add New Department"
        description="Create a new organizational department"
        size="md"
      >
        <AddDepartmentForm
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['departments'] })
            setShowAddModal(false)
          }}
          onCancel={() => setShowAddModal(false)}
        />
      </Modal>

      {/* Edit Department Modal */}
      <Modal
        open={!!editingDept}
        onClose={() => setEditingDept(null)}
        title="Edit Department"
        description={editingDept ? `Update ${editingDept.name}` : ''}
        size="md"
      >
        {editingDept && (
          <EditDepartmentForm
            department={editingDept}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['departments'] })
              queryClient.invalidateQueries({ queryKey: ['active-dept-protocols', editingDept.id] })
              setEditingDept(null)
            }}
            onCancel={() => setEditingDept(null)}
          />
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!deletingDept}
        onClose={() => setDeletingDept(null)}
        title="Delete Department"
        description={deletingDept ? `Remove ${deletingDept.name} permanently` : ''}
        size="sm"
        footer={
          <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
            <button
              onClick={() => setDeletingDept(null)}
              style={{ flex: 1, padding: '12px 20px', borderRadius: '12px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', fontSize: '14px', fontWeight: 600, color: 'var(--pz-text-secondary)', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={() => deletingDept && deleteMutation.mutate(deletingDept.id)}
              disabled={deleteMutation.isPending}
              style={{ flex: 1, padding: '12px 20px', borderRadius: '12px', background: 'var(--pz-danger-500)', color: '#fff', fontSize: '14px', fontWeight: 600, border: 'none', cursor: 'pointer', opacity: deleteMutation.isPending ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              {deleteMutation.isPending ? <><Trash2 size={15} className="animate-spin" /> Deleting...</> : <><Trash2 size={15} /> Delete Department</>}
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ fontSize: '14px', color: 'var(--pz-text-muted)' }}>
            This action permanently deletes <strong style={{ color: 'var(--pz-text)' }}>{deletingDept?.name}</strong> and all associated protocol assignments.
          </p>
          {deletingDept && deletingDept.employee_count > 0 && (
            <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={16} color="var(--pz-danger-500)" style={{ flexShrink: 0 }} />
              <p style={{ fontSize: '12px', color: 'var(--pz-danger-500)', margin: 0 }}>
                {deletingDept.employee_count} employee{deletingDept.employee_count !== 1 ? 's' : ''} are assigned to this department. Reassign them before deleting.
              </p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}

function AddDepartmentForm({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void
  onCancel: () => void
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    name: '',
    code: '',
    description: '',
    head_name: '',
    office_id: '',
    shift_protocol_id: '',
  })
  const [showNewProtocol, setShowNewProtocol] = useState(false)
  const [newProtocol, setNewProtocol] = useState({
    name: '',
    code: '',
    description: '',
    protocol_type: 'fixed' as 'fixed' | 'rotating' | 'custom',
    working_hours_start: '08:30',
    working_hours_end: '17:00',
    grace_period_minutes: 15,
    include_weekends: false,
    working_days: [1, 2, 3, 4, 5] as number[],
    days_on: 2,
    days_off: 2,
    day_shift_start: '08:00',
    day_shift_end: '20:00',
    night_shift_start: '20:00',
    night_shift_end: '08:00',
    color: '#3b82f6',
  })

  const { data: officesData } = useQuery({
    queryKey: ['offices-list'],
    queryFn: async () => (await officesAPI.list()).data,
  })

  const { data: protocolsData, isLoading: protocolsLoading } = useQuery({
    queryKey: ['shift-protocols-list'],
    queryFn: async () => (await shiftProtocolsAPI.list()).data,
  })

  const offices = Array.isArray(officesData) ? officesData : officesData?.items ?? []
  const protocols = Array.isArray(protocolsData) ? protocolsData : protocolsData?.items ?? []

  const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => departmentsAPI.create({
      ...data,
      office_id: data.office_id || undefined,
      shift_protocol_id: data.shift_protocol_id || undefined,
    }),
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ['departments'] })
      toast.success('Department created')
      onSuccess()
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to create'),
  })

  const createProtocolMutation = useMutation({
    mutationFn: (data: typeof newProtocol) => {
      const isRotating = data.protocol_type === 'rotating'
      const payload: Record<string, unknown> = {
        name: data.name, code: data.code, description: data.description || null,
        protocol_type: data.protocol_type, color: data.color,
        grace_period_minutes: data.grace_period_minutes,
        include_weekends: data.include_weekends,
      }
      if (isRotating) {
        payload.days_on = data.days_on
        payload.days_off = data.days_off
        payload.day_shift_start = data.day_shift_start || null
        payload.day_shift_end = data.day_shift_end || null
        payload.night_shift_start = data.night_shift_start || null
        payload.night_shift_end = data.night_shift_end || null
        const rot: string[] = []
        for (let i = 0; i < data.days_on; i++) rot.push('day')
        for (let i = 0; i < data.days_off; i++) rot.push('off')
        for (let i = 0; i < data.days_on; i++) rot.push('night')
        for (let i = 0; i < data.days_off; i++) rot.push('off')
        payload.rotation_shifts = rot
        payload.working_days = data.working_days
      } else {
        payload.working_hours_start = data.working_hours_start || null
        payload.working_hours_end = data.working_hours_end || null
        payload.working_days = data.working_days
      }
      return shiftProtocolsAPI.create(payload)
    },
    onSuccess: async (res) => {
      await queryClient.refetchQueries({ queryKey: ['shift-protocols-list'] })
      const createdId = res.data?.id || res.data?.protocol?.id
      if (createdId) {
        setForm(p => ({ ...p, shift_protocol_id: createdId }))
      }
      setShowNewProtocol(false)
      setNewProtocol({
        name: '', code: '', description: '', protocol_type: 'fixed',
        working_hours_start: '08:30', working_hours_end: '17:00',
        grace_period_minutes: 15, include_weekends: false,
        working_days: [1, 2, 3, 4, 5], days_on: 2, days_off: 2,
        day_shift_start: '08:00', day_shift_end: '20:00',
        night_shift_start: '20:00', night_shift_end: '08:00',
        color: '#3b82f6',
      })
      toast.success('Shift protocol created and assigned to department')
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to create protocol'),
  })

  const selectedProtocol = protocols.find((p: any) => p.id === form.shift_protocol_id)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '24px' }}>
      {/* Identity Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '8px',
            background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(99,102,241,0.2))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Users size={14} color="var(--pz-accent)" />
          </div>
          <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Identity</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
              Name <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
            </label>
            <input value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Information Technology"
              className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
              Code <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
            </label>
            <input value={form.code} onChange={(e) => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
              placeholder="e.g. ICT"
              className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }} />
          </div>
        </div>
      </div>

      {/* Assignment Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '8px',
            background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(167,139,250,0.2))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Building2 size={14} color="#8B5CF6" />
          </div>
          <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Assignment</span>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
            Office / Location
          </label>
          <select value={form.office_id} onChange={(e) => setForm(p => ({ ...p, office_id: e.target.value }))}
            className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }}>
            <option value="">Select office</option>
            {offices.map((o: any) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>

        {/* Shift Protocol Section */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)' }}>
              Default Shift Protocol <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
            </label>
            {!showNewProtocol && (
              <button
                onClick={() => setShowNewProtocol(true)}
                style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-accent)', display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <Plus size={12} />
                Create New
              </button>
            )}
          </div>

          <AnimatePresence mode="wait">
          {showNewProtocol && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              style={{
                padding: '16px', borderRadius: '12px',
                border: '1px solid rgba(59,130,246,0.3)',
                background: 'rgba(59,130,246,0.03)',
                display: 'flex', flexDirection: 'column', gap: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--pz-accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>New Shift Protocol</span>
                <button
                  onClick={() => setShowNewProtocol(false)}
                  style={{ fontSize: '10px', color: 'var(--pz-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Cancel
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px', display: 'block' }}>Name *</label>
                  <input value={newProtocol.name} onChange={(e) => setNewProtocol(p => ({ ...p, name: e.target.value }))}
                    placeholder="Standard Day Shift"
                    className="pz-input w-full" style={{ height: '38px', fontSize: '13px' }} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px', display: 'block' }}>Code *</label>
                  <input value={newProtocol.code} onChange={(e) => setNewProtocol(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                    placeholder="SDS"
                    className="pz-input w-full" style={{ height: '38px', fontSize: '13px' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px', display: 'block' }}>Type</label>
                  <select value={newProtocol.protocol_type}
                    onChange={(e) => setNewProtocol(p => ({ ...p, protocol_type: e.target.value as 'fixed' | 'rotating' | 'custom' }))}
                    className="pz-input w-full" style={{ height: '38px', fontSize: '13px' }}>
                    <option value="fixed">Fixed</option>
                    <option value="rotating">Rotating</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px', display: 'block' }}>Grace Period (min)</label>
                  <input type="number" value={newProtocol.grace_period_minutes}
                    onChange={(e) => setNewProtocol(p => ({ ...p, grace_period_minutes: Number(e.target.value) }))}
                    className="pz-input w-full" style={{ height: '38px', fontSize: '13px' }} />
                </div>
              </div>

              {newProtocol.protocol_type === 'rotating' ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px', display: 'block' }}>Days On</label>
                      <input type="number" min={1} max={7} value={newProtocol.days_on}
                        onChange={(e) => setNewProtocol(p => ({ ...p, days_on: Number(e.target.value) || 1 }))}
                        className="pz-input w-full" style={{ height: '38px', fontSize: '13px' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px', display: 'block' }}>Days Off</label>
                      <input type="number" min={1} max={7} value={newProtocol.days_off}
                        onChange={(e) => setNewProtocol(p => ({ ...p, days_off: Number(e.target.value) || 1 }))}
                        className="pz-input w-full" style={{ height: '38px', fontSize: '13px' }} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px', display: 'block' }}>Day Shift Start</label>
                      <input type="time" value={newProtocol.day_shift_start}
                        onChange={(e) => setNewProtocol(p => ({ ...p, day_shift_start: e.target.value }))}
                        className="pz-input w-full" style={{ height: '38px', fontSize: '13px' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px', display: 'block' }}>Day Shift End</label>
                      <input type="time" value={newProtocol.day_shift_end}
                        onChange={(e) => setNewProtocol(p => ({ ...p, day_shift_end: e.target.value }))}
                        className="pz-input w-full" style={{ height: '38px', fontSize: '13px' }} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px', display: 'block' }}>Night Shift Start</label>
                      <input type="time" value={newProtocol.night_shift_start}
                        onChange={(e) => setNewProtocol(p => ({ ...p, night_shift_start: e.target.value }))}
                        className="pz-input w-full" style={{ height: '38px', fontSize: '13px' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px', display: 'block' }}>Night Shift End</label>
                      <input type="time" value={newProtocol.night_shift_end}
                        onChange={(e) => setNewProtocol(p => ({ ...p, night_shift_end: e.target.value }))}
                        className="pz-input w-full" style={{ height: '38px', fontSize: '13px' }} />
                    </div>
                  </div>
                  {/* Rotation pattern preview */}
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px', display: 'block' }}>Rotation: {
                      Array.from({ length: newProtocol.days_on }, () => 'D').join(' ') +
                      ' ' + Array.from({ length: newProtocol.days_off }, () => 'O').join(' ') +
                      ' ' + Array.from({ length: newProtocol.days_on }, () => 'N').join(' ') +
                      ' ' + Array.from({ length: newProtocol.days_off }, () => 'O').join(' ') +
                      ' ↻'
                    }</label>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {(() => {
                        const seq: { label: string; type: string }[] = []
                        for (let i = 0; i < newProtocol.days_on; i++) seq.push({ label: 'D', type: 'day' })
                        for (let i = 0; i < newProtocol.days_off; i++) seq.push({ label: 'O', type: 'off' })
                        for (let i = 0; i < newProtocol.days_on; i++) seq.push({ label: 'N', type: 'night' })
                        for (let i = 0; i < newProtocol.days_off; i++) seq.push({ label: 'O', type: 'off' })
                        return seq.map((s, i) => {
                          const badgeStyle = s.type === 'day'
                            ? { background: 'rgba(245,158,11,0.15)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.2)' }
                            : s.type === 'night'
                            ? { background: 'rgba(99,102,241,0.15)', color: '#818CF8', border: '1px solid rgba(99,102,241,0.2)' }
                            : { background: 'rgba(113,113,122,0.15)', color: '#A1A1AA', border: '1px solid rgba(113,113,122,0.2)' }
                          return (
                            <span key={i} style={{
                              width: '28px', height: '28px', display: 'flex',
                              alignItems: 'center', justifyContent: 'center',
                              borderRadius: '6px', fontSize: '9px', fontWeight: 700,
                              ...badgeStyle,
                            }}>{s.label}</span>
                          )
                        })
                      })()}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px', display: 'block' }}>Start Time</label>
                      <input type="time" value={newProtocol.working_hours_start}
                        onChange={(e) => setNewProtocol(p => ({ ...p, working_hours_start: e.target.value }))}
                        className="pz-input w-full" style={{ height: '38px', fontSize: '13px' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px', display: 'block' }}>End Time</label>
                      <input type="time" value={newProtocol.working_hours_end}
                        onChange={(e) => setNewProtocol(p => ({ ...p, working_hours_end: e.target.value }))}
                        className="pz-input w-full" style={{ height: '38px', fontSize: '13px' }} />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px', display: 'block' }}>Working Days</label>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {DAYS_SHORT.map((day, idx) => (
                        <button
                          key={day}
                          onClick={() => setNewProtocol(p => ({
                            ...p,
                            working_days: p.working_days.includes(idx + 1)
                              ? p.working_days.filter(d => d !== idx + 1)
                              : [...p.working_days, idx + 1].sort(),
                          }))}
                          style={{
                            width: '36px', height: '36px', borderRadius: '8px',
                            fontSize: '10px', fontWeight: 700, cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            border: newProtocol.working_days.includes(idx + 1)
                              ? '1px solid rgba(59,130,246,0.3)'
                              : '1px solid var(--pz-border)',
                            background: newProtocol.working_days.includes(idx + 1)
                              ? 'rgba(59,130,246,0.2)'
                              : 'var(--pz-surface-2)',
                            color: newProtocol.working_days.includes(idx + 1)
                              ? 'var(--pz-accent)'
                              : 'var(--pz-text-faint)',
                          }}
                        >
                          {day[0]}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <button
                onClick={() => createProtocolMutation.mutate(newProtocol)}
                disabled={!newProtocol.name || !newProtocol.code || createProtocolMutation.isPending}
                style={{
                  width: '100%', paddingBlock: '10px', borderRadius: '8px',
                  background: 'linear-gradient(135deg, var(--pz-accent), #3B82F6)',
                  color: '#fff', fontSize: '11px', fontWeight: 700,
                  border: 'none', cursor: 'pointer',
                  opacity: (!newProtocol.name || !newProtocol.code || createProtocolMutation.isPending) ? 0.5 : 1,
                }}
              >
                {createProtocolMutation.isPending ? 'Creating Protocol...' : 'Create Protocol & Assign'}
              </button>
            </motion.div>
          )}
          </AnimatePresence>

          {!showNewProtocol && (
            <>
              <select
                value={form.shift_protocol_id}
                onChange={(e) => setForm(p => ({ ...p, shift_protocol_id: e.target.value }))}
                className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }}
              >
                {protocolsLoading ? (
                  <option>Loading protocols...</option>
                ) : protocols.length === 0 ? (
                  <option value="">No protocols — create one above</option>
                ) : (
                  <>
                    <option value="">Select protocol</option>
                    {protocols.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </>
                )}
              </select>
              {protocols.length === 0 && !protocolsLoading && (
                <p style={{ fontSize: '11px', color: '#F59E0B', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  No shift protocols exist. Click "Create New" above to define one.
                </p>
              )}
              {selectedProtocol && (
                <div style={{ marginTop: '12px', padding: '12px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <Clock size={14} style={{ color: 'var(--pz-accent)' }} />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-accent)' }}>{selectedProtocol.protocol_type}</span>
                    <span style={{ fontSize: '11px', color: 'var(--pz-text-muted)', fontFamily: 'monospace' }}>
                      {selectedProtocol.working_hours_start ?? '—'} – {selectedProtocol.working_hours_end ?? '—'}
                    </span>
                  </div>
                  {selectedProtocol.description && (
                    <p style={{ fontSize: '12px', color: 'var(--pz-text-muted)' }}>{selectedProtocol.description}</p>
                  )}
                </div>
              )}
              <p style={{ fontSize: '11px', color: 'var(--pz-text-faint)', marginTop: '8px' }}>
                This protocol applies to all employees in this department by default.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Management Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '8px',
            background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(52,211,153,0.2))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <UserCheck size={14} color="#10B981" />
          </div>
          <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Management</span>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
            Head of Department
          </label>
          <input value={form.head_name} onChange={(e) => setForm(p => ({ ...p, head_name: e.target.value }))}
            placeholder="e.g. Jane Smith"
            className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }} />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
            Description
          </label>
          <textarea value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
            rows={3} placeholder="Department purpose and responsibilities..."
            className="pz-input w-full" style={{ height: 'auto', minHeight: '88px', fontSize: '14px', resize: 'none' }} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', paddingTop: '16px', borderTop: '1px solid var(--pz-border)', marginTop: '20px' }}>
        <Button variant="outline" size="md" onClick={onCancel}>Cancel</Button>
        <Button variant="default" size="md"
          loading={createMutation.isPending}
          disabled={!form.name || !form.code || !form.shift_protocol_id || createMutation.isPending}
          onClick={() => createMutation.mutate(form)}>
          {createMutation.isPending ? 'Creating...' : 'Create Department'}
        </Button>
      </div>
    </div>
  )
}

function EditDepartmentForm({
  department,
  onSuccess,
  onCancel,
}: {
  department: Department
  onSuccess: () => void
  onCancel: () => void
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    name: department.name,
    code: department.code,
    description: department.description || '',
    head_name: department.head_name || '',
    office_id: department.office_id || '',
    is_active: department.is_active !== false,
    shift_protocol_id: '',
  })
  const [showNewProtocol, setShowNewProtocol] = useState(false)
  const [newProtocol, setNewProtocol] = useState({
    name: '', code: '', description: '', protocol_type: 'fixed' as 'fixed' | 'rotating' | 'custom',
    working_hours_start: '08:30', working_hours_end: '17:00',
    grace_period_minutes: 15, include_weekends: false,
    working_days: [1, 2, 3, 4, 5] as number[],
    days_on: 2, days_off: 2,
    day_shift_start: '08:00', day_shift_end: '20:00',
    night_shift_start: '20:00', night_shift_end: '08:00',
    color: '#3b82f6',
  })

  const { data: officesData } = useQuery({
    queryKey: ['offices-list'],
    queryFn: async () => (await officesAPI.list()).data,
  })
  const { data: protocolsData, isLoading: protocolsLoading } = useQuery({
    queryKey: ['shift-protocols-list'],
    queryFn: async () => (await shiftProtocolsAPI.list()).data,
  })
  // Fetch currently assigned protocol for this department
  const { data: assignedProto } = useQuery({
    queryKey: ['dept-assigned-protocol', department.id],
    queryFn: () => schedulingAPI.activeProtocol(department.id),
    select: (d: any) => d.data as { id: string; protocol_id: string; protocol_name?: string } | null,
  })

  const offices = Array.isArray(officesData) ? officesData : officesData?.items ?? []
  const protocols = Array.isArray(protocolsData) ? protocolsData : protocolsData?.items ?? []
  const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  // Auto-select currently assigned protocol
  useEffect(() => {
    if (assignedProto?.protocol_id && !form.shift_protocol_id) {
      setForm(f => ({ ...f, shift_protocol_id: assignedProto.protocol_id }))
    }
  }, [assignedProto])

  const updateMutation = useMutation({
    mutationFn: (data: typeof form) => departmentsAPI.update(department.id, {
      ...data,
      office_id: data.office_id || undefined,
    }),
    onSuccess: async () => {
      // If protocol changed, assign via scheduling API
      if (form.shift_protocol_id !== assignedProto?.protocol_id && form.shift_protocol_id) {
        try {
          await schedulingAPI.assignProtocol(department.id, {
            protocol_id: form.shift_protocol_id,
            effective_date: new Date().toISOString().split('T')[0],
          })
        } catch (e: any) {
          toast.error('Department updated but protocol assignment failed')
        }
      }
      await queryClient.refetchQueries({ queryKey: ['departments'] })
      toast.success('Department updated')
      onSuccess()
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to update'),
  })

  const createProtocolMutation = useMutation({
    mutationFn: (data: typeof newProtocol) => {
      const isRotating = data.protocol_type === 'rotating'
      const payload: Record<string, unknown> = {
        name: data.name, code: data.code, description: data.description || null,
        protocol_type: data.protocol_type, color: data.color,
        grace_period_minutes: data.grace_period_minutes,
        include_weekends: data.include_weekends,
      }
      if (isRotating) {
        payload.days_on = data.days_on; payload.days_off = data.days_off
        payload.day_shift_start = data.day_shift_start || null
        payload.day_shift_end = data.day_shift_end || null
        payload.night_shift_start = data.night_shift_start || null
        payload.night_shift_end = data.night_shift_end || null
        const rot: string[] = []
        for (let i = 0; i < data.days_on; i++) rot.push('day')
        for (let i = 0; i < data.days_off; i++) rot.push('off')
        for (let i = 0; i < data.days_on; i++) rot.push('night')
        for (let i = 0; i < data.days_off; i++) rot.push('off')
        payload.rotation_shifts = rot; payload.working_days = data.working_days
      } else {
        payload.working_hours_start = data.working_hours_start || null
        payload.working_hours_end = data.working_hours_end || null
        payload.working_days = data.working_days
      }
      return shiftProtocolsAPI.create(payload)
    },
    onSuccess: async (res) => {
      await queryClient.refetchQueries({ queryKey: ['shift-protocols-list'] })
      const createdId = res.data?.id || res.data?.protocol?.id
      if (createdId) setForm(p => ({ ...p, shift_protocol_id: createdId }))
      setShowNewProtocol(false)
      setNewProtocol({
        name: '', code: '', description: '', protocol_type: 'fixed',
        working_hours_start: '08:30', working_hours_end: '17:00',
        grace_period_minutes: 15, include_weekends: false,
        working_days: [1, 2, 3, 4, 5], days_on: 2, days_off: 2,
        day_shift_start: '08:00', day_shift_end: '20:00',
        night_shift_start: '20:00', night_shift_end: '08:00',
        color: '#3b82f6',
      })
      toast.success('Shift protocol created and assigned')
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed'),
  })

  const selectedProtocol = protocols.find((p: any) => p.id === form.shift_protocol_id)

  // Recommendation logic
  const recommendation = useMemo(() => {
    if (protocols.length === 0 || form.shift_protocol_id) return null
    const deptSize = department.employee_count || 0
    // Suggest rotating for larger depts, fixed for smaller
    const rotatingCount = protocols.filter((p: any) => p.protocol_type === 'rotating').length
    const fixedCount = protocols.filter((p: any) => p.protocol_type === 'fixed').length
    if (deptSize >= 10 && rotatingCount > 0) {
      const rec = protocols.find((p: any) => p.protocol_type === 'rotating')
      return rec ? { protocol: rec, reason: 'Recommended for departments with 10+ employees' } : null
    }
    if (fixedCount > 0) {
      const rec = protocols.find((p: any) => p.protocol_type === 'fixed')
      return rec ? { protocol: rec, reason: 'Standard fixed-shift protocol' } : null
    }
    return null
  }, [protocols, form.shift_protocol_id, department.employee_count])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '24px' }}>
      {/* Identity Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(99,102,241,0.2))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Users size={14} color="var(--pz-accent)" />
          </div>
          <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Identity</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
              Name <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
            </label>
            <input value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Information Technology"
              className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
              Code <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
            </label>
            <input value={form.code} onChange={(e) => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
              placeholder="e.g. ICT"
              className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }} />
          </div>
        </div>
      </div>

      {/* Assignment Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(167,139,250,0.2))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Building2 size={14} color="#8B5CF6" />
          </div>
          <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Assignment</span>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>
            Office / Location
          </label>
          <select value={form.office_id} onChange={(e) => setForm(p => ({ ...p, office_id: e.target.value }))}
            className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }}>
            <option value="">Select office</option>
            {offices.map((o: any) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>

        {/* Shift Protocol */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)' }}>
              Shift Protocol <span style={{ color: 'var(--pz-danger-500)' }}>*</span>
            </label>
            {!showNewProtocol && (
              <button onClick={() => setShowNewProtocol(true)}
                style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-accent)', display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <Plus size={12} /> Create New
              </button>
            )}
          </div>

          {/* Recommendation badge */}
          {recommendation && (
            <div style={{ marginBottom: '10px', padding: '10px 12px', borderRadius: '10px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Lightbulb size={16} color="var(--pz-accent)" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-accent)', margin: 0 }}>Suggested: {recommendation.protocol.name}</p>
                <p style={{ fontSize: '11px', color: 'var(--pz-text-muted)', margin: '2px 0 0' }}>{recommendation.reason}</p>
              </div>
              <button
                onClick={() => setForm(p => ({ ...p, shift_protocol_id: recommendation.protocol.id }))}
                style={{ padding: '6px 12px', borderRadius: '8px', background: 'var(--pz-accent)', color: '#fff', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                Apply
              </button>
            </div>
          )}

          {/* Currently assigned badge */}
          {assignedProto && !form.shift_protocol_id && (
            <div style={{ marginBottom: '10px', padding: '10px 12px', borderRadius: '10px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Shield size={14} color="var(--pz-success-500)" />
              <span style={{ fontSize: '12px', color: 'var(--pz-text-secondary)' }}>Currently: {assignedProto.protocol_name || 'Protocol assigned'}</span>
            </div>
          )}

          {/* Active status toggle */}
          <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)' }}>Active</label>
            <button
              onClick={() => setForm(p => ({ ...p, is_active: !p.is_active }))}
              style={{
                width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                transition: 'all 0.2s', position: 'relative',
                background: form.is_active ? 'var(--pz-success-500)' : 'var(--pz-surface-3)',
              }}
            >
              <span style={{
                position: 'absolute', top: '2px', width: '20px', height: '20px', borderRadius: '50%',
                background: '#fff', transition: 'all 0.2s',
                left: form.is_active ? '22px' : '2px',
              }} />
            </button>
            <span style={{ fontSize: '12px', color: 'var(--pz-text-muted)' }}>{form.is_active ? 'Active' : 'Inactive'}</span>
          </div>

          <AnimatePresence mode="wait">
          {showNewProtocol && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              style={{ padding: '16px', borderRadius: '12px', border: '1px solid rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.03)', display: 'flex', flexDirection: 'column', gap: '16px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--pz-accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>New Shift Protocol</span>
                <button onClick={() => setShowNewProtocol(false)}
                  style={{ fontSize: '10px', color: 'var(--pz-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  Cancel
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px', display: 'block' }}>Name *</label>
                  <input value={newProtocol.name} onChange={(e) => setNewProtocol(p => ({ ...p, name: e.target.value }))}
                    placeholder="Standard Day Shift" className="pz-input w-full" style={{ height: '38px', fontSize: '13px' }} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px', display: 'block' }}>Code *</label>
                  <input value={newProtocol.code} onChange={(e) => setNewProtocol(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                    placeholder="SDS" className="pz-input w-full" style={{ height: '38px', fontSize: '13px' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px', display: 'block' }}>Type</label>
                  <select value={newProtocol.protocol_type}
                    onChange={(e) => setNewProtocol(p => ({ ...p, protocol_type: e.target.value as 'fixed' | 'rotating' | 'custom' }))}
                    className="pz-input w-full" style={{ height: '38px', fontSize: '13px' }}>
                    <option value="fixed">Fixed</option>
                    <option value="rotating">Rotating</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px', display: 'block' }}>Grace (min)</label>
                  <input type="number" value={newProtocol.grace_period_minutes}
                    onChange={(e) => setNewProtocol(p => ({ ...p, grace_period_minutes: Number(e.target.value) }))}
                    className="pz-input w-full" style={{ height: '38px', fontSize: '13px' }} />
                </div>
              </div>
              {newProtocol.protocol_type !== 'rotating' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px', display: 'block' }}>Start</label>
                    <input type="time" value={newProtocol.working_hours_start}
                      onChange={(e) => setNewProtocol(p => ({ ...p, working_hours_start: e.target.value }))}
                      className="pz-input w-full" style={{ height: '38px', fontSize: '13px' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px', display: 'block' }}>End</label>
                    <input type="time" value={newProtocol.working_hours_end}
                      onChange={(e) => setNewProtocol(p => ({ ...p, working_hours_end: e.target.value }))}
                      className="pz-input w-full" style={{ height: '38px', fontSize: '13px' }} />
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px', display: 'block' }}>Days On</label>
                      <input type="number" min={1} max={7} value={newProtocol.days_on}
                        onChange={(e) => setNewProtocol(p => ({ ...p, days_on: Number(e.target.value) || 1 }))}
                        className="pz-input w-full" style={{ height: '38px', fontSize: '13px' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px', display: 'block' }}>Days Off</label>
                      <input type="number" min={1} max={7} value={newProtocol.days_off}
                        onChange={(e) => setNewProtocol(p => ({ ...p, days_off: Number(e.target.value) || 1 }))}
                        className="pz-input w-full" style={{ height: '38px', fontSize: '13px' }} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px', display: 'block' }}>Day Start</label>
                      <input type="time" value={newProtocol.day_shift_start}
                        onChange={(e) => setNewProtocol(p => ({ ...p, day_shift_start: e.target.value }))}
                        className="pz-input w-full" style={{ height: '38px', fontSize: '13px' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px', display: 'block' }}>Day End</label>
                      <input type="time" value={newProtocol.day_shift_end}
                        onChange={(e) => setNewProtocol(p => ({ ...p, day_shift_end: e.target.value }))}
                        className="pz-input w-full" style={{ height: '38px', fontSize: '13px' }} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px', display: 'block' }}>Night Start</label>
                      <input type="time" value={newProtocol.night_shift_start}
                        onChange={(e) => setNewProtocol(p => ({ ...p, night_shift_start: e.target.value }))}
                        className="pz-input w-full" style={{ height: '38px', fontSize: '13px' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px', display: 'block' }}>Night End</label>
                      <input type="time" value={newProtocol.night_shift_end}
                        onChange={(e) => setNewProtocol(p => ({ ...p, night_shift_end: e.target.value }))}
                        className="pz-input w-full" style={{ height: '38px', fontSize: '13px' }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-muted)', marginBottom: '6px', display: 'block' }}>
                      Rotation: {
                        Array.from({ length: newProtocol.days_on }, () => 'D').join(' ') +
                        ' ' + Array.from({ length: newProtocol.days_off }, () => 'O').join(' ') +
                        ' ' + Array.from({ length: newProtocol.days_on }, () => 'N').join(' ') +
                        ' ' + Array.from({ length: newProtocol.days_off }, () => 'O').join(' ') + ' \u21bb'
                      }
                    </label>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {(() => {
                        const seq: { label: string; type: string }[] = []
                        for (let i = 0; i < newProtocol.days_on; i++) seq.push({ label: 'D', type: 'day' })
                        for (let i = 0; i < newProtocol.days_off; i++) seq.push({ label: 'O', type: 'off' })
                        for (let i = 0; i < newProtocol.days_on; i++) seq.push({ label: 'N', type: 'night' })
                        for (let i = 0; i < newProtocol.days_off; i++) seq.push({ label: 'O', type: 'off' })
                        return seq.map((s, i) => (
                          <span key={i} style={{
                            width: '28px', height: '28px', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', borderRadius: '6px', fontSize: '9px', fontWeight: 700,
                            ...(s.type === 'day'
                              ? { background: 'rgba(245,158,11,0.15)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.2)' }
                              : s.type === 'night'
                              ? { background: 'rgba(99,102,241,0.15)', color: '#818CF8', border: '1px solid rgba(99,102,241,0.2)' }
                              : { background: 'rgba(113,113,122,0.15)', color: '#A1A1AA', border: '1px solid rgba(113,113,122,0.2)' }),
                          }}>{s.label}</span>
                        ))
                      })()}
                    </div>
                  </div>
                </>
              )}
              <button
                onClick={() => createProtocolMutation.mutate(newProtocol)}
                disabled={!newProtocol.name || !newProtocol.code || createProtocolMutation.isPending}
                style={{ width: '100%', paddingBlock: '10px', borderRadius: '8px', background: 'linear-gradient(135deg, var(--pz-accent), #3B82F6)', color: '#fff', fontSize: '11px', fontWeight: 700, border: 'none', cursor: 'pointer', opacity: (!newProtocol.name || !newProtocol.code || createProtocolMutation.isPending) ? 0.5 : 1 }}
              >
                {createProtocolMutation.isPending ? 'Creating...' : 'Create & Assign'}
              </button>
            </motion.div>
          )}
          </AnimatePresence>

          {!showNewProtocol && (
            <>
              <select value={form.shift_protocol_id}
                onChange={(e) => setForm(p => ({ ...p, shift_protocol_id: e.target.value }))}
                className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }}>
                {protocolsLoading ? (
                  <option>Loading protocols...</option>
                ) : protocols.length === 0 ? (
                  <option value="">No protocols</option>
                ) : (
                  <>
                    <option value="">Select protocol</option>
                    {protocols.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.protocol_type})</option>
                    ))}
                  </>
                )}
              </select>
              {selectedProtocol && (
                <div style={{ marginTop: '8px', padding: '10px 12px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={13} style={{ color: 'var(--pz-accent)' }} />
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-accent)' }}>{selectedProtocol.protocol_type}</span>
                    <span style={{ fontSize: '11px', color: 'var(--pz-text-muted)' }}>{selectedProtocol.working_hours_start || '\u2014'} \u2013 {selectedProtocol.working_hours_end || '\u2014'}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Management Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(52,211,153,0.2))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <UserCheck size={14} color="#10B981" />
          </div>
          <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--pz-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Management</span>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>Head of Department</label>
          <input value={form.head_name} onChange={(e) => setForm(p => ({ ...p, head_name: e.target.value }))}
            placeholder="e.g. Jane Smith"
            className="pz-input w-full" style={{ height: '44px', fontSize: '14px' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--pz-text-secondary)', marginBottom: '8px' }}>Description</label>
          <textarea value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
            rows={3} placeholder="Department purpose..."
            className="pz-input w-full" style={{ height: 'auto', minHeight: '88px', fontSize: '14px', resize: 'none' }} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', paddingTop: '16px', borderTop: '1px solid var(--pz-border)', marginTop: '20px' }}>
        <Button variant="outline" size="md" onClick={onCancel}>Cancel</Button>
        <Button variant="default" size="md"
          loading={updateMutation.isPending}
          disabled={!form.name || !form.code || updateMutation.isPending}
          onClick={() => updateMutation.mutate(form)}>
          {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  )
}
