import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';

import * as dras from '../airtable/dras.js';
import * as draDocuments from '../airtable/draDocuments.js';
import * as faTracker from '../airtable/faTracker.js';
import * as pipeline from '../airtable/pipeline.js';
import * as shopIds from '../airtable/shopIds.js';
import * as signatories from '../airtable/signatories.js';
import * as standingAddendums from '../airtable/standingAddendums.js';
import * as franchiseeEntities from '../airtable/franchiseeEntities.js';
import * as entityDocuments from '../airtable/entityDocuments.js';
import { DRA_DOCUMENTS, DRA_SIGNATORIES, ENTITY_DOCUMENTS, FA_TRACKER, FRANCHISEE_ENTITIES, FRANCHISEE_GROUPS, SHOP_IDS, STANDING_ADDENDUMS, type DraDocumentType, type EntityLevel } from '../airtable/tables.js';
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
    documentType:    extractName(d.fields[DRA_DOCUMENTS.DOCUMENT_TYPE]) as DraDocumentType | null,
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
        // For addendum-template tokenization
        executionDate:   (d.fields[FRANCHISEE_GROUPS.DRA_EXECUTION_DATE]   as string | undefined) ?? null,
        signatoryEntity: (d.fields[FRANCHISEE_GROUPS.DRA_SIGNATORY_ENTITY] as string | undefined) ?? null,
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
  const [fas, pipelineStatuses, docs, allShopIds, sigs, entities, allEntityDocs] = await Promise.all([
    faTracker.listByDraId(d.id),
    pipeline.listStatusesByShopNumber().catch(err => {
      logger.warn({ err, draName: name }, 'Pipeline status fetch failed; isOpen will be false');
      return new Map<string, pipeline.PipelineCandidate[]>();
    }),
    draDocuments.listForDra(d.id).catch(err => {
      logger.warn({ err, draName: name }, 'DRA Documents fetch failed');
      return [] as draDocuments.DraDocumentRecord[];
    }),
    shopIds.listAll().catch(err => {
      logger.warn({ err, draName: name }, 'Shop IDs fetch failed; allocation panel will be empty');
      return [] as shopIds.ShopIdRecord[];
    }),
    signatories.listForDra(d.id).catch(err => {
      logger.warn({ err, draName: name }, 'DRA Signatories fetch failed; signatories panel will be empty');
      return [] as signatories.SignatoryRecord[];
    }),
    franchiseeEntities.listForDra(d.id).catch(err => {
      logger.warn({ err, draName: name }, 'Franchisee Entities fetch failed; entity docs panel will be empty');
      return [] as franchiseeEntities.FranchiseeEntityRecord[];
    }),
    entityDocuments.listAll().catch(err => {
      logger.warn({ err, draName: name }, 'Entity Documents fetch failed');
      return [] as entityDocuments.EntityDocumentRecord[];
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

  // Shop IDs allocated to this DRA — sorted numerically. Assigned rows show
  // their shop name; unassigned placeholders return null so the frontend can
  // render "TBD". Blocks that span multiple DRAs (Fresh Dining, Lonestar,
  // Bagel Bros IL/WI) only surface the IDs actually linked to THIS DRA.
  const shopIdsForDra = allShopIds
    .filter(r => ((r.fields[SHOP_IDS.DRA] as string[] | undefined) ?? []).includes(d.id))
    .map(r => {
      const shopIdStr = (r.fields[SHOP_IDS.SHOP_ID] as string | undefined) ?? '';
      const shopName  = (r.fields[SHOP_IDS.SHOP_NAME] as string | undefined) ?? null;
      const faLinks   = (r.fields[SHOP_IDS.FA_TRACKER] as string[] | undefined) ?? [];
      const statusRaw = r.fields[SHOP_IDS.STATUS];
      const status = typeof statusRaw === 'string' ? statusRaw : (statusRaw as { name?: string } | undefined)?.name ?? null;
      return {
        shopId:   shopIdStr,
        shopName: shopName && shopName.trim() ? shopName : null,
        status,
        hasFa:    faLinks.length > 0,
      };
    })
    .sort((a, b) => (parseInt(a.shopId, 10) || 0) - (parseInt(b.shopId, 10) || 0));

  // Signatories — owners (Exhibit C) + corporate signatories (bylaws) for
  // this DRA. Ownership stored 0.0-1.0; frontend renders as percentage.
  const signatoriesForDra = sigs.map(s => ({
    id:        s.id,
    name:      (s.fields[DRA_SIGNATORIES.NAME]      as string | undefined) ?? '',
    email:     (s.fields[DRA_SIGNATORIES.EMAIL]     as string | undefined) ?? null,
    ownership: (s.fields[DRA_SIGNATORIES.OWNERSHIP] as number | undefined) ?? null,
    title:     (s.fields[DRA_SIGNATORIES.TITLE]     as string | undefined) ?? null,
    phone:     (s.fields[DRA_SIGNATORIES.PHONE]     as string | undefined) ?? null,
    notes:     (s.fields[DRA_SIGNATORIES.NOTES]     as string | undefined) ?? null,
  }));

  // Franchisee Entities linked to this DRA, each with their corporate docs.
  const entityIds = new Set(entities.map(e => e.id));
  const entitiesForDra = entities.map(e => {
    const entityDocs = allEntityDocs
      .filter(doc => {
        const links = (doc.fields[ENTITY_DOCUMENTS.FRANCHISEE_ENTITY] as string[] | undefined) ?? [];
        return links.some(id => id === e.id);
      })
      .map(doc => ({
        id:            doc.id,
        title:         (doc.fields[ENTITY_DOCUMENTS.TITLE]          as string | undefined) ?? '',
        documentType:  extractName(doc.fields[ENTITY_DOCUMENTS.DOCUMENT_TYPE]),
        effectiveDate: (doc.fields[ENTITY_DOCUMENTS.EFFECTIVE_DATE] as string | undefined) ?? null,
        notes:         (doc.fields[ENTITY_DOCUMENTS.NOTES]          as string | undefined) ?? null,
        file:          (doc.fields[ENTITY_DOCUMENTS.FILE] as { url: string; filename: string }[] | undefined) ?? [],
      }))
      .sort((a, b) => (a.documentType ?? '').localeCompare(b.documentType ?? ''));
    return {
      id:              e.id,
      name:            (e.fields[FRANCHISEE_ENTITIES.ENTITY_NAME]     as string | undefined) ?? '',
      entityLevel:     extractName(e.fields[FRANCHISEE_ENTITIES.ENTITY_LEVEL]) as EntityLevel | null,
      jurisdiction:    (e.fields[FRANCHISEE_ENTITIES.JURISDICTION]    as string | undefined) ?? null,
      formationDate:   (e.fields[FRANCHISEE_ENTITIES.FORMATION_DATE]  as string | undefined) ?? null,
      signatoryName:   (e.fields[FRANCHISEE_ENTITIES.SIGNATORY_NAME]  as string | undefined) ?? null,
      signatoryTitle:  (e.fields[FRANCHISEE_ENTITIES.SIGNATORY_TITLE] as string | undefined) ?? null,
      notes:           (e.fields[FRANCHISEE_ENTITIES.NOTES]           as string | undefined) ?? null,
      documents:       entityDocs,
    };
  })
    .sort((a, b) => {
      // Parents first, then shop-level, then alpha within
      const rank = (lvl: string | null) => lvl === 'Parent (DRA Signatory)' ? 0 : lvl === 'Shop-Level (FA Signatory)' ? 1 : 2;
      const rd = rank(a.entityLevel) - rank(b.entityLevel);
      if (rd !== 0) return rd;
      return a.name.localeCompare(b.name);
    });
  void entityIds;

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
      shopIds:   shopIdsForDra,
      signatories: signatoriesForDra,
      entities:  entitiesForDra,
    },
  });
});

