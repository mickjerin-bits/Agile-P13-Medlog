import type { RecordType } from './config.js';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  date_of_birth: string | null;
  blood_group: string | null;
  role: string;
  created_at: string;
}

export interface RecordRow {
  id: string;
  owner_id: string;
  title: string;
  record_type: RecordType;
  record_date: string;
  provider_name: string | null;
  notes: string | null;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  storage_key: string;
  encryption_iv: string;
  encryption_tag: string;
  checksum: string;
  created_at: string;
}

export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  dateOfBirth: string | null;
  bloodGroup: string | null;
  role: string;
  createdAt: string;
}

export interface PublicRecord {
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

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    dateOfBirth: row.date_of_birth,
    bloodGroup: row.blood_group,
    role: row.role,
    createdAt: row.created_at,
  };
}

export function toPublicRecord(row: RecordRow): PublicRecord {
  return {
    id: row.id,
    title: row.title,
    recordType: row.record_type,
    recordDate: row.record_date,
    providerName: row.provider_name,
    notes: row.notes,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  };
}
