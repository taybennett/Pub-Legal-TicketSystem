import { airtable, type AirtableRecord } from './client.js';
import { DOCUSIGN_ENVELOPES, TABLE } from './tables.js';

export interface DocusignEnvelopeFields {
  [DOCUSIGN_ENVELOPES.SUBJECT]?: string;
  [DOCUSIGN_ENVELOPES.ENVELOPE_ID]?: string;
  [DOCUSIGN_ENVELOPES.STATUS]?: string;
  [DOCUSIGN_ENVELOPES.DOCUMENT_TYPE]?: string;
  [DOCUSIGN_ENVELOPES.RECIPIENTS]?: string;
  [DOCUSIGN_ENVELOPES.RELATED_LOCATION]?: string[];
  [DOCUSIGN_ENVELOPES.RELATED_FA]?: string[];
  [DOCUSIGN_ENVELOPES.RELATED_LEASE]?: string[];
  [DOCUSIGN_ENVELOPES.RELATED_DRA]?: string[];
  [DOCUSIGN_ENVELOPES.SENT_AT]?: string;
  [DOCUSIGN_ENVELOPES.COMPLETED_AT]?: string;
  [DOCUSIGN_ENVELOPES.SIGNED_DOCUMENTS]?: { url: string; filename: string; size?: number; type?: string }[];
  [DOCUSIGN_ENVELOPES.NOTES]?: string;
  [DOCUSIGN_ENVELOPES.SENT_BY]?: string;
  [key: string]: unknown;
}

export type DocusignEnvelopeRecord = AirtableRecord<DocusignEnvelopeFields>;

export async function create(fields: DocusignEnvelopeFields): Promise<DocusignEnvelopeRecord> {
  return airtable.create<DocusignEnvelopeFields>('LEGAL', TABLE.DOCUSIGN_ENVELOPES, fields, true);
}

export async function updateById(recordId: string, fields: DocusignEnvelopeFields): Promise<DocusignEnvelopeRecord> {
  return airtable.update<DocusignEnvelopeFields>('LEGAL', TABLE.DOCUSIGN_ENVELOPES, recordId, fields);
}

/** Find an envelope record by its DocuSign envelope UUID. */
export async function findByEnvelopeId(envelopeId: string): Promise<DocusignEnvelopeRecord | null> {
  if (!envelopeId) return null;
  const all = await airtable.list<DocusignEnvelopeFields>('LEGAL', TABLE.DOCUSIGN_ENVELOPES, {});
  return all.find(r => (r.fields[DOCUSIGN_ENVELOPES.ENVELOPE_ID] as string | undefined) === envelopeId) ?? null;
}

/** Envelopes related to a specific Location, most recent first. */
export async function listForLocation(locationId: string): Promise<DocusignEnvelopeRecord[]> {
  if (!locationId) return [];
  const all = await airtable.list<DocusignEnvelopeFields>('LEGAL', TABLE.DOCUSIGN_ENVELOPES, {});
  const matched = all.filter(r => {
    const links = (r.fields[DOCUSIGN_ENVELOPES.RELATED_LOCATION] as string[] | undefined) ?? [];
    return links.includes(locationId);
  });
  return matched.sort((a, b) => {
    const da = (a.fields[DOCUSIGN_ENVELOPES.SENT_AT] as string | undefined) ?? '';
    const db = (b.fields[DOCUSIGN_ENVELOPES.SENT_AT] as string | undefined) ?? '';
    return db.localeCompare(da);
  });
}

/** All envelopes, most recent first — for the admin dashboard. */
export async function listAll(): Promise<DocusignEnvelopeRecord[]> {
  const all = await airtable.list<DocusignEnvelopeFields>('LEGAL', TABLE.DOCUSIGN_ENVELOPES, {});
  return all.sort((a, b) => {
    const da = (a.fields[DOCUSIGN_ENVELOPES.SENT_AT] as string | undefined) ?? '';
    const db = (b.fields[DOCUSIGN_ENVELOPES.SENT_AT] as string | undefined) ?? '';
    return db.localeCompare(da);
  });
}

/** Attach a signed PDF (from DocuSign) to an envelope record. */
export async function attachSignedPdf(recordId: string, file: { filename: string; contentType: string; base64: string }): Promise<void> {
  await airtable.uploadAttachment('LEGAL', recordId, DOCUSIGN_ENVELOPES.SIGNED_DOCUMENTS, file);
}