// ── GET /dras/:id/standing-addendums — list the required-with-FA addendums
//    for this DRA. Consumed by the FA Generator page to render its callout. ───
drasRouter.get('/:id/standing-addendums', async (req: Request, res: Response) => {
  const { id } = req.params;
  const rows = await standingAddendums.listForDra(id);
  res.json({
    standingAddendums: rows.map(r => ({
      id:          r.id,
      name:        (r.fields[STANDING_ADDENDUMS.NAME]        as string | undefined) ?? '',
      description: (r.fields[STANDING_ADDENDUMS.DESCRIPTION] as string | undefined) ?? '',
      notes:       (r.fields[STANDING_ADDENDUMS.NOTES]       as string | undefined) ?? '',
      file:        (r.fields[STANDING_ADDENDUMS.TEMPLATE_FILE] as { url: string; filename: string }[] | undefined) ?? [],
    })),
  });
});

// ── POST /dras/:id/attach — attach the ORIGINAL DRA PDF to an existing
//    Franchisee Groups row (DRA File field). Used when the DRA record was
//    bulk-created from terms but the PDF arrives separately. ───
drasRouter.post('/:id/attach', upload.single('file'), async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!req.file) throw new BadRequestError('Missing PDF file');
  if (req.file.mimetype !== 'application/pdf') {
    throw new BadRequestError('Only PDF files are supported');
  }
  if (req.file.size > DRA_DOC_MAX_BYTES) {
    throw new BadRequestError(`PDF exceeds ${(DRA_DOC_MAX_BYTES / 1024 / 1024).toFixed(0)} MB limit.`);
  }

  const dra = await dras.getById(id).catch(() => null);
  if (!dra) throw new NotFoundError('DRA not found');

  const filename = req.file.originalname.replace(/[\/\\]/g, '_').slice(0, 255);
  await dras.attachDraFile(id, {
    filename,
    contentType: req.file.mimetype,
    base64: req.file.buffer.toString('base64'),
  });

  logger.info({ draId: id, filename, userId: req.user!.sub }, 'DRA original PDF attached');
  res.json({ ok: true, filename });
});

