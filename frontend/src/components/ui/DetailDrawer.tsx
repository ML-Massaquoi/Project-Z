import { type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

interface DetailDrawerProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  width?: number
  actions?: ReactNode
  children: ReactNode
}

// Topbar height — must match --pz-topbar-height (60px)
const TOPBAR_H = 60

export function DetailDrawer({
  open,
  onClose,
  title,
  subtitle,
  width = 480,
  actions,
  children,
}: DetailDrawerProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — sits BELOW the topbar so header buttons remain clickable */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              top: TOPBAR_H,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.45)',
              backdropFilter: 'blur(2px)',
              zIndex: 50,
            }}
          />

          {/* Drawer Panel — also starts below topbar */}
          <motion.aside
            initial={{ x: width, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: width, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'fixed',
              top: TOPBAR_H,
              right: 0,
              bottom: 0,
              width: `min(${width}px, 100vw)`,
              zIndex: 51,
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--pz-surface-1)',
              borderLeft: '1px solid var(--pz-border)',
              boxShadow: '-8px 0 40px rgba(0,0,0,0.30)',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                padding: '24px 28px 20px 28px',
                borderBottom: '1px solid var(--pz-border)',
                flexShrink: 0,
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <h2
                  style={{
                    fontSize: '22px',
                    fontWeight: 700,
                    color: 'var(--pz-text)',
                    lineHeight: 1.2,
                    margin: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {title}
                </h2>
                {subtitle && (
                  <p
                    style={{
                      fontSize: '12px',
                      color: 'var(--pz-text-muted)',
                      marginTop: '4px',
                      marginBottom: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {subtitle}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '16px', flexShrink: 0, marginTop: '4px' }}>
                {actions}
                <button
                  onClick={onClose}
                  style={{
                    padding: '6px',
                    borderRadius: '4px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--pz-text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--pz-surface-2)')}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
                  aria-label="Close drawer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Scrollable content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
              {children}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
