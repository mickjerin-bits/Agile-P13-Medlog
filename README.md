# MedLog — Health Record Tracker

Project 13 · BITS WILP · Agile Software Processes (S2-25 SECLZG544) · Group 9

MedLog lets a patient upload their medical documents, keeps them encrypted at rest, and gives them
a single dashboard over their health record. Sprint 2 adds doctor access, analytics and reminders.

| | |
|---|---|
| Jira board | https://wilp-agile-group9.atlassian.net/jira/software/projects/AP/boards/2 |
| Sprint 1 goal | Record upload, secure storage, patient dashboard |
| Sprint 2 goal | Doctor access, analytics, reminders |
| Stack | Node 22+ / Express 5 / SQLite · React 19 / Vite / TypeScript |

## Quick start

Two terminals, from the repository root.

**1. API** (http://localhost:4000)

```bash
cd backend && cp .env.example .env
```

Fill the two secrets in `.env` — each command prints one value:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`MEDLOG_ENCRYPTION_KEY` needs 32 bytes (64 hex chars), `JWT_SECRET` any long random string. The
server refuses to boot without them rather than falling back to a default key.

```bash
cd backend && npm install && npm run dev
```

**2. Web app** (http://localhost:5173)

```bash
cd frontend && npm install && npm run dev
```

Open http://localhost:5173, create a patient account, and upload a record.

## Tests

```bash
cd backend && npm test
```

```bash
cd frontend && npm test
```

26 backend tests (supertest against the real Express app and SQLite) and 19 frontend tests
(Vitest + Testing Library). Both suites plus typecheck and production build run on every push via
[GitHub Actions](.github/workflows/ci.yml).

## How it is put together

```
├── backend/           Express 5 API, SQLite, AES-256-GCM record storage
│   ├── src/routes/    /api/auth, /api/records
│   ├── src/services/  crypto.ts (encrypt/decrypt), storage.ts (blob I/O)
│   └── tests/         auth, records, crypto
├── frontend/          React 19 + Vite patient web app
│   └── src/pages/     Login, Register, Dashboard, Records
└── architecture/      Architecture, security model, requirements baseline
```

See [architecture/README.md](architecture/README.md) for the data model, security model and the
full API reference.

### Security model in one paragraph

Passwords are hashed with bcrypt (12 rounds) — never stored or logged in the clear. Uploaded files
are encrypted with AES-256-GCM **before** they are written to disk; the ciphertext, IV and auth tag
are stored separately from the key, which lives only in the server environment. Every read of a
record re-checks ownership (`owner_id = <caller>`), so a patient asking for someone else's record
id gets a 404, not a file. Uploads are limited to 10 MB and to PDF / JPEG / PNG / WebP / plain
text. Login and registration are rate limited. A tampered ciphertext fails the GCM auth tag check
and the download errors out rather than returning corrupt data.

## Sprint 1 backlog → implementation

| Story | Delivered | Verified by |
|---|---|---|
| Patient can register an account | `POST /api/auth/register`, `RegisterPage` | `backend/tests/auth.test.ts` |
| Patient can sign in and stay signed in | JWT + `GET /api/auth/me`, `AuthContext` | `backend/tests/auth.test.ts`, `frontend/src/api/client.test.ts` |
| Patient can upload a record with metadata | `POST /api/records`, `UploadRecordForm` | `backend/tests/records.test.ts`, `frontend/src/components/UploadRecordForm.test.tsx` |
| Records are stored securely | `services/crypto.ts`, `services/storage.ts` | `backend/tests/crypto.test.ts`, "never writes the file to disk in plaintext" |
| Patient sees a dashboard of their record | `GET /api/records/summary`, `DashboardPage` | `backend/tests/records.test.ts`, `frontend/src/components/SummaryCards.test.tsx` |
| Patient can browse, filter and search records | `GET /api/records?recordType&search`, `RecordsPage` | `backend/tests/records.test.ts` |
| Patient can download a record | `GET /api/records/:id/file` | `backend/tests/records.test.ts` |
| Patient can delete a record | `DELETE /api/records/:id` | `backend/tests/records.test.ts` |
| No patient can reach another patient's record | Ownership check on every record route | `backend/tests/records.test.ts` (cross-patient cases) |

## Not in Sprint 1

Doctor accounts and consent-based sharing, analytics/trends, reminders, and cloud deployment are
Sprint 2 scope. The `access_log` table is already written on upload, download and delete so the
Sprint 2 audit trail and analytics have data to build on.
