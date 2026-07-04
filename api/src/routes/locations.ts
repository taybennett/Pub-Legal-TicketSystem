import { Router, type Request, type Response } from 'express';
import * as locations from '../airtable/locations.js';
import * as tickets from '../airtable/tickets.js';
import * as documents from '../airtable/documents.js';
import * as pipeline from '../airtable/pipeline.js';
import * as leases from '../airtable/leases.js';
import * as faTracker from '../airtable/faTracker.js';
import { airtable } from '../airtable/client.js';
import { FA_TRACKER, LEASES, LOCATIONS, PIPELINE, TABLE, TICKETS, type DocumentType, type LifecycleStage, type Workstream } from '../airtable/tables.js';
import { requireAuth } from '../auth/middleware.js';
import { canAccessLocation } from '../scope/rules.js';
import { ForbiddenError, NotFoundError } from '../util/errors.js';
import { lifecycleStageFromPipelineStatus } from '../lib/lifecycleFromPipeline.js';
import { logger } from '../util/logger.js';

export const locationsRouter = Router();

locationsRouter.use(requireAuth);

// GET /locations — list my accessible Locations
locationsRouter.get('/', async (req: Request, res: Response) => {
  const records = await locations.listForScope(req.user!.scope);

  // Bulk-fetch Pipeline statuses keyed by Shop Number so we can derive
  // each Location's Lifecycle Stage live. Soft-fails (logs + falls back
  // to stored value) so the home page still renders if Pipeline is down.
  let pipelineStatuses: Map<string, pipeline.PipelineCandidate[]> = new Map();
  try {
    pipelineStatuses = await pipeline.listStatusesByShopNumber();
  } catch (err) {
    logger.warn({ err }, 'Pipeline status bulk fetch failed; using stored Lifecycle Stage');
  }

  // Batch-resolve Franchisee Entity names so cards can show the franchisee
  const entityIds = new Set<string>();
  for (const r of records) {
    const ids = (r.fields[LOCATIONS.FRANCHISEE_ENTITY] as string[] | undefined) ?? [];
    ids.forEach(id => entityIds.add(id));
  }
  const entityNameById = new Map<string, string>();
  if (entityIds.size > 0) {
    const { airtable } = await import('../airtable/client.js');
    const { TABLE, FRANCHISEE_ENTITIES } = await import('../airtable/tables.js');
    const ids = Array.from(entityIds);
    // Airtable filterByFormula 'OR(RECORD_ID()=...)' for batch lookup
    const formula = 'OR(' + ids.map(id => `RECORD_ID()='${id}'`).join(',') + ')';
    const entities = await airtable.list<{ [k: string]: unknown }>('LEGAL', TABLE.FRANCHISEE_ENTITIES, {
      filterByFormula: formula,
    });
    for (const e of entities) {
      entityNameById.set(e.id, (e.fields[FRANCHISEE_ENTITIES.ENTITY_NAME] as string) ?? '');
    }
  }

  res.json({
    locations: records.map(r => {
      const entIds = (r.fields[LOCATIONS.FRANCHISEE_ENTITY] as string[] | undefined) ?? [];
      const entityName = entIds.map(id => entityNameById.get(id) ?? '').filter(Boolean).join(', ');
      // Legacy text fallback for older records
      const legacy = r.fields[LOCATIONS.FRANCHISEE_ENTITY_LEGACY];
      const legacyName = typeof legacy === 'object' && legacy && 'name' in legacy
        ? (legacy as { name: string }).name
        : (typeof legacy === 'string' ? legacy : '');
      const shopId   = (r.fields[LOCATIONS.SHOP_ID]   as string | undefined) ?? '';
      const shopName = (r.fields[LOCATIONS.SHOP_NAME] as string | undefined) ?? '';
      return {
        id: r.id,
        shopName,
        shopId,
        brand:    r.fields[LOCATIONS.BRAND] ?? 'POP-UP BAGELS',
        address:  r.fields[LOCATIONS.ADDRESS] ?? '',
        city:     r.fields[LOCATIONS.CITY] ?? '',
        state:    r.fields[LOCATIONS.STATE] ?? '',
        zip:      r.fields[LOCATIONS.ZIP] ?? '',
        franchiseeName: entityName || legacyName || '',
        generalManager: r.fields[LOCATIONS.GENERAL_MANAGER] ?? '',
        districtManager: r.fields[LOCATIONS.DISTRICT_MANAGER] ?? '',
        lifecycleStage:  resolveLifecycleStage(shopId, shopName, r.fields[LOCATIONS.LIFECYCLE_STAGE], pipelineStatuses),
        targetOpenDate:   r.fields[LOCATIONS.TARGET_OPEN_DATE] ?? null,
        actualOpenDate:   r.fields[LOCATIONS.ACTUAL_OPEN_DATE] ?? null,
        leaseSignedDate:  r.fields[LOCATIONS.LEASE_SIGNED_DATE] ?? null,
        faSignedDate:     r.fields[LOCATIONS.FA_SIGNED_DATE] ?? null,
      };
    }),
  });
});

