import { useState, type ReactNode } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
  type RowSelectionState,
} from '@tanstack/react-table'
import { motion } from 'framer-motion'
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search, X } from 'lucide-react'

interface DataTableProps<TData> {
  data: TData[]
  columns: ColumnDef<TData, unknown>[]
  loading?: boolean
  skeletonRows?: number
  pageSize?: number
  pageSizeOptions?: number[]
  searchValue?: string
  globalFilter?: string
  enableRowSelection?: boolean
  enableSorting?: boolean
  enablePagination?: boolean
  stickyHeader?: boolean
  compact?: boolean
  onRowClick?: (row: TData) => void
  selectedRows?: RowSelectionState
  onSelectionChange?: (selection: RowSelectionState) => void
  emptyState?: ReactNode
  toolbar?: ReactNode
  totalRows?: number
  currentPage?: number
  onPageChange?: (page: number) => void
  totalPages?: number
  searchPlaceholder?: string
  onSearchChange?: (value: string) => void
}

export function DataTable<TData>({
  data,
  columns,
  loading = false,
  skeletonRows = 8,
  pageSize: initialPageSize = 20,
  pageSizeOptions = [10, 20, 50, 100],
  globalFilter,
  enableRowSelection = false,
  enableSorting = true,
  enablePagination = true,
  stickyHeader = true,
  compact = false,
  onRowClick,
  selectedRows,
  onSelectionChange,
  emptyState,
  toolbar,
  totalRows,
  currentPage,
  onPageChange,
  totalPages: serverTotalPages,
  searchPlaceholder = 'Search...',
  onSearchChange,
  searchValue,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState<RowSelectionState>(selectedRows || {})
  const [pageSize, setPageSize] = useState(initialPageSize)

  const isServerPaginated = totalRows !== undefined && onPageChange !== undefined

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection: enableRowSelection ? rowSelection : {},
      globalFilter,
      ...(!isServerPaginated && enablePagination ? { pagination: { pageIndex: 0, pageSize } } : {}),
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: (updater) => {
      const newSelection = typeof updater === 'function' ? updater(rowSelection) : updater
      setRowSelection(newSelection)
      onSelectionChange?.(newSelection)
    },
    getCoreRowModel: getCoreRowModel(),
    ...(enableSorting ? { getSortedRowModel: getSortedRowModel() } : {}),
    getFilteredRowModel: getFilteredRowModel(),
    ...(enablePagination && !isServerPaginated ? { getPaginationRowModel: getPaginationRowModel() } : {}),
    enableRowSelection,
  })

  const cellPadding = compact ? 'py-2.5 px-4' : 'py-4 px-5'
  const headerPadding = compact ? 'py-2.5 px-4' : 'py-3.5 px-5'

  const totalPageCount = isServerPaginated
    ? (serverTotalPages || Math.ceil((totalRows || 0) / pageSize))
    : table.getPageCount()
  const currentPageIndex = isServerPaginated ? ((currentPage || 1) - 1) : table.getState().pagination.pageIndex

  return (
    <div className="overflow-hidden" style={{ background: 'var(--pz-surface-1)', border: '1px solid var(--pz-border)', borderRadius: 'var(--pz-radius-xl)', boxShadow: 'var(--pz-shadow-card)' }}>
      {/* Toolbar */}
      {(toolbar || onSearchChange) && (
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--pz-border)' }}>
          <div className="flex items-center gap-3 flex-wrap">
            {onSearchChange && (
              <div
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl flex-1 min-w-[200px] max-w-sm transition-all"
                style={{
                  background: 'var(--pz-surface-2)',
                  border: '1px solid var(--pz-border)',
                }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--pz-border-focus)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--pz-border)'}
              >
                <Search size={14} style={{ color: 'var(--pz-text-muted)', flexShrink: 0 }} />
                <input
                  type="text"
                  value={searchValue || ''}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="bg-transparent text-sm outline-none w-full"
                  style={{ color: 'var(--pz-text)' }}
                  maxLength={200}
                />
                {searchValue && (
                  <button onClick={() => onSearchChange('')} style={{ color: 'var(--pz-text-muted)' }}>
                    <X size={14} />
                  </button>
                )}
              </div>
            )}
            {toolbar}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={`${stickyHeader ? 'sticky top-0 z-10' : ''}`}
              style={{ borderBottom: '1.5px solid var(--pz-border)', background: 'var(--pz-surface-2)' }}>
              {table.getHeaderGroups()[0]?.headers.map((header) => {
                const canSort = header.column.getCanSort()
                const sortDir = header.column.getIsSorted()

                return (
                  <th
                    key={header.id}
                    className={`${headerPadding} text-left text-[11px] font-semibold uppercase tracking-wider select-none whitespace-nowrap ${canSort ? 'cursor-pointer transition-colors' : ''}`}
                    style={{ color: 'var(--pz-text-muted)', width: header.getSize() !== 150 ? header.getSize() : undefined }}
                    onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    onMouseEnter={canSort ? e => ((e.currentTarget as HTMLElement).style.color = 'var(--pz-text-secondary)') : undefined}
                    onMouseLeave={canSort ? e => ((e.currentTarget as HTMLElement).style.color = 'var(--pz-text-muted)') : undefined}
                  >
                    <div className="flex items-center gap-1.5">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {canSort && (
                        <span className="text-[var(--pz-text-faint)]">
                          {sortDir === 'asc' ? (
                            <ArrowUp size={13} className="text-blue-400" />
                          ) : sortDir === 'desc' ? (
                            <ArrowDown size={13} className="text-blue-400" />
                          ) : (
                            <ArrowUpDown size={13} className="opacity-50" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              Array.from({ length: skeletonRows }).map((_, i) => (
                <tr key={`skeleton-${i}`} className="border-b border-[var(--pz-border)]/20">
                  {columns.map((_, j) => (
                    <td key={j} className={cellPadding}>
                      <div className="skeleton h-4 rounded" style={{ width: `${40 + Math.random() * 40}%` }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row, index) => (
                <motion.tr
                  key={row.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(index * 0.015, 0.2), duration: 0.2 }}
                  className={`transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
                  style={{
                    borderBottom: '1px solid var(--pz-border)',
                    background: row.getIsSelected() ? 'rgba(0,119,204,0.05)' : 'transparent',
                  }}
                  onMouseEnter={e => !row.getIsSelected() && ((e.currentTarget as HTMLElement).style.background = 'var(--pz-surface-3)')}
                  onMouseLeave={e => !row.getIsSelected() && ((e.currentTarget as HTMLElement).style.background = 'transparent')}
                  onClick={() => onRowClick?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={`${cellPadding}`} style={{ color: 'var(--pz-text-secondary)' }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </motion.tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="py-16">
                  {emptyState || (
                    <div className="text-center text-[var(--pz-text-muted)]">
                      <p className="text-base font-medium">No data found</p>
                      <p className="text-sm mt-1.5">Try adjusting your search or filters</p>
                    </div>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {enablePagination && (data.length > 0 || isServerPaginated) && (
        <div
          className="flex items-center justify-between px-5 py-3.5"
          style={{ borderTop: '1px solid var(--pz-border)', background: 'var(--pz-surface-2)' }}
        >
          <div className="flex items-center gap-5">
            {enableRowSelection && (
              <span className="text-sm" style={{ color: 'var(--pz-text-muted)' }}>
                {Object.keys(rowSelection).length} of {data.length} selected
              </span>
            )}
            <div className="flex items-center gap-2.5">
              <span className="text-sm" style={{ color: 'var(--pz-text-muted)' }}>Rows</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  const newSize = Number(e.target.value)
                  setPageSize(newSize)
                  if (!isServerPaginated) table.setPageSize(newSize)
                }}
                className="rounded-lg text-sm px-2.5 py-1.5 outline-none transition-colors"
                style={{
                  background: 'var(--pz-surface-1)',
                  border: '1px solid var(--pz-border)',
                  color: 'var(--pz-text-secondary)',
                }}
              >
                {pageSizeOptions.map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm tabular-nums" style={{ color: 'var(--pz-text-tertiary)' }}>
              Page {currentPageIndex + 1} of {totalPageCount || 1}
              {totalRows !== undefined && (
                <span style={{ color: 'var(--pz-text-muted)' }} className="ml-1">({totalRows} total)</span>
              )}
            </span>
            <div className="flex items-center gap-1">
              {[
                { icon: ChevronsLeft, action: () => isServerPaginated ? onPageChange!(1) : table.setPageIndex(0), disabled: currentPageIndex === 0 },
                { icon: ChevronLeft,  action: () => isServerPaginated ? onPageChange!((currentPage || 1) - 1) : table.previousPage(), disabled: currentPageIndex === 0 },
                { icon: ChevronRight, action: () => isServerPaginated ? onPageChange!((currentPage || 1) + 1) : table.nextPage(), disabled: currentPageIndex >= totalPageCount - 1 },
                { icon: ChevronsRight,action: () => isServerPaginated ? onPageChange!(totalPageCount) : table.setPageIndex(totalPageCount - 1), disabled: currentPageIndex >= totalPageCount - 1 },
              ].map(({ icon: Icon, action, disabled }, i) => (
                <button
                  key={i}
                  onClick={action}
                  disabled={disabled}
                  className="p-1.5 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ color: 'var(--pz-text-muted)' }}
                  onMouseEnter={e => !disabled && ((e.currentTarget as HTMLElement).style.background = 'var(--pz-surface-3)')}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
                >
                  <Icon size={15} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export { createColumnHelper } from '@tanstack/react-table'
export type { ColumnDef } from '@tanstack/react-table'
