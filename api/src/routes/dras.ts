import { Router, type Request, type Response } from 'express';

import * as dras from '../airtable/dras.js';
import * as faTracker from '../airtable/faTracker.js';
import * as pipeline from '../airtable/pipeline.js';
import { FA_TRACKER, FRANCHISEE_GROUPS } from '../airtable/tables.js';
import { requireAdmin, requireAuth } from '../auth/middleware.js';
import { lifecycleStageFromPipelineStatus } from '../lib/lifecycleFromPipeline.js';
import { logger } from '../util/logger.js';
import { NotFoundError } from '../util/errors.js';

export const drasRouter = Router();

drasRouter.use(requireAuth, requireAdmin);

// ── Helpers ──────────────────────────────────────────────────────

function extractName(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && 'name' in (v as Record<string, unknown>)) {
    return (v as { name: string }).name;
  }
  return null;
}

/**
 * Decide whether an FA's shop is currently open by looking up the matching
 * Pipeline record for that Shop Number. When the FA's Shop Name matches a
 * Pipeline candidate, prefer that one (handles Shop # collisions like
 * Thompson / Thompson St-Remodel sharing #1004).
 */
function isShopOpen(
  shopNumber: string,
  shopName: string,
  pipelineStatuses: Map<string, pipeline.PipelineCandidate[]>,
): boolean {
  const candidates = pipelineStatuses.get(shopNumber) ?? [];
  if (candidates.length === 0) return false;
  const pick = candidates.length === 1
    ? candidates[0]
    : (candidates.find(c => c.shopName === shopName) ?? candidates[0]);
  return lifecycleStageFromPipelineStatus(pick.status) === 'Operating';
}

// ── GET /dras — summary list ─────────────────────────────────────

drasRouter.get('/', async (_req: Request, res: Response) => {
  const [draRecords, faRecords, pipelineStatuses] = await Promise.all([
    dras.listAll(),
    faTracker.listAll(),
    pipeline.listStatusesByShopNumber().catch(err => {
      logger.warn({ err }, 'Pipeline status fetch failed; currentlyOpen will be 0');
      return new Map<string, pipeline.PipelineCandidate[]>();
    }),
  ]);

  // Bucket FAs by DRA name
  const fasByDra = new Map<string, faTracker.FaTrackerRecord[]>();
  for (const fa of faRecords) {
    const draName = fa.fields[FA_TRACKER.DRA_NAME] as string | undefined;
    if (!draName) continue;
    const list = fasByDra.get(draName) ?? [];
    list.push(fa);
    fasByDra.set(draName, list);
  }

  const out = draRecords
    .map(d => {
      const name = (d.fields[FRANCHISEE_GROUPS.GROUP_NAME] as string | undefined) ?? '';
      const totalObligation = (d.fields[FRANCHISEE_GROUPS.TOTAL_OBLIGATION] as number | undefined) ?? 0;
      const fas = fasByDra.get(name) ?? [];
      let currentlyOpen = 0;
      for (const fa of fas) {
        const shopNum  = (fa.fields[FA_TRACKER.SHOP_NUMBER] as string | undefined) ?? '';
        const shopName = (fa.fields[FA_TRACKER.SHOP_NAME]   as string | undefined) ?? '';
        if (isShopOpen(shopNum, shopName, pipelineStatuses)) currentlyOpen++;
      }
      return {
        id: d.id,
        name,
        totalObligation,
        fasExecuted: fas.length,
        currentlyOpen,
        outstanding: Math.max(0, totalObligation - fas.length),
      };
    })
    // Hide records without a Total Obligation set (PUB Corp. etc).
    .filter(d => d.totalObligation > 0);

  res.json({ dras: out });
});

// ── GET /dras/:id — single DRA detail ────────────────────────────

drasRouter.get('/:id', async (req: Request, res: Response) => {
  const d = await dras.getById(req.params.id);
  if (!d) throw new NotFoundError('DRA not found');

  const name = (d.fields[FRANCHISEE_GROUPS.GROUP_NAME] as string | undefined) ?? '';
  const [fas, pipelineStatuses] = await Promise.all([
    faTracker.listByDraName(name),
    pipeline.listStatusesByShopNumber().catch(err => {
      logger.warn({ err, draName: name }, 'Pipeline status fetch failed; isOpen will be false');
      return new Map<string, pipeline.PipelineCandidate[]>();
    }),
  ]);

  // Build the year-by-year schedule from the DRA record's year columns
  const schedule: Record<string, number> = {};
  for (const { year, fieldId } of dras.YEAR_FIELDS) {
    const v = d.fields[fieldId] as number | undefined;
    if (typeof v === 'number' && v > 0) schedule[String(year)] = v;
  }

  let currentlyOpen = 0;
  const faList = fas
    .map(fa => {
      const shopNum  = (fa.fields[FA_TRACKER.SHOP_NUMBER] as string | undefined) ?? '';
      const shopName = (fa.fields[FA_TRACKER.SHOP_NAME]   as string | undefined) ?? '';
      const open = isShopOpen(shopNum, shopName, pipelineStatuses);
      if (open) currentlyOpen++;
      return {
        id: fa.id,
        shopName,
        shopNumber:    shopNum,
        executionDate: (fa.fields[FA_TRACKER.EXECUTION_DATE] as string | undefined) ?? null,
        termEnd:       (fa.fields[FA_TRACKER.TERM_END]       as string | undefined) ?? null,
        termYears:     (fa.fields[FA_TRACKER.TERM_YEARS]     as number | undefined) ?? null,
        entityName:    (fa.fields[FA_TRACKER.ENTITY_NAME]    as string | undefined) ?? null,
        signatory:     (fa.fields[FA_TRACKER.SIGNATORY]      as string | undefined) ?? null,
        attorney:      (fa.fields[FA_TRACKER.ATTORNEY]       as string | undefined) ?? null,
        status:        extractName(fa.fields[FA_TRACKER.STATUS]),
        file:          (fa.fields[FA_TRACKER.FILE] as { url: string; filename: string }[] | undefined) ?? [],
        isOpen: open,
      };
    })
    .sort((a, b) => (a.executionDate ?? '').localeCompare(b.executionDate ?? ''));

  const totalObligation = (d.fields[FRANCHISEE_GROUPS.TOTAL_OBLIGATION] as number | undefined) ?? 0;

  res.json({
    dra: {
      id: d.id,
      name,
      totalObligation,
      termEndDate:  (d.fields[FRANCHISEE_GROUPS.TERM_END_DATE] as string | undefined) ?? null,
      draFile:      (d.fields[FRANCHISEE_GROUPS.DRA_FILE] as { url: string; filename: string }[] | undefined) ?? [],
      schedule,
      fasExecuted:  fas.length,
      currentlyOpen,
      outstanding:  Math.max(0, totalObligation - fas.length),
      fas: faList,
    },
  });
});