/**
 * Pipeline-derived stage wins; falls back to stored Location value.
 * When multiple Pipeline records share a Shop Number (e.g. Thompson and
 * Thompson St-Remodel both at #1004), disambiguate by exact Shop Name.
 */
function resolveLifecycleStage(
  shopId: string,
  shopName: string,
  stored: unknown,
  pipelineStatuses: Map<string, pipeline.PipelineCandidate[]>,
): LifecycleStage | null {
  if (shopId) {
    const candidates = pipelineStatuses.get(shopId) ?? [];
    let pick: pipeline.PipelineCandidate | undefined;
    if (candidates.length === 1) pick = candidates[0];
    else if (candidates.length > 1) pick = candidates.find(c => c.shopName === shopName) ?? candidates[0];
    if (pick) {
      const derived = lifecycleStageFromPipelineStatus(pick.status);
      if (derived) return derived;
    }
  }
  return (stored as LifecycleStage | undefined) ?? null;
}

// GET /locations/:id — single Location detail
locationsRouter.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!canAccessLocation(req.user!.scope, id)) throw new ForbiddenError();
  const r = await locations.getById(id);
  if (!r) throw new NotFoundError('Location not found');

  // Lease + FA Tracker joins (Option C — backend computes from source tables).
  const leaseIds = (r.fields[LOCATIONS.LEASES]  as string[] | undefined) ?? [];
  const shopId   = (r.fields[LOCATIONS.SHOP_ID] as string | undefined) ?? '';
  const [leaseSigned, faSigned] = await Promise.all([
    latestLeaseExecutionDate(leaseIds),
    latestFaTrackerExecutionDate(shopId),
  ]);

  // Manual override on Location wins; else compute lease + 240 days.
  const targetOpenManual = (r.fields[LOCATIONS.TARGET_OPEN_DATE] as string | undefined) ?? null;
  const targetOpen = targetOpenManual ?? addDays(leaseSigned, 240);
  const actualOpen = (r.fields[LOCATIONS.ACTUAL_OPEN_DATE] as string | undefined) ?? null;

  // 240d KPI: variance in days between (effective open) and the 240-day baseline
  // off the lease signed date. Effective open = actualOpen if shop opened, else
  // the manual targetOpen override (because the auto-computed targetOpen is
  // exactly leaseSigned+240 and would always yield 0 — not informative).
  const daysVs240 = computeDaysVs240(leaseSigned, actualOpen, targetOpenManual);

  // Live Lifecycle Stage from Pipeline (Pipeline wins; stored is fallback).
  let lifecycleStage: LifecycleStage | null = (r.fields[LOCATIONS.LIFECYCLE_STAGE] as LifecycleStage | undefined) ?? null;
  const shopIdStr   = (r.fields[LOCATIONS.SHOP_ID]   as string | undefined) ?? '';
  const shopNameStr = (r.fields[LOCATIONS.SHOP_NAME] as string | undefined) ?? '';
  if (shopIdStr) {
    try {
      const p = await pipeline.findByShopNumber(shopIdStr, shopNameStr);
      const rawStatus = p?.fields[PIPELINE.DEVELOPMENT_STATUS];
      const status = !rawStatus ? null : typeof rawStatus === 'string' ? rawStatus : (rawStatus as { name: string }).name;
      const derived = lifecycleStageFromPipelineStatus(status);
      if (derived) lifecycleStage = derived;
    } catch (err) {
      logger.warn({ err, shopId: shopIdStr }, 'Pipeline status lookup failed; using stored Lifecycle Stage');
    }
  }

  res.json({
    location: {
      id: r.id,
      shopName: r.fields[LOCATIONS.SHOP_NAME] ?? '',
      shopId:   r.fields[LOCATIONS.SHOP_ID] ?? '',
      address:  r.fields[LOCATIONS.ADDRESS] ?? '',
      city:     r.fields[LOCATIONS.CITY] ?? '',
      state:    r.fields[LOCATIONS.STATE] ?? '',
      zip:      r.fields[LOCATIONS.ZIP] ?? '',
      lifecycleStage,
      dates: {
        loiSigned:  (r.fields[LOCATIONS.LOI_SIGNED_DATE] as string | undefined) ?? null,
        leaseSigned,
        faSigned,
        targetOpen,
        actualOpen,
        daysVs240,
      },
    },
  });
});

