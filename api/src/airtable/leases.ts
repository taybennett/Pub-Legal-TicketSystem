import { airtable, type AirtableRecord } from './client.js';
import { LEASES, TABLE } from './tables.js';

export interface LeaseFields {
  [LEASES.LOCATION]?: string[];
  [LEASES.EXECUTION_DATE]?: string;
  [LEASES.TERM_END]?: string;
  [LEASES.STATUS]?: string | { name: string };
  [LEASES.TERM_YEARS]?: number;
  [LEASES.MONTHLY_RENT]?: number;
  [LEASES.ANNUAL_RENT]?: number;
  [LEASES.FILE]?: { url: string; filename: string; size?: number; type?: string }[];
  [LEASES.LANDLORD]?: string;
  [LEASES.RENT_COMMENCEMENT_DATE]?: string;
  [LEASES.RENEWAL_OPTIONS]?: string;
  [LEASES.SECURITY_DEPOSIT]?: number;
  [LEASES.AI_EXTRACTION_LOG]?: string;
  [key: string]: unknown;
}

export type LeaseRecord = AirtableRecord<LeaseFields>;

export async function create(fields: LeaseFields): Promise<LeaseRecord> {
  return airtable.create<LeaseFields>('LEGAL', TABLE.LEASES, fields);
}

export async function attachFile(recordId: string, file: { filename: string; contentType: string; base64: string }): Promise<void> {
  await airtable.uploadAttachment('LEGAL', recordId, LEASES.FILE, file);
}

/** Leases linked to a Location, most-recent execution date first. */
export async function listForLocation(leaseIds: string[]): Promise<LeaseRecord[]> {
  if (leaseIds.length === 0) return [];
  const formula = 'OR(' + leaseIds.map(id => `RECORD_ID()='${id}'`).join(',') + ')';
  const records = await airtable.list<LeaseFields>('LEGAL', TABLE.LEASES, {
    filterByFormula: formula,
  });
  return records.sort((a, b) => {
    const da = (a.fields[LEASES.EXECUTION_DATE] as string | undefined) ?? '';
    const db = (b.fields[LEASES.EXECUTION_DATE] as string | undefined) ?? '';
    return db.localeCompare(da);
  });
}
