# Franchisee Portal — Build Blueprint

**Status:** Approved architecture, pre-implementation
**Target ship:** MVP in 2–3 weeks, phased rollout thereafter
**Author:** Taylor Bennett (PUB Legal)

---

## 1. What we're building

A customer-facing portal at **portal.popupbagels.com** that gives franchisees scoped access to the PUB Legal Airtable base. The organizing principle is the **Location** (the shop itself, tracked through its full lifecycle from LOI to grand opening to renewal), not individual tickets. Franchisees navigate to a Location card, then into tabs for each workstream (Real Estate, Franchise Agreement, Construction, Messages, Documents) — and the communication/document exchange happens within that context.

The internal employee app at **legal.popupbagels.com** continues working as today. Employees will see a new "Internal / Franchisee-Visible" toggle on messages and a small badge indicating which tickets originated from the franchisee side, but otherwise the experience is unchanged.

All data lives in one Airtable base (PUB Legal). Authorization is enforced by a new backend API service at **api.popupbagels.com** that holds the Airtable token and scopes every query by the authenticated user's identity. Construction-side data is read live from the PUB Development base by the same backend.

Success at MVP means: a franchisee logs in with email + PIN, sees a grid of their Locations, clicks into one, submits a lease redline review request with an attached PDF, and our legal team picks it up in the existing employee app — responds with a message — the franchisee gets an email notification, logs back in, and sees the reply + downloads the marked-up version.

---

## 2. Airtable schema changes

All changes are additive. No existing fields are removed or renamed. No data migration required for existing records — new fields default to empty for existing rows.

### 2.1 Users table (tblKg2Ls7eNE1nCHs)

New fields:

- **User Type** (singleSelect): Employee, Franchisee, Partner, Admin. Default for existing records: Employee. This drives every authorization decision in the backend.
- **Franchisee Group** (multipleRecordLinks → Franchisee Groups): which DRA a franchisee user belongs to. Null for Employee users. **This is the primary scoping unit** — one account per Group (Seeded Capital, Bagel Boyz, etc.), not per sub-Entity. A user can be linked to multiple Groups if a single person operates across DRAs. Locations accessible to the user are derived automatically from Group → Entity → Location, so new sub-Entities added to a Group appear immediately without updating the user record.
- **Associated Locations** (multipleRecordLinks → Locations): explicit override list for exceptions. Left empty in the common case — access derives from the Group link. Populated only when an individual user needs narrower scope (e.g., a partner with access to only one shop under a shared Group) or wider scope than their Group would grant.
- **Portal Status** (singleSelect): Active, Invited, Suspended. Default Active. Invited = PIN not yet set / first login pending. Suspended = logged attempts exceeded or manually disabled.
- **Last Login** (dateTime): set by backend on each successful auth.
- **Invitation Sent** (dateTime): when Taylor invited this user; drives "resend invite" UX.

### 2.2 Tickets table (tblgnmXTy33sKo5jT)

New fields:

- **Location** (multipleRecordLinks → Locations): which shop this ticket concerns. Optional — some tickets are general and have no Location (appear in General Inbox).
- **Workstream** (singleSelect): Real Estate, Franchise Agreement, Construction, General. Drives which tab the ticket appears under inside a Location view.
- **Request Type** (singleSelect): the MVP taxonomy from our planning conversation. Options scoped by Workstream in the UI but stored as a flat list:
  - _Real Estate:_ Site Selection / Test Fit CAD Review, LOI Draft Review, Lease Draft Review, Redlined Lease Review, Lease Rider Review, Lease Amendment Review, Renewal or Extension, Assignment or Transfer, Other Real Estate Question
  - _Franchise Agreement:_ New FA Review, FA Addendum or Amendment, FA Renewal, FA Transfer or Assignment, Signatory or Execution Question, Other FA Question
  - _General / Legal:_ General Legal Question, Compliance / State Registration, Other
- **Visibility** (singleSelect): Franchisee-Visible, Internal Only. Default Franchisee-Visible. "Internal Only" tickets never appear on the franchisee portal at all — used when the legal team wants to track their own work-in-progress without exposing it.
- **Origin** (singleSelect): Employee, Franchisee. Set by backend based on submitter's User Type. Drives the "Franchisee Submitted" badge in the employee app.

### 2.3 Messages table (tbl2FBBd0ojDClvEo)

New field:

