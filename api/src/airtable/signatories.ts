/**
 * DRA Signatories — individuals tied to each DRA.
 * Owners (Exhibit C) carry an Ownership %, corporate signatories carry a
 * Title; a person can have both when they're in the bylaws AND own equity.
 * Percentages should sum to 100% across owners of a single DRA.
 */

import { airtable, type AirtableRecord } from './client.js';
import { DRA_SIGNATORIES, TABLE } from './tables.js';

export interface SignatoryFields {
  [DRA_SIGNATORIES.NAME]?:      string;
  [DRA_SIGNATORIES.DRA]?:       string[];
  [DRA_SIGNATORIES.EMAIL]?:     string;
  [DRA_SIGNATORIES.OWNERSHIP]?: number; // 0.0-1.0 (Airtable percent)
  [DRA_SIGNATORIES.TITLE]?:     string;
  [DRA_SIGNATORIES.PHONE]?:     string;
  [DRA_SIGNATORIES.NOTES]?:     string;
  [key: string]: unknown;
}

export type SignatoryRecord = AirtableRecord<SignatoryFields>;

/** All DRA Signatory records, sorted by ownership% desc then name. */
export async function listAll(): Promise<SignatoryRecord[]> {
  const records = await airtable.list<SignatoryFields>('LEGAL', TABLE.DRA_SIGNATORIES, {});
  return records.sort((a, b) => {
    const ao = (a.fields[DRA_SIGNATORIES.OWNERSHIP] as number | undefined) ?? -1;
    const bo = (b.fields[DRA_SIGNATORIES.OWNERSHIP] as number | undefined) ?? -1;
    if (bo !== ao) return bo - ao; // higher ownership first
    const an = (a.fields[DRA_SIGNATORIES.NAME] as string | undefined) ?? '';
    const bn = (b.fields[DRA_SIGNATORIES.NAME] as string | undefined) ?? '';
    return an.localeCompare(bn);
  });
}

/** All signatories linked to a given DRA record ID. */
export async function listForDra(draRecordId: string): Promise<SignatoryRecord[]> {
  const all = await listAll();
  return all.filter(r => {
    const links = (r.fields[DRA_SIGNATORIES.DRA] as string[] | undefined) ?? [];
    return links.includes(draRecordId);
  });
}

export async function create(fields: SignatoryFields): Promise<SignatoryRecord> {
  return airtable.create<SignatoryFields>('LEGAL', TABLE.DRA_SIGNATORIES, fields, true);
}

export async function update(recordId: string, fields: SignatoryFields): Promise<SignatoryRecord> {
  return airtable.update<SignatoryFields>('LEGAL', TABLE.DRA_SIGNATORIES, recordId, fields, true);
}

export async function remove(recordId: string): Promise<void> {
  await airtable.delete('LEGAL', TABLE.DRA_SIGNATORIES, recordId);
}
