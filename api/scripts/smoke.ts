/**
 * End-to-end smoke test against a running PUB Legal API.
 *
 * Runs as Taylor (Admin). Walks the full request surface, including
 * creating a test ticket, posting internal + non-internal messages,
 * uploading a file, and cleaning up after itself.
 *
 * Usage:
 *   SMOKE_API=http://localhost:8080 \
 *   SMOKE_ADMIN_EMAIL=taylorb@popupbagels.com \
 *   SMOKE_ADMIN_PIN=1112 \
 *   npx tsx scripts/smoke.ts
 *
 * Optional:
 *   SMOKE_FRANCHISEE_EMAIL=... SMOKE_FRANCHISEE_PIN=...   enables Phase 2
 *   SMOKE_KEEP=1                                          skip cleanup for debugging
 */

import 'dotenv/config';

const API    = process.env.SMOKE_API           ?? 'http://localhost:8080';
const EMAIL  = process.env.SMOKE_ADMIN_EMAIL   ?? 'taylorb@popupbagels.com';
const PIN    = process.env.SMOKE_ADMIN_PIN;
const F_EMAIL = process.env.SMOKE_FRANCHISEE_EMAIL;
const F_PIN   = process.env.SMOKE_FRANCHISEE_PIN;
const KEEP   = process.env.SMOKE_KEEP === '1';

if (!PIN) {
  console.error('SMOKE_ADMIN_PIN is required');
  process.exit(1);
}

// ── tiny test runner ───────────────────────────────────────────────
let cookie = '';
let fails = 0;
let passes = 0;

function pass(label: string): void { passes++; console.log(`  ✓ ${label}`); }
function fail(label: string, err: unknown): void {
  fails++;
  const msg = err instanceof Error ? err.message : String(err);
  console.log(`  ✗ ${label} — ${msg}`);
}
function section(title: string): void {
  console.log(`\n▸ ${title}`);
}

async function step<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    const result = await fn();
    pass(label);
    return result;
  } catch (err) {
    fail(label, err);
    return undefined;
  }
}

