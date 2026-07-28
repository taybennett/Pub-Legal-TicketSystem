import { Router, type Request, type Response } from 'express';

import * as locations from '../airtable/locations.js';
import * as leases from '../airtable/leases.js';
import * as faTracker from '../airtable/faTracker.js';
import * as franchiseeEntities from '../airtable/franchiseeEntities.js';
import * as pipeline from '../airtable/pipeline.js';
import {
  FA_TRACKER,
  FRANCHISEE_ENTITIES,
  LEASES,
  LOCATIONS,
} from '../airtable/tables.js';
import { requireAdmin, requireAuth } from '../auth/middleware.js';
import { lifecycleStageFromPipelineStatus } from '../lib/lifecycleFromPipeline.js';
import { logger } from '../util/logger.js';

export const complianceRouter = Router();

complianceRouter.use(requireAuth, requireAdmin);

// Franchisee Groups table — the "PUB Corp." DRA row record ID. Locations whose
// Franchisee Entity's parent group is this record are corp-owned and exempt
// from FA compliance checks.
const PUB_CORP_GROUP_ID = 'recn5BOYmsGH4jNZD';

interface ChecklistItem {
  ok: boolean;
  label: string;
}

interface ShopComplianceReport {
  locationId:  string;
  shopName:    string;
  shopId:      string;
  isPubCorp:   boolean;
  isOperating: boolean;  // Pipeline status maps to Operating OR stored lifecycle = Operating
  fullyCompliant: boolean;
  gapCount:    number;
  lease: {
    present:     ChecklistItem;
    pdfAttached: ChecklistItem;
    execDate:    ChecklistItem;
  };
  fa: {
    present:     ChecklistItem;
    pdfAttached: ChecklistItem;
    execDate:    ChecklistItem;
  } | null;  // null when isPubCorp = true
}

interface MissingShop {
  shopId:   string;
  shopName: string;
  status:   string;  // raw Pipeline development status
}

interface ExcludedShop {
  locationId: string;
  shopName:   string;
  shopId:     string;
  reason:     string;  // human-readable explanation of why it's out of scope
}

