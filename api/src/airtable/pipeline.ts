/**
 * Cross-base reads from PUB Development's Pipeline table.
 * Only used to hydrate the Construction tab in the franchisee portal.
 * Read-only. Scoped token.
 */

import { airtable, type AirtableRecord } from './client.js';
import { PIPELINE, TABLE } from './tables.js';

export interface PipelineFields {
  [PIPELINE.STORE_NAME]?: string;
  [PIPELINE.STORE_NUMBER]?: string;
  [PIPELINE.DEVELOPMENT_STATUS]?: { name: string } | string;
  [PIPELINE.PROJECTED_OPENING]?: string;
  [PIPELINE.LEASE_SIGNED]?: string;
  [PIPELINE.LEASE_STATUS]?: { name: string } | string;
  [PIPELINE.TERM]?: string;
  [PIPELINE.RENT]?: string;
  [PIPELINE.LEASE_OPTIONS]?: string;
  [PIPELINE.TEST_FIT_APPROVED]?: string;
  [PIPELINE.PERMIT_SUBMITTED]?: string;
  [PIPELINE.PERMIT_APPROVED]?: string;
  [PIPELINE.CONSTRUCTION_START]?: string;
  [PIPELINE.WEEKS_OUT_FROM_OPEN]?: number;
  [PIPELINE.FULL_ADDRESS]?: string;
  [key: string]: unknown;
}

export type PipelineRecord = AirtableRecord<PipelineFields>;

/**
 * Look up a Pipeline record by Shop Number, optionally disambiguated by
 * Shop Name when multiple records share a number (e.g. Thompson and
 * Thompson St-Remodel both carry Shop #1004).
 */
export async function findByShopNumber(shopNumber: string, shopName?: string): Promise<PipelineRecord | null> {
  if (!shopNumber) return null;
  const safe = shopNumber.replace(/'/g, "\\'");
  const records = await airtable.list<PipelineFields>('DEVELOPMENT', TABLE.PIPELINE, {
    filterByFormula: `{Store Number} = '${safe}'`,
  });
  if (records.length === 0) return null;
  if (records.length === 1 || !shopName) return records[0];
  const exact = records.find(r => (r.fields[PIPELINE.STORE_NAME] as string | undefined) === shopName);
  return exact ?? records[0];
}

export interface PipelineCandidate {
  shopName: string;
  status:   string;
}

/**
 * Bulk fetch all Pipeline records' Development Status keyed by Shop Number.
 * Returns an array per Shop Number so callers can disambiguate by Shop
 * Name when multiple records share a number.
 */
export async function listStatusesByShopNumber(): Promise<Map<string, PipelineCandidate[]>> {
  const records = await airtable.list<PipelineFields>('DEVELOPMENT', TABLE.PIPELINE, {});
  const out = new Map<string, PipelineCandidate[]>();
  for (const r of records) {
    const num  = r.fields[PIPELINE.STORE_NUMBER] as string | undefined;
    const name = (r.fields[PIPELINE.STORE_NAME] as string | undefined) ?? '';
    const raw  = r.fields[PIPELINE.DEVELOPMENT_STATUS];
    const status = !raw ? null : typeof raw === 'string' ? raw : (raw as { name: string }).name;
    if (num && status) {
      const list = out.get(num) ?? [];
      list.push({ shopName: name, status });
      out.set(num, list);
    }
  }
  return out;
}
