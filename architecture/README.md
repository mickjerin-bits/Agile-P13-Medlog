# MedLog Architecture

Sprint 1 baseline — a frontend-only prototype with the backend mocked in the browser. The
requirements and design epic that preceded implementation is kept in
[epic-0-requirements-and-design.md](epic-0-requirements-and-design.md).

## Components

```
React 19 + Vite (the only running process)
  │
  ├─ pages/ + components/         UI, forms, validation, loading and error states
  │      │  await api.*()
  │      ▼
  ├─ mock/api.ts                  Mock backend: async, throws ApiError with HTTP status codes,
  │      │                        adds ~140 ms latency so the UI's async states are real
  │      ├─ mock/crypto.ts        Web Crypto: PBKDF2 → AES-256-GCM, SHA-256 checksums
  │      └─ mock/store.ts         localStorage read/write, quota accounting
  │                                    │
  ▼                                    ▼
localStorage
  medlog.users        [{ id, email, passwordSalt, passwordHash, keySalt, … }]
  medlog.records      [{ id, ownerId, title, …, iv, checksum }]
  medlog.blob.<id>    base64 AES-256-GCM ciphertext, one key per record
  medlog.key.<userId> the patient's derived record key
  medlog.session      { userId }
```

Record metadata and ciphertext are stored under separate keys so that adding a record rewrites only
a small index plus one new blob, instead of rewriting one large JSON document each time.

## Data model

**users** (`medlog.users`)

| field | notes |
|---|---|
| id | UUID from `crypto.randomUUID()` |
| email | lowercased and trimmed on write; unique |
| passwordSalt / passwordHash | 16 random bytes + PBKDF2-SHA256, 210,000 iterations |
| keySalt | separate salt, so the record key is never the password hash |
| fullName, dateOfBirth, bloodGroup | profile; the last two are optional |
| role | `PATIENT`; `DOCTOR` arrives in Sprint 2 |
| createdAt | ISO 8601 |

**records** (`medlog.records`)

| field | notes |
|---|---|
| id | UUID |
| ownerId | every read filters on it |
| title, recordType, recordDate | `recordType` is one of 7 enum values |
| providerName, notes | hospital/clinic and free text, nullable |
| originalFilename, mimeType, sizeBytes | metadata of the plaintext file |
| iv | base64, 12 random bytes, fresh per record |
| checksum | SHA-256 of the plaintext, re-verified on every read |
| createdAt | ISO 8601 |

The ciphertext itself lives at `medlog.blob.<recordId>`. The GCM authentication tag is appended to
the ciphertext by Web Crypto, so it needs no separate field.

## API surface (`mock/api.ts`)

| Call | Behaviour |
|---|---|
| `register(payload)` | Validates, rejects duplicate email (409), derives the record key, signs in |
| `login(email, password)` | Re-derives the record key from the password; 401 on any mismatch |
| `me()` | Restores the session on reload; 401 when signed out |
| `logout()` | Clears the session and drops the derived key |
| `listRecords({ recordType, search })` | Own records only, newest record date first |
| `summary()` | Totals, per-type counts, 5 most recent, storage usage |
| `uploadRecord(FormData)` | Validates, encrypts, writes; 400 / 413 / 507 on failure |
| `readRecordFile(id)` | Decrypts and verifies the checksum; 404 if not yours |
| `downloadRecord(record)` | `readRecordFile` + blob download |
| `deleteRecord(id)` | Removes the index entry and the ciphertext |
| `seedDemoRecords()` | Four realistic sample records, for the sprint review demo |
| `inspectRawStorage(id)` | Returns the raw ciphertext — used by tests and for the demo |

Errors are `ApiError { status, message, details? }`, where `details` is a list of
`{ field, message }` for validation failures. Statuses in use: 400, 401, 404, 409, 413, 422, 507.

## Security decisions and their reasons

| Decision | Reason |
|---|---|
| AES-256-GCM, not CBC | Authenticated encryption — a tampered blob fails the tag check instead of decrypting to garbage |
| Fresh 12-byte IV per record | IV reuse under GCM leaks plaintext relationships |
| PBKDF2-SHA256, 210,000 iterations | OWASP's current guidance for PBKDF2-SHA256; slow enough to hurt offline guessing |
| Separate salts for the password hash and the record key | The stored hash must not be usable as the encryption key |
| Password never stored, only its hash | A stored password is a breach waiting to happen, even in a prototype |
| Owner filter inside every read | Not a separate guard a future call site can forget |
| Unknown record id returns 404, not 403 | A 403 confirms the record exists |
| SHA-256 checksum verified on read | Catches silent corruption of a stored blob |
| MIME allowlist + 1.5 MB cap | Blocks executable uploads and keeps a record inside the ~5 MB localStorage budget |
| Quota failure rolls back the blob | A half-written record would leave an undeletable orphan |

## The honest limitation

With no server, the derived record key must be persisted in `localStorage` next to the ciphertext,
because a fresh tab has no other way to recover it. Anyone with access to the browser profile can
therefore decrypt. The encryption is real (verifiable in DevTools) and it models the Sprint 2 data
flow correctly, but it is **not** a protection boundary. This prototype must not hold real patient
data.

## Known gaps (carried into Sprint 2)

- Key custody: needs a server so the key stops living beside the ciphertext.
- ~5 MB total storage; large scans and PDFs will not fit. Object storage is the fix.
- Data is per-browser: no sync across devices, and clearing site data destroys everything.
- No doctor role, consent model, or sharing links.
- No audit trail surfaced to the patient (the Sprint 1 backend had an `access_log` table; the mock
  drops it, and it returns with the real backend).
