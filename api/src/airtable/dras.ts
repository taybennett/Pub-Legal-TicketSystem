import { airtable, type AirtableRecord } from './client.js';
import { FRANCHISEE_GROUPS, TABLE } from './tables.js';

export interface DraFields {
  [FRANCHISEE_GROUPS.GROUP_NAME]?: string;
  [FRANCHISEE_GROUPS.TOTAL_OBLIGATION]?: number;
  [FRANCHISEE_GROUPS.TERM_END_DATE]?: string;
  [FRANCHISEE_GROUPS.DRA_FILE]?: { url: string; filename: string; type?: string }[];
  [key: string]: unknown;
}

export type DraRecord = AirtableRecord<DraFields>;

/** All DRA records, sorted by name. PUB Corp and other non-DRA rows
 *  show up here too — the route filters out rows without a Total Obligation. */
export async function listAll(): Promise<DraRecord[]> {
  const records = await airtable.list<DraFields>('LEGAL', TABLE.FRANCHISEE_GROUPS, {});
  // Sort client-side by primary GROUP_NAME field so we don't depend on the
  // Airtable field's display name (avoids 422 if it gets renamed).
  return records.sort((a, b) => {
    const an = (a.fields[FRANCHISEE_GROUPS.GROUP_NAME] as string | undefined) ?? '';
    const bn = (b.fields[FRANCHISEE_GROUPS.GROUP_NAME] as string | undefined) ?? '';
    return an.localeCompare(bn);
  });
}

export async function getById(recordId: string): Promise<DraRecord> {
  return airtable.get<DraFields>('LEGAL', TABLE.FRANCHISEE_GROUPS, recordId);
}

export const YEAR_FIELDS: Array<{ year: number; fieldId: string }> = [
  { year: 2025, fieldId: FRANCHISEE_GROUPS.YEAR_2025 },
  { year: 2026, fieldId: FRANCHISEE_GROUPS.YEAR_2026 },
  { year: 2027, fieldId: FRANCHISEE_GROUPS.YEAR_2027 },
  { year: 2028, fieldId: FRANCHISEE_GROUPS.YEAR_2028 },
  { year: 2029, fieldId: FRANCHISEE_GROUPS.YEAR_2029 },
  { year: 2030, fieldId: FRANCHISEE_GROUPS.YEAR_2030 },
  { year: 2031, fieldId: FRANCHISEE_GROUPS.YEAR_2031 },
  { year: 2032, fieldId: FRANCHISEE_GROUPS.YEAR_2032 },
  { year: 2033, fieldId: FRANCHISEE_GROUPS.YEAR_2033 },
  { year: 2034, fieldId: FRANCHISEE_GROUPS.YEAR_2034 },
  { year: 2035, fieldId: FRANCHISEE_GROUPS.YEAR_2035 },
];
