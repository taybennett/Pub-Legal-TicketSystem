import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { airtable } from '../airtable/client.js';
import { TABLE, USERS } from '../airtable/tables.js';
import type { UserFields } from '../airtable/users.js';
import { requireAdmin, requireAuth } from '../auth/middleware.js';
import { generatePin, hashPin } from '../auth/pins.js';
import { sendInvitationEmail } from '../email/send.js';
import { BadRequestError } from '../util/errors.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/users', async (_req: Request, res: Response) => {
  const list = await airtable.list<UserFields>('LEGAL', TABLE.USERS, {
    sort: [{ field: 'Name', direction: 'asc' }],
  });
  res.json({
    users: list.map(u => ({
      id: u.id,
      name:   u.fields[USERS.NAME],
      email:  u.fields[USERS.EMAIL],
      userType: u.fields[USERS.USER_TYPE] ?? null,
      portalStatus: u.fields[USERS.PORTAL_STATUS] ?? null,
      franchiseeGroup: u.fields[USERS.FRANCHISEE_GROUP] ?? [],
      lastLogin: u.fields[USERS.LAST_LOGIN] ?? null,
      invitationSent: u.fields[USERS.INVITATION_SENT] ?? null,
    })),
  });
});

const inviteSchema = z.object({
  name:             z.string().min(1),
  email:            z.string().email(),
  userType:         z.enum(['Franchisee', 'Partner']),
  franchiseeGroupIds: z.array(z.string().startsWith('rec').length(17)).min(1),
});

adminRouter.post('/users', async (req: Request, res: Response) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError('Invalid invite payload', parsed.error.flatten());
  const { name, email, userType, franchiseeGroupIds } = parsed.data;

  const pin = generatePin();
  const pinHash = await hashPin(pin);

  const created = await airtable.create<UserFields>('LEGAL', TABLE.USERS, {
    [USERS.NAME]:             name,
    [USERS.EMAIL]:            email,
    [USERS.PIN]:              pinHash,
    [USERS.USER_TYPE]:        userType,
    [USERS.FRANCHISEE_GROUP]: franchiseeGroupIds,
    [USERS.PORTAL_STATUS]:    'Invited',
    [USERS.INVITATION_SENT]:  new Date().toISOString(),
  }, true);

  // Fire-and-log the email; caller gets 201 even if email fails (recoverable).
  sendInvitationEmail({ to: email, name, pin }).catch(() => {
    // logged inside sendInvitationEmail
  });

  res.status(201).json({
    user: { id: created.id, name, email, portalStatus: 'Invited' },
    pin, // returned once to the admin UI so Taylor can copy/share if email fails
  });
});

const patchSchema = z.object({
  portalStatus:       z.enum(['Active', 'Invited', 'Suspended']).optional(),
  franchiseeGroupIds: z.array(z.string().startsWith('rec').length(17)).optional(),
  resendInvite:       z.boolean().optional(),
});

adminRouter.patch('/users/:id', async (req: Request, res: Response) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError('Invalid patch payload', parsed.error.flatten());
  const fields: Record<string, unknown> = {};
  if (parsed.data.portalStatus)       fields[USERS.PORTAL_STATUS] = parsed.data.portalStatus;
  if (parsed.data.franchiseeGroupIds) fields[USERS.FRANCHISEE_GROUP] = parsed.data.franchiseeGroupIds;

  let newPin: string | undefined;
  if (parsed.data.resendInvite) {
    newPin = generatePin();
    fields[USERS.PIN] = await hashPin(newPin);
    fields[USERS.PORTAL_STATUS] = 'Invited';
    fields[USERS.INVITATION_SENT] = new Date().toISOString();
  }

  const updated = await airtable.update<UserFields>('LEGAL', TABLE.USERS, req.params.id, fields);

  if (parsed.data.resendInvite && newPin) {
    const email = updated.fields[USERS.EMAIL] as string;
    const name  = updated.fields[USERS.NAME]  as string;
    sendInvitationEmail({ to: email, name, pin: newPin }).catch(() => {});
  }

  res.json({ user: { id: updated.id, ...updated.fields }, pin: newPin });
});
