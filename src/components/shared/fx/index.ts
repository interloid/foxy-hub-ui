// export { FxBadge, fxBadgeVariants } from '../fx-badge'
export { FxButton, fxButtonVariants } from '../fx-button'
export { FxCard, FxCardContent, FxCardFooter, FxCardHeader } from '../fx-card'
export {
  FxDialogContent,
  FxDialogDescription,
  FxDialogFooter,
  FxDialogHeader,
  FxDialogOverlay,
  FxDialogTitle,
} from '../fx-dialog'
export {
  FxCheckbox,
  FxField,
  FxFieldError,
  FxInput,
  fxInputVariants,
  FxLabel,
  FxSelectTrigger,
  FxTextarea,
} from '../fx-field'
export {
  FxProgress,
  FxPulseLines,
  FxSheen,
  FxSpinner,
  fxSpinnerVariants,
} from '../fx-loader'
export {
  FxTable,
  FxTableCell,
  FxTableHead,
  FxTableHeader,
  FxTableRow,
  FxTableScroll,
} from '../fx-table'
export {
  FxTabsList,
  FxTabsListUnderline,
  FxTabsTrigger,
  FxTabsTriggerUnderline,
} from '../fx-tabs'

// Form controls v2 designed from scratch ("Checkbox, radio and switch didn't exist in the
// prototype; they're built here on the same rules." — § 05).
export {
  FxInputGroup,
  FxInputGroupAddon,
  FxInputGroupInput,
} from '../fx-input-group'
export { FxRadioCard, FxRadioGroup, FxRadioItem } from '../fx-radio'
export { FxSwitch } from '../fx-switch'
export { FxToggleGroup, FxToggleGroupItem } from '../fx-toggle-group'

// The right-hand slide-over. `ui/sheet.tsx` was unsanctioned until D041 gave it a design
// counterpart — the Log time and New project panels.
export {
  FxSheetBody,
  FxSheetContent,
  FxSheetDescription,
  FxSheetFooter,
  FxSheetHeader,
  FxSheetTitle,
  Sheet,
  SheetClose,
} from '../fx-sheet'

export { FxAlert, fxAlertVariants } from '../fx-alert'
export { FxAvatar, FxAvatarFallback, FxAvatarGroup } from '../fx-avatar'
// export {
//   FxCommand,
//   FxCommandGroup,
//   FxCommandIcon,
//   FxCommandInput,
//   FxCommandItem,
//   FxCommandList,
// } from '../fx-command'
export {
  FxEmpty,
  FxEmptyContent,
  FxEmptyDescription,
  FxEmptyHeader,
  FxEmptyMedia,
  FxEmptyTitle,
} from '../fx-empty'
export { FxKbd } from '../fx-kbd'
export {
  FxTooltipContent,
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
} from '../fx-tooltip'

// export {
//   DropdownMenu,
//   DropdownMenuGroup,
//   DropdownMenuLabel,
//   DropdownMenuSeparator,
//   DropdownMenuTrigger,
//   // The LIVE menu — the account menu and anything else with a real trigger. These are the
//   // mapped `ui/dropdown-menu.tsx`, skinned; the two specimens above cannot be triggered.
//   FxDropdownMenuContent,
//   FxDropdownMenuItem,
//   FxMenuIcon,
//   FxMenuItem,
//   FxMenuPanel,
//   FxPopoverContent,
//   Popover,
//   PopoverTrigger,
// } from '../fx-menu'
export { FxToastSpecimen } from '../fx-toast'

// Toast lives in ../toaster.tsx — it also carries the D002 theming fix, so there is one
// wrapper for both concerns rather than two around the same primitive.
export { Toaster } from '../toaster'

/**
 * Structural re-exports.
 *
 * These carry **no design metrics** — they are the behaviour containers the skinned parts
 * live inside: Radix roots that hold state and wiring, and the `<tbody>` element. There is
 * nothing for an `Fx*` wrapper to change, so wrapping them would add a layer that only
 * forwards props.
 *
 * They are re-exported rather than imported directly because the ESLint boundary (and D011)
 * says screens import from this barrel, full stop. A carve-out per file would erode the rule
 * that makes the boundary worth having.
 */
export { Dialog, DialogClose, DialogTrigger } from '@/components/ui/dialog'
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectValue,
} from '@/components/ui/select'
export { TableBody, TableFooter } from '@/components/ui/table'
export { Tabs, TabsContent } from '@/components/ui/tabs'
