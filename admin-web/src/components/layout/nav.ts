import {
  LayoutDashboard,
  Building2,
  MapPinned,
  Users,
  ShieldCheck,
  Wallet,
  FileCheck2,
  Repeat,
  BarChart3,
  FolderOpen,
  Ticket,
  Image as ImageIcon,
  Bell,
  UserSquare2,
  UserCog,
  ScrollText,
  Settings as SettingsIcon,
  type LucideIcon,
} from 'lucide-react'
import type { StoredAdminUser } from '@/lib/tokens'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  roles?: StoredAdminUser['role'][]
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Projects & Plots',
    items: [
      { to: '/projects', label: 'Projects', icon: Building2, roles: ['SUPER_ADMIN', 'ACCOUNTS'] },
      { to: '/plots', label: 'Plot Inventory', icon: MapPinned, roles: ['SUPER_ADMIN', 'ACCOUNTS'] },
    ],
  },
  {
    label: 'Customers',
    items: [
      { to: '/customers', label: 'Customers', icon: Users, roles: ['SUPER_ADMIN', 'ACCOUNTS', 'SUPPORT'] },
      { to: '/kyc', label: 'KYC Review Queue', icon: ShieldCheck, roles: ['SUPER_ADMIN', 'KYC_REVIEWER'] },
    ],
  },
  {
    label: 'Payments & Milestones',
    items: [
      { to: '/payments/milestones', label: 'Milestones', icon: Wallet, roles: ['SUPER_ADMIN', 'ACCOUNTS'] },
      { to: '/payments/verification', label: 'Payment Verification', icon: FileCheck2, roles: ['SUPER_ADMIN', 'ACCOUNTS'] },
      { to: '/payments/change-requests', label: 'Change Requests', icon: Repeat, roles: ['SUPER_ADMIN', 'ACCOUNTS'] },
      { to: '/payments/overview', label: 'Payment Overview', icon: BarChart3, roles: ['SUPER_ADMIN', 'ACCOUNTS'] },
    ],
  },
  {
    label: 'Documents & Tickets',
    items: [
      { to: '/documents', label: 'Documents', icon: FolderOpen, roles: ['SUPER_ADMIN', 'ACCOUNTS'] },
      { to: '/tickets', label: 'Tickets', icon: Ticket, roles: ['SUPER_ADMIN', 'SUPPORT'] },
    ],
  },
  {
    label: 'Content & Comms',
    items: [
      { to: '/banners', label: 'Banners', icon: ImageIcon, roles: ['SUPER_ADMIN'] },
      {
        to: '/notifications',
        label: 'Notifications & Email',
        icon: Bell,
        roles: ['SUPER_ADMIN', 'SUPPORT'],
      },
    ],
  },
  {
    label: 'Settings',
    items: [
      { to: '/sales-team', label: 'Sales Team', icon: UserSquare2, roles: ['SUPER_ADMIN'] },
      { to: '/admin-users', label: 'Admin Users & Roles', icon: UserCog, roles: ['SUPER_ADMIN'] },
      { to: '/audit-log', label: 'Audit Log', icon: ScrollText, roles: ['SUPER_ADMIN'] },
      { to: '/settings', label: 'Settings', icon: SettingsIcon, roles: ['SUPER_ADMIN'] },
    ],
  },
]
