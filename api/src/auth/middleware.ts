import type { NextFunction, Request, Response } from 'express';
import type { UserType } from '../airtable/tables.js';
import { ForbiddenError, UnauthorizedError } from '../util/errors.js';
import { COOKIE_NAME, verify, type SessionClaims } from './tokens.js';
import { resolveUserScope, type UserScope } from '../scope/rules.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionClaims & { scope: UserScope };
    }
  }
}

/**
 * requireAuth validates the session cookie, attaches req.user with the
 * session claims, and resolves the user's location scope from Airtable
 * (walking Franchisee Group → Entities → Locations, or using the
 * Associated Locations override if set).
 *
 * The scope lookup happens on every request — not cached in the JWT —
 * so that access changes Taylor makes in Airtable take effect on the
 * next request without requiring logout/login.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) throw new UnauthorizedError();
    const claims = verify(token);
    const scope = await resolveUserScope(claims.sub);
    req.user = { ...claims, scope };
    next();
  } catch (err) {
    if (err instanceof UnauthorizedError) next(err);
    else next(new UnauthorizedError('Session invalid or expired'));
  }
}

function requireUserType(...allowed: UserType[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new UnauthorizedError());
    if (!allowed.includes(req.user.userType)) return next(new ForbiddenError());
    next();
  };
}

export const requireEmployee = requireUserType('Employee', 'Admin');
export const requireAdmin    = requireUserType('Admin');
