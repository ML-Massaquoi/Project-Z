import { motion } from 'framer-motion'
import type { ReactNode, HTMLAttributes } from 'react'

export const cardStyle = {
  base: 'rounded-2xl border overflow-hidden transition-all duration-200',
  inner: 'p-6',
  bg: 'var(--pz-surface-1)',
  border: '1px solid var(--pz-border)',
  shadow: '0 1px 2px rgba(0,0,0,0.2), 0 1px 4px rgba(0,0,0,0.15)',
}

export function Section({
  delay = 0,
  className = '',
  children,
  style,
}: {
  delay?: number
  className?: string
  children: ReactNode
  style?: HTMLAttributes<HTMLDivElement>['style']
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
      style={{
        background: cardStyle.bg,
        border: cardStyle.border,
        boxShadow: cardStyle.shadow,
        borderRadius: 16,
        padding: 24,
        ...style,
      }}
    >
      {children}
    </motion.div>
  )
}

export const sectionIcon = (color: string) => ({
  padding: '10px',
  borderRadius: 12,
  background: `${color}15`,
  border: `1px solid ${color}25`,
})

export function SectionHeader({
  icon,
  title,
  action,
}: {
  icon: ReactNode
  title: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-3">
        {icon}
        <h3 className="text-sm font-bold tracking-tight" style={{ color: 'var(--pz-text)' }}>
          {title}
        </h3>
      </div>
      {action}
    </div>
  )
}

/** @deprecated Use `<SectionHeader icon={...} title="..." action={...} />` instead */
export function sectionHeader(icon: ReactNode, title: string, action?: ReactNode) {
  return <SectionHeader icon={icon} title={title} action={action} />
}
