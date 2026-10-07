import { useAuth } from './auth'
import type { StoredAdminUser } from './tokens'

type Role = StoredAdminUser['role']

/**
 * Which roles the backend lets into each area (mirrors the role_required(...) on the Django views).
 * Use this before fetching cross-area data so a role never fires requests that will 403.
 * SUPER_ADMIN is always allowed (see hasRole).
 */
export const ACCESS = {
  customers: ['ACCOUNTS', 'SUPPORT'], // accounts.CustomerAdminViewSet
  customerEdit: [], // CustomerAdminViewSet update/destroy — super admins only; Accounts & Support view only
  kyc: ['KYC_REVIEWER'], // kyc.KYCQueue*
  payments: ['ACCOUNTS'], // payments.* (milestones, verification, change requests, overview)
  projects: ['ACCOUNTS'], // projects.ProjectViewSet / PlotViewSet
  plotEdit: [], // PlotViewSet update/destroy — super admins only
  projectDelete: [], // ProjectViewSet destroy — super admins only
  documents: ['ACCOUNTS'], // documents.AdminDocumentViewSet
  sales: [], // sales.SalesPersonViewSet — super admins only
  tickets: ['SUPPORT'], // tickets.AdminTicket*
  campaigns: ['SUPPORT'], // notifications.NotificationCampaignViewSet
  banners: [], // notifications.BannerViewSet — super admins only
  settings: [], // core.AdminSiteSettingsView — super admins only
  auditLog: [], // core.AuditLogListView — super admins only
} satisfies Record<string, Role[]>

export type Area = keyof typeof ACCESS

/** `can('payments')` → whether the signed-in admin may read that area. */
export function useCan() {
  const { hasRole } = useAuth()
  return (area: Area) => hasRole(...ACCESS[area])
}
