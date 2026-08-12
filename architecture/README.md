# MedLog Architecture

Sprint 1 baseline. The requirements and design epic that preceded implementation is kept in
[epic-0-requirements-and-design.md](epic-0-requirements-and-design.md).

## Components

```
Browser (React 19 + Vite)
  │  fetch /api/*  ·  Bearer JWT in Authorization header
  ▼
Express 5 API (Node 22+)
  ├─ helmet, cors, express.json
  ├─ /api/auth      bcrypt password hashing, JWT issue/verify, rate limiting
  └─ /api/records   multer (memory) → AES-256-GCM → disk, ownership checks
       │                    │
       │                    ▼
       │              data/records/<userId>/<uuid>.enc   (ciphertext only)
       ▼
   SQLite (better-sqlite3, WAL)
     users · records · access_log
```

The uploaded file never touches disk in the clear: multer buffers it in memory, `services/crypto.ts`
encrypts the buffer, and `services/storage.ts` writes only the ciphertext. Nothing decrypts except
`GET /api/records/:id/file`, after the ownership check passes.

## Data model

**users**

| column | type | notes |
|---|---|---|
| id | TEXT PK | UUID |
| email | TEXT UNIQUE | lowercased on write |
| password_hash | TEXT | bcrypt, 12 rounds |
| full_name | TEXT | |
| date_of_birth, blood_group | TEXT NULL | optional profile |
| role | TEXT | `PATIENT`; `DOCTOR` arrives in Sprint 2 |
| created_at | TEXT | ISO 8601 |

**records**

| column | type | notes |
|---|---|---|
| id | TEXT PK | UUID |
| owner_id | TEXT FK → users.id | `ON DELETE CASCADE`; every query filters on it |
| title, record_type, record_date | TEXT | `record_type` is one of 7 enum values |
| provider_name, notes | TEXT NULL | hospital/clinic and free text |
| original_filename, mime_type, size_bytes | | metadata of the plaintext file |
| storage_key | TEXT | path of the `.enc` blob, relative to the storage root |
| encryption_iv, encryption_tag | TEXT | base64, per record — never reused |
| checksum | TEXT | SHA-256 of the plaintext, for integrity checks |
| created_at | TEXT | ISO 8601 |

Index: `(owner_id, record_date DESC)` — the shape of every list query.

**access_log** — `actor_id`, `record_id`, `action` (`UPLOAD` / `DOWNLOAD` / `DELETE`), `created_at`.
Written in Sprint 1, consumed by the Sprint 2 audit trail and analytics.

## API

All record routes require `Authorization: Bearer <token>`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness probe |
| POST | `/api/auth/register` | Create a patient account → `{ token, user }` |
| POST | `/api/auth/login` | Sign in → `{ token, user }` |
| GET | `/api/auth/me` | Current user, used to restore a session |
| GET | `/api/records` | List own records; `?recordType=` and `?search=` filters |
| GET | `/api/records/summary` | Dashboard totals, per-type counts, 5 most recent |
| POST | `/api/records` | `multipart/form-data`: `file` + title, recordType, recordDate, providerName, notes |
| GET | `/api/records/:id` | Metadata for one own record |
| GET | `/api/records/:id/file` | Decrypted file; `?disposition=inline` to view instead of download |
| DELETE | `/api/records/:id` | Delete the row and shred the blob |

Errors are `{ error, code }`, plus `details[]` for validation failures. Codes in use:
`VALIDATION_ERROR`, `BAD_REQUEST`, `UNAUTHORIZED`, `NOT_FOUND`, `EMAIL_TAKEN`, `FILE_TOO_LARGE`,
`RATE_LIMITED`, `INTERNAL_ERROR`.

## Security decisions and their reasons

| Decision | Reason |
|---|---|
| AES-256-GCM, not CBC | Authenticated encryption — a tampered blob fails the tag check instead of decrypting to garbage |
| Fresh 12-byte IV per record | IV reuse under GCM leaks plaintext relationships |
| Key only in `MEDLOG_ENCRYPTION_KEY`, server refuses to boot without it | A committed or defaulted key is the same as no encryption |
| bcrypt 12 rounds (4 in tests) | Slow by design against offline cracking; low rounds keep the suite fast |
| Ownership filter inside every SQL query | Not a separate guard that a future route can forget to call |
| Unknown record id returns 404, not 403 | A 403 confirms the record exists |
| MIME allowlist + 10 MB cap | Blocks executable uploads and memory exhaustion |
| `storage_key` resolved and prefix-checked | Defeats `../` path traversal via a tampered key |
| Rate limit on login and register | Slows credential stuffing |

## Known gaps (carried into Sprint 2)

- Files are encrypted with one server-wide key. Per-patient key wrapping is the next step.
- JWTs cannot be revoked before expiry (12 h) — no refresh/blacklist yet.
- Local disk storage; object storage (e.g. S3) needed for a real deployment.
- `access_log` is written but not yet surfaced to the patient.
- No doctor role, consent model, or sharing links.
