export type AdminRole = 'SUPER_ADMIN' | 'KYC_REVIEWER' | 'ACCOUNTS' | 'SUPPORT'
export type CustomerKYCStatus = 'NOT_STARTED' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'
export type PlotRole = 'PRIMARY' | 'CO_APPLICANT'
export type ProjectDevelopmentStatus = 'PLANNING' | 'UNDER_CONSTRUCTION' | 'READY' | 'COMPLETED'
export type ProjectImageType = 'LAYOUT' | 'GALLERY'
export type PlotStatus = 'AVAILABLE' | 'BOOKED' | 'SOLD'
export type PlotAssignmentAction = 'ASSIGNED' | 'UNASSIGNED' | 'TRANSFERRED'
export type KYCStepStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
export type KYCDecisionStep = 'STEP2' | 'STEP3'
export type MilestoneStatus = 'UPCOMING' | 'DUE' | 'OVERDUE' | 'UNDER_REVIEW' | 'PAID' | 'REJECTED'
export type PaymentProofStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
export type MilestoneChangeType = 'PAY_MORE' | 'PAY_LESS' | 'CHANGE_DATE' | 'CHANGE_INSTALMENTS' | 'RESPLIT'
export type MilestoneChangeRequestStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'COUNTERED'
export type DocumentType = 'PAYMENT_RECEIPT' | 'REGISTRY' | 'LEGAL' | 'OTHER'
export type DocumentStatus = 'ISSUED' | 'IN_PROGRESS'
export type TicketCategory = 'PAYMENT' | 'DOCUMENTS' | 'CONSTRUCTION' | 'GENERAL'
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'
export type TicketMessageSenderType = 'CUSTOMER' | 'ADMIN'
export type CampaignTargetType = 'ALL' | 'PROJECT' | 'SELECTED'
export type CampaignChannel = 'PUSH' | 'EMAIL' | 'BOTH'
export type CampaignStatus = 'DRAFT' | 'SENT'

