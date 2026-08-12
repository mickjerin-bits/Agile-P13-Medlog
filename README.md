# MedLog — Health Record Tracker

Project 13 · BITS WILP · Agile Software Processes (S2-25 SECLZG544) · Group 9

MedLog lets a patient upload their medical documents, keeps them encrypted in browser storage, and
gives them a single dashboard over their health record.

**This is a frontend-only prototype.** There is no server and no database — the whole backend is
mocked in the browser against `localStorage`, so the app runs from a single `npm install` and
deploys as static files to any free host.

| | |
|---|---|
| Repository | https://github.com/mickjerin-bits/Agile-P13-Medlog |
| Jira board | https://wilp-agile-group9.atlassian.net/jira/software/projects/AP/boards/2 |
| Sprint 1 goal | Record upload, secure storage, patient dashboard |
| Sprint 2 goal | Doctor access, analytics, reminders |
| Stack | React 19 · Vite · TypeScript · Web Crypto · localStorage |
| Sprint 1 backlog | [docs/sprint-1-backlog.md](docs/sprint-1-backlog.md) — 15 items, 55 points, all Done |

## Quick start

```bash
git clone https://github.com/mickjerin-bits/Agile-P13-Medlog.git
cd Agile-P13-Medlog/frontend && npm install && npm run dev
```

Open http://localhost:5173 and press **Open the demo patient** — that creates
`asha.rao@medlog.test` (password `DemoPass123!`) with four sample records, so there is nothing to
set up before there is something to look at. Registering your own account works too.

Accounts live in the `localStorage` of the browser that created them, so they do not carry across
browsers, devices or incognito windows. Typing the demo credentials in a browser that has never
used MedLog creates that account on the spot.

Everything lives in your browser. To wipe it, clear site data for `localhost:5173`, or run
`api.resetEverything()` from the console.

## Tests

```bash
cd frontend && npm test
```

50 tests (Vitest + Testing Library): the mock API, the Web Crypto layer, and the components.
Typecheck, tests and the production build run on every push via
[GitHub Actions](.github/workflows/ci.yml), which also uploads the built `dist/` as an artifact.

## How it is put together

```
frontend/src/
├── mock/               The "backend", in the browser
│   ├── api.ts          Same shape a REST client would have: register, login, records CRUD
│   ├── crypto.ts       PBKDF2 key derivation + AES-256-GCM via Web Crypto
│   └── store.ts        localStorage persistence, namespaced keys, quota accounting
├── auth/               Session context
├── pages/              Login, Register, Dashboard, Records
└── components/         AppShell, UploadRecordForm, RecordList, SummaryCards
```

`mock/api.ts` deliberately mirrors a real HTTP client — it is `async`, it throws `ApiError` with
status codes, and it adds a small artificial latency so loading and error states are real. Swapping
it for `fetch` calls in Sprint 2 means rewriting one file.

See [architecture/README.md](architecture/README.md) for the data model and the full API surface.

### What the encryption does and does not do

Every uploaded file is encrypted with **AES-256-GCM** before it is written to `localStorage`, using
a key derived from the patient's password with **PBKDF2-SHA256 (210,000 iterations)**. Passwords
themselves are stored only as a salted PBKDF2 hash. You can verify this in DevTools: the
`medlog.blob.*` entries are base64 ciphertext, and the plaintext appears nowhere in storage. A
tampered blob fails the GCM authentication tag and refuses to open rather than returning corrupt
data, and each record carries a SHA-256 checksum that is re-verified on read.

**What this does not give you:** with no server, the derived key has to live in `localStorage`
alongside the ciphertext, so anyone with access to the browser profile can decrypt. The encryption
demonstrates the Sprint 1 data flow and protects against casual inspection — it is **not** real
protection for real patient data. Proper key custody needs the server that arrives in Sprint 2.
**Do not put real medical records in this prototype.**

## Sprint 1 backlog → implementation

| Story | Delivered | Verified by |
|---|---|---|
| Patient can register an account | `api.register`, `RegisterPage` | `mock/api.test.ts` |
| Patient can sign in and stay signed in | `api.login` / `api.me`, `AuthContext` | `mock/api.test.ts` |
| Patient can upload a record with metadata | `api.uploadRecord`, `UploadRecordForm` | `mock/api.test.ts`, `UploadRecordForm.test.tsx` |
| Records are stored securely | `mock/crypto.ts` + `mock/store.ts` | `mock/crypto.test.ts`, "never writes the plaintext into localStorage" |
| Patient sees a dashboard of their record | `api.summary`, `DashboardPage` | `mock/api.test.ts`, `SummaryCards.test.tsx` |
| Patient can browse, filter and search records | `api.listRecords`, `RecordsPage` | `mock/api.test.ts` |
| Patient can download a record | `api.downloadRecord` | `mock/api.test.ts` |
| Patient can delete a record | `api.deleteRecord` | `mock/api.test.ts` |
| No patient can reach another patient's record | Owner filter on every read + per-user key | `mock/api.test.ts` (isolation suite) |

## Agile artefacts

| Artefact | Where |
|---|---|
| Sprint 1 backlog, acceptance criteria (Given–When–Then), QA verification notes | [docs/sprint-1-backlog.md](docs/sprint-1-backlog.md) |
| Jira bulk-import of the same backlog (status + QA comments included) | [docs/jira-import.csv](docs/jira-import.csv) |
| Requirements and design baseline produced before development | [architecture/epic-0-requirements-and-design.md](architecture/epic-0-requirements-and-design.md) |
| Architecture, data model, security decisions | [architecture/README.md](architecture/README.md) |
| Continuous integration | [.github/workflows/ci.yml](.github/workflows/ci.yml) |

Sprint 1 closed **15 items / 55 story points**, including one mid-sprint scope change (dropping the
server for a browser-side mock), one defect found during review preparation, and one security gap
found during testing — record metadata was being stored readable while only the attachment was
encrypted. All three are tracked as their own items rather than folded silently into other work.

## Deploying the demo

The build is static, so any free host works:

```bash
cd frontend && npm run build
```

Upload `frontend/dist` to Netlify (drag and drop), or for GitHub Pages set
`VITE_BASE_PATH=/Agile-P13-Medlog/` before building. Configure the host to serve `index.html` for
unknown paths so client-side routing works on refresh.

## Not in Sprint 1

Doctor accounts and consent-based sharing, analytics, reminders, and the real backend are Sprint 2
scope. Because the storage layer is one module behind an async interface, moving it server-side is
a contained change rather than a rewrite.
