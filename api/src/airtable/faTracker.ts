import { airtable, type AirtableRecord } from './client.js';
import { FA_TRACKER, TABLE } from './tables.js';

export interface FaTrackerFields {
  [FA_TRACKER.SHOP_NUMBER]?: string;
  [FA_TRACKER.EXECUTION_DATE]?: string;
  [FA_TRACKER.TERM_END]?: string;
  [FA_TRACKER.STATUS]?: string | { name: string };
  [FA_TRACKER.TERM_YEARS]?: number;
  [FA_TRACKER.ENTITY_NAME]?: string;
  [FA_TRACKER.SIGNATORY]?: string;
  [FA_TRACKER.DRA_NAME]?: string;
  [FA_TRACKER.ATTORNEY]?: string;
  [FA_TRACKER.FILE]?: { url: string; filename: string; size?: number; type?: string }[];
  [FA_TRACKER.DRA_LINK]?: string[];
  [key: string]: unknown;
}

export type FaTrackerRecord = AirtableRecord<FaTrackerFields>;

/** FA Tracker rows for a Shop Number, most-recent execution date first.
 *  Filters client-side (same robustness reason as listByDraName). */
export async function listForShopNumber(shopId: string): Promise<FaTrackerRecord[]> {
  if (!shopId) return [];
  const all = await airtable.list<FaTrackerFields>('LEGAL', TABLE.FA_TRACKER, {});
  const matched = all.filter(r => (r.fields[FA_TRACKER.SHOP_NUMBER] as string | undefined) === shopId);
  return matched.sort((a, b) => {
    const da = (a.fields[FA_TRACKER.EXECUTION_DATE] as string | undefined) ?? '';
    const db = (b.fields[FA_TRACKER.EXECUTION_DATE] as string | undefined) ?? '';
    return db.localeCompare(da);
  });
}

/** FA Tracker rows linked to a specific DRA (Franchisee Groups) record ID.
 *  Uses the new DRA_LINK linked-record field — survives DRA name renames. */
export async function listByDraId(draRecordId: string): Promise<FaTrackerRecord[]> {
  if (!draRecordId) return [];
  const all = await airtable.list<FaTrackerFields>('LEGAL', TABLE.FA_TRACKER, {});
  return all.filter(r => {
    const links = (r.fields[FA_TRACKER.DRA_LINK] as string[] | undefined) ?? [];
    return links.includes(draRecordId);
  });
}

/** All FA Tracker rows. Used by the DRA list endpoint to bucket per DRA. */
export async function listAll(): Promise<FaTrackerRecord[]> {
  return airtable.list<FaTrackerFields>('LEGAL', TABLE.FA_TRACKER, {});
}

export async function create(fields: FaTrackerFields): Promise<FaTrackerRecord> {
  return airtable.create<FaTrackerFields>('LEGAL', TABLE.FA_TRACKER, fields, true);
}

export async function getById(recordId: string): Promise<FaTrackerRecord> {
  return airtable.get<FaTrackerFields>('LEGAL', TABLE.FA_TRACKER, recordId);
}

export async function remove(recordId: string): Promise<void> {
  await airtable.delete('LEGAL', TABLE.FA_TRACKER, recordId);
}
