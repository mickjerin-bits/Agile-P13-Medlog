import type { MedicalRecord, RecordSummary, User } from '../types';

const TOKEN_KEY = 'medlog.token';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function parseError(response: Response): Promise<never> {
  let message = `Request failed (${response.status})`;
  let details: Array<{ field: string; message: string }> | undefined;

  try {
    const body = await response.json();
    if (body?.error) message = body.error;
    if (Array.isArray(body?.details)) details = body.details;
  } catch {
    // response had no JSON body
  }

  throw new ApiError(response.status, message, details);
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`/api${path}`, { ...init, headers });
  if (!response.ok) await parseError(response);
  return response;
}

async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, init);
  return response.json() as Promise<T>;
}

function jsonBody(payload: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface RegisterPayload {
  email: string;
  password: string;
  fullName: string;
  dateOfBirth?: string;
  bloodGroup?: string;
}

export const api = {
  register: (payload: RegisterPayload) => apiJson<AuthResponse>('/auth/register', jsonBody(payload)),

  login: (email: string, password: string) =>
    apiJson<AuthResponse>('/auth/login', jsonBody({ email, password })),

  me: () => apiJson<{ user: User }>('/auth/me'),

  listRecords: (filters: { recordType?: string; search?: string } = {}) => {
    const query = new URLSearchParams();
    if (filters.recordType) query.set('recordType', filters.recordType);
    if (filters.search) query.set('search', filters.search);
    const suffix = query.toString() ? `?${query}` : '';
    return apiJson<{ records: MedicalRecord[] }>(`/records${suffix}`);
  },

  summary: () => apiJson<RecordSummary>('/records/summary'),

  uploadRecord: (form: FormData) =>
    apiJson<{ record: MedicalRecord }>('/records', { method: 'POST', body: form }),

  deleteRecord: (id: string) => apiFetch(`/records/${id}`, { method: 'DELETE' }).then(() => undefined),

  downloadRecord: async (record: MedicalRecord): Promise<void> => {
    const response = await apiFetch(`/records/${record.id}/file`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = record.originalFilename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};
