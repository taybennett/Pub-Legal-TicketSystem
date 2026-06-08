import { airtable, type AirtableRecord } from './client.js';
import { MESSAGES, TABLE } from './tables.js';
import { hasGlobalAccess, type UserScope } from '../scope/rules.js';

export interface MessageFields {
  [MESSAGES.SENDER_NAME]?: string;
  [MESSAGES.SENDER_ROLE]?: string;
  [MESSAGES.TICKET]?: string[];
  [MESSAGES.BODY]?: string;
  [MESSAGES.SENT_AT]?: string;
  [MESSAGES.INTERNAL]?: boolean;
  [MESSAGES.RECIPIENT_EMAIL]?: string;
  [key: string]: unknown;
}

export type MessageRecord = AirtableRecord<MessageFields>;

/** List all messages for a ticket, filtering internals for franchisees. */
export async function listForTicket(ticketId: string, scope: UserScope): Promise<MessageRecord[]> {
  const all = await airtable.list<MessageFields>('LEGAL', TABLE.MESSAGES, {
    filterByFormula: `FIND('${ticketId}', ARRAYJOIN({Ticket}))`,
    sort: [{ field: 'Sent At', direction: 'asc' }],
  });
  if (hasGlobalAccess(scope)) return all;
  return all.filter(m => !m.fields[MESSAGES.INTERNAL]);
}

export async function create(fields: MessageFields): Promise<MessageRecord> {
  return airtable.create<MessageFields>('LEGAL', TABLE.MESSAGES, fields, true);
}
