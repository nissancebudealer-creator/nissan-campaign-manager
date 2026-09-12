export type RoleName =
  | "ADMINISTRATOR"
  | "MARKETING_MANAGER"
  | "MARKETING_STAFF"
  | "SALES_MANAGER"
  | "SALES_STAFF"
  | "VIEWER";

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  role: RoleName;
  modules: string[];
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export type ConsentChannel = "EMAIL" | "WHATSAPP" | "VIBER";

export interface Tag {
  id: string;
  name: string;
  color: string | null;
}

export interface Consent {
  id: string;
  channel: ConsentChannel;
  optIn: boolean;
  consentDate: string;
  consentSource: string | null;
  optOutDate: string | null;
}

export interface Suppression {
  id: string;
  channel: ConsentChannel;
  reason: string | null;
  addedAt: string;
}

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  company: string | null;
  email: string | null;
  mobileNumber: string | null;
  whatsappNumber: string | null;
  viberNumber: string | null;
  viberUserId: string | null;
  viberSubscribedAt: string | null;
  customerType: string | null;
  productInterest: string | null;
  location: string | null;
  leadSource: string | null;
  leadStatus: string | null;
  dateAdded: string;
  lastContactedAt: string | null;
  notes: string | null;
  tags: { tag: Tag }[];
  consents: Consent[];
  suppressions: Suppression[];
  createdAt: string;
  updatedAt: string;
}

export interface ContactListResponse {
  contacts: Contact[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ContactInput {
  firstName: string;
  lastName: string;
  company?: string;
  email?: string;
  mobileNumber?: string;
  whatsappNumber?: string;
  viberNumber?: string;
  customerType?: string;
  productInterest?: string;
  location?: string;
  leadSource?: string;
  leadStatus?: string;
  notes?: string;
  tagIds?: string[];
}

export interface ImportRowResult {
  rowNumber: number;
  data: Record<string, string>;
  status: "valid" | "duplicate" | "invalid";
  errors?: string[];
}

export interface ImportPreviewResponse {
  results: ImportRowResult[];
  summary: { total: number; valid: number; duplicate: number; invalid: number };
}

export interface SegmentCondition {
  field: string;
  operator: string;
  value: string;
}

export interface SegmentGroup {
  conditions: SegmentCondition[];
}

export interface SegmentRules {
  groups: SegmentGroup[];
}

export interface Segment {
  id: string;
  name: string;
  description: string | null;
  rulesJson: SegmentRules;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SegmentPreviewResponse {
  contacts: Contact[];
  total: number;
  page: number;
  pageSize: number;
}

export type ImagePosition = "TOP" | "BOTTOM";

export interface Template {
  id: string;
  name: string;
  category: string;
  channel: ConsentChannel;
  subject: string | null;
  body: string;
  imageUrl: string | null;
  imagePosition: ImagePosition;
  ctaLabel: string | null;
  ctaUrl: string | null;
  variables: string[];
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateInput {
  name: string;
  category: string;
  channel: ConsentChannel;
  subject?: string | null;
  body: string;
  imageUrl?: string | null;
  imagePosition?: ImagePosition;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
}

export type CampaignStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "SENDING"
  | "SENT"
  | "PAUSED"
  | "CANCELLED"
  | "FAILED";

export interface Campaign {
  id: string;
  name: string;
  type: string;
  channel: ConsentChannel;
  subject: string | null;
  message: string;
  imageUrl: string | null;
  imagePosition: ImagePosition;
  videoUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  whatsappTemplateName: string | null;
  whatsappTemplateLanguage: string | null;
  status: CampaignStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  isArchived: boolean;
  segmentId: string | null;
  segment: Segment | null;
  templateId: string | null;
  template: Template | null;
  tags: { tag: Tag }[];
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignInput {
  name: string;
  type: string;
  channel: ConsentChannel;
  segmentId: string;
  templateId?: string | null;
  subject?: string | null;
  message: string;
  imageUrl?: string | null;
  imagePosition?: ImagePosition;
  videoUrl?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  whatsappTemplateName?: string | null;
  whatsappTemplateLanguage?: string | null;
  tagIds?: string[];
}

export interface AudiencePreview {
  totalMatching: number;
  optedOutCount: number;
  noConsentCount: number;
  noAddressCount: number;
  estimatedMessages: number;
  sample: Contact[];
}

export interface Integration {
  id: string;
  type: "GMAIL" | "WHATSAPP" | "VIBER";
  name: string;
  status: "NOT_CONFIGURED" | "PENDING_VERIFICATION" | "CONNECTED" | "ERROR" | "DISABLED";
}

export interface CampaignMetrics {
  recipients: number;
  sent: number;
  failed: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
  openRate: number;
  clickRate: number;
}

export interface CampaignReportEntry {
  campaign: Campaign;
  metrics: CampaignMetrics;
}

export interface DashboardSummary {
  totalContacts: number;
  activeCampaigns: number;
  scheduledCampaigns: number;
  campaignsSent: number;
  channelPerformance: Record<string, { sent: number; opened: number; clicked: number }>;
  campaignVolumeByMonth: Record<string, number>;
  recentActivity: {
    id: string;
    name: string;
    channel: ConsentChannel;
    status: CampaignStatus;
    updatedAt: string;
  }[];
}

export type AutomationTriggerType = "NEW_CONTACT" | "LEAD_STATUS_CHANGED" | "MANUAL_ONLY";
export type EnrollmentStatus = "ACTIVE" | "COMPLETED" | "CANCELLED";
export type AutomationStepStatus = "SENT" | "FAILED" | "SKIPPED";

export interface AutomationStep {
  dayOffset: number;
  channel: ConsentChannel;
  templateId: string;
  whatsappTemplateName?: string;
  whatsappTemplateLanguage?: string;
}

export interface AutomationRule {
  id: string;
  name: string;
  triggerType: AutomationTriggerType;
  triggerValue: string | null;
  stepsJson: AutomationStep[];
  isActive: boolean;
  createdBy: { firstName: string; lastName: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationRuleInput {
  name: string;
  triggerType: AutomationTriggerType;
  triggerValue?: string | null;
  steps: AutomationStep[];
  isActive?: boolean;
}

export interface AutomationEnrollment {
  id: string;
  automationRuleId: string;
  contactId: string;
  contact: { id: string; firstName: string; lastName: string; email: string | null };
  status: EnrollmentStatus;
  currentStepIndex: number;
  nextStepDueAt: string | null;
  enrolledAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
}

export interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  role: { id: string; name: RoleName };
}

export interface AdminUserInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  roleId: string;
}

export interface AdminRole {
  id: string;
  name: RoleName;
  description: string | null;
  userCount: number;
  grants: string[];
  modules: string[];
}

export interface AuditLogEntry {
  id: string;
  userId: string | null;
  user: { firstName: string; lastName: string; email: string } | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditLogResponse {
  logs: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SendingLimitRow {
  type: "GMAIL" | "WHATSAPP" | "VIBER";
  connected: boolean;
  dailyLimit: number | null;
  defaultDailyLimit: number;
  sentToday: number | null;
}
