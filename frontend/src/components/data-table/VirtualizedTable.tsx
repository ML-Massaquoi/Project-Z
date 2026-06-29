import { useRef, type ReactNode } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useState } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VirtualizedTableProps<TData> {
  data: TData[]
  columns: ColumnDef<TData, unknown>[]
  loading?: boolean
  skeletonRows?: number
  compact?: boolean
  stickyHeader?: boolean
  onRowClick?: (row: TData) => void
  emptyState?: ReactNode
  rowHeight?: number
  containerHeight?: number | string
  className?: string
}

/**
 * High-performance virtualized table for thousands of rows.
 * Uses @tanstack/react-virtual for DOM recycling.
 * Only visible rows are rendered — no lag at any dataset size.
 */
export function VirtualizedTable<TData>({
  data,
  columns,
  loading = false,
  skeletonRows = 12,
  compact = false,
  stickyHeader = true,
  onRowClick,
  emptyState,
  rowHeight = compact ? 44 : 56,
  containerHeight = 600,
  className,
}: VirtualizedTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([])

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    // Prevent internal pagination — virtualization handles display
    manualPagination: true,
  })

  const rows = table.getRowModel().rows
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 8,
  })

  const virtualRows = virtualizer.getVirtualItems()
  const totalHeight = virtualizer.getTotalSize()

  const headerPadding = compact ? 'py-2 px-4' : 'py-3 px-5'
  const cellPadding  = compact ? 'py-2 px-4' : 'py-3 px-5'

  return (
    <div className={cn('pz-card overflow-hidden flex flex-col', className)}>
      {/* Scrollable container */}
      <div
        ref={parentRef}
        style={{ height: containerHeight, overflowY: 'auto' }}
        className="overflow-x-auto"
      >
        <table className="w-full text-sm table-fixed">
          {/* Sticky header */}
          <thead className={stickyHeader ? 'sticky top-0 z-10' : ''}>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-[var(--pz-border)] bg-[var(--pz-surface-2)]/80 backdrop-blur-sm">
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  const dir = header.column.getIsSorted()
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        headerPadding,
                        'text-left text-[11px] font-bold text-[var(--pz-text-muted)] uppercase tracking-wider select-none whitespace-nowrap',
                        canSort && 'cursor-pointer hover:text-[var(--pz-text-secondary)] transition-colors',
                      )}
                      style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    >
                      <div className="flex items-center gap-1.5">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort && (
                          <span className="text-[var(--pz-text-faint)]">
                            {dir === 'asc'  ? <ArrowUp size={12} className="text-blue-400" />
                            : dir === 'desc' ? <ArrowDown size={12} className="text-blue-400" />
                            : <ArrowUpDown size={12} className="opacity-40" />}
                          </span>
                        )}
                      </div>
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>

          <tbody>
            {loading ? (
              Array.from({ length: skeletonRows }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-b border-[var(--pz-border)]/20" style={{ height: rowHeight }}>
                  {columns.map((_, j) => (
                    <td key={j} className={cellPadding}>
                      <div className="skeleton h-4 rounded" style={{ width: `${45 + (i * 17 + j * 13) % 40}%` }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-16">
                  {emptyState || (
                    <div className="text-center text-[var(--pz-text-muted)]">
                      <p className="text-base font-medium">No data found</p>
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              <>
                {/* Spacer for rows above viewport */}
                {virtualRows.length > 0 && virtualRows[0].start > 0 && (
                  <tr>
                    <td style={{ height: virtualRows[0].start }} colSpan={columns.length} />
                  </tr>
                )}
                {virtualRows.map((vRow) => {
                  const row = rows[vRow.index]
                  return (
                    <tr
                      key={row.id}
                      data-index={vRow.index}
                      ref={virtualizer.measureElement}
                      style={{ height: rowHeight }}
                      className={cn(
                        'border-b border-[var(--pz-border)]/20 transition-colors',
                        onRowClick ? 'cursor-pointer hover:bg-[var(--pz-surface-2)]/50' : 'hover:bg-[var(--pz-surface-2)]/25',
                      )}
                      onClick={() => onRowClick?.(row.original)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className={cn(cellPadding, 'text-[var(--pz-text-secondary)] truncate')}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  )
                })}
                {/* Spacer for rows below viewport */}
                {virtualRows.length > 0 && (() => {
                  const last = virtualRows[virtualRows.length - 1]
                  const remaining = totalHeight - last.end
                  return remaining > 0 ? (
                    <tr>
                      <td style={{ height: remaining }} colSpan={columns.length} />
                    </tr>
                  ) : null
                })()}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Row count footer */}
      {!loading && rows.length > 0 && (
        <div className="px-5 py-2.5 border-t border-[var(--pz-border)] text-xs text-[var(--pz-text-muted)]">
          Showing {rows.length.toLocaleString()} row{rows.length !== 1 ? 's' : ''} (virtualized)
        </div>
      )}
    </div>
  )
}

export { createColumnHelper } from '@tanstack/react-table'
export type { ColumnDef } from '@tanstack/react-table'
