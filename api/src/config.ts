import { z } from 'zod';
import 'dotenv/config';

const schema = z.object({
  AIRTABLE_PAT_LEGAL:       z.string().min(10),
  AIRTABLE_BASE_LEGAL:      z.string().startsWith('app').length(17),
  AIRTABLE_PAT_DEVELOPMENT: z.string().min(10),
  AIRTABLE_BASE_DEVELOPMENT:z.string().startsWith('app').length(17),
  JWT_SECRET:               z.string().min(32),
  COOKIE_DOMAIN:            z.string().default('.popupbagels.com'),
  POSTMARK_TOKEN:           z.string().min(10),
  EMAIL_FROM:               z.string().email(),
  EMAIL_FROM_NAME:          z.string().default('PUB Legal Portal'),
  FRONTEND_URL_LEGAL:       z.string().url(),
  FRONTEND_URL_PORTAL:      z.string().url(),
  NODE_ENV:                 z.enum(['development', 'production', 'test']).default('development'),
  PORT:                     z.string().default('8080').transform(Number),
  LOG_LEVEL:                z.enum(['fatal','error','warn','info','debug','trace']).default('info'),
});

// Trim whitespace and CR/LF from all env vars — Windows .env saves often leave
// trailing \r that dotenv doesn't strip, which corrupts Authorization headers.
const cleanEnv: Record<string, string | undefined> = {};
for (const [k, v] of Object.entries(process.env)) {
  cleanEnv[k] = typeof v === 'string' ? v.trim() : v;
}

const parsed = schema.safeParse(cleanEnv);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