// ── POST /dras/:id/documents — upload an Amendment or Addendum ───

const DOC_TYPES = [
  'Amendment', 'Addendum',
  // Ancillary DRA doc types (added 2026-06-29)
  'Exhibit', 'Side Letter', 'Guaranty', 'Assignment',
  'Termination Agreement', 'Memorandum',
  'Other',
] as const;

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

// ── DRA Signatories CRUD ─────────────────────────────────────────

const signatorySchema = z.object({
  name:      z.string().min(1, 'Name is required').max(200),
  email:     z.string().email().optional().nullable().or(z.literal('')),
  ownership: z.number().min(0).max(100).optional().nullable(),  // UI sends 0-100, we store as 0-1
  title:     z.string().max(120).optional().nullable().or(z.literal('')),
  phone:     z.string().max(60).optional().nullable().or(z.literal('')),
  notes:     z.string().max(2000).optional().nullable().or(z.literal('')),
});

function shapeSignatoryFields(p: z.infer<typeof signatorySchema>, draId: string) {
  const fields: Record<string, unknown> = {
    [DRA_SIGNATORIES.NAME]: p.name,
    [DRA_SIGNATORIES.DRA]:  [draId],
  };
  if (p.email  !== undefined) fields[DRA_SIGNATORIES.EMAIL] = p.email || null;
  if (p.title  !== undefined) fields[DRA_SIGNATORIES.TITLE] = p.title || null;
  if (p.phone  !== undefined) fields[DRA_SIGNATORIES.PHONE] = p.phone || null;
  if (p.notes  !== undefined) fields[DRA_SIGNATORIES.NOTES] = p.notes || null;
  // Airtable stores percent as 0.0-1.0; UI sends 0-100.
  if (p.ownership !== undefined && p.ownership !== null) {
    fields[DRA_SIGNATORIES.OWNERSHIP] = p.ownership / 100;
  } else if (p.ownership === null) {
    fields[DRA_SIGNATORIES.OWNERSHIP] = null;
  }
  return fields;
}

drasRouter.post('/:id/signatories', async (req: Request, res: Response) => {
  const { id } = req.params;
  const parsed = signatorySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new BadRequestError(parsed.error.issues.map(i => i.message).join('; '));
  }
  const dra = await dras.getById(id).catch(() => null);
  if (!dra) throw new NotFoundError('DRA not found');
  const created = await signatories.create(shapeSignatoryFields(parsed.data, id));
  logger.info({ signatoryId: created.id, draId: id, userId: req.user!.sub }, 'DRA signatory created');
  res.status(201).json({ signatory: { id: created.id } });
});

drasRouter.patch('/:id/signatories/:sigId', async (req: Request, res: Response) => {
  const { id, sigId } = req.params;
  const parsed = signatorySchema.partial({ name: true }).safeParse(req.body);
  if (!parsed.success) {
    throw new BadRequestError(parsed.error.issues.map(i => i.message).join('; '));
  }
  // Verify signatory belongs to this DRA (prevents cross-DRA tampering)
  const sig = (await signatories.listForDra(id)).find(s => s.id === sigId);
  if (!sig) throw new NotFoundError('Signatory not found on this DRA');
  const fullPayload = signatorySchema.parse({
    name: parsed.data.name ?? (sig.fields[DRA_SIGNATORIES.NAME] as string) ?? '',
    ...parsed.data,
  });
  await signatories.update(sigId, shapeSignatoryFields(fullPayload, id));
  logger.info({ signatoryId: sigId, draId: id, userId: req.user!.sub }, 'DRA signatory updated');
  res.json({ ok: true });
});

