import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Eye, EyeOff, AlertCircle, Loader2, ArrowRight,
  Fingerprint, Activity, Shield, Database, BarChart3, Bell,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { authAPI } from '@/api/client'
import { toast } from 'sonner'

/* ── Animated Background ─────────────────────────────────── */
function MeshGradient() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'radial-gradient(circle at 20% 50%, #3B82F6 0%, transparent 50%), radial-gradient(circle at 80% 20%, #10B981 0%, transparent 50%), radial-gradient(circle at 40% 80%, #8B5CF6 0%, transparent 50%), radial-gradient(circle at 70% 60%, #06B6D4 0%, transparent 50%)',
          backgroundSize: '100% 100%',
          animation: 'pz-mesh-shift 30s ease-in-out infinite alternate',
        }}
      />
    </div>
  )
}

function Watermark() {
  return (
    <div className="fixed inset-0 flex items-center justify-center pointer-events-none select-none">
      <span
        className="font-extrabold leading-none"
        style={{
          fontSize: 'clamp(300px, 40vw, 700px)',
          color: 'rgba(255,255,255,0.06)',
          letterSpacing: '-0.06em',
          animation: 'pz-watermark-float 8s ease-in-out infinite',
        }}
      >
        Z
      </span>
    </div>
  )
}

/* ── Feature Carousel ────────────────────────────────────── */
const features = [
  { icon: Fingerprint, title: 'Biometric Attendance', desc: 'Multi-device fingerprint & face recognition with ADMS push' },
  { icon: Activity,    title: 'Real-Time Monitoring',  desc: 'Live workforce tracking, operational alerts & device health' },
  { icon: Shield,      title: 'Enterprise Security',   desc: 'RBAC, audit trails, JWT auth & compliance-ready' },
  { icon: Database,    title: 'Centralized Database',   desc: 'PostgreSQL with automated scaling & partitioning' },
  { icon: BarChart3,   title: 'Analytics & Reports',    desc: 'Department analytics, overtime & CSV/Excel exports' },
  { icon: Bell,        title: 'Smart Notifications',    desc: 'Real-time alerts for absences & system events' },
]

function FeatureCarousel() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => (i + 1) % features.length), 3500)
    return () => clearInterval(timer)
  }, [])

  const f = features[index]

  return (
      <div
        className="rounded-2xl"
        style={{
          padding: '16px 20px',
          background: 'rgba(15,23,42,0.5)',
          border: '1px solid rgba(255,255,255,0.04)',
        }}
      >
        <div className="flex items-center gap-1 mb-3">
          {features.map((_, i) => (
            <div
              key={i}
              className="h-[2px] flex-1 rounded-full transition-all duration-700"
              style={{ background: i === index ? '#3B82F6' : 'rgba(255,255,255,0.06)' }}
            />
          ))}
        </div>
        <div className="relative" style={{ height: 52 }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0 flex items-start gap-3.5"
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(59,130,246,0.1)' }}
              >
                <f.icon size={16} style={{ color: '#60A5FA' }} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold" style={{ color: '#E2E8F0' }}>{f.title}</p>
                <p className="text-[13px] mt-0.5 leading-relaxed" style={{ color: '#64748B' }}>{f.desc}</p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
  )
}

