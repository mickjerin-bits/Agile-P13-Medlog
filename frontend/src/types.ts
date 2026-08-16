export const RECORD_TYPES = [
  'LAB_REPORT',
  'PRESCRIPTION',
  'IMAGING',
  'DISCHARGE_SUMMARY',
  'VACCINATION',
  'INSURANCE',
  'OTHER',
] as const;

export type RecordType = (typeof RECORD_TYPES)[number];

export const RECORD_TYPE_LABELS: Record<RecordType, string> = {
  LAB_REPORT: 'Lab report',
  PRESCRIPTION: 'Prescription',
  IMAGING: 'Imaging / scan',
  DISCHARGE_SUMMARY: 'Discharge summary',
  VACCINATION: 'Vaccination',
  INSURANCE: 'Insurance',
  OTHER: 'Other',
};

export const USER_ROLES = ['PATIENT', 'DOCTOR'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  PATIENT: 'Patient',
  DOCTOR: 'Doctor',
};

export interface User {
  id: string;
  email: string;
  fullName: string;
  dateOfBirth: string | null;
  bloodGroup: string | null;
  role: UserRole;
  specialty: string | null;
  createdAt: string;
}

export interface MedicalRecord {
  id: string;
  title: string;
  recordType: RecordType;
  recordDate: string;
  providerName: string | null;
  notes: string | null;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface RecordSummary {
  totalRecords: number;
  totalBytes: number;
  lastUploadAt: string | null;
  byType: Partial<Record<RecordType, number>>;
  recentRecords: MedicalRecord[];
  storageUsedBytes: number;
  storageBudgetBytes: number;
}

export interface ConsentGrant {
  id: string;
  patientId: string;
  patientName: string;
  patientEmail: string;
  doctorId: string;
  doctorName: string;
  doctorEmail: string;
  doctorSpecialty: string | null;
  recordTypes: RecordType[];
  purpose: string | null;
  createdAt: string;
  expiresAt: string | null;
}

export interface SharedPatient {
  grantId: string;
  patientId: string;
  patientName: string;
  patientEmail: string;
  dateOfBirth: string | null;
  bloodGroup: string | null;
  recordTypes: RecordType[];
  purpose: string | null;
  createdAt: string;
  expiresAt: string | null;
  recordCount: number;
}

export const AUDIT_ACTIONS = [
  'CONSENT_GRANTED',
  'CONSENT_REVOKED',
  'RECORDS_VIEWED',
  'RECORD_OPENED',
  'RECORD_DOWNLOADED',
  'ACCESS_DENIED',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  CONSENT_GRANTED: 'Access granted',
  CONSENT_REVOKED: 'Access revoked',
  RECORDS_VIEWED: 'Viewed your record list',
  RECORD_OPENED: 'Opened a record',
  RECORD_DOWNLOADED: 'Downloaded a record',
  ACCESS_DENIED: 'Access refused',
};

export interface AuditEntry {
  id: string;
  patientId: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: AuditAction;
  recordId: string | null;
  recordTitle: string | null;
  detail: string | null;
  at: string;
}

export const REMINDER_KINDS = ['MEDICATION', 'APPOINTMENT', 'FOLLOW_UP'] as const;

export type ReminderKind = (typeof REMINDER_KINDS)[number];

export const REMINDER_KIND_LABELS: Record<ReminderKind, string> = {
  MEDICATION: 'Medication',
  APPOINTMENT: 'Appointment',
  FOLLOW_UP: 'Follow-up',
};

export const REPEAT_RULES = ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'] as const;

export type RepeatRule = (typeof REPEAT_RULES)[number];

export const REPEAT_RULE_LABELS: Record<RepeatRule, string> = {
  NONE: 'Does not repeat',
  DAILY: 'Every day',
  WEEKLY: 'Every week',
  MONTHLY: 'Every month',
};

export interface Reminder {
  id: string;
  kind: ReminderKind;
  title: string;
  notes: string | null;
  dueDate: string;
  dueTime: string | null;
  repeat: RepeatRule;
  completedAt: string | null;
  createdAt: string;
  relatedRecordId: string | null;
}

export interface ReminderBoard {
  overdue: Reminder[];
  today: Reminder[];
  upcoming: Reminder[];
  completed: Reminder[];
}

export interface MonthlyActivity {
  month: string;
  count: number;
}

export interface TypeCount {
  recordType: RecordType;
  count: number;
}

export interface ProviderCount {
  providerName: string;
  count: number;
}

export interface CareGap {
  recordType: RecordType;
  lastRecordDate: string;
  monthsSince: number;
}

export interface HealthAnalytics {
  totalRecords: number;
  firstRecordDate: string | null;
  latestRecordDate: string | null;
  monthlyActivity: MonthlyActivity[];
  byType: TypeCount[];
  topProviders: ProviderCount[];
  careGaps: CareGap[];
  busiestMonth: MonthlyActivity | null;
  averagePerMonth: number;
  activeReminders: number;
  doctorsWithAccess: number;
}
