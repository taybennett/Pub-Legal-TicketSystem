import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import type { UserType } from '../airtable/tables.js';

/**
 * JWT payload carried in the session cookie. Keep it small — just
 * identity + static scope. We resolve accessibleLocationIds on each
 * request rather than embedding them in the token, because location
 * scope can change (Taylor adds a new Entity to a Group), and we don't
 * want 30-day-old tokens granting stale access.
 */

export interface SessionClaims {
  sub: string;               // Airtable record ID of the Users row
  email: string;
  name: string;
  userType: UserType;
  // Issued at / expires at handled by jsonwebtoken automatically
}

const EXPIRES_IN_SECONDS = 60 * 60 * 24 * 30; // 30 days

export function sign(claims: SessionClaims): string {
  return jwt.sign(claims, config.JWT_SECRET, {
    expiresIn: EXPIRES_IN_SECONDS,
    issuer: 'pub-legal-api',
  });
}

export function verify(token: string): SessionClaims {
  const decoded = jwt.verify(token, config.JWT_SECRET, { issuer: 'pub-legal-api' });
  if (typeof decoded === 'string') {
    throw new Error('Unexpected string token payload');
  }
  return decoded as unknown as SessionClaims;
}

export const COOKIE_NAME = 'pub_session';

// deploy marker: force Railway to rebuild api with the configurable-cookie code.
export function cookieOptions(): import('express').CookieOptions {
  // COOKIE_DOMAIN empty → cookie scoped to the API's own host (works for
  // sandbox on .up.railway.app where api & portal are on different sites).
  // Set to ".popupbagels.com" once custom domains are wired up for prod.
  const domain = config.NODE_ENV === 'production' && config.COOKIE_DOMAIN
    ? config.COOKIE_DOMAIN
    : undefined;
  return {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: config.COOKIE_SAMESITE,
    domain,
    maxAge: EXPIRES_IN_SECONDS * 1000,
    path: '/',
  };
}