drasRouter.delete('/:id/signatories/:sigId', async (req: Request, res: Response) => {
  const { id, sigId } = req.params;
  const sig = (await signatories.listForDra(id)).find(s => s.id === sigId);
  if (!sig) throw new NotFoundError('Signatory not found on this DRA');
  await signatories.remove(sigId);
  logger.info({ signatoryId: sigId, draId: id, userId: req.user!.sub }, 'DRA signatory deleted');
  res.json({ ok: true });
});

// ── Franchisee Entities CRUD (scoped to a DRA) ───────────────────

const entityCreateSchema = z.object({
  name:            z.string().min(1).max(200),
  entityLevel:     z.enum(['Parent (DRA Signatory)', 'Shop-Level (FA Signatory)']).optional(),
  jurisdiction:    z.string().max(60).optional().or(z.literal('')),
  formationDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  signatoryName:   z.string().max(200).optional().or(z.literal('')),
  signatoryTitle:  z.string().max(120).optional().or(z.literal('')),
  notes:           z.string().max(2000).optional().or(z.literal('')),
});

drasRouter.post('/:id/entities', async (req: Request, res: Response) => {
  const { id } = req.params;
  const parsed = entityCreateSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.issues.map(i => i.message).join('; '));
  const dra = await dras.getById(id).catch(() => null);
  if (!dra) throw new NotFoundError('DRA not found');
  const p = parsed.data;
  const fields: franchiseeEntities.FranchiseeEntityFields = {
    [FRANCHISEE_ENTITIES.ENTITY_NAME]:  p.name,
    [FRANCHISEE_ENTITIES.PARENT_GROUP]: [id],
  };
  if (p.entityLevel)                       fields[FRANCHISEE_ENTITIES.ENTITY_LEVEL]    = p.entityLevel;
  if (p.jurisdiction)                      fields[FRANCHISEE_ENTITIES.JURISDICTION]    = p.jurisdiction;
  if (p.formationDate)                     fields[FRANCHISEE_ENTITIES.FORMATION_DATE]  = p.formationDate;
  if (p.signatoryName)                     fields[FRANCHISEE_ENTITIES.SIGNATORY_NAME]  = p.signatoryName;
  if (p.signatoryTitle)                    fields[FRANCHISEE_ENTITIES.SIGNATORY_TITLE] = p.signatoryTitle;
  if (p.notes)                             fields[FRANCHISEE_ENTITIES.NOTES]           = p.notes;
  const created = await franchiseeEntities.create(fields);
  logger.info({ entityId: created.id, draId: id, userId: req.user!.sub }, 'Franchisee Entity created');
  res.status(201).json({ entity: { id: created.id } });
});

drasRouter.patch('/:id/entities/:entityId', async (req: Request, res: Response) => {
  const { id, entityId } = req.params;
  const parsed = entityCreateSchema.partial({ name: true }).safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.issues.map(i => i.message).join('; '));
  const entity = await franchiseeEntities.getById(entityId);
  if (!entity) throw new NotFoundError('Entity not found');
  const parents = (entity.fields[FRANCHISEE_ENTITIES.PARENT_GROUP] as string[] | undefined) ?? [];
  if (!parents.includes(id)) throw new ForbiddenError('Entity is not linked to this DRA');
  const p = parsed.data;
  const fields: franchiseeEntities.FranchiseeEntityFields = {};
  if (p.name !== undefined)                fields[FRANCHISEE_ENTITIES.ENTITY_NAME]     = p.name;
  if (p.entityLevel !== undefined)         fields[FRANCHISEE_ENTITIES.ENTITY_LEVEL]    = p.entityLevel;
  if (p.jurisdiction !== undefined)        fields[FRANCHISEE_ENTITIES.JURISDICTION]    = p.jurisdiction || undefined;
  if (p.formationDate !== undefined)       fields[FRANCHISEE_ENTITIES.FORMATION_DATE]  = p.formationDate || undefined;
  if (p.signatoryName !== undefined)       fields[FRANCHISEE_ENTITIES.SIGNATORY_NAME]  = p.signatoryName || undefined;
  if (p.signatoryTitle !== undefined)      fields[FRANCHISEE_ENTITIES.SIGNATORY_TITLE] = p.signatoryTitle || undefined;
  if (p.notes !== undefined)               fields[FRANCHISEE_ENTITIES.NOTES]           = p.notes || undefined;
  await franchiseeEntities.update(entityId, fields);
  logger.info({ entityId, draId: id, userId: req.user!.sub }, 'Franchisee Entity updated');
  res.json({ ok: true });
});

