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

export interface User {
  id: string;
  email: string;
  fullName: string;
  dateOfBirth: string | null;
  bloodGroup: string | null;
  role: string;
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
}