// ── Date join helpers ──────────────────────────────────────────────

/** Latest Execution Date among the linked Leases. Active status preferred; falls back to any. */
async function latestLeaseExecutionDate(leaseIds: string[]): Promise<string | null> {
  if (leaseIds.length === 0) return null;
  const formula = 'OR(' + leaseIds.map(id => `RECORD_ID()='${id}'`).join(',') + ')';
  const records = await airtable.list<{ [k: string]: unknown }>('LEGAL', TABLE.LEASES, {
    filterByFormula: formula,
  });
  return pickLatestExecutionDate(records, LEASES.EXECUTION_DATE, LEASES.STATUS);
}

/** Latest Execution Date among Active FA Trackers matching Shop Number. */
async function latestFaTrackerExecutionDate(shopId: string): Promise<string | null> {
  if (!shopId) return null;
  const safe = shopId.replace(/'/g, "\\'");
  const records = await airtable.list<{ [k: string]: unknown }>('LEGAL', TABLE.FA_TRACKER, {
    filterByFormula: `{Shop Number} = '${safe}'`,
  });
  return pickLatestExecutionDate(records, FA_TRACKER.EXECUTION_DATE, FA_TRACKER.STATUS);
}

function pickLatestExecutionDate(
  records: { fields: Record<string, unknown> }[],
  dateFieldId: string,
  statusFieldId: string,
): string | null {
  const datedRecords = records
    .map(r => ({
      date: r.fields[dateFieldId] as string | undefined,
      statusName: extractSelectName(r.fields[statusFieldId]),
    }))
    .filter((x): x is { date: string; statusName: string | null } => Boolean(x.date));

  if (datedRecords.length === 0) return null;

  const active = datedRecords.filter(x => x.statusName === 'Active');
  const pool = active.length > 0 ? active : datedRecords;
  pool.sort((a, b) => (a.date < b.date ? 1 : -1));
  return pool[0].date;
}

function extractSelectName(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && 'name' in (v as Record<string, unknown>)) {
    return (v as { name: string }).name;
  }
  return null;
}

