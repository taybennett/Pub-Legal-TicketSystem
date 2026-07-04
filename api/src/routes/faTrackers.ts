import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';

import * as faTracker from '../airtable/faTracker.js';
import * as locations from '../airtable/locations.js';
import { FA_TRACKER, LOCATIONS } from '../airtable/tables.js';
import { requireAdmin, requireAuth } from '../auth/middleware.js';
import { logger } from '../util/logger.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../util/errors.js';

// Router A — legacy /api/v1/fa-trackers for the FA Generator draft creator.
export const faTrackersRouter = Router();
faTrackersRouter.use(requireAuth, requireAdmin);

// 25 MB cap. Franchise Agreements are usually 5-15 MB PDFs.
const FA_PDF_MAX_BYTES = 25 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: FA_PDF_MAX_BYTES + 1024 },
});

const draftSchema = z.object({
  entity:        z.string().min(1).max(200),
  shopName:      z.string().min(1).max(200),
  shopNumber:    z.string().min(1).max(50),
  execDate:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'execDate must be YYYY-MM-DD'),
  signatoryName: z.string().min(1).max(200),
});

// POST /fa-trackers — creates a draft FA Tracker row from the FA Generator.
// Status is intentionally left empty; the row gets the executed PDF + Status="Active"
// only after the admin uploads the fully-executed copy (Stage 2 feature).
faTrackersRouter.post('/', async (req: Request, res: Response) => {
  const parsed = draftSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError('Invalid FA draft payload', parsed.error.flatten());
  const { entity, shopName, shopNumber, execDate, signatoryName } = parsed.data;

  const created = await faTracker.create({
    [FA_TRACKER.ENTITY_NAME]:    entity,
    [FA_TRACKER.SHOP_NAME]:      shopName,
    [FA_TRACKER.SHOP_NUMBER]:    shopNumber,
    [FA_TRACKER.EXECUTION_DATE]: execDate,
    [FA_TRACKER.SIGNATORY]:      signatoryName,
    [FA_TRACKER.DOCUMENT_TYPE]:  'Franchise Agreement',
  });

  res.status(201).json({
    fa: {
      id:            created.id,
      entityName:    entity,
      shopName,
      shopNumber,
      executionDate: execDate,
      signatory:     signatoryName,
    },
  });
});

// DELETE /:id — legacy delete kept for callers that don't know the Location scope.
faTrackersRouter.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const fa = await faTracker.getById(id).catch(() => null);
  if (!fa) throw new NotFoundError('FA Tracker record not found');
  await faTracker.remove(id);
  logger.info({ faId: id, userId: req.user!.sub }, 'FA Tracker record deleted (legacy path)');
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────
// Router B — mounted under /api/v1/locations for the slot-based
// upload/attach/delete flow that mirrors the Leases pattern.
// ─────────────────────────────────────────────────────────────

export const faTrackersLocationRouter = Router();
faTrackersLocationRouter.use(requireAuth, requireAdmin);

const DOCUMENT_TYPES = [
  'Franchise Agreement', 'Amendment', 'Guaranty',
  'Addendum', 'Renewal Agreement', 'Assignment',
  'Termination Agreement', 'Side Letter', 'Other',
] as const;

const saveSchema = z.object({
  documentType:     z.enum(DOCUMENT_TYPES),
  executionDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  termEnd:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  termYears:        z.coerce.number().int().min(0).max(99).optional(),
  entityName:       z.string().max(300).optional(),
  signatory:        z.string().max(200).optional(),
  draName:          z.string().max(200).optional(),
  attorney:         z.string().max(200).optional(),
  status:           z.string().max(50).optional(),
  documentDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  amendmentNumber:  z.coerce.number().int().min(1).max(99).optional(),
  addendumName:     z.string().max(200).optional(),
  parentFaId:       z.string().startsWith('rec').length(17).optional().or(z.literal('')),
});

