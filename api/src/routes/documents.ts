import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';

import * as documents from '../airtable/documents.js';
import * as tickets from '../airtable/tickets.js';
import { DOCUMENTS, TICKETS, type UploadedByRole } from '../airtable/tables.js';
import { requireAuth } from '../auth/middleware.js';
import { canAccessLocation, hasGlobalAccess } from '../scope/rules.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../util/errors.js';
import { notifyDocumentUploaded } from '../email/notify.js';

export const documentsRouter = Router();

documentsRouter.use(requireAuth);

const MAX_SIZE = 25 * 1024 * 1024; // 25 MB
const ALLOWED_EXTS = new Set(['pdf', 'docx', 'doc', 'dwg', 'dxf', 'png', 'jpg', 'jpeg']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE },
});

const metaSchema = z.object({
  ticketId:     z.string().startsWith('rec').length(17),
  documentType: z.enum([
    'Test Fit CAD','LOI','Lease Draft','Redlined Lease','Lease Rider',
    'Lease Amendment','Signed Lease','Franchise Agreement','Addendum',
    'Signed FA','Site Photo','Correspondence','Other',
  ]).optional(),
  version:      z.coerce.number().int().min(1).optional(),
});

documentsRouter.post('/', upload.single('file'), async (req: Request, res: Response) => {
  const parsed = metaSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError('Invalid upload payload', parsed.error.flatten());
  if (!req.file) throw new BadRequestError('Missing file');

  const filename = req.file.originalname.replace(/[\/\\]/g, '_').slice(0, 255);
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXTS.has(ext)) throw new BadRequestError(`File type .${ext} not allowed`);

  // Confirm user has access to the parent ticket.
  const ticket = await tickets.getById(parsed.data.ticketId);
  if (!ticket) throw new NotFoundError('Ticket not found');
  const me = req.user!;
  if (!hasGlobalAccess(me.scope)) {
    if (ticket.fields[TICKETS.VISIBILITY] !== 'Franchisee-Visible') throw new ForbiddenError();
    const locs = (ticket.fields[TICKETS.LOCATION] as string[] | undefined) ?? [];
    if (locs.length > 0 && !locs.some(id => canAccessLocation(me.scope, id))) {
      throw new ForbiddenError();
    }
  }

  const role: UploadedByRole = me.userType === 'Franchisee' || me.userType === 'Partner' ? 'Franchisee' : 'Franchisor';
  const locationIds = (ticket.fields[TICKETS.LOCATION] as string[] | undefined) ?? [];

  // 1. Create Document record with metadata (no file yet)
  const doc = await documents.create({
    [DOCUMENTS.FILENAME]:         filename,
    [DOCUMENTS.FILE_TYPE]:        req.file.mimetype,
    [DOCUMENTS.FILE_SIZE]:        String(req.file.size),
    [DOCUMENTS.UPLOADED_BY]:      me.name,
    [DOCUMENTS.UPLOADED_BY_ROLE]: role,
    [DOCUMENTS.TICKET]:           [ticket.id],
    [DOCUMENTS.LOCATION]:         locationIds.length > 0 ? locationIds : undefined,
    [DOCUMENTS.DOCUMENT_TYPE]:    parsed.data.documentType,
    [DOCUMENTS.VERSION]:          parsed.data.version,
  });

  // 2. Attach the file bytes via content.airtable.com
  const base64 = req.file.buffer.toString('base64');
  await documents.attachFile(doc.id, {
    filename,
    contentType: req.file.mimetype,
    base64,
  });

  notifyDocumentUploaded({
    ticket:       ticket,
    actor:        me,
    filename,
    documentType: parsed.data.documentType ?? null,
    version:      parsed.data.version ?? null,
  });

  res.status(201).json({
    document: {
      id: doc.id,
      filename,
      size: req.file.size,
      type: req.file.mimetype,
      documentType: parsed.data.documentType ?? null,
      version: parsed.data.version ?? null,
      uploadedByRole: role,
    },
  });
});

export function uploadErrorHandler(err: unknown, _req: Request, _res: Response, next: (e: unknown) => void): void {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') next(new BadRequestError('File exceeds 25MB limit'));
    else next(new BadRequestError(`Upload error: ${err.message}`));
    return;
  }
  next(err);
}

