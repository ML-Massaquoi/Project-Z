import { useState, useCallback, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  User, Monitor, Fingerprint, CheckCircle2, ArrowRight,
  ArrowLeft, Loader2, WifiOff, AlertCircle, Send,
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
      className="min-h-[640px] flex flex-col"
      footer={
        step !== 'complete' ? (
          <div className="flex items-center justify-between w-full">
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
      {/* Step Indicator */}
      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((s, i) => {
          const isActive = i === stepIndex
          const isDone = i < stepIndex
          const Icon = s.icon
          return (
            <div key={s.key} className="flex items-center flex-1">
              <div
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide whitespace-nowrap transition-all border ${
                  isActive
                    ? 'bg-[var(--pz-brand)] text-white border-[var(--pz-brand)]'
                    : isDone
                    ? 'bg-emerald-500 text-white border-emerald-500'
                    : 'bg-[var(--pz-surface-3)] text-[var(--pz-text-muted)] border-[var(--pz-border)]'
                }`}
              >
                {isDone ? <CheckCircle2 size={12} /> : <Icon size={12} />}
                <span>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 rounded-full mx-1.5 ${isDone ? 'bg-emerald-500' : 'bg-[var(--pz-border)]'}`} />
              )}
            </div>
          )
        })}
      </div>

      {/* Step Content — vertically centered in available space */}
      <div className="flex-1 flex flex-col justify-center min-h-0">
      {/* Step 1: Personal Information */}
      {step === 'personal' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-[var(--pz-surface-2)]/50 border border-[var(--pz-border)] space-y-4">
            <h5 className="text-xs font-bold text-[var(--pz-text-secondary)] uppercase tracking-wider">Employee Details</h5>
            <div className="grid grid-cols-2 gap-4">
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
          <div className="p-4 rounded-xl bg-[var(--pz-surface-2)]/50 border border-[var(--pz-border)] space-y-4">
            <h5 className="text-xs font-bold text-[var(--pz-text-secondary)] uppercase tracking-wider">Personal Details</h5>
            <div className="grid grid-cols-3 gap-4">
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
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-[var(--pz-text-secondary)] uppercase tracking-wide">Gender</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="h-11 px-3.5 rounded-lg border border-[var(--pz-border)] bg-[var(--pz-surface-1)] text-sm text-[var(--pz-text)]"
                >
                  <option value="">Not set</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-[var(--pz-surface-2)]/50 border border-[var(--pz-border)] space-y-4">
            <h5 className="text-xs font-bold text-[var(--pz-text-secondary)] uppercase tracking-wider">Contact Information</h5>
            <div className="grid grid-cols-2 gap-4">
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
            <Input
              label="Position"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="e.g. IT Officer"
            />
          </div>
        </div>
      )}

      {/* Step 2: Employment Information */}
      {step === 'employment' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-[var(--pz-surface-2)]/50 border border-[var(--pz-border)] space-y-4">
            <h5 className="text-xs font-bold text-[var(--pz-text-secondary)] uppercase tracking-wider">Employment Details</h5>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-[var(--pz-text-secondary)] uppercase tracking-wide">Department</label>
                <select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className="h-11 px-3.5 rounded-lg border border-[var(--pz-border)] bg-[var(--pz-surface-1)] text-sm text-[var(--pz-text)]"
                >
                  <option value="">Select department</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-[var(--pz-text-secondary)] uppercase tracking-wide">Employment Type</label>
                <select
                  value={employmentType}
                  onChange={(e) => setEmploymentType(e.target.value)}
                  className="h-11 px-3.5 rounded-lg border border-[var(--pz-border)] bg-[var(--pz-surface-1)] text-sm text-[var(--pz-text)]"
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
          <div className="p-4 rounded-xl bg-[var(--pz-surface-2)]/50 border border-[var(--pz-border)] space-y-4">
            <h5 className="text-xs font-bold text-[var(--pz-text-secondary)] uppercase tracking-wider">Schedule Assignment</h5>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[var(--pz-text-secondary)] uppercase tracking-wide">Shift</label>
              <select
                value={shiftId}
                onChange={(e) => setShiftId(e.target.value)}
                className="h-11 px-3.5 rounded-lg border border-[var(--pz-border)] bg-[var(--pz-surface-1)] text-sm text-[var(--pz-text)]"
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

      {/* Step 3: Fingerprint Enrollment */}
      {step === 'fingerprint' && (
        <div className="space-y-4">
          {/* Device Selection */}
          <div className="p-4 rounded-xl bg-[var(--pz-surface-2)]/50 border border-[var(--pz-border)] space-y-3">
            <h5 className="text-xs font-bold text-[var(--pz-text-secondary)] uppercase tracking-wider">Select Enrollment Device</h5>
            {devicesData?.devices?.length === 0 ? (
              <div className="p-8 rounded-xl border-2 border-dashed border-[var(--pz-border)] bg-[var(--pz-surface-2)] flex flex-col items-center justify-center gap-3">
                <WifiOff size={32} className="text-[var(--pz-text-muted)] opacity-40" />
                <p className="text-sm font-semibold text-[var(--pz-text-secondary)]">No devices online</p>
                <p className="text-xs text-[var(--pz-text-muted)]">Ensure devices are connected and ADMS is enabled</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {devicesData?.devices?.map((device: any) => (
                  <button
                    key={device.id}
                    onClick={() => setSelectedDeviceId(device.id)}
                    className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all text-left flex items-center gap-3 ${
                      selectedDeviceId === device.id
                        ? 'border-[var(--pz-brand)] bg-blue-500/[0.06]'
                        : 'border-[var(--pz-border)] bg-[var(--pz-surface-2)] hover:border-[var(--pz-border-strong)]'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      selectedDeviceId === device.id
                        ? 'bg-[var(--pz-brand)] text-white'
                        : 'bg-[var(--pz-surface-3)] text-[var(--pz-text-muted)]'
                    }`}>
                      <Monitor size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--pz-text)]">{device.name}</p>
                      <p className="text-xs text-[var(--pz-text-muted)] font-mono">{device.ip_address}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-[10px] font-bold text-emerald-500 tracking-wider">ONLINE</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Enrollment Command Panel */}
          {selectedDeviceId && !sessionId && (
            <div className="p-4 rounded-xl border border-[var(--pz-brand)] bg-blue-500/[0.06]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[var(--pz-brand)]/10 flex items-center justify-center shrink-0">
                  <Send size={18} className="text-[var(--pz-brand)]" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[var(--pz-text)]">Ready to Enroll</p>
                  <p className="text-xs text-[var(--pz-text-muted)] mt-0.5">
                    Click "Next" to create employee and send enrollment command to <strong>{selectedDevice?.name}</strong>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Fingerprint Capture Panel */}
          {selectedDeviceId && sessionId && (
            <div className="p-4 rounded-xl bg-[var(--pz-surface-2)]/50 border border-[var(--pz-border)] space-y-3">
              <h5 className="text-xs font-bold text-[var(--pz-text-secondary)] uppercase tracking-wider">Fingerprint Capture</h5>
              {fingerprintCaptured ? (
                <div className="flex flex-col gap-4">
                  <div className="p-6 rounded-xl border border-emerald-500 bg-emerald-500/[0.06] text-center">
                    <CheckCircle2 size={40} className="text-emerald-500 mx-auto mb-3" />
                    <p className="text-base font-bold text-emerald-500">Fingerprint Captured!</p>
                    <p className="text-sm text-[var(--pz-text-muted)] mt-1.5">Ready to complete enrollment</p>
                  </div>

                  {syncStatus !== 'idle' && (
                    <div className={`p-3.5 rounded-xl border ${
                      syncStatus === 'syncing' ? 'border-[var(--pz-brand)] bg-blue-500/[0.06]' :
                      syncStatus === 'completed' ? 'border-emerald-500 bg-emerald-500/[0.06]' :
                      'border-red-500 bg-red-500/[0.06]'
                    }`}>
                      <div className="flex items-center gap-3">
                        {syncStatus === 'syncing' && <Loader2 size={18} className="text-[var(--pz-brand)] animate-spin" />}
                        {syncStatus === 'completed' && <CheckCircle2 size={18} className="text-emerald-500" />}
                        {syncStatus === 'failed' && <AlertCircle size={18} className="text-red-500" />}
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-[var(--pz-text)]">
                            {syncStatus === 'syncing' ? 'Syncing to devices...' :
                             syncStatus === 'completed' ? 'Sync Complete' :
                             'Sync Failed'}
                          </p>
                          <p className="text-xs text-[var(--pz-text-muted)] mt-0.5">{syncMessage}</p>
                        </div>
                        {syncStatus === 'completed' && totalDevices > 0 && (
                          <div className="text-right">
                            <p className="text-lg font-bold text-emerald-500">{syncedDevices}/{totalDevices}</p>
                            <p className="text-[10px] text-[var(--pz-text-muted)]">devices</p>
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

      {/* Step 4: Complete */}
      {step === 'complete' && (
        <div className="text-center py-8">
          <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={40} className="text-emerald-500" />
          </div>
          <h3 className="text-2xl font-bold text-[var(--pz-text)] mb-3">Enrollment Complete!</h3>
          <p className="text-sm text-[var(--pz-text-muted)] mx-auto max-w-[400px] leading-relaxed">
            Employee <strong className="text-[var(--pz-text-secondary)]">{employeeCode}</strong> has been created and enrolled successfully.
            Biometric templates have been stored and synced to all devices.
          </p>
          <div className="flex justify-center gap-4 mt-8">
            <Button variant="outline" size="lg" onClick={handleClose}>Done</Button>
            <Button variant="default" size="lg" onClick={() => resetState()}>Enroll Another</Button>
          </div>
        </div>
      )}
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
      return <Loader2 size={28} className="text-[var(--pz-brand)] animate-spin" />
    }
    switch (status) {
      case 'waiting':
      case 'enrolling':
        return <Loader2 size={28} className="text-[var(--pz-brand)] animate-spin" />
      case 'detecting':
        return <Loader2 size={28} className="text-amber-500 animate-spin" />
      case 'captured':
      case 'saved':
        return <CheckCircle2 size={28} className="text-emerald-500" />
      case 'timeout':
      case 'failed':
        return <AlertCircle size={28} className="text-red-500" />
      default:
        return <Fingerprint size={28} className="text-[var(--pz-text-muted)] opacity-50" />
    }
  }

  const getStatusColor = () => {
    if (enrolling && status === 'idle') {
      return 'border-[var(--pz-brand)] bg-blue-500/[0.06]'
    }
    switch (status) {
      case 'waiting':
      case 'enrolling':
        return 'border-[var(--pz-brand)] bg-blue-500/[0.06]'
      case 'detecting':
        return 'border-amber-500 bg-amber-500/[0.06]'
      case 'captured':
      case 'saved':
        return 'border-emerald-500 bg-emerald-500/[0.06]'
      case 'timeout':
      case 'failed':
        return 'border-red-500 bg-red-500/[0.06]'
      default:
        return 'border-[var(--pz-border)] bg-[var(--pz-surface-2)]'
    }
  }

  const isConnecting = enrolling && status === 'idle'
  const showCountdownBar = countdownActive || (enrolling && (status === 'waiting' || status === 'detecting'))
  const showButton = !enrolling && !fingerprintDone

  return (
    <div className={`p-5 rounded-xl border ${getStatusColor()} text-center`}>
      <div className="flex flex-col items-center gap-3">
        {getStatusIcon()}
        <div>
          {isConnecting ? (
            <>
              <p className="text-sm font-semibold text-[var(--pz-text)]">
                Connecting to device...
              </p>
              <p className="text-xs text-[var(--pz-text-muted)] mt-1">
                Waiting for <strong>{deviceName}</strong> to be ready
              </p>
            </>
          ) : !fingerprintDone && status === 'idle' && !enrolling ? (
            <>
              <p className="text-sm font-semibold text-[var(--pz-text)]">
                Ready to capture fingerprint
              </p>
              <p className="text-xs text-[var(--pz-text-muted)] mt-1">
                Click the button below, then place your finger on <strong>{deviceName}</strong> scanner
              </p>
            </>
          ) : !fingerprintDone && !enrolling ? (
            <>
              <p className="text-sm font-semibold text-[var(--pz-text)]">
                {message || 'No fingerprint detected. Try again.'}
              </p>
              <p className="text-xs text-[var(--pz-text-muted)] mt-1">
                Click "Try Again" to retry enrollment on <strong>{deviceName}</strong>
              </p>
            </>
          ) : status === 'captured' || status === 'saved' || fingerprintDone ? (
            <p className="text-sm font-semibold text-[var(--pz-text)]">
              {message || 'Fingerprint captured successfully!'}
            </p>
          ) : (
            <>
              <p className="text-sm font-semibold text-[var(--pz-text)]">
                {message}
              </p>
            </>
          )}
        </div>

        {/* Connecting spinner */}
        {isConnecting && (
          <p className="text-xs text-[var(--pz-text-muted)]">
            This may take up to a minute...
          </p>
        )}

        {/* Countdown bar — only shown when device is actually in enrollment mode */}
        {showCountdownBar && (
          <>
            <div className="w-56 h-2 rounded-full overflow-hidden bg-[var(--pz-surface-3)]">
              <div
                className="h-full rounded-full bg-[var(--pz-brand)] transition-[width] duration-1000 ease-linear"
                style={{ width: `${(countdown / 45) * 100}%` }}
              />
            </div>
            <p className="text-xs text-[var(--pz-text-muted)]">{countdown}s remaining</p>
          </>
        )}

        {/* Retry button — only shown after a failed attempt (first attempt auto-starts) */}
        {showButton && attempts > 0 && (
          <Button variant="default" size="lg" onClick={startEnrollment} disabled={!sessionId}>
            <Fingerprint size={16} /> Try Again
          </Button>
        )}
      </div>
    </div>
  )
}
