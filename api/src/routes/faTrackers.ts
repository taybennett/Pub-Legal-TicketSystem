import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import * as faTracker from '../airtable/faTracker.js';
import { FA_TRACKER } from '../airtable/tables.js';
import { requireAdmin, requireAuth } from '../auth/middleware.js';
import { BadRequestError } from '../util/errors.js';

export const faTrackersRouter = Router();

faTrackersRouter.use(requireAuth, requireAdmin);

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