/* ── Login ───────────────────────────────────────────────── */
export default function Login() {
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const usernameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    usernameRef.current?.focus()
  }, [])

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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: '#0B1121' }}
    >
      <MeshGradient />
      <Watermark />

      <div className="w-full max-w-[420px] relative z-10 px-6 py-10">
        {/* Title */}
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08 }}
          className="text-[32px] font-bold tracking-[-0.02em] text-center"
          style={{ color: '#F1F5F9' }}
        >
          Welcome back
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.12 }}
          className="text-[15px] mt-1.5 mb-8 text-center"
          style={{ color: '#64748B' }}
        >
          Sign in to your account
        </motion.p>

        {/* Auth Card */}
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="relative overflow-hidden backdrop-blur-xl"
          style={{
            padding: 40,
            borderRadius: 20,
            background: 'rgba(15,23,42,0.75)',
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.2)',
          }}
        >
          {/* Top edge glow */}
          <div
            className="absolute top-0 left-0 right-0 h-[1px]"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.25), transparent)' }}
          />

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2.5 p-3.5 rounded-xl text-sm"
                style={{
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  color: '#F87171',
                }}
              >
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </motion.div>
            )}

            {/* Username */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.18 }}
            >
              <label
                htmlFor="username"
                className="block text-[13px] font-medium mb-2"
                style={{ color: '#94A3B8' }}
              >
                Username
              </label>
              <div className="relative">
                <div
                  className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full transition-all duration-200"
                  style={{ background: '#3B82F6', opacity: 0 }}
                  data-focus-indicator
                />
                <input
                  ref={usernameRef}
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  aria-label="Username"
                  className="w-full transition-all duration-150"
                  style={{
                    height: 50,
                    padding: '0 16px',
                    borderRadius: 12,
                    background: 'rgba(30,41,59,0.6)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    color: '#F1F5F9',
                    fontSize: 15,
                    outline: 'none',
                  }}
                  placeholder="Enter your username"
                  autoComplete="username"
                  onFocus={(e) => {
                    const parent = e.currentTarget.parentElement
                    e.currentTarget.style.borderColor = 'rgba(59,130,246,0.4)'
                    e.currentTarget.style.boxShadow = '0 0 0 1px rgba(59,130,246,0.15), 0 0 20px rgba(59,130,246,0.05)'
                    e.currentTarget.style.background = 'rgba(30,41,59,0.85)'
                    const indicator = parent?.querySelector('[data-focus-indicator]') as HTMLElement
                    if (indicator) indicator.style.opacity = '1'
                  }}
                  onBlur={(e) => {
                    const parent = e.currentTarget.parentElement
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'
                    e.currentTarget.style.boxShadow = 'none'
                    e.currentTarget.style.background = 'rgba(30,41,59,0.6)'
                    const indicator = parent?.querySelector('[data-focus-indicator]') as HTMLElement
                    if (indicator) indicator.style.opacity = '0'
                  }}
                />
              </div>
            </motion.div>

            {/* Password */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.22 }}
            >
              <label
                htmlFor="password"
                className="block text-[13px] font-medium mb-2"
                style={{ color: '#94A3B8' }}
              >
                Password
              </label>
              <div className="relative">
                <div
                  className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full transition-all duration-200"
                  style={{ background: '#3B82F6', opacity: 0 }}
                  data-focus-indicator
                />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-label="Password"
                  className="w-full transition-all duration-150"
                  style={{
                    height: 50,
                    padding: '0 44px 0 16px',
                    borderRadius: 12,
                    background: 'rgba(30,41,59,0.6)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    color: '#F1F5F9',
                    fontSize: 15,
                    outline: 'none',
                  }}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  onFocus={(e) => {
                    const parent = e.currentTarget.parentElement
                    e.currentTarget.style.borderColor = 'rgba(59,130,246,0.4)'
                    e.currentTarget.style.boxShadow = '0 0 0 1px rgba(59,130,246,0.15), 0 0 20px rgba(59,130,246,0.05)'
                    e.currentTarget.style.background = 'rgba(30,41,59,0.85)'
                    const indicator = parent?.querySelector('[data-focus-indicator]') as HTMLElement
                    if (indicator) indicator.style.opacity = '1'
                  }}
                  onBlur={(e) => {
                    const parent = e.currentTarget.parentElement
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'
                    e.currentTarget.style.boxShadow = 'none'
                    e.currentTarget.style.background = 'rgba(30,41,59,0.6)'
                    const indicator = parent?.querySelector('[data-focus-indicator]') as HTMLElement
                    if (indicator) indicator.style.opacity = '0'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: '#475569' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#94A3B8')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#475569')}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              <div className="flex justify-end mt-2">
                <button
                  type="button"
                  className="text-[12px] font-medium transition-colors hover:underline"
                  style={{ color: '#475569' }}
                >
                  Forgot password?
                </button>
              </div>
            </motion.div>

            {/* Submit */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.26 }}
            >
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2.5 font-semibold text-[15px] text-white transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden"
                style={{
                  height: 50,
                  borderRadius: 12,
                  background: loading
                    ? 'linear-gradient(135deg, #3B82F6, #2563EB)'
                    : 'linear-gradient(135deg, #3B82F6, #2563EB)',
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #60A5FA, #3B82F6)'
                    e.currentTarget.style.transform = 'translateY(-1px)'
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(59,130,246,0.35)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading) {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #3B82F6, #2563EB)'
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = 'none'
                  }
                }}
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight size={18} className="transition-transform duration-150 group-hover:translate-x-1" />
                  </>
                )}
              </button>
            </motion.div>

            {/* OR Divider */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.3 }}
              className="flex items-center gap-4 pt-1"
            >
              <div className="flex-1 h-[1px]" style={{ background: 'rgba(255,255,255,0.05)' }} />
              <span className="text-[12px] font-medium flex-shrink-0" style={{ color: '#334155' }}>OR</span>
              <div className="flex-1 h-[1px]" style={{ background: 'rgba(255,255,255,0.05)' }} />
            </motion.div>
          </form>
        </motion.div>

        {/* Feature Carousel */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6"
        >
          <FeatureCarousel />
        </motion.div>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.45 }}
          className="text-[11px] text-center mt-10"
          style={{ color: '#1E293B' }}
        >
          &copy; 2026 Project Z
        </motion.p>
      </div>
    </motion.div>
  )
}
