/**
 * Shared data-loading + shaping for the /reports route. Fetches locations,
 * leases, FA Tracker, DRAs, and Pipeline in parallel once per report request,
 * then shapes into a common "shopRow" the report generators can operate on.
 *
 * Every report generator ultimately consumes the same shopRow[]; individual
 * reports project/filter/sort it. Keeping the load in one place means a single
 * report request never hits Airtable more than once for the same table.
 */

import * as dras from '../airtable/dras.js';
import * as faTracker from '../airtable/faTracker.js';
import * as franchiseeEntities from '../airtable/franchiseeEntities.js';
import * as leases from '../airtable/leases.js';
import * as locations from '../airtable/locations.js';
import * as pipeline from '../airtable/pipeline.js';
import {
  FA_TRACKER,
  FRANCHISEE_ENTITIES,
  FRANCHISEE_GROUPS,
  LEASES,
  LOCATIONS,
} from '../airtable/tables.js';
import { lifecycleStageFromPipelineStatus } from './lifecycleFromPipeline.js';
import { logger } from '../util/logger.js';

/** PUB Corp's group ID in Franchisee Groups. Used to classify corp vs franchise. */
const PUB_CORP_GROUP_ID = 'recn5BOYmsGH4jNZD';

/** Everything the reports care about about one shop. Assembled once, shared. */
export interface ShopRow {
  locationId:      string;
  shopName:        string;
  shopId:          string | null;
  address:         string | null;
  city:            string | null;
  state:           string | null;
  isOpen:          boolean;
  isPubCorp:       boolean;
  lifecycleStage:  string | null;

  // Franchisee entity + group
  entityName:      string | null;
  franchiseeGroup: string | null;

  // Original Lease
  leaseId:         string | null;
  leaseExecDate:   string | null;
  leaseTermEnd:    string | null;
  leaseTermYears:  number | null;
  monthlyRent:     number | null;
  annualRent:      number | null;
  landlord:        string | null;
  squareFeet:      number | null;
  costPerSqFt:     number | null;
  leasePdf:        boolean;

  // Franchise Agreement (only for franchise shops)
  faId:            string | null;
  faExecDate:      string | null;
  faTermEnd:       string | null;
  faTermYears:     number | null;
  faEntityName:    string | null;
  faSignatory:     string | null;
  faPdf:           boolean;
}

export interface ReportBundle {
  shops: ShopRow[];
  dras: Array<{
    id: string;
    name: string;
    totalObligation: number;
    executed: number;
    open: number;
    outstanding: number;
    termEnd: string | null;
    yearSchedule: Record<string, number>;
    onSchedule: boolean;
  }>;
  generatedAt: string;
}

function extractSelectName(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && 'name' in (v as Record<string, unknown>)) {
    return (v as { name?: string }).name ?? null;
  }
  return null;
}