function addDays(isoDate: string | null, days: number): string | null {
  if (!isoDate) return null;
  const d = new Date(isoDate + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function computeDaysVs240(
  leaseSigned: string | null,
  actualOpen: string | null,
  targetOpenManual: string | null,
): number | null {
  if (!leaseSigned) return null;
  const effectiveOpen = actualOpen ?? targetOpenManual;
  if (!effectiveOpen) return null;
  const a = new Date(leaseSigned + 'T00:00:00Z').getTime();
  const b = new Date(effectiveOpen + 'T00:00:00Z').getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const days = Math.round((b - a) / (24 * 60 * 60 * 1000));
  return days - 240;
}

// GET /locations/:id/construction — live read from PUB Development Pipeline
locationsRouter.get('/:id/construction', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!canAccessLocation(req.user!.scope, id)) throw new ForbiddenError();
  const loc = await locations.getById(id);
  if (!loc) throw new NotFoundError('Location not found');
  const shopId = loc.fields[LOCATIONS.SHOP_ID] as string | undefined;
  if (!shopId) {
    res.json({ construction: null, reason: 'no_shop_number' });
    return;
  }
  const p = await pipeline.findByShopNumber(shopId);
  if (!p) {
    res.json({ construction: null, reason: 'not_in_pipeline' });
    return;
  }
  const pickName = (v: unknown): string | null => {
    if (!v) return null;
    if (typeof v === 'string') return v;
    if (typeof v === 'object' && 'name' in (v as Record<string, unknown>)) {
      return (v as { name: string }).name;
    }
    return null;
  };
  res.json({
    construction: {
      developmentStatus: pickName(p.fields[PIPELINE.DEVELOPMENT_STATUS]),
      leaseStatus:       pickName(p.fields[PIPELINE.LEASE_STATUS]),
      projectedOpening:  p.fields[PIPELINE.PROJECTED_OPENING] ?? null,
      leaseSigned:       p.fields[PIPELINE.LEASE_SIGNED] ?? null,
      term:              p.fields[PIPELINE.TERM] ?? null,
      rent:              p.fields[PIPELINE.RENT] ?? null,
      leaseOptions:      p.fields[PIPELINE.LEASE_OPTIONS] ?? null,
      testFitApproved:   p.fields[PIPELINE.TEST_FIT_APPROVED] ?? null,
      permitSubmitted:   p.fields[PIPELINE.PERMIT_SUBMITTED] ?? null,
      permitApproved:    p.fields[PIPELINE.PERMIT_APPROVED] ?? null,
      constructionStart: p.fields[PIPELINE.CONSTRUCTION_START] ?? null,
      weeksOutFromOpen:  p.fields[PIPELINE.WEEKS_OUT_FROM_OPEN] ?? null,
    },
  });
});

// GET /locations/:id/leases — leases linked to this Location, most recent first
locationsRouter.get('/:id/leases', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!canAccessLocation(req.user!.scope, id)) throw new ForbiddenError();
  const loc = await locations.getById(id);
  if (!loc) throw new NotFoundError('Location not found');
  const leaseIds = (loc.fields[LOCATIONS.LEASES] as string[] | undefined) ?? [];
  const records = await leases.listForLocation(leaseIds);
  res.json({
    leases: records.map(r => ({
      id: r.id,
      executionDate: (r.fields[LEASES.EXECUTION_DATE] as string | undefined) ?? null,
      termEnd:       (r.fields[LEASES.TERM_END]       as string | undefined) ?? null,
      termYears:     (r.fields[LEASES.TERM_YEARS]     as number | undefined) ?? null,
      monthlyRent:   (r.fields[LEASES.MONTHLY_RENT]   as number | undefined) ?? null,
      annualRent:    (r.fields[LEASES.ANNUAL_RENT]    as number | undefined) ?? null,
      status:        extractSelectName(r.fields[LEASES.STATUS]),
      file:          (r.fields[LEASES.FILE] as { url: string; filename: string }[] | undefined) ?? [],
      // Document hierarchy — null Document Type is treated as "Original Lease" client-side
      documentType:    extractSelectName(r.fields[LEASES.DOCUMENT_TYPE]),
      parentLeaseIds:  (r.fields[LEASES.PARENT_LEASE] as string[] | undefined) ?? [],
      documentDate:    (r.fields[LEASES.DOCUMENT_DATE]     as string | undefined) ?? null,
      amendmentNumber: (r.fields[LEASES.AMENDMENT_NUMBER]  as number | undefined) ?? null,
    })),
  });
});

