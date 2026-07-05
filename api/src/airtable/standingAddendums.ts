import { airtable, type AirtableRecord } from './client.js';
import { STANDING_ADDENDUMS, TABLE } from './tables.js';

export interface StandingAddendumFields {
  [STANDING_ADDENDUMS.NAME]?: string;
  [STANDING_ADDENDUMS.DESCRIPTION]?: string;
  [STANDING_ADDENDUMS.APPLIES_TO]?: string[];
  [STANDING_ADDENDUMS.NOTES]?: string;
  [STANDING_ADDENDUMS.TEMPLATE_FILE]?: { url: string; filename: string; size?: number; type?: string }[];
  [key: string]: unknown;
}

export type StandingAddendumRecord = AirtableRecord<StandingAddendumFields>;

/** All Standing Addendums. Small table (single-digit rows), so we filter client-side. */
export async function listAll(): Promise<StandingAddendumRecord[]> {
  return airtable.list<StandingAddendumFields>('LEGAL', TABLE.STANDING_ADDENDUMS, {});
}

/** Standing Addendums that apply to a given DRA (Franchisee Groups record ID). */
export async function listForDra(draRecordId: string): Promise<StandingAddendumRecord[]> {
  if (!draRecordId) return [];
  const all = await listAll();
  return all.filter(r => {
    const applies = (r.fields[STANDING_ADDENDUMS.APPLIES_TO] as string[] | undefined) ?? [];
    return applies.includes(draRecordId);
  });
}