// POST /:id/fa-trackers — create a new FA record for this Location + attach PDF
faTrackersLocationRouter.post('/:id/fa-trackers', upload.single('file'), async (req: Request, res: Response) => {
  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError('Invalid FA payload', parsed.error.flatten());
  if (!req.file) throw new BadRequestError('Missing PDF file');
  if (req.file.mimetype !== 'application/pdf') {
    throw new BadRequestError('Only PDF files are supported');
  }
  if (req.file.size > FA_PDF_MAX_BYTES) {
    throw new BadRequestError(`PDF exceeds ${(FA_PDF_MAX_BYTES / 1024 / 1024).toFixed(0)} MB limit.`);
  }

  const { id } = req.params;
  const loc = await locations.getById(id).catch(() => null);
  if (!loc) throw new NotFoundError('Location not found');
  const shopId   = (loc.fields[LOCATIONS.SHOP_ID]   as string | undefined) ?? '';
  const shopName = (loc.fields[LOCATIONS.SHOP_NAME] as string | undefined) ?? '';

  const f = parsed.data;
  const docType = f.documentType;
  const fields: faTracker.FaTrackerFields = {
    [FA_TRACKER.DOCUMENT_TYPE]: docType,
    [FA_TRACKER.SHOP_NUMBER]:   shopId,
    [FA_TRACKER.SHOP_NAME]:     shopName,
  };
  // Terms only apply to the primary Franchise Agreement record; child docs leave them empty.
  if (docType === 'Franchise Agreement') {
    if (f.status)                fields[FA_TRACKER.STATUS]         = f.status;
    if (f.executionDate)         fields[FA_TRACKER.EXECUTION_DATE] = f.executionDate;
    if (f.termEnd)               fields[FA_TRACKER.TERM_END]       = f.termEnd;
    if (f.termYears != null)     fields[FA_TRACKER.TERM_YEARS]     = f.termYears;
    if (f.entityName)            fields[FA_TRACKER.ENTITY_NAME]    = f.entityName;
    if (f.signatory)             fields[FA_TRACKER.SIGNATORY]      = f.signatory;
    if (f.draName)               fields[FA_TRACKER.DRA_NAME]       = f.draName;
    if (f.attorney)              fields[FA_TRACKER.ATTORNEY]       = f.attorney;
  }
  if (f.documentDate)              fields[FA_TRACKER.DOCUMENT_DATE]    = f.documentDate;
  if (f.amendmentNumber != null)   fields[FA_TRACKER.AMENDMENT_NUMBER] = f.amendmentNumber;
  if (f.addendumName)              fields[FA_TRACKER.ADDENDUM_NAME]    = f.addendumName;
  if (f.parentFaId)                fields[FA_TRACKER.PARENT_FA]        = [f.parentFaId];

  const created = await faTracker.create(fields);
  const filename = req.file.originalname.replace(/[\/\\]/g, '_').slice(0, 255);
  await faTracker.attachFile(created.id, {
    filename,
    contentType: req.file.mimetype,
    base64: req.file.buffer.toString('base64'),
  });

  logger.info({ faId: created.id, locationId: id, docType, userId: req.user!.sub }, 'FA record created');
  res.status(201).json({ fa: { id: created.id, filename } });
});

// POST /:id/fa-trackers/:faId/attach — attach a PDF to an EXISTING FA Tracker record
faTrackersLocationRouter.post('/:id/fa-trackers/:faId/attach', upload.single('file'), async (req: Request, res: Response) => {
  const { id, faId } = req.params;
  if (!req.file) throw new BadRequestError('Missing PDF file');
  if (req.file.mimetype !== 'application/pdf') {
    throw new BadRequestError('Only PDF files are supported');
  }
  if (req.file.size > FA_PDF_MAX_BYTES) {
    throw new BadRequestError(`PDF exceeds ${(FA_PDF_MAX_BYTES / 1024 / 1024).toFixed(0)} MB limit.`);
  }

  const loc = await locations.getById(id).catch(() => null);
  if (!loc) throw new NotFoundError('Location not found');
  const shopId = (loc.fields[LOCATIONS.SHOP_ID] as string | undefined) ?? '';

  const fa = await faTracker.getById(faId).catch(() => null);
  if (!fa) throw new NotFoundError('FA Tracker record not found');
  // Safety: confirm this FA record belongs to the Location by Shop Number
  const faShopNum = (fa.fields[FA_TRACKER.SHOP_NUMBER] as string | undefined) ?? '';
  if (!shopId || faShopNum !== shopId) {
    throw new ForbiddenError('FA record does not belong to this Location');
  }

  const filename = req.file.originalname.replace(/[\/\\]/g, '_').slice(0, 255);
  await faTracker.attachFile(faId, {
    filename,
    contentType: req.file.mimetype,
    base64: req.file.buffer.toString('base64'),
  });

  logger.info({ faId, locationId: id, filename, userId: req.user!.sub }, 'FA PDF attached');
  res.json({ ok: true, filename });
});

// DELETE /:id/fa-trackers/:faId — remove an FA record (Location-scoped safety check)
faTrackersLocationRouter.delete('/:id/fa-trackers/:faId', async (req: Request, res: Response) => {
  const { id, faId } = req.params;
  const loc = await locations.getById(id).catch(() => null);
  if (!loc) throw new NotFoundError('Location not found');
  const shopId = (loc.fields[LOCATIONS.SHOP_ID] as string | undefined) ?? '';

  const fa = await faTracker.getById(faId).catch(() => null);
  if (!fa) throw new NotFoundError('FA Tracker record not found');
  const faShopNum = (fa.fields[FA_TRACKER.SHOP_NUMBER] as string | undefined) ?? '';
  if (!shopId || faShopNum !== shopId) {
    throw new ForbiddenError('FA record does not belong to this Location');
  }
  await faTracker.remove(faId);
  logger.info({ faId, locationId: id, userId: req.user!.sub }, 'FA record deleted');
  res.json({ ok: true });
});
