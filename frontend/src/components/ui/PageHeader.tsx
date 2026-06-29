import { type ReactNode, type ElementType } from 'react'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface PageHeaderProps {
  title: string
  subtitle?: string
  /** Alias for subtitle — some pages use description */
  description?: string
  breadcrumbs?: BreadcrumbItem[]
  actions?: ReactNode
  tabs?: ReactNode
  badge?: ReactNode
  /** Optional icon shown before the title */
  icon?: ElementType
  /** Color for the icon */
  iconColor?: string
}

export function PageHeader({ title, subtitle, description, breadcrumbs, actions, tabs, badge, icon: Icon, iconColor }: PageHeaderProps) {
  const subText = subtitle || description
  return (
    <div className="mb-8 space-y-4 pz-slide-up">
        {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1 text-xs text-[var(--pz-text-muted)]">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={14} className="text-[var(--pz-text-faint)]" />}
              {crumb.href ? (
                <Link to={crumb.href} className="hover:text-[var(--pz-text-secondary)] transition-colors">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-[var(--pz-text-tertiary)]">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            {Icon && (
              <div
                className="p-2.5 rounded-lg border flex-shrink-0"
                style={{
                  background: 'var(--pz-brand-50)',
                  borderColor: 'var(--pz-brand-200)',
                }}
              >
                <Icon size={20} style={{ color: iconColor || 'var(--pz-brand)' }} />
              </div>
            )}
            <h1
              className="text-[30px] font-bold tracking-tight truncate leading-none"
              style={{ color: 'var(--pz-text)' }}
            >
              {title}
            </h1>
            {badge}
          </div>
          {subText && (
            <p className="text-sm mt-1.5" style={{ color: 'var(--pz-text-muted)' }}>{subText}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-3 flex-shrink-0">
            {actions}
          </div>
        )}
      </div>

      {/* Tabs */}
      {tabs}
    </div>
  )
}

/* ── Tab Bar Component ───────────────────────────────────── */
interface TabItem {
  id: string
  label: string
  icon?: ReactNode
  badge?: number
}

interface TabBarProps {
  tabs: TabItem[]
  activeTab: string
  onChange: (id: string) => void
}

export function TabBar({ tabs, activeTab, onChange }: TabBarProps) {
  return (
    <div className="flex items-center gap-1 p-1 bg-[var(--pz-surface-2)]/50 border border-[var(--pz-border)] rounded-lg w-fit">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
            ${activeTab === tab.id
              ? 'bg-[var(--pz-surface-1)] text-[var(--pz-text)] shadow-sm border border-[var(--pz-border)]'
              : 'text-[var(--pz-text-muted)] hover:text-[var(--pz-text-secondary)] hover:bg-[var(--pz-surface-1)]'
            }`}
        >
          {tab.icon}
          <span>{tab.label}</span>
          {tab.badge !== undefined && tab.badge > 0 && (
            <span className="min-w-[20px] h-[20px] flex items-center justify-center px-1 rounded-full bg-amber-500/15 text-amber-500 text-[10px] font-bold">
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
