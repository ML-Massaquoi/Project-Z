import { useState, type ReactNode } from 'react'
import { Search, X, Calendar, ChevronDown } from 'lucide-react'

interface FilterOption {
  value: string
  label: string
}

interface FilterConfig {
  id: string
  label: string
  type: 'select' | 'date' | 'daterange'
  options?: FilterOption[]
  placeholder?: string
}

interface FilterBarProps {
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string
  filters?: FilterConfig[]
  filterValues?: Record<string, string>
  onFilterChange?: (filterId: string, value: string) => void
  onClearAll?: () => void
  actions?: ReactNode
}

export function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  filters = [],
  filterValues = {},
  onFilterChange,
  onClearAll,
  actions,
}: FilterBarProps) {
  const [openFilter, setOpenFilter] = useState<string | null>(null)
  const activeFilters = Object.entries(filterValues).filter(([, v]) => v !== '' && v !== undefined)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search Input */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] focus-within:border-[var(--pz-border-focus)] focus-within:shadow-[0_0_0_3px_rgba(37,99,235,0.1)] transition-all flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="text-[var(--pz-text-muted)] flex-shrink-0" />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="bg-transparent text-sm text-[var(--pz-text)] placeholder:text-[var(--pz-text-muted)] outline-none w-full"
            maxLength={200}
          />
          {searchValue && (
            <button
              onClick={() => onSearchChange('')}
              className="text-[var(--pz-text-muted)] hover:text-[var(--pz-text-secondary)] transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filters */}
        {filters.map((filter) => (
          <div key={filter.id} className="relative">
            {filter.type === 'select' && (
              <>
                <button
                  onClick={() => setOpenFilter(openFilter === filter.id ? null : filter.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all
                    ${filterValues[filter.id]
                      ? 'bg-[var(--pz-blue-50)] border-[var(--pz-blue-600)]/30 text-blue-400'
                      : 'bg-[var(--pz-surface-2)] border-[var(--pz-border)] text-[var(--pz-text-muted)] hover:text-[var(--pz-text)] hover:border-[var(--pz-border-strong)]'
                    }`}
                >
                  <span>{filterValues[filter.id]
                    ? filter.options?.find(o => o.value === filterValues[filter.id])?.label || filter.label
                    : filter.label
                  }</span>
                  <ChevronDown size={14} className={`transition-transform ${openFilter === filter.id ? 'rotate-180' : ''}`} />
                </button>

                {openFilter === filter.id && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setOpenFilter(null)} />
                    <div className="absolute top-full left-0 mt-1 min-w-[180px] rounded-lg border border-[var(--pz-border)] bg-[var(--pz-surface-1)] shadow-xl z-20 py-1 pz-scale-in max-h-[240px] overflow-y-auto">
                      <button
                        onClick={() => { onFilterChange?.(filter.id, ''); setOpenFilter(null) }}
                        className="w-full text-left px-3 py-2 text-sm text-[var(--pz-text-muted)] hover:bg-[var(--pz-surface-2)] transition-colors"
                      >
                        All
                      </button>
                      {filter.options?.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => { onFilterChange?.(filter.id, option.value); setOpenFilter(null) }}
                          className={`w-full text-left px-3 py-2 text-sm transition-colors
                            ${filterValues[filter.id] === option.value
                              ? 'text-blue-400 bg-[var(--pz-blue-50)]'
                              : 'text-[var(--pz-text-secondary)] hover:bg-[var(--pz-surface-2)]'
                            }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            {filter.type === 'date' && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--pz-surface-2)] border border-[var(--pz-border)] focus-within:border-[var(--pz-border-focus)] transition-all">
                <Calendar size={14} className="text-[var(--pz-text-muted)] flex-shrink-0" />
                <input
                  type="date"
                  value={filterValues[filter.id] || ''}
                  onChange={(e) => onFilterChange?.(filter.id, e.target.value)}
                  className="bg-transparent text-sm text-[var(--pz-text)] outline-none"
                />
              </div>
            )}
          </div>
        ))}

        {/* Right-side actions */}
        {actions && (
          <div className="flex items-center gap-2 ml-auto">
            {actions}
          </div>
        )}
      </div>

      {/* Active Filter Pills */}
      {activeFilters.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold text-[var(--pz-text-muted)] uppercase tracking-wider">Active:</span>
          {activeFilters.map(([key, value]) => {
            const config = filters.find(f => f.id === key)
            const displayValue = config?.options?.find(o => o.value === value)?.label || value
            return (
              <span
                key={key}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--pz-blue-50)] border border-[var(--pz-blue-600)]/20 text-[11px] font-medium text-blue-400"
              >
                <span className="text-[var(--pz-text-muted)]">{config?.label}:</span>
                {displayValue}
                <button
                  onClick={() => onFilterChange?.(key, '')}
                  className="text-blue-500 hover:text-blue-300 transition-colors"
                >
                  <X size={12} />
                </button>
              </span>
            )
          })}
          <button
            onClick={onClearAll}
            className="text-[11px] text-[var(--pz-text-muted)] hover:text-[var(--pz-text-secondary)] transition-colors underline"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  )
}