export interface Paginated<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface ApiErrorShape {
  detail: string
  errors: Record<string, string[]>
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export interface AdminLoginResponse {
  access: string
  refresh: string
  admin: { id: number; email: string; name: string; role: AdminRole }
}

// ---------------------------------------------------------------------------
// Admin Users
// ---------------------------------------------------------------------------
export interface AdminUser {
  id: number
  email: string
  first_name: string
  last_name: string
  phone: string
  role: AdminRole
  is_active: boolean
  date_joined: string
  last_login: string | null
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
export interface ProjectImage {
  id: number
  image: string
  image_type: ProjectImageType
  caption: string
  order: number
}

export interface Project {
  id: number
  name: string
  location: string
  latitude: string | null
  longitude: string | null
  description: string
  amenities: string[]
  brochure: string | null
  development_status: ProjectDevelopmentStatus
  is_published: boolean
  images: ProjectImage[]
  plot_count: number
  created_at: string
}

// ---------------------------------------------------------------------------
// Plots
// ---------------------------------------------------------------------------
export interface PlotBuyer {
  id: number
  email: string
  name: string
  plot_role: PlotRole
  kyc_status: CustomerKYCStatus
}

export interface Plot {
  id: number
  project: number
  project_name: string
  plot_number: string
  size: string
  block_sector: string
  price: string
  status: PlotStatus
  booking_date: string | null
  total_value: string | null
  amount_paid_outside_app: string | null
  instalment_count: number | null
  remaining_balance: string | null
  buyers: PlotBuyer[]
  created_at: string
}

export interface PlotAssignmentHistoryEntry {
  id: number
  action: PlotAssignmentAction
  from_email: string
  to_email: string
  reason: string
  performed_by_email: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Sales team
// ---------------------------------------------------------------------------
export interface SalesPerson {
  id: number
  name: string
  photo: string | null
  phone: string
  email: string
  is_active: boolean
  customer_count: number
  created_at: string
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
export interface CustomerListItem {
  id: number
  name: string
  email: string
  phone: string
  plot_id: number | null
  project_name: string | null
  plot_number: string | null
  plot_role: PlotRole | null
  kyc_status: CustomerKYCStatus
  is_active: boolean
  sales_person_name: string | null
  sales_person_id: number | null
  created_at: string
}

export interface CustomerPlotSummary {
  id: number
  project_name: string
  plot_number: string
  size: string
  block_sector: string
  status: PlotStatus
}

export interface CustomerDetail {
  id: number
  email: string
  name: string
  phone: string
  address: string
  kyc_status: CustomerKYCStatus
  is_active: boolean
  plot: CustomerPlotSummary | null
  plot_role: PlotRole | null
  assigned_sales_person: number | null
  sales_person_id: number | null
  created_at: string
  updated_at: string
  last_login_at: string | null
}

// ---------------------------------------------------------------------------
// KYC
// ---------------------------------------------------------------------------
export interface KycQueueListItem {
  id: number
  customer_id: number
  customer_email: string
  customer_name: string
  kyc_status: CustomerKYCStatus
  plot_number: string | null
  project_name: string | null
  plot_confirmed: boolean
  step2_status: KYCStepStatus | null
  step3_status: KYCStepStatus | null
  step2_submitted_at: string | null
  step3_submitted_at: string | null
  /** When the oldest still-pending step came in; null when nothing is pending. */
  waiting_since: string | null
  reviewed_at: string | null
}

export interface KycQueueStats {
  total: number
  step2: number
  step3: number
  both: number
  flagged: number
  stale: number
  approved: number
  rejected: number
}

export interface KYCDecisionLogEntry {
  id: number
  step: KYCDecisionStep
  decision: 'APPROVED' | 'REJECTED'
  reason: string
  decided_by_email: string | null
  decided_by_name: string | null
  created_at: string
}

export interface KycQueueDetail {
  id: number
  customer_id: number
  customer_email: string
  customer_name: string
  customer_phone: string
  kyc_status: CustomerKYCStatus
  plot: {
    id: number
    project: Project
    plot_number: string
    size: string
    block_sector: string
    status: PlotStatus
    booking_date: string | null
    total_value: string | null
  } | null
  plot_confirmed: boolean
  plot_mismatch_note: string
  receipt_file: string | null
  receipt_amount: string | null
  receipt_payment_date: string | null
  step2_status: KYCStepStatus | null
  step2_rejection_reason: string
  step2_submitted_at: string | null
  video_file: string | null
  prompt_lines: string[]
  step3_status: KYCStepStatus | null
  step3_rejection_reason: string
  step3_submitted_at: string | null
  decisions: KYCDecisionLogEntry[]
  /** Next pending submission (oldest first, excluding this one) and the total pending. */
  queue: { next_id: number | null; pending_count: number }
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------
export interface Milestone {
  id: number
  plot: number
  plot_number: string
  project_name: string
  buyer: { id: number; name: string; email: string } | null
  /** Platform-generated receipt, issued when a payment proof is approved. */
  receipt: { id: number; name: string; url: string; created_at: string } | null
  sequence: number
  name: string
  description: string
  amount: string
  due_date: string
  status: MilestoneStatus
  paid_date: string | null
  payment_mode: string
  transaction_reference: string
  admin_remarks: string
}

export type MilestoneStats = Record<MilestoneStatus, { count: number; amount: string }>

// ---------------------------------------------------------------------------
// Payment verification
// ---------------------------------------------------------------------------
export interface PaymentProofQueueItem {
  id: number
  milestone: number
  milestone_name: string
  milestone_sequence: number
  /** total milestones on the plot; null on approve/reject responses */
  milestone_count: number | null
  milestone_due_date: string
  expected_amount: string
  customer_id: number
  customer_email: string
  customer_name: string
  project_name: string
  plot_id: number
  plot_number: string
  file: string
  claimed_amount: string
  payment_date: string
  payment_mode: string
  transaction_reference: string
  status: PaymentProofStatus
  rejection_reason: string
  reviewed_by_email: string | null
  reviewed_at: string | null
  /** same transaction reference appears on another proof */
  duplicate_reference: boolean
  created_at: string
}

export interface PaymentVerificationStats {
  pending: number
  pending_amount: string
  stale: number
  mismatch: number
  short: number
  approved_this_month: number
  approved_this_month_amount: string
  approved: number
  rejected: number
}

// ---------------------------------------------------------------------------
// Milestone change requests
// ---------------------------------------------------------------------------
export interface MilestoneChangeRequest {
  id: number
  plot: number
  plot_number: string
  project_name: string
  requested_by: number
  requested_by_email: string
  requested_by_name: string
  change_type: MilestoneChangeType
  proposed_details: Record<string, unknown>
  reason: string
  attachment: string | null
  status: MilestoneChangeRequestStatus
  admin_response: string
  /** {schedule: ScheduleItem[], note} once countered; {} otherwise */
  counter_schedule: { schedule?: ScheduleItem[]; note?: string } | null
  reviewed_by_email: string | null
  reviewed_at: string | null
  created_at: string
}

export interface ScheduleItem {
  name?: string
  amount: string
  due_date: string
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------
export interface DocumentItem {
  id: number
  customer: number | null
  customer_email: string | null
  customer_name: string | null
  plot_number: string | null
  project: number | null
  project_name: string | null
  milestone: number | null
  milestone_name: string | null
  name: string
  doc_type: DocumentType
  status: DocumentStatus
  file: string | null
  is_visible_to_customer: boolean
  uploaded_by: number | null
  uploaded_by_email: string | null
  created_at: string
  updated_at: string
}

export interface DocumentStats {
  total: number
  by_type: Record<DocumentType, number>
  in_progress: number
  missing_file: number
  hidden: number
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------
export interface TicketListItem {
  id: number
  customer_id: number
  customer_email: string
  customer_name: string
  plot_number: string | null
  project_name: string | null
  category: TicketCategory
  subject: string
  status: TicketStatus
  assigned_to_email: string | null
  assigned_to_name: string | null
  /** latest message — replies don't bump updated_at, so this is the real last activity */
  last_message_at: string | null
  last_sender_type: TicketMessageSenderType | null
  last_message: string | null
  message_count: number
  created_at: string
  updated_at: string
}

export interface TicketStats {
  open: number
  in_progress: number
  resolved: number
  closed: number
  awaiting_reply: number
  unassigned_active: number
  mine_active: number
}

export interface TicketAssignee {
  id: number
  email: string
  name: string
  role: AdminRole
}

export interface TicketMessage {
  id: number
  sender_type: TicketMessageSenderType
  sender_name: string
  message: string
  attachment: string | null
  created_at: string
}

export interface TicketDetail {
  id: number
  customer: number
  customer_email: string
  customer_name: string
  customer_phone: string
  kyc_status: CustomerKYCStatus
  plot_number: string | null
  project_name: string | null
  assigned_to_name: string | null
  category: TicketCategory
  subject: string
  description: string
  status: TicketStatus
  assigned_to: number | null
  messages: TicketMessage[]
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Banners
// ---------------------------------------------------------------------------
export interface Banner {
  id: number
  title: string
  image: string
  link_target: string
  display_order: number
  start_date: string | null
  end_date: string | null
  is_active: boolean
}

// ---------------------------------------------------------------------------
// Notification campaigns
// ---------------------------------------------------------------------------
export interface NotificationCampaign {
  id: number
  title: string
  body: string
  target_type: CampaignTargetType
  target_project: number | null
  target_customers: number[]
  target_project_name: string | null
  target_customers_detail: { id: number; name: string; email: string }[]
  channel: CampaignChannel
  sent_at: string | null
  status: CampaignStatus
  recipient_count: number
  created_by_email: string | null
  created_at: string
}

export interface CampaignStats {
  drafts: number
  sent: number
  delivered: number
  reachable: number
  last_sent_at: string | null
}

// ---------------------------------------------------------------------------
// Settings / Audit log
// ---------------------------------------------------------------------------
export interface CompanySettings {
  company_name: string
  support_phone: string
  support_email: string
  bank_account_name: string
  bank_account_number: string
  bank_ifsc: string
  bank_name: string
  upi_id: string
  receipt_template_note: string
  updated_at?: string
}

export interface AuditLogEntry {
  id: number
  actor: number | null
  actor_name: string
  actor_email: string | null
  action: string
  target_type: string
  target_id: string
  /** human-readable name of the target, or null if the record no longer exists */
  target_label: string | null
  details: Record<string, unknown>
  ip_address: string | null
  created_at: string
}

export interface MoneyBucket {
  amount: string
  count: number
  plots: number
}

export interface PaymentInsights {
  range: { start: string; end: string; today: string }
  period: { expected: string; collected: string; due_to_date: string; paid_of_due_to_date: string }
  snapshot: { overdue: MoneyBucket; due: MoneyBucket; under_review: MoneyBucket; next_30_days: MoneyBucket }
  monthly: { month: string; scheduled: string; collected: string; is_future: boolean }[]
  ageing: ({ label: string } & MoneyBucket)[]
  by_project: { id: number; name: string; plots: number; scheduled: string; collected: string; overdue: string; under_review: string }[]
  top_overdue: {
    plot_id: number
    plot_number: string
    project_name: string
    amount: string
    count: number
    oldest_due_date: string
    days_overdue: number
    buyer: { id: number; name: string; email: string } | null
  }[]
}

export interface PaymentOverviewSummary {
  due: string
  overdue: string
  received: string
  under_review: string
  milestone_count: number
}
