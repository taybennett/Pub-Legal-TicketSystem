import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';

import * as dras from '../airtable/dras.js';
import * as draDocuments from '../airtable/draDocuments.js';
import * as faTracker from '../airtable/faTracker.js';
import * as pipeline from '../airtable/pipeline.js';
import { DRA_DOCUMENTS, FA_TRACKER, FRANCHISEE_GROUPS } from '../airtable/tables.js';
import { requireAdmin, requireAuth } from '../auth/middleware.js';
import { lifecycleStageFromPipelineStatus } from '../lib/lifecycleFromPipeline.js';
import { logger } from '../util/logger.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../util/errors.js';

export const drasRouter = Router();

drasRouter.use(requireAuth, requireAdmin);

// 25 MB cap on a DRA Document PDF. Amendments/Addendums are typically much
// smaller than full leases; this is a hard fail-fast for accidental wrong-file uploads.
const DRA_DOC_MAX_BYTES = 25 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DRA_DOC_MAX_BYTES + 1024 },
});

// ── Helpers ──────────────────────────────────────────────────────

function extractName(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && 'name' in (v as Record<string, unknown>)) {
    return (v as { name: string }).name;
  }
  return null;
}

function shapeDocument(d: draDocuments.DraDocumentRecord) {
  return {
    id:              d.id,
    title:           (d.fields[DRA_DOCUMENTS.TITLE]            as string | undefined) ?? null,
    documentType:    extractName(d.fields[DRA_DOCUMENTS.DOCUMENT_TYPE]) as 'Amendment' | 'Addendum' | 'Other' | null,
    amendmentNumber: (d.fields[DRA_DOCUMENTS.AMENDMENT_NUMBER] as number | undefined) ?? null,
    addendumName:    (d.fields[DRA_DOCUMENTS.ADDENDUM_NAME]    as string | undefined) ?? null,
    effectiveDate:   (d.fields[DRA_DOCUMENTS.EFFECTIVE_DATE]   as string | undefined) ?? null,
    notes:           (d.fields[DRA_DOCUMENTS.NOTES]            as string | undefined) ?? null,
    signatories:     (d.fields[DRA_DOCUMENTS.SIGNATORIES]      as string | undefined) ?? null,
    file:            (d.fields[DRA_DOCUMENTS.FILE] as { url: string; filename: string }[] | undefined) ?? [],
  };
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

  // Bucket FAs by linked DRA record ID — survives DRA renames.
  const fasByDra = new Map<string, faTracker.FaTrackerRecord[]>();
  for (const fa of faRecords) {
    const links = (fa.fields[FA_TRACKER.DRA_LINK] as string[] | undefined) ?? [];
    for (const draId of links) {
      const list = fasByDra.get(draId) ?? [];
      list.push(fa);
      fasByDra.set(draId, list);
    }
  }

  const out = draRecords
    .map(d => {
      const name = (d.fields[FRANCHISEE_GROUPS.GROUP_NAME] as string | undefined) ?? '';
      const totalObligation = (d.fields[FRANCHISEE_GROUPS.TOTAL_OBLIGATION] as number | undefined) ?? 0;
      const fas = fasByDra.get(d.id) ?? [];
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

// ── GET /dras/:id — single DRA detail (includes child documents) ─

drasRouter.get('/:id', async (req: Request, res: Response) => {
  const d = await dras.getById(req.params.id);
  if (!d) throw new NotFoundError('DRA not found');

  const name = (d.fields[FRANCHISEE_GROUPS.GROUP_NAME] as string | undefined) ?? '';
  const [fas, pipelineStatuses, docs] = await Promise.all([
    faTracker.listByDraId(d.id),
    pipeline.listStatusesByShopNumber().catch(err => {
      logger.warn({ err, draName: name }, 'Pipeline status fetch failed; isOpen will be false');
      return new Map<string, pipeline.PipelineCandidate[]>();
    }),
    draDocuments.listForDra(d.id).catch(err => {
      logger.warn({ err, draName: name }, 'DRA Documents fetch failed');
      return [] as draDocuments.DraDocumentRecord[];
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
      documents: docs.map(shapeDocument),
    },
  });
});

// ── POST /dras/:id/documents — upload an Amendment or Addendum ───

const DOC_TYPES = ['Amendment', 'Addendum', 'Other'] as const;

const docSaveSchema = z.object({
  documentType:    z.enum(DOC_TYPES),
  amendmentNumber: z.coerce.number().int().min(1).max(99).optional(),
  addendumName:    z.string().max(200).optional(),
  effectiveDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  notes:           z.string().max(5000).optional(),
  signatories:     z.string().max(500).optional(),
  title:           z.string().max(200).optional(),
});

drasRouter.post('/:id/documents', upload.single('file'), async (req: Request, res: Response) => {
  const parsed = docSaveSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError('Invalid DRA document payload', parsed.error.flatten());
  if (!req.file) throw new BadRequestError('Missing PDF file');
  if (req.file.mimetype !== 'application/pdf') {
    throw new BadRequestError('Only PDF files are supported');
  }
  if (req.file.size > DRA_DOC_MAX_BYTES) {
    throw new BadRequestError(`PDF exceeds ${(DRA_DOC_MAX_BYTES / 1024 / 1024).toFixed(0)} MB limit.`);
  }

  const { id } = req.params;
  const dra = await dras.getById(id).catch(() => null);
  if (!dra) throw new NotFoundError('DRA not found');

  const f = parsed.data;
  const fields: draDocuments.DraDocumentFields = {
    [DRA_DOCUMENTS.PARENT_DRA]:    [id],
    [DRA_DOCUMENTS.DOCUMENT_TYPE]: f.documentType,
  };
  if (f.title)              fields[DRA_DOCUMENTS.TITLE]            = f.title;
  if (f.amendmentNumber != null) fields[DRA_DOCUMENTS.AMENDMENT_NUMBER] = f.amendmentNumber;
  if (f.addendumName)       fields[DRA_DOCUMENTS.ADDENDUM_NAME]    = f.addendumName;
  if (f.effectiveDate)      fields[DRA_DOCUMENTS.EFFECTIVE_DATE]   = f.effectiveDate;
  if (f.notes)              fields[DRA_DOCUMENTS.NOTES]            = f.notes;
  if (f.signatories)        fields[DRA_DOCUMENTS.SIGNATORIES]      = f.signatories;

  // Auto-generate a Title if the caller didn't supply one.
  if (!f.title) {
    if (f.documentType === 'Amendment' && f.amendmentNumber != null) {
      fields[DRA_DOCUMENTS.TITLE] = `${ordinal(f.amendmentNumber)} Amendment`;
    } else if (f.documentType === 'Addendum' && f.addendumName) {
      fields[DRA_DOCUMENTS.TITLE] = `${f.addendumName} Addendum`;
    } else {
      fields[DRA_DOCUMENTS.TITLE] = f.documentType;
    }
  }

  const created = await draDocuments.create(fields);

  const filename = req.file.originalname.replace(/[\/\\]/g, '_').slice(0, 255);
  await draDocuments.attachFile(created.id, {
    filename,
    contentType: req.file.mimetype,
    base64: req.file.buffer.toString('base64'),
  });

  logger.info({ docId: created.id, draId: id, type: f.documentType, userId: req.user!.sub }, 'DRA document created');
  res.status(201).json({ document: { id: created.id, filename } });
});

// ── DELETE /dras/:id/documents/:docId ────────────────────────────

drasRouter.delete('/:id/documents/:docId', async (req: Request, res: Response) => {
  const { id, docId } = req.params;
  const doc = await draDocuments.getById(docId).catch(() => null);
  if (!doc) throw new NotFoundError('DRA document not found');
  const parents = (doc.fields[DRA_DOCUMENTS.PARENT_DRA] as string[] | undefined) ?? [];
  if (!parents.includes(id)) {
    throw new ForbiddenError('Document is not linked to this DRA');
  }
  await draDocuments.remove(docId);
  logger.info({ docId, draId: id, userId: req.user!.sub }, 'DRA document deleted');
  res.json({ ok: true });
});

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
