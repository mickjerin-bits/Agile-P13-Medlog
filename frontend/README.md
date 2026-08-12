# MedLog Web App

React 19 + Vite + TypeScript. The whole application — including its mocked backend.

## Setup

```bash
npm install && npm run dev
```

Runs on http://localhost:5173. No server, no database, no environment variables.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm test` | 99 Vitest + Testing Library tests |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm run build` | Static bundle into `dist/` |

Set `VITE_BASE_PATH` when building for a sub-path host such as GitHub Pages.

## Layout

```
src/
├── App.tsx                Routing; unauthenticated users only reach login/register
├── mock/
│   ├── api.ts             Mock backend — the module Sprint 2 replaces with fetch calls
│   ├── crypto.ts          PBKDF2 + AES-256-GCM + SHA-256 via Web Crypto
│   └── store.ts           localStorage keys, quota accounting, reset
├── auth/AuthContext.tsx   Session state, restored through api.me()
├── pages/                 LoginPage, RegisterPage, DashboardPage, RecordsPage
├── components/            AppShell, UploadRecordForm, RecordList, SummaryCards
└── styles.css             Design tokens and layout (no CSS framework)
```

## Notes for whoever picks this up

- `mock/api.ts` is deliberately shaped like an HTTP client: `async`, throws `ApiError` with a status
  code, ~140 ms of simulated latency (0 under test). Keep that contract and the UI needs no changes
  when a real API lands.
- Uploads are capped at 1.5 MB because `localStorage` gives roughly 5 MB per origin and base64
  inflates a file by a third. Exceeding the quota returns status 507 and rolls the blob back.
- `crypto.ts` needs `crypto.subtle`, which browsers only expose on `https://` or `localhost`. A demo
  served over plain `http://` from an IP address will not work.
- Tests run under jsdom, which has no `crypto.subtle` — `src/test-setup.ts` substitutes Node's
  `webcrypto`. jsdom's `Storage` is also a Proxy, so stubbing `localStorage.setItem` directly does
  nothing; spy on `Storage.prototype.setItem` instead.
