/**
 * Shop IDs table — master allocation of shop numbers to DRAs.
 *
 * Every ID from 2001-2357 plus the special 6969 (GSP Hawaii) has one row.
 * Rows carry: which DRA the block is allocated to, block owner label,
 * shop name (once secured), links back to Locations and FA Tracker, and
 * an assignment Status.
 *
 * Read-only reads feed the Shop ID Allocation report on the Reports tab.
 */

import { airtable, type AirtableRecord } from './client.js';
import { SHOP_IDS, TABLE, type ShopIdStatus } from './tables.js';

export interface ShopIdFields {
  [SHOP_IDS.SHOP_ID]?:     string;
  [SHOP_IDS.DRA]?:         string[];  // record IDs → Franchisee Groups
  [SHOP_IDS.BLOCK_OWNER]?: string;
  [SHOP_IDS.SHOP_NAME]?:   string;
  [SHOP_IDS.ADDRESS]?:     string;
  [SHOP_IDS.LOCATION]?:    string[];
  [SHOP_IDS.FA_TRACKER]?:  string[];
  [SHOP_IDS.STATUS]?:      ShopIdStatus | { name: ShopIdStatus };
  [SHOP_IDS.NOTES]?:       string;
  [key: string]: unknown;
}

export type ShopIdRecord = AirtableRecord<ShopIdFields>;

/** All Shop ID records, sorted numerically by Shop ID. */
export async function listAll(): Promise<ShopIdRecord[]> {
  const records = await airtable.list<ShopIdFields>('LEGAL', TABLE.SHOP_IDS, {});
  // Sort by numeric Shop ID so "6969" doesn't lex-sort before "20xx".
  return records.sort((a, b) => {
    const ai = parseInt((a.fields[SHOP_IDS.SHOP_ID] as string | undefined) ?? '0', 10);
    const bi = parseInt((b.fields[SHOP_IDS.SHOP_ID] as string | undefined) ?? '0', 10);
    return ai - bi;
  });
}
