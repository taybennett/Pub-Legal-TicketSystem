# PUB Legal API

Backend API for the PUB Legal franchisee portal. Node 20 + Express + TypeScript, deployed to Railway.

## Local development

```bash
cp .env.example .env     # fill in real values
npm install
npm run dev              # tsx watch, reloads on save
```

Requires Node 20+.

## Build & run (production)

```bash
npm ci
npm run build
npm start
```

Or via Docker (same as Railway):

```bash
docker build -t pub-legal-api .
docker run --env-file .env -p 8080:8080 pub-legal-api
```

## Architecture at a glance

- `src/config.ts` — env var validation via zod. Exits on missing/invalid config.
- `src/airtable/` — HTTP client, table/field ID constants, per-resource modules (users, locations, tickets, messages, documents, pipeline).
- `src/auth/` — JWT session tokens, bcrypt PIN hashing (with plaintext legacy upgrade), middleware.
- `src/scope/rules.ts` — the authorization matrix. Every access decision funnels through `resolveUserScope`.
- `src/routes/` — Express routers for `/locations`, `/tickets`, `/documents`, `/admin`.
- `src/email/send.ts` — Postmark wrapper for invitations + ticket activity notifications.

## Critical invariants

1. **Field IDs are pinned.** Never use a field name string in queries — always an ID from `src/airtable/tables.ts`. An Airtable UI rename will NOT break the API.
2. **No Airtable token client-side.** Both PATs live only in server env vars. Requests from the portal go through this API, not directly to Airtable.
3. **Scope resolution happens on every request.** The JWT carries identity only. Location access derives from `resolveUserScope`, so Taylor's Airtable changes take effect immediately.
4. **Franchisees cannot post `internal: true` messages.** Enforced server-side regardless of what the client sends.

## Environment variables

See `.env.example`. Two Airtable PATs are required:

- `AIRTABLE_PAT_LEGAL` — full read/write on `appUInS3SOfPul1jr`.
- `AIRTABLE_PAT_DEVELOPMENT` — read-only on `appw92pCC1jrY5CNv`, ideally scoped to the Pipeline table only.

## Deployment

Railway auto-builds from the Dockerfile on push to main. Domain `api.popupbagels.com` → this service. CORS is configured to accept `legal.popupbagels.com` and `portal.popupbagels.com`.

## Testing (to do)

No tests yet in this scaffold. First-pass priorities when tests land:
- `scope/rules.ts` — the authorization matrix needs airtight coverage.
- `auth/pins.ts` — bcrypt + legacy upgrade path.
- `airtable/client.ts` — pagination + error handling against a mock.

## Route inventory

| Method | Path | Auth | Who |
|---|---|---|---|
| GET  | `/health` | none | anyone |
| POST | `/api/v1/auth/verify` | none | anyone (rate-limited) |
| POST | `/api/v1/auth/logout` | cookie | anyone authed |
| GET  | `/api/v1/auth/me` | cookie | anyone authed |
| GET  | `/api/v1/locations` | cookie | authed, scoped |
| GET  | `/api/v1/locations/:id` | cookie | authed + location access |
| GET  | `/api/v1/locations/:id/construction` | cookie | authed + location access |
| GET  | `/api/v1/locations/:id/tickets` | cookie | authed + location access |
| GET  | `/api/v1/locations/:id/documents` | cookie | authed + location access |
| POST | `/api/v1/tickets` | cookie | authed + (locationId access if provided) |
| GET  | `/api/v1/tickets/:id` | cookie | authed + ticket access |
| GET  | `/api/v1/tickets/:id/messages` | cookie | authed + ticket access |
| POST | `/api/v1/tickets/:id/messages` | cookie | authed + ticket access |
| GET  | `/api/v1/tickets/:id/documents` | cookie | authed + ticket access |
| POST | `/api/v1/documents` | cookie + multipart | authed + ticket access |
| GET  | `/api/v1/admin/users` | cookie + Admin | Taylor only |
| POST | `/api/v1/admin/users` | cookie + Admin | Taylor only |
| PATCH| `/api/v1/admin/users/:id` | cookie + Admin | Taylor only |
