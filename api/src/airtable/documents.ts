import { airtable, type AirtableRecord } from './client.js';
import {
  DOCUMENTS,
  TABLE,
  type DocumentType,
  type UploadedByRole,
} from './tables.js';

export interface DocumentFields {
  [DOCUMENTS.FILENAME]?: string;
  [DOCUMENTS.FILE_TYPE]?: string;
  [DOCUMENTS.FILE_SIZE]?: string;
  [DOCUMENTS.UPLOADED_BY]?: string;
  [DOCUMENTS.FILE]?: unknown[];
  [DOCUMENTS.TICKET]?: string[];
  [DOCUMENTS.LOCATION]?: string[];
  [DOCUMENTS.DOCUMENT_TYPE]?: DocumentType;
  [DOCUMENTS.VERSION]?: number;
  [DOCUMENTS.UPLOADED_BY_ROLE]?: UploadedByRole;
  [DOCUMENTS.PARENT_DOCUMENT]?: string[];
  [key: string]: unknown;
}

export type DocumentRecord = AirtableRecord<DocumentFields>;

export async function listForTicket(ticketId: string): Promise<DocumentRecord[]> {
  return airtable.list<DocumentFields>('LEGAL', TABLE.DOCUMENTS, {
    filterByFormula: `FIND('${ticketId}', ARRAYJOIN({Ticket}))`,
    sort: [{ field: 'Uploaded At', direction: 'asc' }],
  });
}

export async function listForLocation(locationId: string, documentType?: DocumentType): Promise<DocumentRecord[]> {
  const clauses: string[] = [`FIND('${locationId}', ARRAYJOIN({Location}))`];
  if (documentType) clauses.push(`{Document Type} = '${documentType.replace(/'/g, "\\'")}'`);
  const formula = clauses.length === 1 ? clauses[0] : `AND(${clauses.join(',')})`;
  return airtable.list<DocumentFields>('LEGAL', TABLE.DOCUMENTS, {
    filterByFormula: formula,
    sort: [{ field: 'Uploaded At', direction: 'desc' }],
  });
}

export async function create(fields: DocumentFields): Promise<DocumentRecord> {
  return airtable.create<DocumentFields>('LEGAL', TABLE.DOCUMENTS, fields);
}

export async function attachFile(recordId: string, file: { filename: string; contentType: string; base64: string }): Promise<void> {
  await airtable.uploadAttachment('LEGAL', recordId, DOCUMENTS.FILE, file);
}
