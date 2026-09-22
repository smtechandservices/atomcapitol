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
export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'SENT'

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
  project_name: string | null
  plot_number: string | null
  plot_role: PlotRole | null
  kyc_status: CustomerKYCStatus
  is_active: boolean
  sales_person_name: string | null
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
  customer_email: string
  customer_name: string
  kyc_status: CustomerKYCStatus
  plot_number: string | null
  step2_status: KYCStepStatus | null
  step3_status: KYCStepStatus | null
  step2_submitted_at: string | null
  step3_submitted_at: string | null
}

export interface KYCDecisionLogEntry {
  id: number
  step: KYCDecisionStep
  decision: 'APPROVED' | 'REJECTED'
  reason: string
  decided_by_email: string | null
  created_at: string
}

export interface KycQueueDetail {
  id: number
  customer_email: string
  customer_name: string
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
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------
export interface Milestone {
  id: number
  plot: number
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

// ---------------------------------------------------------------------------
// Payment verification
// ---------------------------------------------------------------------------
export interface PaymentProofQueueItem {
  id: number
  milestone: number
  milestone_name: string
  expected_amount: string
  customer_email: string
  customer_name: string
  project_name: string
  plot_number: string
  file: string
  claimed_amount: string
  payment_date: string
  payment_mode: string
  transaction_reference: string
  status: PaymentProofStatus
  rejection_reason: string
  created_at: string
}

// ---------------------------------------------------------------------------
// Milestone change requests
// ---------------------------------------------------------------------------
export interface MilestoneChangeRequest {
  id: number
  plot: number
  plot_number: string
  requested_by: number
  requested_by_email: string
  change_type: MilestoneChangeType
  proposed_details: Record<string, unknown>
  reason: string
  attachment: string | null
  status: MilestoneChangeRequestStatus
  admin_response: string
  counter_schedule: Record<string, unknown> | null
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
  project: number | null
  project_name: string | null
  milestone: number | null
  name: string
  doc_type: DocumentType
  status: DocumentStatus
  file: string | null
  is_visible_to_customer: boolean
  uploaded_by: number | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------
export interface TicketListItem {
  id: number
  customer_email: string
  category: TicketCategory
  subject: string
  status: TicketStatus
  assigned_to_email: string | null
  created_at: string
  updated_at: string
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
  channel: CampaignChannel
  scheduled_at: string | null
  sent_at: string | null
  status: CampaignStatus
  recipient_count: number
  created_at: string
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
  action: string
  target_type: string
  target_id: string
  details: Record<string, unknown>
  ip_address: string | null
  created_at: string
}

export interface PaymentOverviewSummary {
  due: string
  overdue: string
  received: string
  under_review: string
  milestone_count: number
}
