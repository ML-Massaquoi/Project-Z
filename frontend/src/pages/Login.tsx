import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, EyeOff, LogIn, AlertCircle, Loader2, Fingerprint, Shield, Activity } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { authAPI } from '@/api/client'
import { toast } from 'sonner'

export default function Login() {
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password')
      return
    }
    setLoading(true)
    try {
      const response = await authAPI.login(username, password)
      const { access_token, user } = response.data
      login(user, access_token, response.data.refresh_token || '')
      toast.success(`Welcome back, ${user.full_name || user.username}`)
      navigate('/', { replace: true })
    } catch (err: any) {
      const raw = err.response?.data?.detail || err.message || 'Authentication failed'
      const message = typeof raw === 'object'
        ? (raw.message || raw.detail || 'Too many requests. Please try again later.')
        : String(raw)
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--pz-bg)' }}>

      <div
        className="hidden lg:flex lg:w-[52%] xl:w-[55%] flex-col justify-between relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0F172A, #1E293B, #0B1121)' }}
      >
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(59,130,246,0.8) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
        <div className="absolute top-[10%] left-[15%] w-96 h-96 rounded-full opacity-10 blur-[140px]"
          style={{ background: '#3B82F6' }} />
        <div className="absolute bottom-[15%] right-[10%] w-72 h-72 rounded-full opacity-10 blur-[120px]"
          style={{ background: '#10B981' }} />

        <div className="relative z-10 px-12 xl:px-16 pt-14">
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.25)' }}
            >
              <span className="text-blue-400 font-extrabold text-xl leading-none">Z</span>
            </div>
            <div>
              <p className="text-white font-bold text-lg leading-tight tracking-tight">Project Z</p>
              <p className="text-[13px] font-medium leading-tight" style={{ color: '#94A3B8' }}>
                Workforce Operations
              </p>
            </div>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 px-12 xl:px-16"
        >
          <h2 className="text-4xl xl:text-5xl font-extrabold text-white leading-[1.15] tracking-tight mb-6">
            Enterprise Workforce<br />
            <span style={{ color: '#60A5FA' }}>Command Center</span>
          </h2>

          <p className="text-base leading-relaxed max-w-md mb-10" style={{ color: '#94A3B8' }}>
            Biometric attendance tracking, real-time workforce monitoring, and operational intelligence — built for enterprise teams.
          </p>

          <div className="flex flex-wrap gap-2.5">
            {[
              { icon: Fingerprint, label: 'Biometric Attendance' },
              { icon: Activity,    label: 'Real-Time Monitoring' },
              { icon: Shield,      label: 'RBAC Security' },
            ].map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-medium"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#CBD5E1',
                }}
              >
                <Icon size={14} />
                {label}
              </span>
            ))}
          </div>
        </motion.div>

        <div className="relative z-10 px-12 xl:px-16 pb-12">
          <p className="text-xs" style={{ color: '#475569' }}>
            Enterprise Biometric Attendance Platform
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-8 py-12" style={{ background: 'var(--pz-bg)' }}>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-[400px]"
        >
          <div className="flex items-center gap-3 mb-12 lg:hidden">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--pz-brand)' }}
            >
              <span className="text-white font-bold text-base">Z</span>
            </div>
            <div>
              <p className="font-bold text-base" style={{ color: 'var(--pz-text)' }}>Project Z</p>
              <p className="text-xs" style={{ color: 'var(--pz-text-muted)' }}>Workforce Operations</p>
            </div>
          </div>

          <div className="mb-9">
            <h2
              className="text-3xl font-bold tracking-tight"
              style={{ color: 'var(--pz-text)' }}
            >
              Sign in
            </h2>
            <p className="text-sm mt-1.5" style={{ color: 'var(--pz-text-muted)' }}>
              Enter your credentials to access the platform
            </p>
          </div>

          <div
            className="rounded-2xl p-8"
            style={{
              background: 'var(--pz-surface-1)',
              border: '1px solid var(--pz-border)',
              boxShadow: 'var(--pz-shadow-card)',
            }}
          >
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2.5 p-3.5 rounded-xl text-sm"
                  style={{
                    background: 'var(--pz-danger-50)',
                    border: '1px solid var(--pz-danger-border)',
                    color: 'var(--pz-danger-500)',
                  }}
                >
                  <AlertCircle size={16} className="flex-shrink-0" />
                  <span>{error}</span>
                </motion.div>
              )}

              <div className="space-y-1.5">
                <label
                  htmlFor="username"
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: 'var(--pz-text-tertiary)' }}
                >
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pz-input"
                  style={{ height: 44 }}
                  placeholder="Enter your username"
                  autoComplete="username"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="password"
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: 'var(--pz-text-tertiary)' }}
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pz-input pr-11"
                    style={{ height: 44 }}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                    style={{ color: 'var(--pz-text-muted)' }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = 'var(--pz-text-secondary)')}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'var(--pz-text-muted)')}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2.5 rounded-lg font-semibold text-sm text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  height: 44,
                  background: loading ? 'var(--pz-brand-hover)' : 'var(--pz-brand)',
                  marginTop: 8,
                }}
                onMouseEnter={e => !loading && ((e.currentTarget as HTMLElement).style.background = 'var(--pz-brand-hover)')}
                onMouseLeave={e => !loading && ((e.currentTarget as HTMLElement).style.background = 'var(--pz-brand)')}
              >
                {loading ? (
                  <>
                    <Loader2 size={17} className="animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  <>
                    <LogIn size={17} />
                    Sign In
                  </>
                )}
              </button>
            </form>
          </div>

          <p className="text-[11px] mt-8 text-center" style={{ color: 'var(--pz-text-faint)' }}>
            Project Z · Enterprise Biometric Attendance Platform
          </p>
        </motion.div>
      </div>
    </div>
  )
}
