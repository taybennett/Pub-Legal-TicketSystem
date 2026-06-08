import { airtable, type AirtableRecord } from './client.js';
import { TABLE, TICKETS, type Origin, type Visibility, type Workstream } from './tables.js';
import { hasGlobalAccess, type UserScope } from '../scope/rules.js';

export interface TicketFields {
  [TICKETS.TITLE]?: string;
  [TICKETS.DESCRIPTION]?: string;
  [TICKETS.SUBMITTER]?: string[];
  [TICKETS.SUBMITTER_NAME]?: string;
  [TICKETS.SUBMITTER_EMAIL]?: string;
  [TICKETS.STATUS]?: string;
  [TICKETS.LOCATION]?: string[];
  [TICKETS.WORKSTREAM]?: Workstream;
  [TICKETS.REQUEST_TYPE]?: string;
  [TICKETS.VISIBILITY]?: Visibility;
  [TICKETS.ORIGIN]?: Origin;
  [TICKETS.ASSIGNED_TO]?: string;
  [TICKETS.ATTORNEY_EMAIL]?: string;
  [TICKETS.DEADLINE]?: string;
  [TICKETS.SUBMITTED_AT]?: string;
  [key: string]: unknown;
}

export type TicketRecord = AirtableRecord<TicketFields>;

export interface ListTicketsOptions {
  locationId?: string;
  workstream?: Workstream;
  status?: string;
}

export async function listForScope(scope: UserScope, opts: ListTicketsOptions = {}): Promise<TicketRecord[]> {
  const clauses: string[] = [];

  if (opts.locationId) {
    clauses.push(`FIND('${opts.locationId}', ARRAYJOIN({Location}))`);
  }
  if (opts.workstream) {
    clauses.push(`{Workstream} = '${opts.workstream.replace(/'/g, "\\'")}'`);
  }
  if (opts.status) {
    clauses.push(`{Status} = '${opts.status.replace(/'/g, "\\'")}'`);
  }

  if (!hasGlobalAccess(scope)) {
    // Franchisee: must be in one of their accessible Locations + visible
    if (scope.accessibleLocationIds.length === 0) return [];
    const locOr = 'OR(' +
      scope.accessibleLocationIds.map(id => `FIND('${id}', ARRAYJOIN({Location}))`).join(',') +
      ')';
    clauses.push(locOr);
    clauses.push("{Visibility} = 'Franchisee-Visible'");
  }

  const filterByFormula = clauses.length ? (clauses.length === 1 ? clauses[0] : `AND(${clauses.join(',')})`) : undefined;
  return airtable.list<TicketFields>('LEGAL', TABLE.TICKETS, {
    filterByFormula,
    sort: [{ field: 'Submitted At', direction: 'desc' }],
  });
}

export async function getById(recordId: string): Promise<TicketRecord> {
  return airtable.get<TicketFields>('LEGAL', TABLE.TICKETS, recordId);
}

export async function create(fields: TicketFields): Promise<TicketRecord> {
  return airtable.create<TicketFields>('LEGAL', TABLE.TICKETS, fields, true);
}

export async function update(recordId: string, fields: Partial<TicketFields>): Promise<TicketRecord> {
  return airtable.update<TicketFields>('LEGAL', TABLE.TICKETS, recordId, fields);
}