async function api<T>(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
      ...extraHeaders,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  // Capture Set-Cookie for session maintenance
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    const match = setCookie.match(/pub_session=([^;]+)/);
    if (match) cookie = `pub_session=${match[1]}`;
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(data)}`);
  }
  return data as T;
}

// ── scenarios ──────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log(`PUB Legal API smoke test\n  target: ${API}\n  admin:  ${EMAIL}`);

  // Phase 0: reachability
  section('Phase 0 — Reachability');
  await step('GET /health returns ok', async () => {
    const h = await api<{ status: string }>('GET', '/health');
    if (h.status !== 'ok') throw new Error('health not ok');
  });

  // Phase 1: admin flow
  section('Phase 1 — Admin session');
  const login = await step('POST /auth/verify (admin)', async () => {
    return api<{ user: { id: string; userType: string } }>(
      'POST', '/api/v1/auth/verify',
      { email: EMAIL, pin: PIN },
    );
  });
  if (!login || login.user.userType !== 'Admin') {
    console.log('\nAdmin login failed or user is not Admin. Aborting.');
    process.exit(1);
  }

  await step('GET /auth/me returns Admin', async () => {
    const me = await api<{ user: { userType: string; scope: { globalAccess: boolean } } }>('GET', '/api/v1/auth/me');
    if (me.user.userType !== 'Admin') throw new Error(`userType=${me.user.userType}`);
    if (!me.user.scope.globalAccess) throw new Error('globalAccess should be true for Admin');
  });

  await step('GET /admin/users', async () => {
    const r = await api<{ users: unknown[] }>('GET', '/api/v1/admin/users');
    if (r.users.length < 1) throw new Error('no users returned');
  });

  // Phase 2: locations
  section('Phase 2 — Locations (admin scope)');
  const locs = await step('GET /locations (admin sees all)', async () => {
    const r = await api<{ locations: { id: string; shopName: string; shopId: string }[] }>('GET', '/api/v1/locations');
    if (r.locations.length < 50) throw new Error(`expected 50+ locations, got ${r.locations.length}`);
    return r;
  });
  if (!locs) return;

  // Pick a known-good location: prefer Cambridge, fallback to first w/ shopId
  const cambridge = locs.locations.find(l => l.shopId === '2003')
    ?? locs.locations.find(l => l.shopId)
    ?? locs.locations[0];
  console.log(`  using: ${cambridge.shopName} (shop ${cambridge.shopId}, rec ${cambridge.id})`);

  await step(`GET /locations/${cambridge.id}`, async () => {
    await api('GET', `/api/v1/locations/${cambridge.id}`);
  });

  await step(`GET /locations/${cambridge.id}/construction`, async () => {
    await api('GET', `/api/v1/locations/${cambridge.id}/construction`);
  });

  await step(`GET /locations/${cambridge.id}/tickets`, async () => {
    await api('GET', `/api/v1/locations/${cambridge.id}/tickets`);
  });

  await step(`GET /locations/${cambridge.id}/documents`, async () => {
    await api('GET', `/api/v1/locations/${cambridge.id}/documents`);
  });

  // Phase 3: ticket lifecycle
  section('Phase 3 — Ticket create + messages + upload');
  const ticket = await step('POST /tickets (smoke test)', async () => {
    return api<{ ticket: { id: string } }>('POST', '/api/v1/tickets', {
      locationId:  cambridge.id,
      workstream:  'Real Estate',
      requestType: 'Other Real Estate Question',
      title:       '[SMOKE TEST] — safe to delete',
      description: 'This ticket was created by the automated smoke test. It will be deleted at the end of the run.',
    });
  });
  if (!ticket) return;
  const ticketId = ticket.ticket.id;

  await step('POST non-internal message', async () => {
    await api('POST', `/api/v1/tickets/${ticketId}/messages`, {
      body: 'Smoke test — public message.',
    });
  });

  await step('POST internal message', async () => {
    await api('POST', `/api/v1/tickets/${ticketId}/messages`, {
      body: 'Smoke test — internal-only note.',
      internal: true,
    });
  });

  await step('GET messages (admin sees 2)', async () => {
    const r = await api<{ messages: { internal: boolean }[] }>('GET', `/api/v1/tickets/${ticketId}/messages`);
    if (r.messages.length !== 2) throw new Error(`expected 2 messages, got ${r.messages.length}`);
    const internals = r.messages.filter(m => m.internal).length;
    if (internals !== 1) throw new Error(`expected 1 internal message, got ${internals}`);
  });

  await step('POST /documents (small test upload)', async () => {
    const fd = new FormData();
    const blob = new Blob(['Smoke test file contents\n'], { type: 'text/plain' });
    // rename to .pdf to match our allowlist — we accept pdf/docx/etc.
    // Actually our allowlist is pdf,docx,doc,dwg,dxf,png,jpg,jpeg. Let's use a 1-byte png.
    const png = new Uint8Array([
      0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A, // PNG header
      0x00,0x00,0x00,0x0D,0x49,0x48,0x44,0x52, // IHDR chunk header
      0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01, // 1x1
      0x08,0x06,0x00,0x00,0x00,0x1F,0x15,0xC4,0x89,
      0x00,0x00,0x00,0x0D,0x49,0x44,0x41,0x54, // IDAT
      0x78,0x9C,0x62,0x00,0x01,0x00,0x00,0x05,0x00,0x01,0x0D,0x0A,0x2D,0xB4,
      0x00,0x00,0x00,0x00,0x49,0x45,0x4E,0x44,0xAE,0x42,0x60,0x82, // IEND
    ]);
    const pngBlob = new Blob([png], { type: 'image/png' });
    fd.append('file', pngBlob, 'smoke-test.png');
    fd.append('ticketId', ticketId);
    fd.append('documentType', 'Site Photo');
    fd.append('version', '1');
    // void the unused blob var to keep strict unused-local clean
    void blob;

    const res = await fetch(`${API}/api/v1/documents`, {
      method: 'POST',
      headers: { Cookie: cookie },
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(data)}`);
  });

  // Phase 4 (optional): franchisee scope enforcement
  if (F_EMAIL && F_PIN) {
    section('Phase 4 — Franchisee scope enforcement');
    const adminCookie = cookie;
    cookie = ''; // clear admin session

    const f = await step('POST /auth/verify (franchisee)', async () => {
      return api<{ user: { userType: string } }>('POST', '/api/v1/auth/verify', { email: F_EMAIL, pin: F_PIN });
    });
    if (f) {
      await step('GET /auth/me returns Franchisee or Partner', async () => {
        const me = await api<{ user: { userType: string; scope: { globalAccess: boolean } } }>('GET', '/api/v1/auth/me');
        if (me.user.userType !== 'Franchisee' && me.user.userType !== 'Partner') {
          throw new Error(`expected Franchisee/Partner, got ${me.user.userType}`);
        }
        if (me.user.scope.globalAccess) throw new Error('franchisee should NOT have global access');
      });

      await step('GET /locations (franchisee scoped)', async () => {
        const r = await api<{ locations: unknown[] }>('GET', '/api/v1/locations');
        if (r.locations.length > 30) {
          throw new Error(`suspiciously many locations (${r.locations.length}) — scope may be leaking`);
        }
      });

      await step('GET internal message hidden from franchisee', async () => {
        // Only works if the franchisee has access to Cambridge — they may not.
        // Try and just accept 403 as a valid scope rejection.
        try {
          const r = await api<{ messages: { internal: boolean }[] }>('GET', `/api/v1/tickets/${ticketId}/messages`);
          // If they can see it, verify internal is filtered out
          if (r.messages.some(m => m.internal)) {
            throw new Error('franchisee saw an internal message');
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('403')) {
            // Forbidden is correct behavior if they don't own that ticket
            return;
          }
          throw err;
        }
      });
    }

    cookie = adminCookie; // restore admin session for cleanup
  }

  // Phase 5: cleanup
  section('Phase 5 — Cleanup');
  if (KEEP) {
    console.log(`  SKIPPED (SMOKE_KEEP=1). Test ticket left at: ${ticketId}`);
  } else {
    await step(`DELETE /tickets/${ticketId}`, async () => {
      await api('DELETE', `/api/v1/tickets/${ticketId}`);
    });
  }

  await step('POST /auth/logout', async () => {
    await api('POST', '/api/v1/auth/logout');
  });

  // ── summary ──────────────────────────────────────────────────────
  console.log(`\n${passes} passed, ${fails} failed`);
  process.exit(fails > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