- **Internal** (checkbox, default false): when true, the message is invisible to franchisee users. Employees see a small "Internal" pill on the message in the UI. This is the single most important new field in the whole migration — it's what makes internal team conversations possible on franchisee-visible tickets.

### 2.4 Documents table (tblCvHWHKVWxPULf5)

New fields:

- **Location** (multipleRecordLinks → Locations): direct link so we can query "all documents for Cambridge" without traversing tickets. Backend populates this from the Ticket's Location on upload.
- **Document Type** (singleSelect): Test Fit CAD, LOI, Lease Draft, Redlined Lease, Lease Rider, Lease Amendment, Signed Lease, Franchise Agreement, Addendum, Signed FA, Site Photo, Correspondence, Other. Drives icons and grouping in the portal UI.
- **Version** (number): v1, v2, v3 etc. Manual for MVP (uploader picks when uploading). Automated version chaining via Parent Document is Phase 2.
- **Uploaded By Role** (singleSelect): Franchisee, Franchisor, System. Set by backend based on uploader's User Type. Drives which side of the document timeline the file renders on.
- **Parent Document** (multipleRecordLinks → self): used in Phase 2 for "this is v2 of that previous document" chaining. Null for MVP.

### 2.5 Locations table (tbl23K8h2GHqaT2I5)

New fields (this table becomes the center of gravity for the portal):

