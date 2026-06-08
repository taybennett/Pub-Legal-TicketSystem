import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import * as tickets from '../airtable/tickets.js';
import * as messages from '../airtable/messages.js';
import * as documents from '../airtable/documents.js';
import { MESSAGES, TICKETS, TABLE, type Visibility } from '../airtable/tables.js';
import { airtable } from '../airtable/client.js';
import { requireAdmin, requireAuth } from '../auth/middleware.js';
import { canAccessLocation, hasGlobalAccess } from '../scope/rules.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../util/errors.js';
import { notifyMessagePosted, notifyTicketCreated } from '../email/notify.js';

export const ticketsRouter = Router();

ticketsRouter.use(requireAuth);

const createSchema = z.object({
  locationId:  z.string().startsWith('rec').length(17).optional(),
  workstream:  z.enum(['Real Estate', 'Franchise Agreement', 'Construction', 'General']),
  requestType: z.string().min(1),
  title:       z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
});

ticketsRouter.post('/', async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError('Invalid ticket payload', parsed.error.flatten());
  const { locationId, workstream, requestType, title, description } = parsed.data;
  const me = req.user!;

  if (locationId && !canAccessLocation(me.scope, locationId)) throw new ForbiddenError();

  const origin = me.userType === 'Franchisee' || me.userType === 'Partner' ? 'Franchisee' : 'Employee';
  const visibility: Visibility = 'Franchisee-Visible';

  const created = await tickets.create({
    [TICKETS.TITLE]:           title,
    [TICKETS.DESCRIPTION]:     description ?? '',
    [TICKETS.SUBMITTER]:       [me.sub],
    [TICKETS.SUBMITTER_NAME]:  me.name,
    [TICKETS.SUBMITTER_EMAIL]: me.email,
    [TICKETS.LOCATION]:        locationId ? [locationId] : undefined,
    [TICKETS.WORKSTREAM]:      workstream,
    [TICKETS.REQUEST_TYPE]:    requestType,
    [TICKETS.VISIBILITY]:      visibility,
    [TICKETS.ORIGIN]:          origin,
    [TICKETS.STATUS]:          'New',
  });

  notifyTicketCreated({ ticket: created, actor: me });

  res.status(201).json({ ticket: serialize(created) });
});

ticketsRouter.get('/:id', async (req: Request, res: Response) => {
  const t = await tickets.getById(req.params.id);
  if (!t) throw new NotFoundError('Ticket not found');
  assertCanReadTicket(req.user!, t);
  res.json({ ticket: serialize(t) });
});

ticketsRouter.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
  await airtable.delete('LEGAL', TABLE.TICKETS, req.params.id);
  res.json({ ok: true });
});

ticketsRouter.get('/:id/messages', async (req: Request, res: Response) => {
  const t = await tickets.getById(req.params.id);
  if (!t) throw new NotFoundError('Ticket not found');
  assertCanReadTicket(req.user!, t);
  const msgs = await messages.listForTicket(t.id, req.user!.scope);
  res.json({
    messages: msgs.map(m => ({
      id:         m.id,
      sender:     m.fields[MESSAGES.SENDER_NAME] ?? '',
      senderRole: m.fields[MESSAGES.SENDER_ROLE] ?? null,
      body:       m.fields[MESSAGES.BODY] ?? '',
      sentAt:     m.fields[MESSAGES.SENT_AT] ?? null,
      internal:   Boolean(m.fields[MESSAGES.INTERNAL]),
    })),
  });
});

const postMessageSchema = z.object({
  body:     z.string().min(1).max(20000),
  internal: z.boolean().optional(),
});

ticketsRouter.post('/:id/messages', async (req: Request, res: Response) => {
  const parsed = postMessageSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError('Invalid message payload', parsed.error.flatten());
  const t = await tickets.getById(req.params.id);
  if (!t) throw new NotFoundError('Ticket not found');
  assertCanReadTicket(req.user!, t);

  const me = req.user!;
  const internal = parsed.data.internal && hasGlobalAccess(me.scope);

  const created = await messages.create({
    [MESSAGES.SENDER_NAME]:     me.name,
    [MESSAGES.SENDER_ROLE]:     me.userType,
    [MESSAGES.TICKET]:          [t.id],
    [MESSAGES.BODY]:            parsed.data.body,
    [MESSAGES.INTERNAL]:        Boolean(internal),
    [MESSAGES.RECIPIENT_EMAIL]: (t.fields[TICKETS.SUBMITTER_EMAIL] as string) ?? '',
  });

  notifyMessagePosted({
    ticket:   t,
    actor:    me,
    internal: Boolean(internal),
    preview:  parsed.data.body,
  });

  res.status(201).json({
    message: {
      id:       created.id,
      sender:   created.fields[MESSAGES.SENDER_NAME] ?? me.name,
      body:     created.fields[MESSAGES.BODY] ?? parsed.data.body,
      internal: Boolean(created.fields[MESSAGES.INTERNAL]),
    },
  });
});

ticketsRouter.get('/:id/documents', async (req: Request, res: Response) => {
  const t = await tickets.getById(req.params.id);
  if (!t) throw new NotFoundError('Ticket not found');
  assertCanReadTicket(req.user!, t);
  const docs = await documents.listForTicket(t.id);
  res.json({ documents: docs.map(d => ({ id: d.id, ...d.fields })) });
});

function assertCanReadTicket(user: Request['user'], t: Awaited<ReturnType<typeof tickets.getById>>): void {
  if (!user) throw new ForbiddenError();
  if (hasGlobalAccess(user.scope)) return;
  if (t.fields[TICKETS.VISIBILITY] !== 'Franchisee-Visible') throw new ForbiddenError();
  const locs = (t.fields[TICKETS.LOCATION] as string[] | undefined) ?? [];
  if (locs.length > 0 && !locs.some(id => canAccessLocation(user.scope, id))) {
    throw new ForbiddenError();
  }
  if (locs.length === 0) {
    const submitterIds = (t.fields[TICKETS.SUBMITTER] as string[] | undefined) ?? [];
    if (!submitterIds.includes(user.sub)) throw new ForbiddenError();
  }
}

function serialize(t: Awaited<ReturnType<typeof tickets.getById>>) {
  return {
    id:            t.id,
    title:         t.fields[TICKETS.TITLE] ?? '',
    description:   t.fields[TICKETS.DESCRIPTION] ?? '',
    status:        t.fields[TICKETS.STATUS] ?? null,
    workstream:    t.fields[TICKETS.WORKSTREAM] ?? null,
    requestType:   t.fields[TICKETS.REQUEST_TYPE] ?? null,
    visibility:    t.fields[TICKETS.VISIBILITY] ?? null,
    origin:        t.fields[TICKETS.ORIGIN] ?? null,
    submitterName: t.fields[TICKETS.SUBMITTER_NAME] ?? '',
    submittedAt:   t.fields[TICKETS.SUBMITTED_AT] ?? null,
    locationIds:   (t.fields[TICKETS.LOCATION] as string[] | undefined) ?? [],
  };
}
