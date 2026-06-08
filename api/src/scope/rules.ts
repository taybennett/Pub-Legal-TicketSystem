/**
 * The authorization matrix, as code.
 *
 * Every resource-access decision in the API funnels through this file.
 * Keep it small, keep it pure, and cover it with tests before changing.
 */

import { airtable } from '../airtable/client.js';
import {
  FRANCHISEE_ENTITIES,
  TABLE,
  USERS,
  type UserType,
} from '../airtable/tables.js';
import { NotFoundError } from '../util/errors.js';

export interface UserScope {
  userType: UserType;
  /** Location record IDs this user can read / write tickets on. */
  accessibleLocationIds: string[];
  /** Franchisee Group record IDs (for logging / display). */
  franchiseeGroupIds: string[];
}

interface UsersFields {
  [k: string]: unknown;
}

/**
 * Resolve the authorization scope for a user.
 *
 * Rules:
 *   - Admin & Employee see everything (accessibleLocationIds = [] means
 *     "no filter" for these user types; check userType first).
 *   - Franchisee/Partner: derive from Franchisee Group membership.
 *     Walk Group → Entities → Locations. If Associated Locations is
 *     populated, use that list INSTEAD (override, narrower or wider).
 */
export async function resolveUserScope(userRecordId: string): Promise<UserScope> {
  const user = await airtable.get<UsersFields>('LEGAL', TABLE.USERS, userRecordId);
  if (!user) throw new NotFoundError('User not found');

  const userType = (user.fields[USERS.USER_TYPE] as UserType) ?? 'Employee';
  const associated = (user.fields[USERS.ASSOCIATED_LOCATIONS] as string[] | undefined) ?? [];
  const groupIds = (user.fields[USERS.FRANCHISEE_GROUP] as string[] | undefined) ?? [];

  // Employees and Admins have no location filter applied.
  if (userType === 'Employee' || userType === 'Admin') {
    return { userType, accessibleLocationIds: [], franchiseeGroupIds: [] };
  }

  // If Associated Locations is explicitly set, it's the authoritative scope.
  if (associated.length > 0) {
    return { userType, accessibleLocationIds: associated, franchiseeGroupIds: groupIds };
  }

  // Otherwise derive from Groups → Entities → Locations.
  if (groupIds.length === 0) {
    return { userType, accessibleLocationIds: [], franchiseeGroupIds: [] };
  }

  // Walk each group's linked Entities, collect their Locations.
  // Airtable query: filter Entities where Parent Group has any of these group IDs.
  // We use a formula: OR(FIND('grpId', ARRAYJOIN({Parent Group})), ...)
  const entityFormula = 'OR(' + groupIds.map(id => `FIND('${id}', ARRAYJOIN({Parent Group}))`).join(',') + ')';
  const entities = await airtable.list<{ [k: string]: unknown }>(
    'LEGAL',
    TABLE.FRANCHISEE_ENTITIES,
    { filterByFormula: entityFormula, fields: [FRANCHISEE_ENTITIES.LOCATIONS] },
  );

  const locationIds = new Set<string>();
  for (const ent of entities) {
    const locs = (ent.fields[FRANCHISEE_ENTITIES.LOCATIONS] as string[] | undefined) ?? [];
    locs.forEach(id => locationIds.add(id));
  }

  return {
    userType,
    accessibleLocationIds: Array.from(locationIds),
    franchiseeGroupIds: groupIds,
  };
}

/**
 * True if the user has unrestricted cross-franchisee access.
 * Use this to short-circuit scope filters for staff.
 */
export function hasGlobalAccess(scope: UserScope): boolean {
  return scope.userType === 'Employee' || scope.userType === 'Admin';
}

/**
 * True if the user can read records linked to this Location.
 */
export function canAccessLocation(scope: UserScope, locationId: string): boolean {
  if (hasGlobalAccess(scope)) return true;
  return scope.accessibleLocationIds.includes(locationId);
}