- **Lifecycle Stage** (singleSelect): Prospect, LOI, At Lease, Lease Executed, FA Signed, Under Construction, Open, Operating, Renewal Due, Transferred, Closed. Default Operating for existing records. Drives the stage pill on Location cards.
- **Primary Franchisee Contact** (multipleRecordLinks → Users): who the franchisee lead is for this Location.
- **Assigned Attorney** (multipleRecordLinks → Users): who on our side owns the legal work. Drives ticket routing.
- **Target Open Date** (date): projected opening — mirrored from Pipeline or manually set.
- **LOI Signed Date** (date)
- **Lease Signed Date** (date, computed from most recent Lease record's Execution Date via lookup — no manual input needed)
- **FA Signed Date** (date, computed from most recent FA Tracker record's Execution Date where Status = Active)
- **Actual Open Date** (date)

A **Location Milestones** table is deferred to Phase 2 — for MVP, the Overview tab derives stage info from these fields directly.

### 2.6 No new tables at MVP

Deferred to future phases:
- Location Milestones (Phase 2 Overview polish)
- Portal Sessions (if we move away from JWT cookies)
- Audit Log (Phase 2 for compliance)
- Invitations (could be a table rather than fields on Users — reassess after MVP)

---

## 3. Backend architecture

### 3.1 Technology

- Node.js 20 + Express
- TypeScript (strict mode)
- `airtable` npm package for Airtable REST calls
- `jsonwebtoken` for session tokens
- `bcrypt` for PIN hashing (we are NOT storing plaintext PINs, even though the employee app does — franchisee PINs get hashed)
- `nodemailer` + Postmark for transactional email
- `zod` for request body validation
- `multer` for multipart file uploads

Deployed as a second Railway service in the same project as the existing static app. Internal environment isolation — no shared state, just shared infra billing.

### 3.2 File layout

```
api/
├── src/
│   ├── index.ts                  # Express app entry, routes mount point
│   ├── config.ts                 # Env var validation via zod
│   ├── auth/
│   │   ├── middleware.ts         # requireAuth, requireEmployee, requireAdmin
│   │   ├── routes.ts             # /auth/request-pin, /auth/verify, /auth/logout, /auth/me
│   │   ├── tokens.ts             # JWT sign/verify
│   │   └── pins.ts               # PIN hash/verify, set-on-first-login
│   ├── airtable/
│   │   ├── client.ts             # Shared Airtable client (PUB Legal + PUB Development bases)
│   │   ├── tables.ts             # All table + field ID constants (single source of truth)
│   │   ├── users.ts              # User CRUD + identity lookups
│   │   ├── locations.ts          # Location queries with scope enforcement
│   │   ├── tickets.ts            # Ticket CRUD with scope enforcement
│   │   ├── messages.ts           # Message CRUD with Internal filter
│   │   ├── documents.ts          # Document CRUD + upload proxy
│   │   └── pipeline.ts           # Cross-base reads from PUB Development
│   ├── routes/
│   │   ├── locations.ts          # /api/locations, /api/locations/:id, /api/locations/:id/construction
│   │   ├── tickets.ts            # /api/tickets CRUD under a Location
│   │   ├── messages.ts           # /api/tickets/:id/messages CRUD
│   │   ├── documents.ts          # /api/tickets/:id/documents CRUD + upload
│   │   └── admin.ts              # /api/admin/users for Taylor's account provisioning UI
│   ├── email/
│   │   ├── send.ts               # Postmark wrapper
│   │   └── templates/            # Invitation, ticket activity, status change
│   ├── scope/
│   │   └── rules.ts              # The authorization matrix — central place to check "can user X see record Y"
│   └── util/
│       ├── logger.ts
│       └── errors.ts
├── package.json
├── tsconfig.json
└── README.md
```

### 3.3 Configuration (environment variables)

- `AIRTABLE_PAT_LEGAL` — full read/write access to PUB Legal base
- `AIRTABLE_PAT_DEVELOPMENT` — read-only access to PUB Development base (scoped token)
- `JWT_SECRET` — 32+ byte random string for session signing
- `POSTMARK_TOKEN` — transactional email
- `FRONTEND_URL_LEGAL` — https://legal.popupbagels.com
- `FRONTEND_URL_PORTAL` — https://portal.popupbagels.com
- `EMAIL_FROM` — legal@popupbagels.com (or similar)
- `NODE_ENV` — production
- `PORT` — Railway-assigned

### 3.4 Authentication flow (email + PIN)

First-time login (Invited status):
1. Taylor creates a Users row with email + generated 8-digit PIN, User Type = Franchisee, Franchisee Group link set to the DRA (e.g., Seeded Capital), Portal Status = Invited.
2. Backend sends an invitation email with the PIN and a link to portal.popupbagels.com.
3. Franchisee enters email + PIN on portal login.
4. Backend verifies PIN against hash, sets Portal Status to Active, sets Last Login, issues JWT in an httpOnly cookie (30-day expiry, secure, sameSite=strict).
5. Franchisee can optionally change PIN from their profile page.

Returning login:
1. Franchisee enters email + PIN.
2. Backend verifies, issues JWT cookie.
3. Rate limiting: 5 failed attempts in 15 minutes → Portal Status = Suspended, email alert to Taylor.

Session:
- Every API request includes the JWT cookie.
- `requireAuth` middleware validates + attaches `req.user` (id, email, userType, franchiseeEntityIds, associatedLocationIds).
- `requireEmployee` and `requireAdmin` middleware for elevated endpoints.

---

## 4. API endpoint inventory

All endpoints are versioned at `/api/v1/`. All require auth except `/auth/request-pin` (not used at MVP) and `/auth/verify`.

### 4.1 Auth

- `POST /auth/verify` — body: { email, pin } → sets cookie, returns user profile
- `POST /auth/logout` — clears cookie
- `GET /auth/me` — returns current user profile + entity/location scope

### 4.2 Locations

- `GET /locations` — returns array of Locations this user can see. Franchisees see only their associated Locations. Employees see all.
- `GET /locations/:id` — single Location with summary (stage, key dates, counts of open tickets per workstream). 403 if franchisee lacks scope.
- `GET /locations/:id/construction` — live read from PUB Development Pipeline for this Shop Number. Returns the subset of fields a franchisee should see (Development Status, Target Open Date, Test Fit status, Permit status, Construction Manager contact, Opening Date, Weeks Out from Opening).
- `GET /locations/:id/tickets?workstream=Real%20Estate` — tickets for this Location, optionally scoped to one workstream.
- `GET /locations/:id/documents?type=Lease%20Draft` — documents for this Location, optionally filtered by type.

### 4.3 Tickets

- `POST /tickets` — create a new ticket. Body: { locationId?, workstream, requestType, title, description }. Backend auto-sets Submitter, Origin, Visibility=Franchisee-Visible (for franchisee submitters).
- `GET /tickets/:id` — single ticket with all its messages + documents. Internal messages filtered for franchisees.
- `PATCH /tickets/:id` — update status, assignee, deadline (employees only).
- `DELETE /tickets/:id` — admin only.

### 4.4 Messages

- `GET /tickets/:id/messages` — message thread. Franchisee users: Internal=false only. Employees: all.
- `POST /tickets/:id/messages` — body: { body, internal? }. Franchisees can't set internal=true. Backend records sender name/role from JWT.

### 4.5 Documents

- `POST /tickets/:id/documents` — multipart upload. Body: { file, documentType, version? }. Backend validates file size (max 25MB MVP), type allowlist (pdf, docx, dwg, png, jpg), uploads to Airtable via content.airtable.com attachment endpoint, creates Document record with Location link from parent Ticket.
- `GET /documents/:id` — metadata only.
- `GET /documents/:id/file` — **Phase 2**: proxied download with auth check. For MVP, UI uses the Airtable attachment URL directly (acceptable risk — see Security section).

### 4.6 Admin (Taylor only)

- `GET /admin/users` — list all portal users
- `POST /admin/users` — create a franchisee user, generates PIN, sends invite email
- `PATCH /admin/users/:id` — update (resend invite, suspend, change entity links)
- `GET /admin/activity` — audit log of logins and ticket creates (Phase 2)

---

## 5. Portal page inventory

All pages at portal.popupbagels.com. Same branding language as the employee app (same typography, color tokens) but simplified — no sidebar, top nav only, no multi-module switching.

### 5.1 Login (/)

Email + PIN inputs. "Forgot PIN?" link emails Taylor (no self-service reset at MVP — Taylor regenerates). First-time users see the same form; their PIN is the one from the invitation email. On success, redirect to /locations.

### 5.2 Locations home (/locations)

Grid of cards, one per associated Location. Matches the employee app's Locations card UI conceptually but stripped of the attorney-facing detail panel. Each card shows: Shop name, address, Lifecycle Stage pill (color-coded by stage), last-activity line, open-ticket count badge. Search bar filters by shop name / city / Shop ID. Empty state: "No Locations associated with your account yet — contact your PUB legal rep."

### 5.3 Location detail (/locations/:id)

Header: Shop name + address + stage pill + "Assigned attorney: Taylor Bennett" line.

Five tabs:

**Overview** — current stage, key dates (LOI, Lease, FA, Target Open, Actual Open), summary counts of tickets per workstream, latest activity feed (last 5 events across all workstreams).

**Real Estate** — filtered view of tickets where Workstream=Real Estate. Timeline-style list: each ticket is a card showing title, status, last message preview, document thumbnails. Click a card → ticket detail page. "New Conversation" button opens a modal scoped to Real Estate Request Types.

**Franchise Agreement** — same pattern, scoped to Workstream=FA.

**Construction** — read-only panel pulling live from PUB Development. Shows Development Status, Target Open Date, Test Fit / CD / Permit / Construction milestones with status pills, Construction Manager contact info. A note at top: "Construction questions go through Lynn on the Development team — email link."

**Documents** — flat list of all documents attached to this Location, across all tickets. Filterable by Document Type. Each row: icon + filename + type + version + uploaded by + date + download link.

### 5.4 Ticket detail (/tickets/:id)

Header: ticket title, status pill, location breadcrumb, workstream tag.

Body: message thread chronological. Each message shows sender name + role pill (Franchisee / Franchisor / Legal), timestamp, body, attachments rendered inline. Reply composer at bottom with file attachment button.

Sidebar: ticket metadata (request type, created date, assigned to, deadline if set), attached documents list.

### 5.5 General Inbox (/inbox)

Tickets with no Location (Workstream=General). Same chronological list as tabs. "New General Request" button.

### 5.6 Profile (/profile)

Email (read-only), Name, Phone (optional), associated entity/locations (read-only, shown as a list), Change PIN button.

### 5.7 Admin console (/admin) — Taylor only

User list with filters (Portal Status, User Type), "Invite New User" form, activity summary. Login-gated by User Type = Admin.

---

## 6. Employee app changes

Keep the existing legal.popupbagels.com app working. The following patches land in index.html:

1. **Message composer** gets an "Internal" checkbox. When checked, the message is hidden from the franchisee. Rendered messages show an "Internal" pill when Internal=true.

2. **Ticket list** gets a small badge on each ticket row: "Franchisee Submitted" (Origin=Franchisee). Helps the team know at a glance which tickets need more careful external-facing tone.

3. **Ticket detail** gains: Location link display, Workstream tag, Request Type tag. Employees can edit these.

4. **New Ticket form** gets a Workstream + Request Type + Location picker. Employees can create tickets on behalf of a Location even without a franchisee having submitted.

5. **Optional**: a "View as Franchisee" toggle that filters internal messages out of view, so employees can preview what the franchisee sees before hitting send.

No other employee-app functionality changes.

---

## 7. Email notifications

Transactional email via Postmark. All triggered server-side in the backend.

Triggers at MVP:

- **Invitation**: Taylor creates a franchisee user → email with PIN and portal URL.
- **Ticket created by employee on a Location** → email to Primary Franchisee Contact with ticket title + link to /tickets/:id.
- **Ticket created by franchisee** → email to Assigned Attorney on the Location, cc Taylor.
- **Non-internal message posted** → email to the other party (franchisee if employee posted; assigned attorney if franchisee posted).
- **Ticket status change** → email to franchisee if Visibility=Franchisee-Visible.
- **PIN reset** (Phase 2) → magic link with new PIN.

Each email uses a consistent footer linking to the portal + unsubscribe link (required by anti-spam law even for transactional, as best practice).

---

## 8. Security model

### 8.1 Authorization matrix (enforced in backend scope/rules.ts)

- **Admin**: full read/write on everything.
- **Employee**: full read/write on Tickets, Messages, Documents, Locations in PUB Legal. Read-only on PUB Development via proxy. Cannot modify Users table via portal API (done in Airtable directly).
- **Franchisee**: scope derives from `user.franchiseeGroupIds` — the backend resolves these to `accessibleLocationIds` by walking Group → Entities → Locations. If `user.associatedLocationIds` is non-empty, that overrides the derived set (narrower or wider). Read Locations where `id IN accessibleLocationIds`. Read Tickets where `Location IN accessibleLocationIds AND Visibility = Franchisee-Visible`. Read Messages where `Internal = false`. Read Documents where `Location IN accessibleLocationIds`. Write Messages/Documents only on Tickets they can read. Create Tickets only with Location=one of theirs (or no Location, for General). Cannot write anywhere else.
- **Partner**: same as Franchisee for now; reserved for future differentiation.

### 8.2 Token storage

- JWTs in httpOnly, secure, sameSite=strict cookies. Never localStorage.
- 30-day expiry, rolling (refresh on each authenticated request).
- Server-side token revocation not implemented at MVP (acceptable — if we need to boot a user, setting Portal Status=Suspended will fail the next request's identity check).

### 8.3 Upload safety

- File size cap 25MB (Airtable Plus plan limit allows 20MB per attachment; we cap at 25 to leave room and return clear errors).
- Type allowlist: pdf, docx, doc, dwg, dxf, png, jpg, jpeg.
- Filename sanitization (strip path separators, limit length).
- No in-line virus scanning at MVP — Airtable doesn't scan either. Acceptable risk; flag for Phase 2.

### 8.4 Attachment access

Airtable returns signed-but-public attachment URLs. A franchisee who copies a URL and shares it externally would let the recipient view the file without logging in. For MVP we accept this (URLs expire after ~2 hours, and the audience is small and contractual). Phase 2 introduces `GET /documents/:id/file` as an authenticated proxy that streams the file through the backend after verifying access, and the portal UI switches to using that.

### 8.5 Logging & audit

- Every successful auth, ticket create, message post, document upload logged with userId + timestamp + IP.
- Phase 2: surface this in an admin audit view.

### 8.6 Rate limiting

- Login endpoint: 5 attempts per email per 15 min, then 15-min cooldown + email alert to Taylor.
- General API: 100 req/min per user (generous; we're not expecting heavy load).

---

## 9. Deployment

### 9.1 Railway setup

Two new services in the existing Railway project:

- **api** — Node/Express backend. Dockerfile or Nixpacks build from `api/` subfolder. Public endpoint at `api-production-xxxx.up.railway.app`.
- **portal** — static site serving `portal/dist/`. Build command runs Vite or whatever bundler we pick. Public endpoint at `portal-production-xxxx.up.railway.app`.

### 9.2 Domain setup

At GoDaddy (or wherever DNS lives):

- `api.popupbagels.com` CNAME → Railway api service
- `portal.popupbagels.com` CNAME → Railway portal service
- Railway auto-provisions Let's Encrypt certs

### 9.3 CORS

Backend allows origins: `https://portal.popupbagels.com`, `https://legal.popupbagels.com`. Credentials enabled so cookies work cross-origin.

### 9.4 Rollout

1. Deploy backend with no clients connected — smoke test all endpoints with curl/Postman.
2. Deploy portal with a handful of test Franchisee accounts (internal team members set up as fake franchisees).
3. Live test: Taylor and Lynn pretend to be a franchisee, submit a lease redline ticket, verify employee app sees it with proper badge/workstream/location.
4. Invite one real pilot franchisee — whoever is most cooperative and has an active Location in flight.
5. Watch closely for 2 weeks, iterate on feedback.
6. Broader rollout — batches of 5 franchisees per week, with an intro email from Taylor.

---

## 10. Build sequence

### Week 1 — foundation

Days 1–2: Airtable schema migration. Add all new fields to Users, Tickets, Messages, Documents, Locations. Backfill Locations.Lifecycle Stage = Operating for existing open shops. Test by manually creating one franchisee user + linking to Cambridge.

Days 3–5: Backend scaffold. Express app, config loader, Airtable client, auth middleware, `/auth/verify` + `/auth/me` working end-to-end. Scope rules module with unit tests.

### Week 2 — endpoints + portal shell

Days 6–8: Implement Locations, Tickets, Messages, Documents routes with scope enforcement. Pipeline read endpoint for Construction tab. Admin users endpoint. Postmark invitation email.

Days 9–10: Portal frontend — login page, Locations home, Location detail shell (Overview tab only). Deployed to staging.

### Week 3 — polish + employee changes

Days 11–13: Real Estate + FA + Messages + Documents tabs in Location detail. Ticket detail page. General Inbox.

Days 14: Employee app patches (Internal toggle, Franchisee Submitted badge, Location/Workstream/Request Type fields on tickets).

Day 15: End-to-end smoke test with internal-pretend-franchisee accounts. Fix critical bugs.

### Week 4+ — pilot

Invite first real franchisee. Iterate based on their feedback. Build out remaining Request Types as needs emerge. Start planning Phase 2.

### Phase 2 (post-MVP, 3–6 weeks out)

- Construction tab wiring to Pipeline (if we extend beyond read-only)
- Document version chaining via Parent Document
- Authenticated document download proxy
- Magic-link login (replacing PIN)
- Audit log UI
- Email notification preferences
- Mobile responsive polish
- Bulk account provisioning for onboarding a whole DRA at once

### Phase 3 (later)

- Site selection workflow with staged approvals
- Renewal calendar + proactive notifications
- Marketing approval submissions
- Dashboards / reporting
- Franchisee self-service document library (signed FAs, leases) beyond just their open tickets

---

## 11. Open questions / deferred decisions

These are known unknowns. None block MVP; flagging so we handle them deliberately when the time comes.

**Partners vs Franchisees** — RESOLVED: one portal account per Franchisee Group (Seeded Capital, Bagel Boyz, BBP Mass, etc.), not per natural person and not per sub-Entity. The Group account holder distributes access internally as their operation requires. We can revisit if a DRA requests per-person logins after pilot, but the default is Group-level.

**Shop assignment when entity transfers** — if BBP Mass sells Cambridge to a new LLC mid-lease, how does the portal re-route history? Likely: keep the ticket history on the old entity for audit, grant the new entity read access to the Location + future-only ticket creation. Design this when it comes up.

**Franchisee multi-franchise portfolio** — some franchisees operate multiple independent franchises (hypothetically PUB + another brand). Out of scope; PUB Legal portal is PUB-only.

**Lease PDF privacy** — covered under Security section 8.4. Phase 2 item.

**Email notifications preferences** — franchisees may want to turn some off. Not MVP — default is "everything", Phase 2 adds granular preferences.

**Account deletion / offboarding** — when a franchisee exits, how do we wind down their portal access while preserving audit trail? Suspend is enough for MVP; full deletion workflow is legal/compliance Phase 2.

**Pipeline field IDs pinning** — we agreed to pin specific field IDs in `src/airtable/tables.ts` so a rename by the Development team doesn't silently break us. Corollary: when we add new Pipeline fields to the Construction tab, we need a coordination moment with Lynn / the Development team to confirm field IDs. Build it into the onboarding doc for new fields.

**Rate limit tuning** — 100 req/min per user is a guess. Watch real usage after pilot, adjust.

---

## 12. Next action

Awaiting Taylor's final approval on this blueprint. Once approved:

1. I execute the Airtable schema migration (all additive, reversible).
2. I scaffold the backend repo structure in Railway.
3. I scaffold the portal frontend structure.
4. We do a day-1 review together before any substantive logic lands, to make sure the abstractions match your mental model.

Estimated time from approval to MVP-in-pilot: 2.5–3 weeks. The long pole is the frontend — backend is smaller and more mechanical, but the portal UI needs iteration cycles with you to get right.
