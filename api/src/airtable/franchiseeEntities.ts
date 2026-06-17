import { airtable, type AirtableRecord } from './client.js';
import { FRANCHISEE_ENTITIES, TABLE } from './tables.js';

export interface FranchiseeEntityFields {
  [FRANCHISEE_ENTITIES.ENTITY_NAME]?: string;
  [FRANCHISEE_ENTITIES.PARENT_GROUP]?: string[];
  [FRANCHISEE_ENTITIES.JURISDICTION]?: string;
  [key: string]: unknown;
}

export type FranchiseeEntityRecord = AirtableRecord<FranchiseeEntityFields>;

export async function listAll(): Promise<FranchiseeEntityRecord[]> {
  return airtable.list<FranchiseeEntityFields>('LEGAL', TABLE.FRANCHISEE_ENTITIES, {});
}
