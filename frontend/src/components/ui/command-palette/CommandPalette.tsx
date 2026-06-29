import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, LayoutDashboard, Users, Fingerprint, Monitor, Building2,
  Clock, FileBarChart, UserCog, Settings, ScrollText, Activity,
  AlertCircle, ArrowRight, Command, Plus, BarChart2, History, X, RefreshCw,
} from 'lucide-react'

const RECENT_SEARCHES_KEY = 'pz:command-palette:recent'
const MAX_RECENT = 5

interface CommandItem {
  id: string
  label: string
  description?: string
  icon: React.ReactNode
  action: () => void
  group: string
  keywords?: string[]
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

function loadRecentSearches(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function saveRecentSearch(query: string) {
  if (!query.trim()) return
  try {
    const recent = loadRecentSearches()
    const updated = [query, ...recent.filter(r => r !== query)].slice(0, MAX_RECENT)
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated))
  } catch {
    // ignore storage errors
  }
}

function clearRecentSearches() {
  try {
    localStorage.removeItem(RECENT_SEARCHES_KEY)
  } catch {
    // ignore
  }
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const nav = useCallback((path: string) => {
    navigate(path)
    onClose()
  }, [navigate, onClose])

  const commands: CommandItem[] = useMemo(() => [
    // Navigation
    { id: 'nav-dashboard',   label: 'Dashboard',           description: 'Operations Command Center',    icon: <LayoutDashboard size={16} />, action: () => nav('/'),               group: 'Navigate', keywords: ['home', 'overview'] },
    { id: 'nav-live',        label: 'Live Monitor',         description: 'Real-time scan feed',          icon: <Activity size={16} />,        action: () => nav('/live-monitor'),   group: 'Navigate', keywords: ['scan', 'real-time', 'feed'] },
    { id: 'nav-attendance',  label: 'Attendance',           description: 'Workforce attendance tracking', icon: <Fingerprint size={16} />,     action: () => nav('/attendance'),     group: 'Navigate', keywords: ['clock', 'check-in'] },
    { id: 'nav-employees',   label: 'Employees',            description: 'Workforce management',         icon: <Users size={16} />,           action: () => nav('/employees'),      group: 'Navigate', keywords: ['staff', 'people', 'workforce'] },
    { id: 'nav-departments', label: 'Departments',          description: 'Organizational structure',     icon: <Building2 size={16} />,       action: () => nav('/departments'),    group: 'Navigate', keywords: ['org', 'teams'] },
    { id: 'nav-devices',     label: 'Devices',              description: 'Biometric terminal fleet',     icon: <Monitor size={16} />,         action: () => nav('/devices'),        group: 'Navigate', keywords: ['terminal', 'biometric'] },
    { id: 'nav-sync',        label: 'Sync Center',          description: 'Device synchronization hub',   icon: <RefreshCw size={16} />,       action: () => nav('/sync-center'),    group: 'Navigate', keywords: ['sync', 'device', 'synchronization'] },
    { id: 'nav-unrecognized',label: 'Unrecognized Users',   description: 'Identity resolution',          icon: <AlertCircle size={16} />,     action: () => nav('/unrecognized'),   group: 'Navigate', keywords: ['unknown', 'match'] },
    { id: 'nav-shifts',      label: 'Shifts & Schedules',   description: 'Shift management',             icon: <Clock size={16} />,           action: () => nav('/shifts'),         group: 'Navigate', keywords: ['schedule', 'roster'] },
    { id: 'nav-reports',     label: 'Reports',              description: 'Generate and export reports',  icon: <FileBarChart size={16} />,    action: () => nav('/reports'),        group: 'Navigate', keywords: ['export', 'analytics'] },
    { id: 'nav-users',       label: 'Users & Roles',        description: 'Access management',            icon: <UserCog size={16} />,         action: () => nav('/users'),          group: 'Navigate', keywords: ['access', 'permissions', 'admin'] },
    { id: 'nav-settings',    label: 'Settings',             description: 'System configuration',         icon: <Settings size={16} />,        action: () => nav('/settings'),       group: 'Navigate', keywords: ['config', 'preferences'] },
    { id: 'nav-audit',       label: 'Audit Logs',           description: 'System audit trail',           icon: <ScrollText size={16} />,      action: () => nav('/audit'),          group: 'Navigate', keywords: ['log', 'trail', 'history'] },

    // Quick Actions
    { id: 'action-add-employee',    label: 'Add Employee',      description: 'Create a new employee record',   icon: <Plus size={16} />,         action: () => nav('/employees?action=create'), group: 'Quick Actions', keywords: ['new', 'create', 'hire'] },
    { id: 'action-add-department',  label: 'Add Department',    description: 'Create a new department',        icon: <Building2 size={16} />,    action: () => nav('/departments'),            group: 'Quick Actions', keywords: ['new', 'org', 'create'] },
    { id: 'action-create-report',   label: 'Create Report',     description: 'Generate an attendance report',  icon: <BarChart2 size={16} />,    action: () => nav('/reports'),               group: 'Quick Actions', keywords: ['generate', 'export', 'analytics'] },
    { id: 'action-live-monitor',    label: 'Open Live Monitor', description: 'Watch real-time scan events',    icon: <Activity size={16} />,     action: () => nav('/live-monitor'),          group: 'Quick Actions', keywords: ['live', 'scan', 'real-time'] },
  ], [nav])

  const filtered = useMemo(() => {
    if (!query.trim()) return commands
    const q = query.toLowerCase()
    return commands.filter(cmd =>
      cmd.label.toLowerCase().includes(q) ||
      cmd.description?.toLowerCase().includes(q) ||
      cmd.keywords?.some(kw => kw.includes(q))
    )
  }, [commands, query])

  const grouped = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {}
    filtered.forEach(cmd => {
      if (!groups[cmd.group]) groups[cmd.group] = []
      groups[cmd.group].push(cmd)
    })
    return groups
  }, [filtered])

  const flatItems = useMemo(() => filtered, [filtered])

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      setRecentSearches(loadRecentSearches())
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const items = listRef.current.querySelectorAll('[data-command-item]')
    items[selectedIndex]?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const handleSelect = useCallback((item: CommandItem) => {
    saveRecentSearch(item.label)
    item.action()
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, flatItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = flatItems[selectedIndex]
      if (item) handleSelect(item)
    } else if (e.key === 'Escape') {
      onClose()
    }
  }, [flatItems, selectedIndex, onClose, handleSelect])

  // Global keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (open) onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const handleClearRecent = () => {
    clearRecentSearches()
    setRecentSearches([])
  }

  const handleRecentClick = (term: string) => {
    setQuery(term)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const showRecent = !query.trim() && recentSearches.length > 0

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            style={{ zIndex: 100 }}
            onClick={onClose}
          />

          {/* Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed left-1/2 top-[18%] -translate-x-1/2 w-full max-w-[580px] px-4"
            style={{ zIndex: 101 }}
          >
            <div
              className="rounded-2xl border overflow-hidden"
              style={{
                background: 'var(--pz-surface-1)',
                borderColor: 'var(--pz-border)',
                boxShadow: 'var(--pz-shadow-modal)',
              }}
              onKeyDown={handleKeyDown}
            >
              {/* Search Input */}
              <div
                className="flex items-center gap-3 px-4 py-3.5 border-b"
                style={{ borderColor: 'var(--pz-border)' }}
              >
                <Search size={16} className="flex-shrink-0" style={{ color: 'var(--pz-text-muted)' }} />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search commands, navigate, or find anything..."
                  className="bg-transparent text-sm outline-none w-full"
                  style={{ color: 'var(--pz-text)' }}
                  autoFocus
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    className="text-[var(--pz-text-muted)] hover:text-[var(--pz-text-secondary)] transition-colors flex-shrink-0"
                  >
                    <X size={14} />
                  </button>
                )}
                <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-[10px] text-[var(--pz-text-muted)] font-mono flex-shrink-0">
                  ESC
                </kbd>
              </div>

              {/* Recent Searches */}
              {showRecent && (
                <div className="border-b border-[var(--pz-border)] py-2">
                  <div className="flex items-center justify-between px-4 py-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--pz-text-muted)] uppercase tracking-widest">
                      <History size={10} />
                      Recent
                    </div>
                    <button
                      onClick={handleClearRecent}
                      className="text-[10px] text-[var(--pz-text-faint)] hover:text-[var(--pz-text-muted)] transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="px-3 mt-1 flex flex-wrap gap-1.5">
                    {recentSearches.map((term) => (
                      <button
                        key={term}
                        onClick={() => handleRecentClick(term)}
                        className="px-2.5 py-1 rounded-lg text-xs bg-[var(--pz-surface-2)] border border-[var(--pz-border)] text-[var(--pz-text-secondary)] hover:text-[var(--pz-text)] hover:bg-[var(--pz-surface-3)] transition-colors"
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Results */}
              <div ref={listRef} className="max-h-[360px] overflow-y-auto py-2">
                {Object.keys(grouped).length === 0 ? (
                  <div className="px-4 py-8 text-center text-[var(--pz-text-muted)]">
                    <p className="text-sm">No results found</p>
                    <p className="text-xs mt-1 text-[var(--pz-text-faint)]">Try a different search term</p>
                  </div>
                ) : (
                  Object.entries(grouped).map(([group, items]) => (
                    <div key={group} className="mb-1">
                      <div className="px-4 py-1.5">
                        <span className="text-[10px] font-semibold text-[var(--pz-text-muted)] uppercase tracking-widest">
                          {group}
                        </span>
                      </div>
                      {items.map((item) => {
                        const globalIndex = flatItems.indexOf(item)
                        const isSelected = globalIndex === selectedIndex

                        return (
                          <button
                            key={item.id}
                            data-command-item
                            onClick={() => handleSelect(item)}
                            onMouseEnter={() => setSelectedIndex(globalIndex)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors
                              ${isSelected
                                ? 'bg-blue-600/10 text-blue-400'
                                : 'text-[var(--pz-text-secondary)] hover:bg-[var(--pz-surface-2)]'
                              }`}
                          >
                            <span className={`flex-shrink-0 ${isSelected ? 'text-blue-400' : 'text-[var(--pz-text-muted)]'}`}>
                              {item.icon}
                            </span>
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium">{item.label}</span>
                              {item.description && (
                                <span className="text-xs text-[var(--pz-text-muted)] ml-2">{item.description}</span>
                              )}
                            </div>
                            {isSelected && (
                              <ArrowRight size={14} className="text-blue-400 flex-shrink-0" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--pz-border)] bg-[var(--pz-surface-0)]/50">
                <div className="flex items-center gap-3 text-[10px] text-[var(--pz-text-muted)]">
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.5 rounded bg-[var(--pz-surface-2)] border border-[var(--pz-border)] font-mono">↑↓</kbd>
                    navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.5 rounded bg-[var(--pz-surface-2)] border border-[var(--pz-border)] font-mono">↵</kbd>
                    select
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.5 rounded bg-[var(--pz-surface-2)] border border-[var(--pz-border)] font-mono">esc</kbd>
                    close
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-[var(--pz-text-muted)]">
                  <Command size={10} />
                  <span>Command Palette</span>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
