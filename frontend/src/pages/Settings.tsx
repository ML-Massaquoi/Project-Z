import { motion } from 'framer-motion'
import { Settings as SettingsIcon, Shield, Clock, Building2 } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'

export default function Settings() {
  const { user } = useAuthStore()

  return (
    <div className="animate-fade-in max-w-3xl mx-auto space-y-6">
      {/* Profile */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2.5 rounded-xl bg-blue-50"><Shield size={20} className="text-[var(--color-primary)]" /></div>
          <h2 className="font-semibold text-[var(--color-slate-800)]">Account Profile</h2>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="p-4 rounded-xl bg-[var(--color-slate-50)]">
            <p className="text-[var(--color-slate-400)] text-xs uppercase font-semibold mb-1">Username</p>
            <p className="font-medium text-[var(--color-slate-700)]">{user?.username}</p>
          </div>
          <div className="p-4 rounded-xl bg-[var(--color-slate-50)]">
            <p className="text-[var(--color-slate-400)] text-xs uppercase font-semibold mb-1">Email</p>
            <p className="font-medium text-[var(--color-slate-700)]">{user?.email}</p>
          </div>
          <div className="p-4 rounded-xl bg-[var(--color-slate-50)]">
            <p className="text-[var(--color-slate-400)] text-xs uppercase font-semibold mb-1">Full Name</p>
            <p className="font-medium text-[var(--color-slate-700)]">{user?.full_name || '—'}</p>
          </div>
          <div className="p-4 rounded-xl bg-[var(--color-slate-50)]">
            <p className="text-[var(--color-slate-400)] text-xs uppercase font-semibold mb-1">Role</p>
            <p className="font-medium text-[var(--color-slate-700)]">
              {user?.role_type === 'super_admin' ? 'Super Administrator' : user?.role || '—'}
            </p>
          </div>
        </div>
      </motion.div>

      {/* System Info */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2.5 rounded-xl bg-indigo-50"><SettingsIcon size={20} className="text-indigo-500" /></div>
          <h2 className="font-semibold text-[var(--color-slate-800)]">System Information</h2>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="p-4 rounded-xl bg-[var(--color-slate-50)]">
            <p className="text-[var(--color-slate-400)] text-xs uppercase font-semibold mb-1">Organization</p>
            <p className="font-medium text-[var(--color-slate-700)]">Freetown International Airport</p>
          </div>
          <div className="p-4 rounded-xl bg-[var(--color-slate-50)]">
            <p className="text-[var(--color-slate-400)] text-xs uppercase font-semibold mb-1">Country</p>
            <p className="font-medium text-[var(--color-slate-700)]">Sierra Leone</p>
          </div>
          <div className="p-4 rounded-xl bg-[var(--color-slate-50)]">
            <p className="text-[var(--color-slate-400)] text-xs uppercase font-semibold mb-1">Timezone</p>
            <p className="font-medium text-[var(--color-slate-700)]">Freetown / UTC</p>
          </div>
          <div className="p-4 rounded-xl bg-[var(--color-slate-50)]">
            <p className="text-[var(--color-slate-400)] text-xs uppercase font-semibold mb-1">Version</p>
            <p className="font-medium text-[var(--color-slate-700)]">Project Z v1.0.0</p>
          </div>
        </div>
      </motion.div>

      {/* ADMS Info */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2.5 rounded-xl bg-cyan-50"><Building2 size={20} className="text-cyan-500" /></div>
          <h2 className="font-semibold text-[var(--color-slate-800)]">ADMS Configuration</h2>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between p-4 rounded-xl bg-[var(--color-slate-50)]">
            <span className="text-[var(--color-slate-400)]">ADMS Endpoint</span>
            <span className="font-mono text-[var(--color-slate-700)]">/iclock/cdata</span>
          </div>
          <div className="flex justify-between p-4 rounded-xl bg-[var(--color-slate-50)]">
            <span className="text-[var(--color-slate-400)]">ADMS Port</span>
            <span className="font-mono text-[var(--color-slate-700)]">8081</span>
          </div>
          <div className="flex justify-between p-4 rounded-xl bg-[var(--color-slate-50)]">
            <span className="text-[var(--color-slate-400)]">Duplicate Window</span>
            <span className="font-mono text-[var(--color-slate-700)]">60 seconds</span>
          </div>
          <div className="flex justify-between p-4 rounded-xl bg-[var(--color-slate-50)]">
            <span className="text-[var(--color-slate-400)]">Default Grace Period</span>
            <span className="font-mono text-[var(--color-slate-700)]">15 minutes</span>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
