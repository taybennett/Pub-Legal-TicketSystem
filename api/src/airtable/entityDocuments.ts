/**
 * Entity Documents — corporate governance PDFs (Operating Agreement, SS-4,
 * Articles of Formation, Bylaws, etc.) attached to any Franchisee Entity.
 * Works for both parent (DRA-signing) and shop-level (FA-signing) entities.
 */

import { airtable, type AirtableRecord } from './client.js';
import { ENTITY_DOCUMENTS, TABLE, type EntityDocumentType } from './tables.js';

export interface EntityDocumentFields {
  [ENTITY_DOCUMENTS.TITLE]?:             string;
  [ENTITY_DOCUMENTS.DOCUMENT_TYPE]?:     EntityDocumentType | { name: EntityDocumentType };
  [ENTITY_DOCUMENTS.FRANCHISEE_ENTITY]?: string[]; // record IDs → Franchisee Entities
  [ENTITY_DOCUMENTS.FILE]?:              { url: string; filename: string; size?: number; type?: string }[];
  [ENTITY_DOCUMENTS.EFFECTIVE_DATE]?:    string;
  [ENTITY_DOCUMENTS.NOTES]?:             string;
  [key: string]: unknown;
}

export type EntityDocumentRecord = AirtableRecord<EntityDocumentFields>;

/** Every entity doc, sorted client-side by title. */
export async function listAll(): Promise<EntityDocumentRecord[]> {
  const records = await airtable.list<EntityDocumentFields>('LEGAL', TABLE.ENTITY_DOCUMENTS, {});
  return records.sort((a, b) => {
    const at = (a.fields[ENTITY_DOCUMENTS.TITLE] as string | undefined) ?? '';
    const bt = (b.fields[ENTITY_DOCUMENTS.TITLE] as string | undefined) ?? '';
    return at.localeCompare(bt);
  });
}

/** Docs linked to one specific Franchisee Entity. */
export async function listForEntity(entityRecordId: string): Promise<EntityDocumentRecord[]> {
  const all = await listAll();
  return all.filter(r => {
    const links = (r.fields[ENTITY_DOCUMENTS.FRANCHISEE_ENTITY] as string[] | undefined) ?? [];
    return links.includes(entityRecordId);
  });
}

export async function create(fields: EntityDocumentFields): Promise<EntityDocumentRecord> {
  return airtable.create<EntityDocumentFields>('LEGAL', TABLE.ENTITY_DOCUMENTS, fields, true);
}

export async function attachFile(
  recordId: string,
  file: { filename: string; contentType: string; base64: string },
): Promise<void> {
  await airtable.uploadAttachment('LEGAL', recordId, ENTITY_DOCUMENTS.FILE, file);
}

export async function remove(recordId: string): Promise<void> {
  await airtable.delete('LEGAL', TABLE.ENTITY_DOCUMENTS, recordId);
}

export async function getById(recordId: string): Promise<EntityDocumentRecord | null> {
  try {
    return await airtable.get<EntityDocumentFields>('LEGAL', TABLE.ENTITY_DOCUMENTS, recordId);
  } catch {
    return null;
  }
}
