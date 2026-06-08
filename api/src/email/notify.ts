import { config } from '../config.js';
import { logger } from '../util/logger.js';
import { sendTicketActivityEmail } from './send.js';
import * as locations from '../airtable/locations.js';
import * as users from '../airtable/users.js';
import { LOCATIONS, TICKETS, USERS, type Origin, type UserType } from '../airtable/tables.js';
import type { TicketRecord } from '../airtable/tickets.js';

type Side = 'franchisee' | 'firm';

interface Actor {
  sub: string;
  name: string;
  userType: UserType;
}

interface ResolvedRecipient {
  email: string;
  name: string;
  side: Side;
}

/**
 * Resolve who should be notified about activity on a ticket. The actor's
 * userType determines which side we're notifying (the other one).
 *
 * Preferred path: walk ticket → first Location → that Location's
 *   Primary Franchisee Contact (if notifying franchisee side) or
 *   Assigned Attorney (if notifying firm side) → User.Email.
 *
 * Fallback: ticket.SubmitterEmail when the submitter is on the side we
 * want to notify (i.e., the actor is responding to them).
 *
 * Returns null when no recipient can be determined; caller logs and skips.
 */
async function resolveRecipient(ticket: TicketRecord, actorType: UserType): Promise<ResolvedRecipient | null> {
  const actorIsFirm = actorType === 'Employee' || actorType === 'Admin';
  const targetSide: Side = actorIsFirm ? 'franchisee' : 'firm';

  const locationIds = (ticket.fields[TICKETS.LOCATION] as string[] | undefined) ?? [];
  if (locationIds.length > 0) {
    try {
      const loc = await locations.getById(locationIds[0]);
      const userIds = targetSide === 'franchisee'
        ? (loc.fields[LOCATIONS.PRIMARY_FRANCHISEE_CONTACT] as string[] | undefined) ?? []
        : (loc.fields[LOCATIONS.ASSIGNED_ATTORNEY]          as string[] | undefined) ?? [];
      if (userIds.length > 0) {
        const user = await users.findById(userIds[0]);
        const email = user.fields[USERS.EMAIL] as string | undefined;
        const name  = (user.fields[USERS.NAME] as string | undefined) ?? '';
        if (email) return { email, name, side: targetSide };
      }
    } catch (err) {
      logger.warn({ err, ticketId: ticket.id, locationId: locationIds[0] }, 'recipient lookup via Location failed');
    }
  }

  const ticketOrigin   = ticket.fields[TICKETS.ORIGIN]          as Origin | undefined;
  const submitterEmail = ticket.fields[TICKETS.SUBMITTER_EMAIL] as string | undefined;
  const submitterName  = ticket.fields[TICKETS.SUBMITTER_NAME] as string | undefined;
  if (submitterEmail) {
    if (targetSide === 'franchisee' && ticketOrigin === 'Franchisee') {
      return { email: submitterEmail, name: submitterName ?? '', side: 'franchisee' };
    }
    if (targetSide === 'firm' && ticketOrigin === 'Employee') {
      return { email: submitterEmail, name: submitterName ?? '', side: 'firm' };
    }
  }

  return null;
}

// ── Dedup ───────────────────────────────────────────────────────────
// Suppresses repeat notifications of the same kind to the same recipient
// for the same ticket within the window. Keyed per-kind, so a message +
// doc upload from a single Composer Send still produce one email each
// (different kinds), but two rapid-fire messages collapse.

const DEDUP_WINDOW_MS = 60_000;
const recentNotifications = new Map<string, number>();

function dedupAllow(key: string): boolean {
  const now = Date.now();
  for (const [k, t] of recentNotifications) {
    if (now - t > DEDUP_WINDOW_MS) recentNotifications.delete(k);
  }
  const last = recentNotifications.get(key);
  if (last && now - last < DEDUP_WINDOW_MS) return false;
  recentNotifications.set(key, now);
  return true;
}

// ── Helpers ─────────────────────────────────────────────────────────

function ticketUrlFor(side: Side, ticketId: string): string {
  if (side === 'franchisee') return `${config.FRONTEND_URL_PORTAL}/tickets/${ticketId}`;
  return config.FRONTEND_URL_LEGAL;
}

function ticketTitleOf(ticket: TicketRecord): string {
  return (ticket.fields[TICKETS.TITLE] as string | undefined) ?? '(untitled)';
}

interface NotifyContext {
  ticket: TicketRecord;
  actor: Actor;
}

async function dispatch(
  ctx: NotifyContext,
  kind: 'new_message' | 'ticket_created' | 'document_uploaded' | 'status_changed',
  extra?: string,
): Promise<void> {
  const recipient = await resolveRecipient(ctx.ticket, ctx.actor.userType);
  if (!recipient) {
    logger.info({ ticketId: ctx.ticket.id, kind }, 'no recipient resolvable; notification skipped');
    return;
  }
  const dedupKey = `${kind}:${ctx.ticket.id}:${ctx.actor.sub}:${recipient.email.toLowerCase()}`;
  if (!dedupAllow(dedupKey)) {
    logger.debug({ dedupKey }, 'notification deduped within window');
    return;
  }
  await sendTicketActivityEmail({
    to:            recipient.email,
    recipientName: recipient.name,
    ticketTitle:   ticketTitleOf(ctx.ticket),
    ticketUrl:     ticketUrlFor(recipient.side, ctx.ticket.id),
    actorName:     ctx.actor.name,
    action:        kind,
    extra,
  });
}

// ── Public API ──────────────────────────────────────────────────────

export function notifyTicketCreated(ctx: NotifyContext): void {
  dispatch(ctx, 'ticket_created').catch(err => {
    logger.error({ err, ticketId: ctx.ticket.id }, 'notifyTicketCreated failed');
  });
}

export function notifyMessagePosted(ctx: NotifyContext & { internal: boolean; preview?: string }): void {
  if (ctx.internal) return;
  const extra = ctx.preview ? truncate(ctx.preview, 240) : undefined;
  dispatch(ctx, 'new_message', extra).catch(err => {
    logger.error({ err, ticketId: ctx.ticket.id }, 'notifyMessagePosted failed');
  });
}

export function notifyDocumentUploaded(ctx: NotifyContext & {
  filename: string;
  documentType?: string | null;
  version?: number | null;
}): void {
  const parts = [ctx.filename];
  if (ctx.documentType) parts.push(ctx.documentType);
  if (ctx.version)      parts.push(`v${ctx.version}`);
  const extra = `File: ${parts.join(' · ')}`;
  dispatch(ctx, 'document_uploaded', extra).catch(err => {
    logger.error({ err, ticketId: ctx.ticket.id }, 'notifyDocumentUploaded failed');
  });
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}