// GET /locations/:id/fa-trackers — FA Tracker rows matching this Location's Shop ID
locationsRouter.get('/:id/fa-trackers', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!canAccessLocation(req.user!.scope, id)) throw new ForbiddenError();
  const loc = await locations.getById(id);
  if (!loc) throw new NotFoundError('Location not found');
  const shopId = (loc.fields[LOCATIONS.SHOP_ID] as string | undefined) ?? '';
  const records = await faTracker.listForShopNumber(shopId);
  res.json({
    faTrackers: records.map(r => ({
      id: r.id,
      executionDate: (r.fields[FA_TRACKER.EXECUTION_DATE] as string | undefined) ?? null,
      termEnd:       (r.fields[FA_TRACKER.TERM_END]       as string | undefined) ?? null,
      termYears:     (r.fields[FA_TRACKER.TERM_YEARS]     as number | undefined) ?? null,
      entityName:    (r.fields[FA_TRACKER.ENTITY_NAME]    as string | undefined) ?? null,
      signatory:     (r.fields[FA_TRACKER.SIGNATORY]      as string | undefined) ?? null,
      draName:       (r.fields[FA_TRACKER.DRA_NAME]       as string | undefined) ?? null,
      attorney:      (r.fields[FA_TRACKER.ATTORNEY]       as string | undefined) ?? null,
      status:        extractSelectName(r.fields[FA_TRACKER.STATUS]),
      file:          (r.fields[FA_TRACKER.FILE] as { url: string; filename: string }[] | undefined) ?? [],
      // Multi-doc hierarchy (added 2026-07-04)
      documentType:    extractSelectName(r.fields[FA_TRACKER.DOCUMENT_TYPE]),
      parentFaIds:     (r.fields[FA_TRACKER.PARENT_FA] as string[] | undefined) ?? [],
      documentDate:    (r.fields[FA_TRACKER.DOCUMENT_DATE]    as string | undefined) ?? null,
      amendmentNumber: (r.fields[FA_TRACKER.AMENDMENT_NUMBER] as number | undefined) ?? null,
      addendumName:    (r.fields[FA_TRACKER.ADDENDUM_NAME]    as string | undefined) ?? null,
    })),
  });
});

// GET /locations/:id/tickets — scoped to this Location, optionally by workstream
locationsRouter.get('/:id/tickets', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!canAccessLocation(req.user!.scope, id)) throw new ForbiddenError();
  const workstream = (req.query.workstream as Workstream | undefined);
  const records = await tickets.listForScope(req.user!.scope, { locationId: id, workstream });
  res.json({
    tickets: records.map(r => ({
      id: r.id,
      title:        r.fields[TICKETS.TITLE] ?? '',
      description:  r.fields[TICKETS.DESCRIPTION] ?? '',
      status:       r.fields[TICKETS.STATUS] ?? null,
      workstream:   r.fields[TICKETS.WORKSTREAM] ?? null,
      requestType:  r.fields[TICKETS.REQUEST_TYPE] ?? null,
      submitterName:r.fields[TICKETS.SUBMITTER_NAME] ?? null,
      submittedAt:  r.fields[TICKETS.SUBMITTED_AT] ?? null,
      origin:       r.fields[TICKETS.ORIGIN] ?? null,
    })),
  });
});

// GET /locations/:id/documents — all docs for this Location
locationsRouter.get('/:id/documents', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!canAccessLocation(req.user!.scope, id)) throw new ForbiddenError();
  const type = req.query.type as DocumentType | undefined;
  const records = await documents.listForLocation(id, type);
  res.json({
    documents: records.map(r => ({
      id: r.id,
      filename:     r.fields['Filename'] ?? '',
      documentType: r.fields['Document Type'] ?? null,
      version:      r.fields['Version'] ?? null,
      uploadedBy:   r.fields['Uploaded By'] ?? null,
      uploadedByRole: r.fields['Uploaded By Role'] ?? null,
      uploadedAt:   r.fields['Uploaded At'] ?? null,
      file:         r.fields['File'] ?? [],
    })),
  });
});

