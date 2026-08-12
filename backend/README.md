# MedLog API

Express 5 + TypeScript + SQLite. Stores medical records encrypted with AES-256-GCM.

## Setup

```bash
npm install && cp .env.example .env
```

Generate the two secrets (`.env.example` has the commands) — the server exits at boot if
`MEDLOG_ENCRYPTION_KEY` or `JWT_SECRET` is missing, so there is no insecure default to fall into.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Watch mode on http://localhost:4000 |
| `npm test` | 26 Vitest + supertest tests against an in-memory SQLite |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` / `npm start` | Compile to `dist/` and run it |

## Layout

```
src/
├── app.ts                 Express app factory (imported directly by the tests)
├── index.ts               Boot + listen
├── config.ts              Env parsing, paths, allowed MIME types, record types
├── db/index.ts            SQLite connection, schema, WAL
├── middleware/            auth (JWT), error (HttpError + Zod), upload (multer)
├── routes/                auth.routes.ts, records.routes.ts
└── services/              crypto.ts (AES-256-GCM), storage.ts (encrypted blob I/O)
```

`data/` holds the SQLite file and the encrypted blobs. It is gitignored — never commit it.

The API reference lives in [../architecture/README.md](../architecture/README.md).
