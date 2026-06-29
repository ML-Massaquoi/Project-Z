// ── Primitives ──────────────────────────────────────────────
export { Button, buttonVariants } from './button'
export type { ButtonProps } from './button'

export { Badge, badgeVariants } from './badge'
export type { BadgeProps } from './badge'

export { Input } from './input'
export type { InputProps } from './input'

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './card'

export { Skeleton, SkeletonText, SkeletonCard } from './skeleton'

export { Avatar, AvatarImage, AvatarFallback } from './avatar'

export { Separator } from './separator'

// ── Overlays ────────────────────────────────────────────────
export {
  Dialog, DialogPortal, DialogOverlay, DialogTrigger, DialogClose,
  DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription, DialogBody,
} from './dialog'

export {
  Sheet, SheetPortal, SheetOverlay, SheetTrigger, SheetClose,
  SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription, SheetBody,
} from './sheet'

export {
  Select, SelectGroup, SelectValue, SelectTrigger, SelectContent,
  SelectLabel, SelectItem, SelectSeparator,
} from './select'

export { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs'

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './tooltip'

export {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuShortcut, DropdownMenuGroup, DropdownMenuPortal, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuRadioGroup,
} from './dropdown-menu'

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from './accordion'

// ── Feedback ────────────────────────────────────────────────
export { toast, rawToast } from './toast'

export {
  EmptyState, EmptyEmployees, EmptyDepartments, EmptyAttendance,
  EmptyDevices, EmptyReports, EmptyAuditLogs, EmptySearch,
} from './empty-state'
export type { EmptyStateProps } from './empty-state'

export { Modal } from './Modal'
export type { ModalProps } from './Modal'

// ── Motion ──────────────────────────────────────────────────
export { PageTransition } from './page-transition'

// ── Re-export existing components ────────────────────────────
export { DataTable, createColumnHelper } from './data-table/DataTable'
export type { ColumnDef } from './data-table/DataTable'
