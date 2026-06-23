import { Router, type Request, type Response } from 'express';
import { Readable } from 'node:stream';

import { requireAuth } from '../auth/middleware.js';
import { BadRequestError, ForbiddenError } from '../util/errors.js';
import { logger } from '../util/logger.js';

/**
 * Proxies file fetches from Airtable's signed attachment URLs so the
 * browser receives them with `Content-Disposition: inline` instead of
 * `attachment`. That lets the portal render PDFs inside an iframe modal
 * rather than triggering a download every time.
 *
 * The proxy is auth-gated and the upstream host is restricted to known
 * Airtable attachment domains to prevent SSRF.
 */
export const filesRouter = Router();

filesRouter.use(requireAuth);

const ALLOWED_HOSTS = [
  /\.airtableusercontent\.com$/i,
  /^airtableusercontent\.com$/i,
];

function isAllowedUrl(rawUrl: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (!ALLOWED_HOSTS.some(re => re.test(parsed.hostname))) return null;
  return parsed;
}

filesRouter.get('/proxy', async (req: Request, res: Response) => {
  const rawUrl = req.query.url;
  if (typeof rawUrl !== 'string' || !rawUrl) {
    throw new BadRequestError('Missing url query parameter');
  }
  const parsed = isAllowedUrl(rawUrl);
  if (!parsed) {
    throw new ForbiddenError('URL host not allowed');
  }

  // `Response` is shadowed by Express's Response type in this file, so we
  // can't annotate `upstream` with it directly — let TS infer the global one.
  let upstream;
  try {
    upstream = await fetch(parsed.toString());
  } catch (err) {
    logger.warn({ err, host: parsed.hostname }, 'file proxy: upstream fetch failed');
    res.status(502).json({ error: { code: 'upstream_unreachable', message: 'Failed to fetch file' } });
    return;
  }

  if (!upstream.ok || !upstream.body) {
    logger.warn({ status: upstream.status, host: parsed.hostname }, 'file proxy: upstream not OK');
    res.status(upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502)
      .json({ error: { code: 'upstream_error', message: `Upstream returned ${upstream.status}` } });
    return;
  }

  // Mirror Content-Type from upstream (default to PDF since that's our caller).
  const contentType = upstream.headers.get('content-type') ?? 'application/pdf';
  res.setHeader('Content-Type', contentType);

  // Force inline so the iframe renders rather than downloads.
  const filename = extractFilename(upstream.headers.get('content-disposition'));
  res.setHeader('Content-Disposition', `inline; filename="${sanitizeForHeader(filename)}"`);

  // Short private cache so quickly re-opening the same PDF in the modal is snappy.
  res.setHeader('Cache-Control', 'private, max-age=300');

  const contentLength = upstream.headers.get('content-length');
  if (contentLength) res.setHeader('Content-Length', contentLength);

  // Stream the body. fetch's body is a web ReadableStream; Readable.fromWeb wraps it for Node.
  // The `as any` is needed because @types/node's fromWeb signature is narrower than what fetch returns.
  Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
});

/** Pull `filename=...` out of a Content-Disposition header (handles both `filename` and `filename*`). */
function extractFilename(cd: string | null): string {
  if (!cd) return 'document.pdf';
  const star = cd.match(/filename\*=(?:utf-8'')?["']?([^;"']+)["']?/i);
  if (star) {
    try { return decodeURIComponent(star[1]); } catch { /* fall through */ }
  }
  const plain = cd.match(/filename=["']?([^;"']+)["']?/i);
  if (plain) return plain[1];
  return 'document.pdf';
}

/** Strip characters that would break the header (`"`, CR, LF) before re-quoting. */
function sanitizeForHeader(s: string): string {
  return s.replace(/[\r\n"]/g, '').slice(0, 255);
}