drasRouter.delete('/:id/entities/:entityId', async (req: Request, res: Response) => {
  const { id, entityId } = req.params;
  const entity = await franchiseeEntities.getById(entityId);
  if (!entity) throw new NotFoundError('Entity not found');
  const parents = (entity.fields[FRANCHISEE_ENTITIES.PARENT_GROUP] as string[] | undefined) ?? [];
  if (!parents.includes(id)) throw new ForbiddenError('Entity is not linked to this DRA');
  await franchiseeEntities.remove(entityId);
  logger.info({ entityId, draId: id, userId: req.user!.sub }, 'Franchisee Entity deleted');
  res.json({ ok: true });
});

// ── Entity Documents (corporate docs) upload/delete ──────────────

const entityDocTypes = [
  'Operating Agreement', 'SS-4 Letter',
  'Articles of Formation', 'Articles of Incorporation',
  'Bylaws', 'Amendment to Operating Agreement',
  'Certificate of Good Standing', 'EIN Verification', 'Other',
] as const;

const entityDocSaveSchema = z.object({
  documentType:  z.enum(entityDocTypes),
  title:         z.string().max(200).optional().or(z.literal('')),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  notes:         z.string().max(2000).optional().or(z.literal('')),
});

drasRouter.post('/:id/entities/:entityId/documents', upload.single('file'), async (req: Request, res: Response) => {
  const parsed = entityDocSaveSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError('Invalid entity doc payload', parsed.error.flatten());
  if (!req.file) throw new BadRequestError('Missing PDF file');
  if (req.file.mimetype !== 'application/pdf') {
    throw new BadRequestError('Only PDF files are supported');
  }
  if (req.file.size > DRA_DOC_MAX_BYTES) {
    throw new BadRequestError(`PDF exceeds ${(DRA_DOC_MAX_BYTES / 1024 / 1024).toFixed(0)} MB limit.`);
  }

  const { id, entityId } = req.params;
  const entity = await franchiseeEntities.getById(entityId);
  if (!entity) throw new NotFoundError('Entity not found');
  const parents = (entity.fields[FRANCHISEE_ENTITIES.PARENT_GROUP] as string[] | undefined) ?? [];
  if (!parents.includes(id)) throw new ForbiddenError('Entity is not linked to this DRA');

  const p = parsed.data;
  const entityName = (entity.fields[FRANCHISEE_ENTITIES.ENTITY_NAME] as string | undefined) ?? 'Unknown Entity';
  const title = p.title?.trim() || `${p.documentType} — ${entityName}`;

  const fields: entityDocuments.EntityDocumentFields = {
    [ENTITY_DOCUMENTS.TITLE]:             title,
    [ENTITY_DOCUMENTS.DOCUMENT_TYPE]:     p.documentType,
    [ENTITY_DOCUMENTS.FRANCHISEE_ENTITY]: [entityId],
  };
  if (p.effectiveDate) fields[ENTITY_DOCUMENTS.EFFECTIVE_DATE] = p.effectiveDate;
  if (p.notes)         fields[ENTITY_DOCUMENTS.NOTES]          = p.notes;

  const created = await entityDocuments.create(fields);

  const filename = req.file.originalname.replace(/[\/\\]/g, '_').slice(0, 255);
  await entityDocuments.attachFile(created.id, {
    filename,
    contentType: req.file.mimetype,
    base64: req.file.buffer.toString('base64'),
  });

  logger.info({ docId: created.id, entityId, draId: id, type: p.documentType, userId: req.user!.sub }, 'Entity document created');
  res.status(201).json({ document: { id: created.id, filename } });
});

drasRouter.delete('/:id/entities/:entityId/documents/:docId', async (req: Request, res: Response) => {
  const { id, entityId, docId } = req.params;
  const entity = await franchiseeEntities.getById(entityId);
  if (!entity) throw new NotFoundError('Entity not found');
  const parents = (entity.fields[FRANCHISEE_ENTITIES.PARENT_GROUP] as string[] | undefined) ?? [];
  if (!parents.includes(id)) throw new ForbiddenError('Entity is not linked to this DRA');
  const doc = await entityDocuments.getById(docId);
  if (!doc) throw new NotFoundError('Entity document not found');
  const docEntities = (doc.fields[ENTITY_DOCUMENTS.FRANCHISEE_ENTITY] as string[] | undefined) ?? [];
  if (!docEntities.includes(entityId)) throw new ForbiddenError('Document is not linked to this entity');
  await entityDocuments.remove(docId);
  logger.info({ docId, entityId, draId: id, userId: req.user!.sub }, 'Entity document deleted');
  res.json({ ok: true });
});

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
