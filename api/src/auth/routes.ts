import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import * as users from '../airtable/users.js';
import { USERS } from '../airtable/tables.js';
import { BadRequestError, ForbiddenError, UnauthorizedError } from '../util/errors.js';
import { logger } from '../util/logger.js';
import { hashPin, isLegacyPin, verifyPin } from './pins.js';
import { COOKIE_NAME, cookieOptions, sign } from './tokens.js';
import { requireAuth } from './middleware.js';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  pin: z.string().min(4).max(20),
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = (req.body?.email ?? '').toString().toLowerCase();
    return `${req.ip}:${email}`;
  },
  message: { error: { code: 'rate_limited', message: 'Too many attempts. Try again in 15 minutes.' } },
});

authRouter.post('/verify', loginLimiter, async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError('Invalid email or PIN');
  const { email, pin } = parsed.data;

  const user = await users.findByEmail(email);
  if (!user) throw new UnauthorizedError('Email or PIN incorrect');

  const status = user.fields[USERS.PORTAL_STATUS];
  if (status === 'Suspended') throw new ForbiddenError('Account suspended. Contact your PUB Legal contact.');

  const stored = (user.fields[USERS.PIN] as string) ?? '';
  logger.info({ submittedPin: pin, submittedPinLen: pin.length, storedPinLen: stored.length, storedFirst2: stored.slice(0,2), userId: user.id, userEmail: user.fields[USERS.EMAIL] }, 'DEBUG login attempt');
  const ok = await verifyPin(pin, stored);
  if (!ok) throw new UnauthorizedError('Email or PIN incorrect');

  // Upgrade legacy plaintext PINs to bcrypt on successful login.
  if (isLegacyPin(stored)) {
    const hash = await hashPin(pin);
    await users.updatePinHash(user.id, hash);
    logger.info({ userId: user.id }, 'upgraded legacy PIN to bcrypt hash');
  }

  await users.updateLastLogin(user.id);

  const token = sign({
    sub: user.id,
    email: (user.fields[USERS.EMAIL] as string) ?? email,
    name: (user.fields[USERS.NAME] as string) ?? '',
    userType: (user.fields[USERS.USER_TYPE] as any) ?? 'Employee',
  });

  res.cookie(COOKIE_NAME, token, cookieOptions());
  res.json({
    user: {
      id: user.id,
      email: user.fields[USERS.EMAIL],
      name: user.fields[USERS.NAME],
      userType: user.fields[USERS.USER_TYPE] ?? 'Employee',
    },
  });
});

authRouter.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie(COOKIE_NAME, cookieOptions());
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req: Request, res: Response) => {
  // req.user is guaranteed after requireAuth
  const u = req.user!;
  res.json({
    user: {
      id: u.sub,
      email: u.email,
      name: u.name,
      userType: u.userType,
      scope: {
        accessibleLocationCount: u.scope.accessibleLocationIds.length,
        franchiseeGroupIds: u.scope.franchiseeGroupIds,
        globalAccess: u.scope.userType === 'Employee' || u.scope.userType === 'Admin',
      },
    },
  });
});