/** Load everything once. Reports read from this bundle instead of hitting Airtable. */
export async function loadReportBundle(): Promise<ReportBundle> {
  const [
    locs, allLeases, allFAs, allDras, allEntities, pipelineMap,
  ] = await Promise.all([
    locations.listAll(),
    leases.listAll(),
    faTracker.listAll(),
    dras.listAll(),
    franchiseeEntities.listAll(),
    pipeline.listStatusesByShopNumber().catch(err => {
      logger.warn({ err }, 'reports: pipeline fetch failed, falling back to stored lifecycle stage');
      return new Map<string, pipeline.PipelineCandidate[]>();
    }),
  ]);

  // entity → { isPubCorp, groupName, entityName }
  const entityById = new Map<string, { isPubCorp: boolean; groupName: string | null; entityName: string | null }>();
  const groupNameById = new Map<string, string>();
  for (const g of allDras) {
    const name = (g.fields[FRANCHISEE_GROUPS.GROUP_NAME] as string | undefined) ?? '';
    groupNameById.set(g.id, name);
  }
  for (const e of allEntities) {
    const parentGroups = (e.fields[FRANCHISEE_ENTITIES.PARENT_GROUP] as string[] | undefined) ?? [];
    const isPubCorp = parentGroups.includes(PUB_CORP_GROUP_ID);
    const entityName = (e.fields[FRANCHISEE_ENTITIES.ENTITY_NAME] as string | undefined) ?? null;
    const groupName = parentGroups.length > 0 ? (groupNameById.get(parentGroups[0]) ?? null) : null;
    entityById.set(e.id, { isPubCorp, groupName, entityName });
  }

  // Leases by locationId — pick the Original Lease for each shop
  const leasesByLocation = new Map<string, leases.LeaseRecord[]>();
  for (const l of allLeases) {
    const linked = (l.fields[LEASES.LOCATION] as string[] | undefined) ?? [];
    for (const locId of linked) {
      const list = leasesByLocation.get(locId) ?? [];
      list.push(l);
      leasesByLocation.set(locId, list);
    }
  }

  // FA by shop number
  const faByShopNum = new Map<string, faTracker.FaTrackerRecord[]>();
  for (const fa of allFAs) {
    const num = (fa.fields[FA_TRACKER.SHOP_NUMBER] as string | undefined) ?? '';
    if (!num) continue;
    const list = faByShopNum.get(num) ?? [];
    list.push(fa);
    faByShopNum.set(num, list);
  }

  const shops: ShopRow[] = locs.map(loc => {
    const shopId = (loc.fields[LOCATIONS.SHOP_ID] as string | undefined) ?? null;
    const shopName = (loc.fields[LOCATIONS.SHOP_NAME] as string | undefined) ?? '';
    const entIds = (loc.fields[LOCATIONS.FRANCHISEE_ENTITY] as string[] | undefined) ?? [];
    const entInfo = entIds.map(id => entityById.get(id)).find(Boolean) ?? null;
    const isPubCorp = entIds.some(id => entityById.get(id)?.isPubCorp);

    // Pipeline-driven open decision
    let isOpen = false;
    let lifecycleStage: string | null = null;
    if (shopId) {
      const candidates = pipelineMap.get(shopId) ?? [];
      const pick = candidates.length <= 1
        ? candidates[0]
        : (candidates.find(c => c.shopName === shopName) ?? candidates[0]);
      if (pick) {
        lifecycleStage = lifecycleStageFromPipelineStatus(pick.status);
        isOpen = lifecycleStage === 'Operating';
      }
    }
    if (lifecycleStage === null) {
      const stored = loc.fields[LOCATIONS.LIFECYCLE_STAGE];
      lifecycleStage = extractSelectName(stored);
      isOpen = lifecycleStage === 'Operating';
    }

    // Original lease pick — filter by Document Type = Original Lease (or null for back-compat)
    const locLeases = leasesByLocation.get(loc.id) ?? [];
    const originalLease = locLeases.find(l => {
      const name = extractSelectName(l.fields[LEASES.DOCUMENT_TYPE]);
      return name == null || name === 'Original Lease';
    });

    const monthlyRent = (originalLease?.fields[LEASES.MONTHLY_RENT] as number | undefined) ?? null;
    const annualRent = (originalLease?.fields[LEASES.ANNUAL_RENT] as number | undefined) ?? null;
    const squareFeet = (originalLease?.fields[LEASES.SQUARE_FEET] as number | undefined) ?? null;
    const costPerSqFt = (annualRent && squareFeet && squareFeet > 0)
      ? Math.round((annualRent / squareFeet) * 100) / 100
      : null;

    // FA pick — first record for this shop number
    const fas = shopId ? (faByShopNum.get(shopId) ?? []) : [];
    const fa = fas[0];

    return {
      locationId: loc.id,
      shopName,
      shopId,
      address:  (loc.fields[LOCATIONS.ADDRESS] as string | undefined) ?? null,
      city:     (loc.fields[LOCATIONS.CITY]    as string | undefined) ?? null,
      state:    (loc.fields[LOCATIONS.STATE]   as string | undefined) ?? null,
      isOpen,
      isPubCorp,
      lifecycleStage,
      entityName:      entInfo?.entityName ?? null,
      franchiseeGroup: entInfo?.groupName ?? null,

      leaseId:        originalLease?.id ?? null,
      leaseExecDate:  (originalLease?.fields[LEASES.EXECUTION_DATE] as string | undefined) ?? null,
      leaseTermEnd:   (originalLease?.fields[LEASES.TERM_END]       as string | undefined) ?? null,
      leaseTermYears: (originalLease?.fields[LEASES.TERM_YEARS]     as number | undefined) ?? null,
      monthlyRent,
      annualRent,
      landlord:       (originalLease?.fields[LEASES.LANDLORD]       as string | undefined) ?? null,
      squareFeet,
      costPerSqFt,
      leasePdf: !!originalLease && ((originalLease.fields[LEASES.FILE] as unknown[] | undefined)?.length ?? 0) > 0,

      faId:         fa?.id ?? null,
      faExecDate:   (fa?.fields[FA_TRACKER.EXECUTION_DATE] as string | undefined) ?? null,
      faTermEnd:    (fa?.fields[FA_TRACKER.TERM_END]       as string | undefined) ?? null,
      faTermYears:  (fa?.fields[FA_TRACKER.TERM_YEARS]     as number | undefined) ?? null,
      faEntityName: (fa?.fields[FA_TRACKER.ENTITY_NAME]    as string | undefined) ?? null,
      faSignatory:  (fa?.fields[FA_TRACKER.SIGNATORY]      as string | undefined) ?? null,
      faPdf:        !!fa && ((fa.fields[FA_TRACKER.FILE] as unknown[] | undefined)?.length ?? 0) > 0,
    };
  });

  // DRAs — for the DRA Progress report
  const draRows = allDras
    .map(d => {
      const totalObligation = (d.fields[FRANCHISEE_GROUPS.TOTAL_OBLIGATION] as number | undefined) ?? 0;
      const name = (d.fields[FRANCHISEE_GROUPS.GROUP_NAME] as string | undefined) ?? '';
      const linkedFAs = allFAs.filter(fa => {
        const links = (fa.fields[FA_TRACKER.DRA_LINK] as string[] | undefined) ?? [];
        return links.includes(d.id);
      });
      let open = 0;
      for (const fa of linkedFAs) {
        const num = (fa.fields[FA_TRACKER.SHOP_NUMBER] as string | undefined) ?? '';
        const name = (fa.fields[FA_TRACKER.SHOP_NAME] as string | undefined) ?? '';
        const candidates = pipelineMap.get(num) ?? [];
        const pick = candidates.length <= 1
          ? candidates[0]
          : (candidates.find(c => c.shopName === name) ?? candidates[0]);
        if (pick && lifecycleStageFromPipelineStatus(pick.status) === 'Operating') open++;
      }

      const yearSchedule: Record<string, number> = {};
      for (const { year, fieldId } of dras.YEAR_FIELDS) {
        const v = d.fields[fieldId] as number | undefined;
        if (typeof v === 'number' && v > 0) yearSchedule[String(year)] = v;
      }
      const thisYear = new Date().getUTCFullYear();
      // "on schedule" if executed count >= sum of scheduled through prior year
      const expectedByNow = Object.entries(yearSchedule)
        .filter(([year]) => parseInt(year, 10) < thisYear)
        .reduce((sum, [, count]) => sum + count, 0);
      const onSchedule = linkedFAs.length >= expectedByNow;

      return {
        id: d.id,
        name,
        totalObligation,
        executed: linkedFAs.length,
        open,
        outstanding: Math.max(0, totalObligation - linkedFAs.length),
        termEnd: (d.fields[FRANCHISEE_GROUPS.TERM_END_DATE] as string | undefined) ?? null,
        yearSchedule,
        onSchedule,
      };
    })
    .filter(d => d.totalObligation > 0);

  return {
    shops,
    dras: draRows,
    generatedAt: new Date().toISOString(),
  };
}
