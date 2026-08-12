# MedLog Web App

React 19 + Vite + TypeScript. Patient-facing UI for MedLog.

## Setup

```bash
npm install && npm run dev
```

Runs on http://localhost:5173 and proxies `/api` to http://localhost:4000, so start the
[backend](../backend/README.md) first. Override the target with `VITE_API_TARGET` if the API runs
elsewhere.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm test` | 19 Vitest + Testing Library tests |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm run build` | Production bundle into `dist/` |

## Layout

```
src/
├── App.tsx                Routing; unauthenticated users only reach login/register
├── auth/AuthContext.tsx   Token + current user, session restore via /auth/me
├── api/client.ts          Typed fetch wrapper, ApiError, token storage
├── pages/                 LoginPage, RegisterPage, DashboardPage, RecordsPage
├── components/            AppShell, UploadRecordForm, RecordList, SummaryCards
└── styles.css             Design tokens and layout (no CSS framework)
```

The JWT is kept in `localStorage` under `medlog.token` and attached as a bearer header by
`api/client.ts`. Files are requested as blobs and handed to a temporary anchor for download, so the
token is never put in a URL.
