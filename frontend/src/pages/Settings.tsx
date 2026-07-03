import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Settings as SettingsIcon, Building2, Clock, Monitor, Bell, Shield, Save, RotateCcw } from 'lucide-react'
import { settingsAPI } from '@/api/client'
import { toast } from 'sonner'

interface SettingSection {
  id: string
  label: string
  icon: React.ElementType
  color: string
}

const sections: SettingSection[] = [
  { id: 'organization', label: 'Organization', icon: Building2, color: '#3B82F6' },
  { id: 'attendance', label: 'Attendance', icon: Clock, color: '#10B981' },
  { id: 'devices', label: 'Devices', icon: Monitor, color: '#6366F1' },
  { id: 'notifications', label: 'Notifications', icon: Bell, color: '#F59E0B' },
  { id: 'security', label: 'Security', icon: Shield, color: '#EF4444' },
]

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
  card: {
    background: 'var(--pz-surface-1)',
    border: '1px solid var(--pz-border)',
    borderRadius: '10px',
    padding: '24px',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    background: 'var(--pz-surface-2)',
    border: '1px solid var(--pz-border)',
    borderRadius: '8px',
    color: 'var(--pz-text)',
    fontSize: '14px',
    outline: 'none',
  },
}

export default function Settings() {
  const queryClient = useQueryClient()
  const [activeSection, setActiveSection] = useState('organization')
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [isDirty, setIsDirty] = useState(false)

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await settingsAPI.list()).data,
  })

  useEffect(() => {
    if (settings) {
      const values: Record<string, string> = {}
      Object.entries(settings).forEach(([key, val]) => {
        values[key] = String(val ?? '')
      })
      setFormValues(values)
    }
  }, [settings])

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, string>) => settingsAPI.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      toast.success('Settings saved successfully')
      setIsDirty(false)
    },
    onError: () => {
      toast.error('Failed to save settings')
    },
  })

  const handleChange = (key: string, value: string) => {
    setFormValues(prev => ({ ...prev, [key]: value }))
    setIsDirty(true)
  }

  const handleSave = () => {
    updateMutation.mutate(formValues)
  }

  const handleReset = () => {
    if (settings) {
      const values: Record<string, string> = {}
      Object.entries(settings).forEach(([key, val]) => {
        values[key] = String(val ?? '')
      })
      setFormValues(values)
      setIsDirty(false)
    }
  }

  const settingFields: Record<string, { key: string; label: string; type: string; description?: string }[]> = {
    organization: [
      { key: 'organization_name', label: 'Organization Name', type: 'text', description: 'The name displayed across the platform' },
      { key: 'organization_code', label: 'Organization Code', type: 'text' },
      { key: 'timezone', label: 'Timezone', type: 'text', description: 'System timezone for attendance calculations' },
      { key: 'default_office', label: 'Default Office', type: 'text' },
    ],
    attendance: [
      { key: 'attendance_calculation_mode', label: 'Calculation Mode', type: 'text', description: 'Method for calculating attendance (session-based or punch-based)' },
      { key: 'default_grace_period', label: 'Default Grace Period (minutes)', type: 'number' },
      { key: 'auto_checkout_enabled', label: 'Auto Checkout', type: 'toggle', description: 'Automatically check out employees at shift end' },
      { key: 'overtime_threshold_minutes', label: 'Overtime Threshold (minutes)', type: 'number' },
    ],
    devices: [
      { key: 'device_heartbeat_interval', label: 'Heartbeat Interval (seconds)', type: 'number', description: 'How often devices report status' },
      { key: 'device_offline_threshold', label: 'Offline Threshold (seconds)', type: 'number', description: 'Time before device is marked offline' },
      { key: 'adms_listener_port', label: 'ADMS Listener Port', type: 'number' },
    ],
    notifications: [
      { key: 'alert_on_device_offline', label: 'Device Offline Alert', type: 'toggle' },
      { key: 'alert_on_critical_absence', label: 'Critical Absence Alert', type: 'toggle' },
      { key: 'email_notifications', label: 'Email Notifications', type: 'toggle' },
    ],
    security: [
      { key: 'session_timeout_minutes', label: 'Session Timeout (minutes)', type: 'number', description: 'Auto-logout after inactivity' },
      { key: 'max_login_attempts', label: 'Max Login Attempts', type: 'number' },
      { key: 'password_min_length', label: 'Minimum Password Length', type: 'number' },
    ],
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h1 style={s.headerTitle}>Settings</h1>
          <p style={s.headerSubtitle}>System configuration and preferences</p>
        </div>
        {isDirty ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={handleReset}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',
                borderRadius: '8px', background: 'var(--pz-surface-2)',
                border: '1px solid var(--pz-border)', fontSize: '12px',
                fontWeight: 600, color: 'var(--pz-text-secondary)', cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <RotateCcw size={14} />
              Reset
            </button>
            <button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px',
                borderRadius: '8px', background: '#3B82F6', color: '#fff',
                fontSize: '14px', fontWeight: 600, border: 'none', cursor: 'pointer',
                boxShadow: '0 4px 6px rgba(59,130,246,0.2)',
                opacity: updateMutation.isPending ? 0.5 : 1,
                transition: 'all 0.15s',
              }}
            >
              <Save size={14} />
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        ) : undefined}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Section Nav */}
        <nav className="space-y-1">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '9px 12px',
                width: '100%',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 500,
                border: activeSection === section.id ? '1px solid rgba(59,130,246,0.2)' : '1px solid transparent',
                background: activeSection === section.id ? 'rgba(59,130,246,0.1)' : 'transparent',
                color: activeSection === section.id ? '#3B82F6' : 'var(--pz-text-muted)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => { if (activeSection !== section.id) { e.currentTarget.style.background = 'var(--pz-surface-2)'; e.currentTarget.style.color = 'var(--pz-text-secondary)' } }}
              onMouseLeave={(e) => { if (activeSection !== section.id) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--pz-text-muted)' } }}
            >
              <section.icon size={16} style={{ color: activeSection === section.id ? section.color : undefined }} />
              {section.label}
            </button>
          ))}
        </nav>

        {/* Settings Form */}
        <div className="lg:col-span-3">
          <motion.div
            key={activeSection}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            style={{ ...s.card }}
            className="space-y-5"
          >
            <h3 className="text-base font-bold" style={{ color: 'var(--pz-text)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              {(() => {
                const section = sections.find(s => s.id === activeSection)
                const Icon = section?.icon || SettingsIcon
                return <Icon size={18} style={{ color: section?.color }} />
              })()}
              {sections.find(s => s.id === activeSection)?.label} Settings
            </h3>

            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div style={{ height: '12px', width: '112px', borderRadius: '6px', background: 'var(--pz-surface-3)' }} />
                    <div style={{ height: '40px', width: '100%', borderRadius: '8px', background: 'var(--pz-surface-3)' }} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-5">
                {(settingFields[activeSection] || []).map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pz-text-secondary)' }}>{field.label}</label>
                    {field.description && (
                      <p style={{ fontSize: '10px', color: 'var(--pz-text-muted)', margin: 0 }}>{field.description}</p>
                    )}
                    {field.type === 'toggle' ? (
                      <button
                        onClick={() => handleChange(field.key, formValues[field.key] === 'true' ? 'false' : 'true')}
                        style={{
                          position: 'relative', width: '40px', height: '20px',
                          borderRadius: '10px', border: 'none', cursor: 'pointer',
                          transition: 'background 0.2s',
                          background: formValues[field.key] === 'true' ? '#3B82F6' : 'var(--pz-surface-3)',
                        }}
                      >
                        <span
                          style={{
                            position: 'absolute', top: '2px', width: '16px', height: '16px',
                            borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                            transition: 'transform 0.2s',
                            transform: formValues[field.key] === 'true' ? 'translateX(20px)' : 'translateX(2px)',
                          }}
                        />
                      </button>
                    ) : (
                      <input
                        type={field.type}
                        value={formValues[field.key] || ''}
                        onChange={(e) => handleChange(field.key, e.target.value)}
                        style={s.input}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  )
}
