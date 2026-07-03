import { useState, useCallback, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  User, Monitor, Fingerprint, CheckCircle2, ArrowRight,
  ArrowLeft, Loader2, WifiOff, AlertCircle, Send, Clock,
} from 'lucide-react'
import { enrollmentAPI, departmentsAPI, shiftTemplatesAPI } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/Modal'
import { toast } from 'sonner'
import { useWebSocket } from '@/hooks/useWebSocket'
import type { Department } from '@/types'

type WizardStep = 'personal' | 'employment' | 'fingerprint' | 'complete'

const STEPS: { key: WizardStep; label: string; icon: React.ElementType }[] = [
  { key: 'personal', label: 'Personal', icon: User },
  { key: 'employment', label: 'Employment', icon: Monitor },
  { key: 'fingerprint', label: 'Fingerprint', icon: Fingerprint },
  { key: 'complete', label: 'Complete', icon: CheckCircle2 },
]

interface Props {
  open: boolean
  onClose: () => void
}

export default function EnrollmentWizard({ open, onClose }: Props) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<WizardStep>('personal')
  const [stepIndex, setStepIndex] = useState(0)

  const [employeeCode, setEmployeeCode] = useState('')
  const [fullName, setFullName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [gender, setGender] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [position, setPosition] = useState('')

  const [departmentId, setDepartmentId] = useState('')
  const [employmentType, setEmploymentType] = useState('')
  const [shiftId, setShiftId] = useState('')

  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  const [employeeId, setEmployeeId] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [fingerprintCaptured, setFingerprintCaptured] = useState(false)
  const [fingerprintData, setFingerprintData] = useState<string | null>(null)
  const [enrollmentStatus, setEnrollmentStatus] = useState<string>('idle')
  const [enrollmentMessage, setEnrollmentMessage] = useState<string>('')

  const { lastEvent } = useWebSocket(null)

  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'completed' | 'failed'>('idle')
  const [syncMessage, setSyncMessage] = useState('')
  const [syncedDevices, setSyncedDevices] = useState(0)
  const [totalDevices, setTotalDevices] = useState(0)

  useEffect(() => {
    if (!lastEvent) return
    const eventType = (lastEvent.type || lastEvent.event) as string | undefined
    const eventMessage = typeof lastEvent.message === 'string' ? lastEvent.message : undefined

    if (lastEvent.session_id === sessionId) {
      switch (eventType) {
        case 'enrollment.fingerprint.started':
          setEnrollmentStatus('waiting')
          setEnrollmentMessage(eventMessage || 'Device entered enrollment mode. Place your finger on the scanner.')
          break
        case 'enrollment.fingerprint.detected':
          setEnrollmentStatus('detecting')
          setEnrollmentMessage(eventMessage || 'Finger detected! Processing...')
          break
        case 'enrollment.fingerprint.saved':
          setEnrollmentStatus('captured')
          setEnrollmentMessage(eventMessage || 'Fingerprint captured and verified!')
          setFingerprintCaptured(true)
          break
        case 'enrollment.fingerprint.timeout':
          setEnrollmentStatus('timeout')
          setEnrollmentMessage(eventMessage || 'No fingerprint detected. Please try again.')
          break
        case 'enrollment.fingerprint.failed':
          setEnrollmentStatus('failed')
          setEnrollmentMessage(eventMessage || 'Enrollment failed. Please try again.')
          break
      }
    }

    if (lastEvent.employee_id === employeeId) {
      switch (eventType) {
        case 'enrollment.sync.started':
          setSyncStatus('syncing')
          setSyncMessage(eventMessage || 'Syncing to devices...')
          break
        case 'enrollment.sync.completed':
          setSyncStatus('completed')
          setSyncedDevices(typeof lastEvent.devices_synced === 'number' ? lastEvent.devices_synced : 0)
          setTotalDevices(typeof lastEvent.total_devices === 'number' ? lastEvent.total_devices : 0)
          setSyncMessage(eventMessage || 'Sync completed!')
          break
        case 'enrollment.sync.device':
          setSyncMessage(`Synced to ${String(lastEvent.device_name || 'device')}...`)
          break
        case 'enrollment.sync.failed':
          setSyncStatus('failed')
          setSyncMessage(eventMessage || 'Sync failed')
          break
      }
    }
  }, [lastEvent, sessionId, employeeId])

  const { data: devicesData } = useQuery({
    queryKey: ['enrollment-devices-online'],
    queryFn: async () => (await enrollmentAPI.getOnlineDevices()).data,
    enabled: open,
    refetchInterval: 5000,
  })

  const { data: deptsData } = useQuery({
    queryKey: ['departments-list'],
    queryFn: async () => (await departmentsAPI.list()).data,
    enabled: open,
  })
  const departments: Department[] = Array.isArray(deptsData) ? deptsData : deptsData?.items ?? []

  const { data: shiftsData } = useQuery({
    queryKey: ['shift-templates-list'],
    queryFn: async () => (await shiftTemplatesAPI.list()).data,
    enabled: open,
  })
  const shiftTemplates: any[] = Array.isArray(shiftsData) ? shiftsData : shiftsData?.items ?? []

  const createMutation = useMutation({
    mutationFn: enrollmentAPI.wizardCreateAndEnroll,
    onSuccess: (data) => {
      setEmployeeId(data.data.employee_id)
      setSessionId(data.data.session_id)
      setEnrollmentStatus('idle')
      setEnrollmentMessage('')
      setFingerprintCaptured(false)
      toast.success(`Employee ${data.data.employee_code} created`)
      goToStep('fingerprint')
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to create employee'),
  })

  const sendFingerprintMutation = useMutation({
    mutationFn: (data: { session_id: string; template_data: string; finger_index: number }) =>
      enrollmentAPI.sendFingerprint(data),
    onSuccess: () => {
      setFingerprintCaptured(true)
      setEnrollmentStatus('saved')
      setEnrollmentMessage('Fingerprint saved successfully!')
      toast.success('Fingerprint captured and saved!')
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to save fingerprint'),
  })

  const completeMutation = useMutation({
    mutationFn: (sid: string) => enrollmentAPI.completeSession(sid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      toast.success('Enrollment complete!')
      goToStep('complete')
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to complete enrollment'),
  })

  const cancelMutation = useMutation({
    mutationFn: (sid: string) => enrollmentAPI.cancelSession(sid, 'Wizard cancelled'),
    onError: () => {},
  })

  const goToStep = (s: WizardStep) => {
    setStep(s)
    setStepIndex(STEPS.findIndex(st => st.key === s))
  }

  const handleNext = () => {
    switch (step) {
      case 'personal':
        if (!employeeCode.trim() || !fullName.trim()) {
          toast.error('Employee code and full name are required')
          return
        }
        goToStep('employment')
        break
      case 'employment':
        goToStep('fingerprint')
        break
      case 'fingerprint':
        if (!selectedDeviceId) {
          toast.error('Please select a device')
          return
        }
        if (sessionId && fingerprintCaptured) {
          completeMutation.mutate(sessionId)
        } else if (!sessionId) {
          createMutation.mutate({
            employee_code: employeeCode.trim(),
            full_name: fullName.trim(),
            first_name: firstName.trim() || undefined,
            last_name: lastName.trim() || undefined,
            gender: gender || undefined,
            email: email.trim() || undefined,
            phone: phone.trim() || undefined,
            position: position.trim() || undefined,
            department_id: departmentId || undefined,
            employment_type: employmentType || undefined,
            shift_id: shiftId || undefined,
            device_id: selectedDeviceId,
          })
        } else {
          toast.error('Please capture fingerprint first')
        }
        break
    }
  }

  const handleBack = () => {
    if (step === 'employment') goToStep('personal')
    else if (step === 'fingerprint') {
      if (sessionId && !fingerprintCaptured) {
        toast.warning('Cancel enrollment first, or complete it before going back')
        return
      }
      goToStep('employment')
    }
  }

  const handleClose = () => {
    if (sessionId && !fingerprintCaptured) {
      cancelMutation.mutate(sessionId)
    }
    resetState()
    onClose()
  }

  const resetState = () => {
    setStep('personal')
    setStepIndex(0)
    setEmployeeCode('')
    setFullName('')
    setFirstName('')
    setLastName('')
    setGender('')
    setEmail('')
    setPhone('')
    setPosition('')
    setDepartmentId('')
    setEmploymentType('')
    setShiftId('')
    setSelectedDeviceId(null)
    setEmployeeId(null)
    setSessionId(null)
    setFingerprintCaptured(false)
    setFingerprintData(null)
    setEnrollmentStatus('idle')
    setEnrollmentMessage('')
    setSyncStatus('idle')
    setSyncMessage('')
    setSyncedDevices(0)
    setTotalDevices(0)
  }

  const selectedDevice = devicesData?.devices?.find((d: any) => d.id === selectedDeviceId)
  const isPending = createMutation.isPending || sendFingerprintMutation.isPending || completeMutation.isPending

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="New Employee Enrollment"
      description="Create employee record and enroll biometrics in one flow"
      size="xl"
      className="min-h-[680px]"
      footer={
        step !== 'complete' ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <Button variant="outline" size="lg" onClick={step === 'personal' ? handleClose : handleBack} disabled={isPending}>
              {step === 'personal' ? 'Cancel' : <><ArrowLeft size={16} /> Back</>}
            </Button>
            <Button
              variant="default" size="lg" onClick={handleNext}
              disabled={isPending || (step === 'fingerprint' && !selectedDeviceId) || (step === 'fingerprint' && !!sessionId && !fingerprintCaptured)}
            >
              {createMutation.isPending ? (
                <><Loader2 size={16} className="animate-spin" /> Creating Employee...</>
              ) : sendFingerprintMutation.isPending ? (
                <><Loader2 size={16} className="animate-spin" /> Saving...</>
              ) : completeMutation.isPending ? (
                <><Loader2 size={16} className="animate-spin" /> Completing...</>
              ) : step === 'fingerprint' && sessionId && fingerprintCaptured ? (
                <><CheckCircle2 size={16} /> Complete Enrollment</>
              ) : step === 'fingerprint' && !sessionId ? (
                <><Send size={16} /> Send Enrollment Command</>
              ) : step === 'fingerprint' && sessionId && !fingerprintCaptured ? (
                <><Loader2 size={16} className="animate-spin" /> Enrolling...</>
              ) : (
                <><ArrowRight size={16} /> Next</>
              )}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', minHeight: 0, flex: 1 }}>
        {/* ── Step Indicator ─────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '0 4px' }}>
          {STEPS.map((s, i) => {
            const isActive = i === stepIndex
            const isDone = i < stepIndex
            const Icon = s.icon
            const stepColors = isActive
              ? { bg: '#2563EB', text: '#fff', border: '#2563EB' }
              : isDone
              ? { bg: '#10B981', text: '#fff', border: '#10B981' }
              : { bg: 'var(--pz-surface-3)', text: 'var(--pz-text-muted)', border: 'var(--pz-border)' }
            return (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '6px 14px', borderRadius: '20px',
                  fontSize: '12px', fontWeight: 700, letterSpacing: '0.03em',
                  whiteSpace: 'nowrap', transition: 'all 0.2s',
                  background: stepColors.bg, color: stepColors.text,
                  border: `1px solid ${stepColors.border}`,
                }}>
                  {isDone ? <CheckCircle2 size={14} /> : <Icon size={14} />}
                  <span>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{
                    flex: 1, height: '3px', borderRadius: '4px', margin: '0 8px',
                    background: isDone ? '#10B981' : 'var(--pz-border)',
                  }} />
                )}
              </div>
            )
          })}
        </div>

        {/* ── Step Content ───────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>

        {/* ── Step 1: Personal Information ──────────────────── */}
        {step === 'personal' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Identity */}
            <div style={{ padding: '24px', borderRadius: '12px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(37,99,235,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <User size={15} color="#3B82F6" />
                </div>
                <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--pz-text-secondary)', margin: 0 }}>Identity</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
                <Input
                  label="Employee Code *"
                  value={employeeCode}
                  onChange={(e) => setEmployeeCode(e.target.value)}
                  placeholder="e.g. FIA0597"
                />
                <Input
                  label="Full Name *"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. John Doe"
                />
              </div>
            </div>

            {/* Personal Details */}
            <div style={{ padding: '24px', borderRadius: '12px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(139,92,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <User size={15} color="#8B5CF6" />
                </div>
                <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--pz-text-secondary)', margin: 0 }}>Personal Details</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '18px' }}>
                <Input
                  label="First Name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name"
                />
                <Input
                  label="Last Name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last name"
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Gender</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    style={{ height: '44px', padding: '0 14px', borderRadius: '10px', border: '1px solid var(--pz-border)', background: 'var(--pz-surface-1)', fontSize: '14px', color: 'var(--pz-text)' }}
                  >
                    <option value="">Not set</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
              </div>
              <div style={{ marginTop: '18px' }}>
                <Input
                  label="Position"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder="e.g. IT Officer"
                />
              </div>
            </div>

            {/* Contact */}
            <div style={{ padding: '24px', borderRadius: '12px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <User size={15} color="#10B981" />
                </div>
                <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--pz-text-secondary)', margin: 0 }}>Contact</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
                <Input
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. john@company.com"
                />
                <Input
                  label="Phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +232 77 123456"
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Employment ────────────────────────────── */}
        {step === 'employment' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ padding: '24px', borderRadius: '12px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(37,99,235,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Monitor size={15} color="#3B82F6" />
                </div>
                <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--pz-text-secondary)', margin: 0 }}>Employment Details</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Department</label>
                  <select
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    style={{ height: '44px', padding: '0 14px', borderRadius: '10px', border: '1px solid var(--pz-border)', background: 'var(--pz-surface-1)', fontSize: '14px', color: 'var(--pz-text)' }}
                  >
                    <option value="">Select department</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Employment Type</label>
                  <select
                    value={employmentType}
                    onChange={(e) => setEmploymentType(e.target.value)}
                    style={{ height: '44px', padding: '0 14px', borderRadius: '10px', border: '1px solid var(--pz-border)', background: 'var(--pz-surface-1)', fontSize: '14px', color: 'var(--pz-text)' }}
                  >
                    <option value="">Not set</option>
                    <option value="full_time">Full Time</option>
                    <option value="part_time">Part Time</option>
                    <option value="contract">Contract</option>
                    <option value="intern">Intern</option>
                  </select>
                </div>
              </div>
            </div>

            <div style={{ padding: '24px', borderRadius: '12px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Clock size={15} color="#F59E0B" />
                </div>
                <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--pz-text-secondary)', margin: 0 }}>Schedule</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pz-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Shift</label>
                <select
                  value={shiftId}
                  onChange={(e) => setShiftId(e.target.value)}
                  style={{ height: '44px', padding: '0 14px', borderRadius: '10px', border: '1px solid var(--pz-border)', background: 'var(--pz-surface-1)', fontSize: '14px', color: 'var(--pz-text)' }}
                >
                  <option value="">No shift assigned</option>
                  {shiftTemplates.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.start_time} - {s.end_time})</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3: Fingerprint Enrollment ────────────────── */}
        {step === 'fingerprint' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Device Selection */}
            <div style={{ padding: '24px', borderRadius: '12px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(37,99,235,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Monitor size={15} color="#3B82F6" />
                </div>
                <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--pz-text-secondary)', margin: 0 }}>Select Enrollment Device</p>
              </div>
              {devicesData?.devices?.length === 0 ? (
                <div style={{ padding: '40px', borderRadius: '12px', border: '2px dashed var(--pz-border)', background: 'var(--pz-surface-1)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                  <WifiOff size={36} style={{ color: 'var(--pz-text-muted)', opacity: 0.4 }} />
                  <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--pz-text-secondary)', margin: 0 }}>No devices online</p>
                  <p style={{ fontSize: '12px', color: 'var(--pz-text-muted)', margin: 0 }}>Ensure devices are connected and ADMS is enabled</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {devicesData?.devices?.map((device: any) => {
                    const isSel = selectedDeviceId === device.id
                    return (
                      <button
                        key={device.id}
                        onClick={() => setSelectedDeviceId(device.id)}
                        style={{
                          padding: '16px', borderRadius: '12px', cursor: 'pointer',
                          transition: 'all 0.15s', textAlign: 'left',
                          display: 'flex', alignItems: 'center', gap: '14px',
                          border: `2px solid ${isSel ? '#2563EB' : 'var(--pz-border)'}`,
                          background: isSel ? 'rgba(37,99,235,0.06)' : 'var(--pz-surface-1)',
                        }}
                      >
                        <div style={{
                          width: '44px', height: '44px', borderRadius: '10px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          background: isSel ? '#2563EB' : 'var(--pz-surface-3)',
                          color: isSel ? '#fff' : 'var(--pz-text-muted)',
                        }}>
                          <Monitor size={20} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--pz-text)', margin: 0 }}>{device.name}</p>
                          <p style={{ fontSize: '12px', color: 'var(--pz-text-muted)', fontFamily: 'monospace', margin: '2px 0 0 0' }}>{device.ip_address}</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981' }} />
                          <span style={{ fontSize: '10px', fontWeight: 700, color: '#10B981', letterSpacing: '0.04em' }}>ONLINE</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Enrollment Command Panel */}
            {selectedDeviceId && !sessionId && (
              <div style={{ padding: '20px 24px', borderRadius: '12px', border: '1px solid #2563EB', background: 'rgba(37,99,235,0.06)', display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: 'rgba(37,99,235,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Send size={18} color="#2563EB" />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--pz-text)', margin: 0 }}>Ready to Enroll</p>
                  <p style={{ fontSize: '12px', color: 'var(--pz-text-muted)', marginTop: '3px', marginBottom: 0 }}>
                    Click "Next" to create employee and send enrollment command to <strong style={{ color: 'var(--pz-text-secondary)' }}>{selectedDevice?.name}</strong>
                  </p>
                </div>
              </div>
            )}

            {/* Fingerprint Capture Panel */}
            {selectedDeviceId && sessionId && (
              <div style={{ padding: '24px', borderRadius: '12px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Fingerprint size={15} color="#10B981" />
                  </div>
                  <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--pz-text-secondary)', margin: 0 }}>Fingerprint Capture</p>
                </div>
                {fingerprintCaptured ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ padding: '32px', borderRadius: '12px', border: '1px solid #10B981', background: 'rgba(16,185,129,0.06)', textAlign: 'center' }}>
                      <CheckCircle2 size={48} style={{ color: '#10B981', margin: '0 auto 12px auto' }} />
                      <p style={{ fontSize: '16px', fontWeight: 700, color: '#10B981', margin: 0 }}>Fingerprint Captured!</p>
                      <p style={{ fontSize: '13px', color: 'var(--pz-text-muted)', marginTop: '6px', marginBottom: 0 }}>Ready to complete enrollment</p>
                    </div>

                    {syncStatus !== 'idle' && (
                      <div style={{
                        padding: '16px', borderRadius: '10px', border: syncStatus === 'syncing' ? '1px solid #2563EB'
                          : syncStatus === 'completed' ? '1px solid #10B981' : '1px solid #EF4444',
                        background: syncStatus === 'syncing' ? 'rgba(37,99,235,0.06)'
                          : syncStatus === 'completed' ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          {syncStatus === 'syncing' && <Loader2 size={20} style={{ color: '#2563EB' }} />}
                          {syncStatus === 'completed' && <CheckCircle2 size={20} style={{ color: '#10B981' }} />}
                          {syncStatus === 'failed' && <AlertCircle size={20} style={{ color: '#EF4444' }} />}
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pz-text)', margin: 0 }}>
                              {syncStatus === 'syncing' ? 'Syncing to devices...' :
                               syncStatus === 'completed' ? 'Sync Complete' :
                               'Sync Failed'}
                            </p>
                            <p style={{ fontSize: '11px', color: 'var(--pz-text-muted)', marginTop: '3px', marginBottom: 0 }}>{syncMessage}</p>
                          </div>
                          {syncStatus === 'completed' && totalDevices > 0 && (
                            <div style={{ textAlign: 'right' }}>
                              <p style={{ fontSize: '18px', fontWeight: 700, color: '#10B981', margin: 0 }}>{syncedDevices}/{totalDevices}</p>
                              <p style={{ fontSize: '10px', color: 'var(--pz-text-muted)', margin: 0 }}>devices</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <FingerprintCapturePanel
                    sessionId={sessionId}
                    deviceName={selectedDevice?.name}
                    status={enrollmentStatus}
                    message={enrollmentMessage}
                    onCaptured={(data) => {
                      setFingerprintData(data.template_data)
                      sendFingerprintMutation.mutate({
                        session_id: sessionId!,
                        template_data: data.template_data,
                        finger_index: data.finger_index,
                      })
                    }}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Step 4: Complete ──────────────────────────────── */}
        {step === 'complete' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ width: '88px', height: '88px', borderRadius: '50%', background: 'rgba(16,185,129,0.1)', border: '2px solid rgba(16,185,129,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
              <CheckCircle2 size={48} style={{ color: '#10B981' }} />
            </div>
            <h3 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--pz-text)', margin: '0 0 12px 0' }}>Enrollment Complete!</h3>
            <p style={{ fontSize: '14px', color: 'var(--pz-text-muted)', maxWidth: '420px', lineHeight: 1.6, margin: 0 }}>
              Employee <strong style={{ color: 'var(--pz-text-secondary)' }}>{employeeCode}</strong> has been created and enrolled successfully.
              Biometric templates have been stored and synced to all devices.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '32px' }}>
              <Button variant="outline" size="lg" onClick={handleClose}>Done</Button>
              <Button variant="default" size="lg" onClick={() => resetState()}>Enroll Another</Button>
            </div>
          </div>
        )}
        </div>
      </div>
    </Modal>
  )
}


function FingerprintCapturePanel({ sessionId, deviceName, status, message, onCaptured }: {
  sessionId: string | null
  deviceName?: string
  status: string
  message: string
  onCaptured: (data: { template_data: string; finger_index: number }) => void
}) {
  const [enrolling, setEnrolling] = useState(false)
  const [countdown, setCountdown] = useState(45)
  const [countdownActive, setCountdownActive] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [fingerprintDone, setFingerprintDone] = useState(false)
  const connectingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Reset local state when sessionId changes (new session)
  useEffect(() => {
    setEnrolling(false)
    setCountdown(45)
    setCountdownActive(false)
    setAttempts(0)
    setFingerprintDone(false)

    // Auto-start enrollment when session is first created (no extra click needed)
    if (sessionId) {
      const t = setTimeout(() => startEnrollment(), 300)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // Start countdown only when WebSocket confirms device is in enrollment mode,
  // NOT on button click (device may take 30-90s to acquire lock + setup).
  useEffect(() => {
    if (enrolling && (status === 'waiting' || status === 'detecting')) {
      setCountdownActive(true)
    }
  }, [enrolling, status])

  // Countdown ticker — only runs when device is actually ready for finger scan
  useEffect(() => {
    if (!countdownActive) return
    const interval = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(interval); return 0 }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [countdownActive])

  // Reset countdown when status resets to idle (e.g. new session)
  useEffect(() => {
    if (status === 'idle') {
      setCountdown(45)
      setCountdownActive(false)
    }
  }, [status])

  // When WebSocket reports terminal status (timeout/failed), immediately
  // unlock the UI so the retry button appears (don't wait for HTTP response).
  useEffect(() => {
    if (status === 'timeout' || status === 'failed') {
      setEnrolling(false)
      setCountdownActive(false)
    }
  }, [status])

  // Safety net: if enrolling but WebSocket never fires, stop connecting state
  // after 130s (matching backend lock+enroll max = 90+45 = 135s)
  useEffect(() => {
    if (!enrolling || status !== 'idle') return
    connectingTimeoutRef.current = setTimeout(() => {
      setEnrolling(false)
      toast.error('Device did not respond. Please try again.')
    }, 130000)
    return () => {
      if (connectingTimeoutRef.current) clearTimeout(connectingTimeoutRef.current)
    }
  }, [enrolling, status])

  // Handle fingerprint capture — bridge between HTTP response and local state
  const handleCaptured = useCallback((data: { template_data: string; finger_index: number }) => {
    setFingerprintDone(true)
    onCaptured(data)
  }, [onCaptured])

  const startEnrollment = useCallback(async () => {
    if (!sessionId) return
    setAttempts(a => a + 1)
    setEnrolling(true)
    setCountdown(45)
    setCountdownActive(false)
    try {
      const result = await enrollmentAPI.wizardPollFingerprint(sessionId, 45)
      if (result.data.status === 'captured') {
        handleCaptured({
          template_data: result.data.template_data,
          finger_index: result.data.finger_index || 0,
        })
      } else {
        toast.info(result.data.message || 'No fingerprint detected - try again')
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      toast.error(detail || 'Failed to communicate with device')
    } finally {
      setEnrolling(false)
      setCountdownActive(false)
    }
  }, [sessionId, handleCaptured])

  const getStatusIcon = () => {
    if (enrolling && status === 'idle') {
      return <Loader2 size={28} className="animate-spin" style={{ color: '#2563EB' }} />
    }
    switch (status) {
      case 'waiting':
      case 'enrolling':
        return <Loader2 size={28} className="animate-spin" style={{ color: '#2563EB' }} />
      case 'detecting':
        return <Loader2 size={28} className="animate-spin" style={{ color: '#F59E0B' }} />
      case 'captured':
      case 'saved':
        return <CheckCircle2 size={28} style={{ color: '#10B981' }} />
      case 'timeout':
      case 'failed':
        return <AlertCircle size={28} style={{ color: '#EF4444' }} />
      default:
        return <Fingerprint size={28} style={{ color: 'var(--pz-text-muted)', opacity: 0.5 }} />
    }
  }

  const getStatusBg = () => {
    if (enrolling && status === 'idle') return 'rgba(37,99,235,0.06)'
    switch (status) {
      case 'waiting':
      case 'enrolling': return 'rgba(37,99,235,0.06)'
      case 'detecting': return 'rgba(245,158,11,0.06)'
      case 'captured':
      case 'saved': return 'rgba(16,185,129,0.06)'
      case 'timeout':
      case 'failed': return 'rgba(239,68,68,0.06)'
      default: return 'var(--pz-surface-1)'
    }
  }

  const getStatusBorder = () => {
    if (enrolling && status === 'idle') return '1px solid #2563EB'
    switch (status) {
      case 'waiting':
      case 'enrolling': return '1px solid #2563EB'
      case 'detecting': return '1px solid #F59E0B'
      case 'captured':
      case 'saved': return '1px solid #10B981'
      case 'timeout':
      case 'failed': return '1px solid #EF4444'
      default: return '1px solid var(--pz-border)'
    }
  }

  const isConnecting = enrolling && status === 'idle'
  const showCountdownBar = countdownActive || (enrolling && (status === 'waiting' || status === 'detecting'))
  const showButton = !enrolling && !fingerprintDone

  return (
    <div style={{
      padding: '28px', borderRadius: '12px', border: getStatusBorder(),
      background: getStatusBg(), textAlign: 'center',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
        {getStatusIcon()}

        {isConnecting ? (
          <div>
            <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--pz-text)', margin: 0 }}>Connecting to device...</p>
            <p style={{ fontSize: '13px', color: 'var(--pz-text-muted)', marginTop: '4px', marginBottom: 0 }}>
              Waiting for <strong style={{ color: 'var(--pz-text-secondary)' }}>{deviceName}</strong> to be ready
            </p>
          </div>
        ) : !fingerprintDone && status === 'idle' && !enrolling ? (
          <div>
            <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--pz-text)', margin: 0 }}>Ready to capture fingerprint</p>
            <p style={{ fontSize: '13px', color: 'var(--pz-text-muted)', marginTop: '4px', marginBottom: 0 }}>
              Click the button below, then place your finger on <strong style={{ color: 'var(--pz-text-secondary)' }}>{deviceName}</strong> scanner
            </p>
          </div>
        ) : !fingerprintDone && !enrolling ? (
          <div>
            <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--pz-text)', margin: 0 }}>{message || 'No fingerprint detected. Try again.'}</p>
            <p style={{ fontSize: '13px', color: 'var(--pz-text-muted)', marginTop: '4px', marginBottom: 0 }}>
              Click "Try Again" to retry enrollment on <strong style={{ color: 'var(--pz-text-secondary)' }}>{deviceName}</strong>
            </p>
          </div>
        ) : status === 'captured' || status === 'saved' || fingerprintDone ? (
          <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--pz-text)', margin: 0 }}>
            {message || 'Fingerprint captured successfully!'}
          </p>
        ) : (
          <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--pz-text)', margin: 0 }}>{message}</p>
        )}

        {isConnecting && (
          <p style={{ fontSize: '12px', color: 'var(--pz-text-muted)', margin: 0 }}>
            This may take up to a minute...
          </p>
        )}

        {showCountdownBar && (
          <>
            <div style={{ width: '224px', height: '6px', borderRadius: '4px', overflow: 'hidden', background: 'var(--pz-surface-3)' }}>
              <div style={{
                height: '100%', borderRadius: '4px', background: '#2563EB',
                width: `${(countdown / 45) * 100}%`,
                transition: 'width 1s linear',
              }} />
            </div>
            <p style={{ fontSize: '12px', color: 'var(--pz-text-muted)', margin: 0 }}>{countdown}s remaining</p>
          </>
        )}

        {showButton && attempts > 0 && (
          <Button variant="default" size="lg" onClick={startEnrollment} disabled={!sessionId}>
            <Fingerprint size={16} /> Try Again
          </Button>
        )}
      </div>
    </div>
  )
}
