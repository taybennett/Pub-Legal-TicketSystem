# PUB Legal Portal

Franchisee-facing React/Vite app served at `portal.popupbagels.com`. Talks to the backend at `api.popupbagels.com`.

## Local development

```bash
cp .env.example .env   # VITE_API_URL is optional in dev — Vite proxies /api to localhost:8080
npm install
npm run dev            # opens http://localhost:5173
```

The dev server proxies `/api` to `http://localhost:8080` so cookies and CORS work without any fuss. Make sure the backend is running in another terminal (`cd ../api && npm run dev`).

## Production build

```bash
npm run build          # outputs to dist/
npm run preview        # serves the built bundle locally to sanity-check
```

Railway builds from the Dockerfile on push; the container runs `serve -s dist` on port 8080.

## Structure

```
src/
├── main.tsx                    entry — mounts React + Router + AuthProvider
├── App.tsx                     route table + auth guard
├── styles.css                  global tokens, layout, components
├── api/
│   ├── client.ts               fetch wrapper with credentials: include
│   └── types.ts                shared response shapes
├── hooks/
│   └── useAuth.tsx             session context (me, signIn, signOut, refresh)
├── components/
│   ├── Layout.tsx              top nav + sign-out
│   ├── LocationCard.tsx        shop card for the grid
│   └── StagePill.tsx           colored lifecycle-stage chip
└── pages/
    ├── Login.tsx               email + PIN entry
    ├── Locations.tsx           card grid with search
    └── LocationDetail.tsx      5-tab shop view (Overview, RE, FA, Construction, Documents)
```

## What's implemented (MVP skeleton)

- Login with email + PIN (backend-verified, httpOnly cookie)
- Route guard on `/locations/*` — redirects to login if unauthenticated
- Locations home: card grid, search by name / city / shop #, stage pill per card
- Location detail: 5 tabs
  - **Overview** — key dates from PUB Legal
  - **Real Estate** — tickets filtered by workstream (list view; composer coming next)
  - **Franchise Agreement** — same pattern
  - **Construction** — live read from PUB Development's Pipeline
  - **Documents** — flat list of all docs for this Location, with direct attachment links

## What's next (in order)

1. Ticket detail page at `/tickets/:id` — message thread + reply composer + file upload
2. New-conversation composer on the Real Estate / FA tabs (modal with Request Type dropdown + first-message body + optional attachment)
3. General Inbox page `/inbox` for tickets without a Location
4. Profile page at `/profile` — change PIN
5. Admin console at `/admin` — Taylor's user provisioning UI (only shown when userType === Admin)

## Deploy notes

- `VITE_API_URL` must point to the backend. In production, set to `https://api.popupbagels.com`.
- The backend's CORS config must include this origin (already wired via `FRONTEND_URL_PORTAL`).
- Since the portal is a SPA with client-side routing, make sure Railway uses SPA mode — our Dockerfile runs `serve -s dist` which handles this.