complianceRouter.get('/', async (req: Request, res: Response) => {
  const me = req.user!;
  const [locs, pipelineMap, allLeases, allFAs, allEntities] = await Promise.all([
    locations.listForScope(me.scope),
    pipeline.listStatusesByShopNumber().catch(err => {
      logger.warn({ err }, 'Pipeline fetch failed for compliance check; falling back to stored stages');
      return new Map<string, pipeline.PipelineCandidate[]>();
    }),
    leases.listAll(),
    faTracker.listAll(),
    franchiseeEntities.listAll(),
  ]);

  // Build entity → isPubCorp map
  const entityIsPubCorp = new Map<string, boolean>();
  for (const e of allEntities) {
    const parentGroups = (e.fields[FRANCHISEE_ENTITIES.PARENT_GROUP] as string[] | undefined) ?? [];
    entityIsPubCorp.set(e.id, parentGroups.includes(PUB_CORP_GROUP_ID));
  }

  // Build leases by locationId — leases can link to multiple Locations
  const leasesByLocationId = new Map<string, leases.LeaseRecord[]>();
  for (const l of allLeases) {
    const linked = (l.fields[LEASES.LOCATION] as string[] | undefined) ?? [];
    for (const locId of linked) {
      const list = leasesByLocationId.get(locId) ?? [];
      list.push(l);
      leasesByLocationId.set(locId, list);
    }
  }

  // Build FAs by shop number (string)
  const fasByShopNumber = new Map<string, faTracker.FaTrackerRecord[]>();
  for (const fa of allFAs) {
    const shopNum = (fa.fields[FA_TRACKER.SHOP_NUMBER] as string | undefined) ?? '';
    if (!shopNum) continue;
    const list = fasByShopNumber.get(shopNum) ?? [];
    list.push(fa);
    fasByShopNumber.set(shopNum, list);
  }

  // Scope rule: a Location is IN SCOPE for the compliance report if and only
  // if it has an Original Lease record (or a lease with null document type,
  // for backwards-compat with records that predate multi-doc support) that
  // carries an Execution Date. Any shop without a signed lease is excluded
  // and surfaced in the info banner with the reason.
  //
  // Note: PUB Corp shops still count if they have a signed lease — they're
  // exempt from FA checks specifically, not from the lease scope.
  function scopeCheck(loc: locations.LocationRecord): { inScope: boolean; reason: string } {
    const locLeases = leasesByLocationId.get(loc.id) ?? [];
    if (locLeases.length === 0) {
      return { inScope: false, reason: 'No lease record linked' };
    }
    const originalLease = locLeases.find(l => {
      const dt = l.fields[LEASES.DOCUMENT_TYPE];
      const name = typeof dt === 'string' ? dt : (dt as { name?: string } | undefined)?.name;
      return name == null || name === 'Original Lease';
    });
    if (!originalLease) {
      return { inScope: false, reason: 'Only ancillary lease documents; no Original Lease' };
    }
    const execDate = originalLease.fields[LEASES.EXECUTION_DATE] as string | undefined;
    if (!execDate) {
      return { inScope: false, reason: 'Original Lease present but no Execution Date' };
    }
    return { inScope: true, reason: 'Signed Original Lease' };
  }

  const excludedFromScope: ExcludedShop[] = [];
  const inScopeLocs: locations.LocationRecord[] = [];
  for (const loc of locs) {
    const check = scopeCheck(loc);
    if (check.inScope) {
      inScopeLocs.push(loc);
    } else {
      const shopName = (loc.fields[LOCATIONS.SHOP_NAME] as string | undefined) ?? '';
      const shopId   = (loc.fields[LOCATIONS.SHOP_ID]   as string | undefined) ?? '';
      // Silently skip Closed / Dead — they're not what the user means by
      // "shops in the system." Everything else surfaces.
      if (/Closed|Dead/i.test(check.reason)) continue;
      excludedFromScope.push({ locationId: loc.id, shopName, shopId, reason: check.reason });
    }
  }
  excludedFromScope.sort((a, b) => a.shopName.localeCompare(b.shopName));

  const reports: ShopComplianceReport[] = inScopeLocs
    .map(loc => {
      const shopName = (loc.fields[LOCATIONS.SHOP_NAME] as string | undefined) ?? '';
      const shopId   = (loc.fields[LOCATIONS.SHOP_ID]   as string | undefined) ?? '';
      const entIds   = (loc.fields[LOCATIONS.FRANCHISEE_ENTITY] as string[] | undefined) ?? [];
      const isPubCorp = entIds.some(eid => entityIsPubCorp.get(eid));

      // Is the shop actually open (not just lease-signed and in buildout)?
      // Prefer Pipeline (source of truth for construction state); fall back
      // to the stored Lifecycle Stage on the Locations record. Used by the
      // "Franchise-Operating" filter tab to distinguish shops we'd expect
      // a full FA-compliance profile on from shops still in buildout.
      let isOperating = false;
      if (shopId) {
        const candidates = pipelineMap.get(shopId) ?? [];
        const pick = candidates.length <= 1
          ? candidates[0]
          : (candidates.find(c => c.shopName === shopName) ?? candidates[0]);
        if (pick) {
          isOperating = lifecycleStageFromPipelineStatus(pick.status) === 'Operating';
        }
      }
      if (!isOperating && loc.fields[LOCATIONS.LIFECYCLE_STAGE] === 'Operating') {
        isOperating = true;
      }

      // Lease checks. We evaluate against the ORIGINAL LEASE specifically,
      // not just locLeases[0] — otherwise an ancillary doc (Amendment,
      // Guaranty, Possession Letter, etc.) ordered first by Airtable would
      // fail the exec-date check because those types don't carry an
      // execution date (they use Document Date). Null documentType is treated
      // as Original Lease for back-compat with records that predate the
      // multi-doc support.
      const locLeases = leasesByLocationId.get(loc.id) ?? [];
      const originalLease = locLeases.find(l => {
        const dt = l.fields[LEASES.DOCUMENT_TYPE];
        const name = typeof dt === 'string' ? dt : (dt as { name?: string } | undefined)?.name;
        return name == null || name === 'Original Lease';
      });
      const leaseChecks = {
        present:     { ok: !!originalLease,                                                                              label: 'Lease record' },
        pdfAttached: { ok: !!originalLease && ((originalLease.fields[LEASES.FILE] as unknown[] | undefined)?.length ?? 0) > 0, label: 'Lease PDF' },
        execDate:    { ok: !!originalLease && !!originalLease.fields[LEASES.EXECUTION_DATE],                             label: 'Lease exec date' },
      };

      // FA checks (skipped for PUB Corp shops)
      let faChecks: ShopComplianceReport['fa'] = null;
      if (!isPubCorp) {
        const fas = shopId ? (fasByShopNumber.get(shopId) ?? []) : [];
        const fa = fas[0];
        faChecks = {
          present:     { ok: fas.length > 0,                                                              label: 'FA record' },
          pdfAttached: { ok: !!fa && ((fa.fields[FA_TRACKER.FILE] as unknown[] | undefined)?.length ?? 0) > 0, label: 'FA PDF' },
          execDate:    { ok: !!fa && !!fa.fields[FA_TRACKER.EXECUTION_DATE],                              label: 'FA exec date' },
        };
      }

      const leaseFails = Object.values(leaseChecks).filter(c => !c.ok).length;
      const faFails    = faChecks ? Object.values(faChecks).filter(c => !c.ok).length : 0;
      const gapCount   = leaseFails + faFails;

      return {
        locationId: loc.id,
        shopName,
        shopId,
        isPubCorp,
        isOperating,
        fullyCompliant: gapCount === 0,
        gapCount,
        lease: leaseChecks,
        fa: faChecks,
      };
    })
    .sort((a, b) => {
      // Sort: gaps first (descending), then alphabetical by shop name
      if (a.gapCount !== b.gapCount) return b.gapCount - a.gapCount;
      return a.shopName.localeCompare(b.shopName);
    });

  const compliant = reports.filter(r => r.fullyCompliant).length;
  const withGaps  = reports.length - compliant;

  // Diagnostic A: shops the Pipeline says are Operating but that don't have
  // a Locations record in the LEGAL base at all. Silently excluded from the
  // compliance report today — surfacing them so ops can add the missing
  // Location record. Match on BOTH Shop ID and Shop Name (case-insensitive)
  // so a Locations record with a name-match but no Shop ID doesn't produce
  // a false-positive "missing" flag.
  const knownLocationShopIds = new Set(
    locs.map(l => (l.fields[LOCATIONS.SHOP_ID] as string | undefined) ?? '').filter(Boolean),
  );
  const knownLocationShopNames = new Set(
    locs.map(l => ((l.fields[LOCATIONS.SHOP_NAME] as string | undefined) ?? '').trim().toLowerCase())
        .filter(Boolean),
  );
  const missingFromLocations: MissingShop[] = [];
  for (const [shopId, candidates] of pipelineMap.entries()) {
    if (knownLocationShopIds.has(shopId)) continue;
    for (const c of candidates) {
      if (lifecycleStageFromPipelineStatus(c.status) !== 'Operating') continue;
      // Skip if a Locations record with the same name exists — it's really
      // present, just with a blank Shop ID (surfaced separately below).
      if (knownLocationShopNames.has(c.shopName.trim().toLowerCase())) continue;
      missingFromLocations.push({ shopId, shopName: c.shopName, status: c.status });
      break;
    }
  }
  missingFromLocations.sort((a, b) => a.shopName.localeCompare(b.shopName));

  // Diagnostic B: Locations records where Shop ID is empty. These silently
  // fail the FA check because the FA-tracker join uses Shop ID as the key.
  // A shop can look "compliant" here purely because we're pulling zero FAs
  // to check against.
  const locationsMissingShopId = locs
    .filter(l => {
      const id   = (l.fields[LOCATIONS.SHOP_ID]   as string | undefined) ?? '';
      const name = (l.fields[LOCATIONS.SHOP_NAME] as string | undefined) ?? '';
      return !id.trim() && !!name.trim();
    })
    .map(l => ({
      locationId: l.id,
      shopName:   (l.fields[LOCATIONS.SHOP_NAME] as string | undefined) ?? '',
    }))
    .sort((a, b) => a.shopName.localeCompare(b.shopName));

  res.json({
    summary: {
      totalOpen: reports.length,
      fullyCompliant: compliant,
      withGaps,
    },
    reports,
    missingFromLocations,
    locationsMissingShopId,
    excludedFromScope,
    refreshedAt: new Date().toISOString(),
  });
});
