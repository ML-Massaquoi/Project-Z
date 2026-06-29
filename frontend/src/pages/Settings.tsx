import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Settings as SettingsIcon, Building2, Clock, Monitor, Bell, Shield, Save, RotateCcw } from 'lucide-react'
import { settingsAPI } from '@/api/client'
import { PageHeader } from '@/components/ui/PageHeader'
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
    <div className="space-y-5 pz-slide-up">
      <PageHeader
        title="Settings"
        subtitle="System configuration and preferences"
        breadcrumbs={[{ label: 'Administration' }, { label: 'Settings' }]}
        actions={
          isDirty ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--pz-surface-2)] hover:bg-[var(--pz-surface-3)] border border-[var(--pz-border)] text-xs font-semibold text-gray-300 transition-all"
              >
                <RotateCcw size={14} />
                Reset
              </button>
              <button
                onClick={handleSave}
                disabled={updateMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors shadow-lg shadow-blue-600/20 disabled:opacity-50"
              >
                <Save size={14} />
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Section Nav */}
        <nav className="space-y-1">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                ${activeSection === section.id
                  ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20'
                  : 'text-gray-400 hover:bg-[var(--pz-surface-2)] hover:text-gray-200 border border-transparent'
                }`}
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
            className="pz-card p-6 space-y-5"
          >
            <h3 className="text-base font-bold text-white flex items-center gap-2">
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
                    <div className="pz-skeleton h-3 w-28 rounded" />
                    <div className="pz-skeleton h-10 w-full rounded-lg" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-5">
                {(settingFields[activeSection] || []).map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-300">{field.label}</label>
                    {field.description && (
                      <p className="text-[10px] text-gray-500">{field.description}</p>
                    )}
                    {field.type === 'toggle' ? (
                      <button
                        onClick={() => handleChange(field.key, formValues[field.key] === 'true' ? 'false' : 'true')}
                        className={`relative w-10 h-5 rounded-full transition-colors ${formValues[field.key] === 'true' ? 'bg-blue-600' : 'bg-[var(--pz-surface-3)]'}`}
                      >
                        <span
                          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${formValues[field.key] === 'true' ? 'translate-x-5' : 'translate-x-0.5'}`}
                        />
                      </button>
                    ) : (
                      <input
                        type={field.type}
                        value={formValues[field.key] || ''}
                        onChange={(e) => handleChange(field.key, e.target.value)}
                        className="w-full pz-input"
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
