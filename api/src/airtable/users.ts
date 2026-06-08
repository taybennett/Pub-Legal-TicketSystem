import { airtable, type AirtableRecord } from './client.js';
import { TABLE, USERS, type PortalStatus, type UserType } from './tables.js';

export interface UserFields {
  [USERS.NAME]?: string;
  [USERS.EMAIL]?: string;
  [USERS.PIN]?: string;
  [USERS.USER_TYPE]?: UserType;
  [USERS.FRANCHISEE_GROUP]?: string[];
  [USERS.ASSOCIATED_LOCATIONS]?: string[];
  [USERS.PORTAL_STATUS]?: PortalStatus;
  [USERS.LAST_LOGIN]?: string;
  [USERS.INVITATION_SENT]?: string;
  [key: string]: unknown;
}

export type UserRecord = AirtableRecord<UserFields>;

export async function findByEmail(email: string): Promise<UserRecord | null> {
  const records = await airtable.list<UserFields>('LEGAL', TABLE.USERS, {
    filterByFormula: `LOWER({Email}) = '${email.toLowerCase().replace(/'/g, "\\'")}'`,
    pageSize: 1,
  });
  return records[0] ?? null;
}

export async function findById(recordId: string): Promise<UserRecord> {
  return airtable.get<UserFields>('LEGAL', TABLE.USERS, recordId);
}

export async function updateLastLogin(recordId: string): Promise<void> {
  await airtable.update('LEGAL', TABLE.USERS, recordId, {
    [USERS.LAST_LOGIN]: new Date().toISOString(),
    [USERS.PORTAL_STATUS]: 'Active',
  });
}

export async function updatePinHash(recordId: string, hash: string): Promise<void> {
  await airtable.update('LEGAL', TABLE.USERS, recordId, {
    [USERS.PIN]: hash,
  });
}
