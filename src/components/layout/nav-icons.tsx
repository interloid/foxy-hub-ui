import {
  Bell,
  ChartColumn,
  ChevronDown,
  ChevronLeft,
  Clock,
  CreditCard,
  Folder,
  House,
  Lock,
  LogOut,
  Pencil,
  Receipt,
  Search,
  SlidersHorizontal,
  Sparkles,
  SquareCheckBig,
  TrendingUp,
  User,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'

export const NAV_ICONS = {
  dashboard: House,
  projects: Folder,
  time: Clock,
  invoices: Receipt,
  reports: ChartColumn,
  ai: Sparkles,
  billing: CreditCard,
  settings: SlidersHorizontal,
  auth: Lock,
  search: Search,
  collapse: ChevronLeft,
  chevron: ChevronDown,
  bell: Bell,

  zap: Zap,

  profile: User,
  signOut: LogOut,

  edit: Pencil,
  cancel: X,
  approvals: SquareCheckBig,
  trend: TrendingUp,
} satisfies Record<string, LucideIcon>

export type NavIconName = keyof typeof NAV_ICONS
