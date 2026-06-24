import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';

import * as leases from '../airtable/leases.js';
import * as locations from '../airtable/locations.js';
import { LEASES, LOCATIONS } from '../airtable/tables.js';
import { requireAdmin, requireAuth } from '../auth/middleware.js';
import { PDF_MAX_BYTES, extractLease, type LeaseExtraction } from '../lib/leaseExtractor.js';
import { logger } from '../util/logger.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../util/errors.js';

// Mounted under /api/v1/locations — paths include /:id/leases/...
export const leasesRouter = Router();

leasesRouter.use(requireAuth, requireAdmin);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PDF_MAX_BYTES + 1024 }, // +1KB slack so we can give a clean error vs multer's generic one
});

// ── GET /:id/leases/existing — for duplicate detection on the upload modal ──
leasesRouter.get('/:id/leases/existing', async (req: Request, res: Response) => {
  const { id } = req.params;
  const loc = await locations.getById(id);
  if (!loc) throw new NotFoundError('Location not found');
  const leaseIds = (loc.fields[LOCATIONS.LEASES] as string[] | undefined) ?? [];
  res.json({ count: leaseIds.length, leaseIds });
});

// ── POST /:id/leases/extract — AI extraction only, does not persist ──
leasesRouter.post('/:id/leases/extract', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) throw new BadRequestError('Missing PDF file');
  if (req.file.mimetype !== 'application/pdf') {
    throw new BadRequestError('Only PDF files are supported');
  }
  if (req.file.size > PDF_MAX_BYTES) {
    throw new BadRequestError(
      `Lease PDF exceeds ${(PDF_MAX_BYTES / 1024 / 1024).toFixed(0)} MB limit. ` +
      'Please enter the lease fields manually.',
    );
  }

  try {
    const pdfBase64 = req.file.buffer.toString('base64');
    const extraction = await extractLease(pdfBase64);
    res.json({ extraction });
  } catch (err) {
    logger.error({ err, locationId: req.params.id, filename: req.file.originalname }, 'lease AI extraction failed');
    res.status(502).json({
      error: {
        code: 'extraction_failed',
        message: 'AI extraction failed. You can still enter the lease fields manually.',
      },
    });
  }
});

// ── POST /:id/leases — create the Lease record and attach the PDF ──

const DOCUMENT_TYPES = ['Original Lease', 'Amendment', 'Guaranty', 'Landlord Work Letter', 'Estoppel', 'Side Letter', 'Other'] as const;

const saveSchema = z.object({
  executionDate:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  rentCommencementDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  termEnd:                z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  termYears:              z.coerce.number().int().min(0).max(99).optional(),
  monthlyRent:            z.coerce.number().min(0).optional(),
  annualRent:             z.coerce.number().min(0).optional(),
  landlord:               z.string().max(500).optional(),
  renewalOptions:         z.string().max(500).optional(),
  securityDeposit:        z.coerce.number().min(0).optional(),
  status:                 z.enum(['Active', 'Expiring Soon', 'Expired', 'On Holdover']).optional(),
  aiExtractionLog:        z.string().max(20000).optional(),
  // Document hierarchy fields
  documentType:           z.enum(DOCUMENT_TYPES).optional(),
  parentLeaseId:          z.string().startsWith('rec').length(17).optional().or(z.literal('')),
  documentDate:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  amendmentNumber:        z.coerce.number().int().min(1).max(99).optional(),
});

