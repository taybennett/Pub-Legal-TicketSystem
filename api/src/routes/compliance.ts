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
  locationId: string;
  shopName:   string;
  shopId:     string;
  isPubCorp:  boolean;
  fullyCompliant: boolean;
  gapCount:   number;
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

  // Determine "Open" via Pipeline (matches the home page filter logic)
  function isOpen(loc: locations.LocationRecord): boolean {
    const shopId   = (loc.fields[LOCATIONS.SHOP_ID]   as string | undefined) ?? '';
    const shopName = (loc.fields[LOCATIONS.SHOP_NAME] as string | undefined) ?? '';
    if (shopId) {
      const candidates = pipelineMap.get(shopId) ?? [];
      const pick = candidates.length <= 1
        ? candidates[0]
        : (candidates.find(c => c.shopName === shopName) ?? candidates[0]);
      if (pick) {
        const stage = lifecycleStageFromPipelineStatus(pick.status);
        return stage === 'Operating';
      }
    }
    // Fall back to stored Lifecycle Stage
    const stored = loc.fields[LOCATIONS.LIFECYCLE_STAGE];
    return stored === 'Operating';
  }

  const reports: ShopComplianceReport[] = locs
    .filter(isOpen)
    .map(loc => {
      const shopName = (loc.fields[LOCATIONS.SHOP_NAME] as string | undefined) ?? '';
      const shopId   = (loc.fields[LOCATIONS.SHOP_ID]   as string | undefined) ?? '';
      const entIds   = (loc.fields[LOCATIONS.FRANCHISEE_ENTITY] as string[] | undefined) ?? [];
      const isPubCorp = entIds.some(eid => entityIsPubCorp.get(eid));

      // Lease checks
      const locLeases = leasesByLocationId.get(loc.id) ?? [];
      const lease = locLeases[0];
      const leaseChecks = {
        present:     { ok: locLeases.length > 0,                                                        label: 'Lease record' },
        pdfAttached: { ok: !!lease && ((lease.fields[LEASES.FILE] as unknown[] | undefined)?.length ?? 0) > 0, label: 'Lease PDF' },
        execDate:    { ok: !!lease && !!lease.fields[LEASES.EXECUTION_DATE],                            label: 'Lease exec date' },
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

  res.json({
    summary: {
      totalOpen: reports.length,
      fullyCompliant: compliant,
      withGaps,
    },
    reports,
  });
});
