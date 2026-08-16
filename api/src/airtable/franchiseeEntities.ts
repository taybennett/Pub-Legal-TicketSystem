import { airtable, type AirtableRecord } from './client.js';
import { FRANCHISEE_ENTITIES, TABLE, type EntityLevel } from './tables.js';

export interface FranchiseeEntityFields {
  [FRANCHISEE_ENTITIES.ENTITY_NAME]?:      string;
  [FRANCHISEE_ENTITIES.PARENT_GROUP]?:     string[];
  [FRANCHISEE_ENTITIES.JURISDICTION]?:     string;
  [FRANCHISEE_ENTITIES.FORMATION_DATE]?:   string;
  [FRANCHISEE_ENTITIES.SIGNATORY_NAME]?:   string;
  [FRANCHISEE_ENTITIES.SIGNATORY_TITLE]?:  string;
  [FRANCHISEE_ENTITIES.NOTES]?:            string;
  [FRANCHISEE_ENTITIES.ENTITY_LEVEL]?:     EntityLevel | { name: EntityLevel };
  [key: string]: unknown;
}

export type FranchiseeEntityRecord = AirtableRecord<FranchiseeEntityFields>;

export async function listAll(): Promise<FranchiseeEntityRecord[]> {
  return airtable.list<FranchiseeEntityFields>('LEGAL', TABLE.FRANCHISEE_ENTITIES, {});
}

/** Entities whose Parent Group includes this DRA (record ID). */
export async function listForDra(draRecordId: string): Promise<FranchiseeEntityRecord[]> {
  const all = await listAll();
  return all.filter(r => {
    const links = (r.fields[FRANCHISEE_ENTITIES.PARENT_GROUP] as string[] | undefined) ?? [];
    return links.includes(draRecordId);
  });
}

export async function create(fields: FranchiseeEntityFields): Promise<FranchiseeEntityRecord> {
  return airtable.create<FranchiseeEntityFields>('LEGAL', TABLE.FRANCHISEE_ENTITIES, fields, true);
}

export async function update(recordId: string, fields: FranchiseeEntityFields): Promise<FranchiseeEntityRecord> {
  return airtable.update<FranchiseeEntityFields>('LEGAL', TABLE.FRANCHISEE_ENTITIES, recordId, fields, true);
}

export async function remove(recordId: string): Promise<void> {
  await airtable.delete('LEGAL', TABLE.FRANCHISEE_ENTITIES, recordId);
}

export async function getById(recordId: string): Promise<FranchiseeEntityRecord | null> {
  try {
    return await airtable.get<FranchiseeEntityFields>('LEGAL', TABLE.FRANCHISEE_ENTITIES, recordId);
  } catch {
    return null;
  }
}
