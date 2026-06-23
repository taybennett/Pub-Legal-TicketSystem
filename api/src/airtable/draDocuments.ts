import { airtable, type AirtableRecord } from './client.js';
import { DRA_DOCUMENTS, TABLE } from './tables.js';

export interface DraDocumentFields {
  [DRA_DOCUMENTS.TITLE]?: string;
  [DRA_DOCUMENTS.PARENT_DRA]?: string[];
  [DRA_DOCUMENTS.DOCUMENT_TYPE]?: string | { name: string };
  [DRA_DOCUMENTS.AMENDMENT_NUMBER]?: number;
  [DRA_DOCUMENTS.ADDENDUM_NAME]?: string;
  [DRA_DOCUMENTS.EFFECTIVE_DATE]?: string;
  [DRA_DOCUMENTS.FILE]?: { url: string; filename: string; size?: number; type?: string }[];
  [DRA_DOCUMENTS.NOTES]?: string;
  [DRA_DOCUMENTS.SIGNATORIES]?: string;
  [key: string]: unknown;
}

export type DraDocumentRecord = AirtableRecord<DraDocumentFields>;

export async function create(fields: DraDocumentFields): Promise<DraDocumentRecord> {
  return airtable.create<DraDocumentFields>('LEGAL', TABLE.DRA_DOCUMENTS, fields);
}

export async function getById(recordId: string): Promise<DraDocumentRecord> {
  return airtable.get<DraDocumentFields>('LEGAL', TABLE.DRA_DOCUMENTS, recordId);
}

export async function remove(recordId: string): Promise<void> {
  await airtable.delete('LEGAL', TABLE.DRA_DOCUMENTS, recordId);
}

export async function attachFile(recordId: string, file: { filename: string; contentType: string; base64: string }): Promise<void> {
  await airtable.uploadAttachment('LEGAL', recordId, DRA_DOCUMENTS.FILE, file);
}

/** All DRA Documents whose Parent DRA links to the given DRA record. */
export async function listForDra(draId: string): Promise<DraDocumentRecord[]> {
  // Pull all docs and filter client-side. The table is small (a handful of rows
  // per DRA) and this avoids fragile filterByFormula syntax around linked records.
  const records = await airtable.list<DraDocumentFields>('LEGAL', TABLE.DRA_DOCUMENTS, {});
  return records.filter(r => {
    const parents = (r.fields[DRA_DOCUMENTS.PARENT_DRA] as string[] | undefined) ?? [];
    return parents.includes(draId);
  });
}
