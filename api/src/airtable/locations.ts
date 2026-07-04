import { airtable, type AirtableRecord } from './client.js';
import { LOCATIONS, TABLE, type LifecycleStage } from './tables.js';
import { type UserScope, hasGlobalAccess } from '../scope/rules.js';

export interface LocationFields {
  [LOCATIONS.SHOP_NAME]?: string;
  [LOCATIONS.SHOP_ID]?: string;
  [LOCATIONS.ADDRESS]?: string;
  [LOCATIONS.CITY]?: string;
  [LOCATIONS.STATE]?: string;
  [LOCATIONS.ZIP]?: string;
  [LOCATIONS.LIFECYCLE_STAGE]?: LifecycleStage;
  [LOCATIONS.TARGET_OPEN_DATE]?: string;
  [LOCATIONS.LOI_SIGNED_DATE]?: string;
  [LOCATIONS.LEASE_SIGNED_DATE]?: string;
  [LOCATIONS.FA_SIGNED_DATE]?: string;
  [LOCATIONS.ACTUAL_OPEN_DATE]?: string;
  [LOCATIONS.PRIMARY_FRANCHISEE_CONTACT]?: string[];
  [LOCATIONS.ASSIGNED_ATTORNEY]?: string[];
  [LOCATIONS.FRANCHISEE_ENTITY]?: string[];
  [key: string]: unknown;
}

export type LocationRecord = AirtableRecord<LocationFields>;

/** List Locations this user can see. */
export async function listForScope(scope: UserScope): Promise<LocationRecord[]> {
  if (hasGlobalAccess(scope)) {
    return airtable.list<LocationFields>('LEGAL', TABLE.LOCATIONS, {
      sort: [{ field: 'Shop Name', direction: 'asc' }],
    });
  }
  if (scope.accessibleLocationIds.length === 0) return [];
  // Pull by recordIds in batches of 100 (Airtable list accepts recordIds[] param).
  // The MCP-style approach uses a formula; we use OR(...) for simplicity.
  const idFormula = 'OR(' +
    scope.accessibleLocationIds.map(id => `RECORD_ID() = '${id}'`).join(',') +
    ')';
  return airtable.list<LocationFields>('LEGAL', TABLE.LOCATIONS, {
    filterByFormula: idFormula,
    sort: [{ field: 'Shop Name', direction: 'asc' }],
  });
}

/** Every Location record. Admin-only routes (reports, compliance, etc.). */
export async function listAll(): Promise<LocationRecord[]> {
  return airtable.list<LocationFields>('LEGAL', TABLE.LOCATIONS, {
    sort: [{ field: 'Shop Name', direction: 'asc' }],
  });
}

export async function getById(recordId: string): Promise<LocationRecord> {
  return airtable.get<LocationFields>('LEGAL', TABLE.LOCATIONS, recordId);
}
