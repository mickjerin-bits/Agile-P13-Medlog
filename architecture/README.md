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
| Consent wraps the patient key rather than sharing it | Revoking deletes the grant, and the wrapped key dies with it — the doctor's only route to the plaintext closes |
| Revoke deletes the grant instead of flagging it | A `revoked: true` flag would leave the usable key sitting in storage |
| Unknown or expired consent returns 404, not 403 | Same reason as records: a 403 confirms the grant exists |
| Audit rows store a record id, never a title | Titles are encrypted metadata; writing them to the log would undo the Sprint 1 CRYPTO-META fix |
| Reminder title and notes encrypted like record metadata | "Oncology follow-up" is as sensitive as the record it refers to |

## Sprint 2: how doctor access works

1. The patient names a doctor by email and optionally narrows the scope to certain record types and
   an end date.
2. MedLog generates a fresh per-grant key, encrypts the patient's record key under it, and stores
   both on the grant.
3. The doctor's reads unwrap that key to decrypt only the record types the grant allows.
4. Revoking deletes the grant row, so the wrapped key and its unwrapping key both disappear.

Every doctor action — listing, opening, downloading, and refusals outside the granted scope — is
appended to an audit log the patient can read.

**The same honest limitation applies.** With no server, the per-grant unwrapping key has to sit
beside the wrapped key it opens, exactly as the record key sits beside the ciphertext. In a real
deployment the patient's key would be wrapped under the doctor's public key and that field would not
exist. What the model *does* enforce correctly, and what the tests prove, is the lifecycle: no grant
means no access, a scoped grant means no access outside the scope, and revocation ends access
immediately.

## The honest limitation

With no server, the derived record key must be persisted in `localStorage` next to the ciphertext,
because a fresh tab has no other way to recover it. Anyone with access to the browser profile can
therefore decrypt. The encryption is real (verifiable in DevTools) and it models the Sprint 2 data
flow correctly, but it is **not** a protection boundary. This prototype must not hold real patient
data.

## Known gaps

- Key custody: needs a server so neither the record key nor the per-grant wrapping key lives beside
  the ciphertext. This is the one gap that matters most and it is unchanged since Sprint 1.
- ~5 MB total storage; large scans and PDFs will not fit. Object storage is the fix.
- Data is per-browser: no sync across devices, and clearing site data destroys everything. A doctor
  and their patients must therefore be in the same browser profile for the demo.
- Export to CSV/PDF is in the P13 feature list but assigned to neither sprint column, and is not
  built.
- Care gaps are derived only from what the patient has uploaded, so they are a prompt and not a
  clinical recall system.

Closed in Sprint 2: the doctor role, the consent model, and the patient-visible audit trail that
replaced the Sprint 1 backend's `access_log` table.
