/**
 * Minimal Airtable REST client. We don't use the `airtable` npm package
 * for table queries because we want full control over URL construction
 * (cross-base reads, custom filter/sort params, pagination). We do use
 * it for attachment uploads where convenience outweighs control.
 */

import { config } from '../config.js';
import { InternalError } from '../util/errors.js';
import { logger } from '../util/logger.js';
import { BASE } from './tables.js';

type Base = 'LEGAL' | 'DEVELOPMENT';

const API_HOST = 'https://api.airtable.com/v0';
const CONTENT_HOST = 'https://content.airtable.com/v0';

function tokenFor(base: Base): string {
  return base === 'LEGAL' ? config.AIRTABLE_PAT_LEGAL : config.AIRTABLE_PAT_DEVELOPMENT;
}

function baseIdFor(base: Base): string {
  return BASE[base];
}

export interface AirtableRecord<F = Record<string, unknown>> {
  id: string;
  createdTime: string;
  fields: F;
}

export interface ListParams {
  filterByFormula?: string;
  fields?: string[];
  sort?: { field: string; direction?: 'asc' | 'desc' }[];
  pageSize?: number;
  offset?: string;
  view?: string;
}

export interface ListResponse<F> {
  records: AirtableRecord<F>[];
  offset?: string;
}

async function request(
  base: Base,
  method: string,
  path: string,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<unknown> {
  const url = new URL(`${API_HOST}/${baseIdFor(base)}/${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) v.forEach(item => url.searchParams.append(k, String(item)));
      else url.searchParams.append(k, String(v));
    }
  }

  // Airtable returns field-name-keyed data by default; we use field IDs
  // everywhere in this codebase, so force ID keying on reads and writes.
  url.searchParams.set('returnFieldsByFieldId', 'true');
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${tokenFor(base)}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error({ base, method, path, status: res.status, body: text }, 'airtable request failed');
    throw new InternalError(`Airtable ${method} ${path} failed: ${res.status}`);
  }

  return res.json();
}

export const airtable = {
  /** List all records from a table, auto-paginating. */
  async list<F>(base: Base, tableId: string, params: ListParams = {}): Promise<AirtableRecord<F>[]> {
    const all: AirtableRecord<F>[] = [];
    let offset: string | undefined;
    do {
      const qs: Record<string, unknown> = { ...params, offset };
      if (params.sort) {
        // Airtable wants sort[0][field] and sort[0][direction] as separate params.
        // Simpler: let URLSearchParams handle each one manually.
        delete qs.sort;
      }
      const url = new URL(`${API_HOST}/${baseIdFor(base)}/${tableId}`);
      for (const [k, v] of Object.entries(qs)) {
        if (v === undefined || v === null) continue;
        if (Array.isArray(v)) v.forEach(item => url.searchParams.append(k, String(item)));
        else url.searchParams.append(k, String(v));
      }
      if (params.sort) {
        params.sort.forEach((s, i) => {
          url.searchParams.append(`sort[${i}][field]`, s.field);
          if (s.direction) url.searchParams.append(`sort[${i}][direction]`, s.direction);
        });
      }
      url.searchParams.set('returnFieldsByFieldId', 'true');
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${tokenFor(base)}` },
      });
      if (!res.ok) {
        const text = await res.text();
        logger.error({ base, tableId, status: res.status, body: text }, 'airtable list failed');
        throw new InternalError(`Airtable list ${tableId} failed: ${res.status}`);
      }
      const page = (await res.json()) as ListResponse<F>;
      all.push(...page.records);
      offset = page.offset;
    } while (offset);
    return all;
  },

  async get<F>(base: Base, tableId: string, recordId: string): Promise<AirtableRecord<F>> {
    return request(base, 'GET', `${tableId}/${recordId}`) as Promise<AirtableRecord<F>>;
  },

  async create<F>(base: Base, tableId: string, fields: Record<string, unknown>, typecast = false): Promise<AirtableRecord<F>> {
    const body = { records: [{ fields }], typecast };
    const res = (await request(base, 'POST', tableId, undefined, body)) as { records: AirtableRecord<F>[] };
    return res.records[0];
  },

  async update<F>(base: Base, tableId: string, recordId: string, fields: Record<string, unknown>, typecast = false): Promise<AirtableRecord<F>> {
    const body = { fields, typecast };
    return request(base, 'PATCH', `${tableId}/${recordId}`, undefined, body) as Promise<AirtableRecord<F>>;
  },

  async delete(base: Base, tableId: string, recordId: string): Promise<void> {
    await request(base, 'DELETE', `${tableId}/${recordId}`);
  },

  /** Attach a file to a record via Airtable's content API. */
  async uploadAttachment(base: Base, recordId: string, fieldId: string, file: { filename: string; contentType: string; base64: string }): Promise<AirtableRecord> {
    const url = `${CONTENT_HOST}/${baseIdFor(base)}/${recordId}/${fieldId}/uploadAttachment`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenFor(base)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contentType: file.contentType,
        filename: file.filename,
        file: file.base64,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      logger.error({ status: res.status, body: text }, 'attachment upload failed');
      throw new InternalError(`Attachment upload failed: ${res.status}`);
    }
    return res.json() as Promise<AirtableRecord>;
  },
};
