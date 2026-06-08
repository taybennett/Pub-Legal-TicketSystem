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

/** All FA Tracker rows whose DRA Name text matches `draName` exactly.
 *  Filters client-side to avoid filterByFormula 422s if the field's
 *  display name in Airtable doesn't match what we'd hardcode here. */
export async function listByDraName(draName: string): Promise<FaTrackerRecord[]> {
  if (!draName) return [];
  const all = await airtable.list<FaTrackerFields>('LEGAL', TABLE.FA_TRACKER, {});
  return all.filter(r => (r.fields[FA_TRACKER.DRA_NAME] as string | undefined) === draName);
}

/** All FA Tracker rows. Used by the DRA list endpoint to bucket per DRA. */
export async function listAll(): Promise<FaTrackerRecord[]> {
  return airtable.list<FaTrackerFields>('LEGAL', TABLE.FA_TRACKER, {});
}