leasesRouter.post('/:id/leases', upload.single('file'), async (req: Request, res: Response) => {
  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError('Invalid lease payload', parsed.error.flatten());
  if (!req.file) throw new BadRequestError('Missing PDF file');
  if (req.file.mimetype !== 'application/pdf') {
    throw new BadRequestError('Only PDF files are supported');
  }

  const { id } = req.params;
  const loc = await locations.getById(id);
  if (!loc) throw new NotFoundError('Location not found');

  const f = parsed.data;
  const docType = f.documentType ?? 'Original Lease';
  const fields: leases.LeaseFields = {
    [LEASES.LOCATION]:      [id],
    [LEASES.DOCUMENT_TYPE]: docType,
  };
  // Status only applies to Original Lease records; child docs leave it empty.
  if (docType === 'Original Lease') {
    fields[LEASES.STATUS] = f.status ?? 'Active';
  }
  if (f.executionDate)        fields[LEASES.EXECUTION_DATE]         = f.executionDate;
  if (f.rentCommencementDate) fields[LEASES.RENT_COMMENCEMENT_DATE] = f.rentCommencementDate;
  if (f.termEnd)              fields[LEASES.TERM_END]               = f.termEnd;
  if (f.termYears != null)    fields[LEASES.TERM_YEARS]             = f.termYears;
  if (f.monthlyRent != null)  fields[LEASES.MONTHLY_RENT]           = f.monthlyRent;
  if (f.annualRent != null)   fields[LEASES.ANNUAL_RENT]            = f.annualRent;
  if (f.landlord)             fields[LEASES.LANDLORD]               = f.landlord;
  if (f.renewalOptions)       fields[LEASES.RENEWAL_OPTIONS]        = f.renewalOptions;
  if (f.securityDeposit != null) fields[LEASES.SECURITY_DEPOSIT]    = f.securityDeposit;
  if (f.aiExtractionLog)      fields[LEASES.AI_EXTRACTION_LOG]      = f.aiExtractionLog;
  if (f.parentLeaseId)        fields[LEASES.PARENT_LEASE]           = [f.parentLeaseId];
  if (f.documentDate)         fields[LEASES.DOCUMENT_DATE]          = f.documentDate;
  if (f.amendmentNumber != null) fields[LEASES.AMENDMENT_NUMBER]    = f.amendmentNumber;

  const created = await leases.create(fields);

  // Attach the PDF in a second step (Airtable separates record + attachment)
  const filename = req.file.originalname.replace(/[\/\\]/g, '_').slice(0, 255);
  await leases.attachFile(created.id, {
    filename,
    contentType: req.file.mimetype,
    base64: req.file.buffer.toString('base64'),
  });

  res.status(201).json({
    lease: {
      id: created.id,
      executionDate: f.executionDate ?? null,
      filename,
    },
  });
});

// ── POST /:id/leases/:leaseId/attach — attach a PDF to an EXISTING lease record ──
// Used when the record was created without a file (e.g. bulk-imported from
// Occupier metadata) and the PDF arrives later. No new record is created.
leasesRouter.post('/:id/leases/:leaseId/attach', upload.single('file'), async (req: Request, res: Response) => {
  const { id, leaseId } = req.params;
  if (!req.file) throw new BadRequestError('Missing PDF file');
  if (req.file.mimetype !== 'application/pdf') {
    throw new BadRequestError('Only PDF files are supported');
  }
  if (req.file.size > PDF_MAX_BYTES) {
    throw new BadRequestError(
      `PDF exceeds ${(PDF_MAX_BYTES / 1024 / 1024).toFixed(0)} MB limit.`,
    );
  }

  const lease = await leases.getById(leaseId).catch(() => null);
  if (!lease) throw new NotFoundError('Lease not found');
  // Safety: confirm this lease is linked to the Location in the URL
  const linkedLocations = (lease.fields[LEASES.LOCATION] as string[] | undefined) ?? [];
  if (!linkedLocations.includes(id)) {
    throw new ForbiddenError('Lease is not linked to this Location');
  }

  const filename = req.file.originalname.replace(/[\/\\]/g, '_').slice(0, 255);
  await leases.attachFile(leaseId, {
    filename,
    contentType: req.file.mimetype,
    base64: req.file.buffer.toString('base64'),
  });

  logger.info({ leaseId, locationId: id, filename, userId: req.user!.sub }, 'lease PDF attached');
  res.json({ ok: true, filename });
});

// ── DELETE /:id/leases/:leaseId — remove a lease record + its PDF ──
leasesRouter.delete('/:id/leases/:leaseId', async (req: Request, res: Response) => {
  const { id, leaseId } = req.params;
  const lease = await leases.getById(leaseId).catch(() => null);
  if (!lease) throw new NotFoundError('Lease not found');
  // Safety: confirm this lease is actually linked to the location in the URL
  const linkedLocations = (lease.fields[LEASES.LOCATION] as string[] | undefined) ?? [];
  if (!linkedLocations.includes(id)) {
    throw new ForbiddenError('Lease is not linked to this Location');
  }
  await leases.remove(leaseId);
  logger.info({ leaseId, locationId: id, userId: req.user!.sub }, 'lease deleted');
  res.json({ ok: true });
});

/** Helper: shape extraction → save payload (used by the frontend) */
export function extractionToSavePayload(e: LeaseExtraction): Record<string, unknown> {
  return {
    executionDate:        e.executionDate.value        ?? '',
    rentCommencementDate: e.commencementDate.value     ?? '',
    termEnd:              e.termEnd.value              ?? '',
    termYears:            e.termYears.value            ?? undefined,
    monthlyRent:          e.monthlyRent.value          ?? undefined,
    annualRent:           e.annualRent.value           ?? undefined,
    landlord:             e.landlord.value             ?? '',
    renewalOptions:       e.renewalOptions.value       ?? '',
    securityDeposit:      e.securityDeposit.value      ?? undefined,
  };
}
