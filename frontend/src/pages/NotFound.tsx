import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Home, ArrowLeft, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'

const s = {
  page: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '28px',
    padding: '32px',
    flex: 1,
  },
}

export default function NotFound() {
  const navigate = useNavigate()

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--pz-bg)', padding: '16px' }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{ textAlign: 'center', maxWidth: '400px' }}
      >
        <motion.div
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
          style={{ marginBottom: '32px' }}
        >
          <span style={{ fontSize: '80px', fontWeight: 800, background: 'linear-gradient(135deg, #3B82F6, #6366F1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            404
          </span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          style={{ marginBottom: '24px' }}
        >
          <div style={{ width: '64px', height: '64px', borderRadius: '10px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
            <Search size={28} color="var(--pz-text-muted)" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--pz-text-secondary)', margin: 0 }}>Page Not Found</h1>
          <p style={{ fontSize: '13px', color: 'var(--pz-text-muted)', margin: '8px 0 32px' }}>
            The page you're looking for doesn't exist or has been moved.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}
        >
          <Button variant="outline" size="md" onClick={() => navigate(-1)}>
            <ArrowLeft size={15} />
            Go Back
          </Button>
          <Button variant="default" size="md" onClick={() => navigate('/')}>
            <Home size={15} />
            Dashboard
          </Button>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          style={{ fontSize: '10px', color: 'var(--pz-text-faint)', marginTop: '48px' }}
        >
          Project Z · Airport Workforce Operations Platform
        </motion.p>
      </motion.div>
    </div>
  )
}
