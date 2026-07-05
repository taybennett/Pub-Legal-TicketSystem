/**
 * DocuSign endpoints.
 *
 *   POST /api/v1/docusign/envelope    Create + send an envelope. Admin-only.
 *   GET  /api/v1/docusign/envelope/:id Sync envelope status (calls DocuSign).
 *   GET  /api/v1/docusign/envelopes    Recent envelopes (dashboard).
 *   GET  /api/v1/docusign/envelopes/for-location/:id  Envelopes for a shop.
 *   POST /api/v1/docusign/webhook     Public Connect webhook. HMAC-verified.
 *   GET  /api/v1/docusign/callback    JWT consent redirect landing (no-op).
 */

import crypto from 'node:crypto';
import express, { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { config } from '../config.js';
import { requireAdmin, requireAuth } from '../auth/middleware.js';
import * as envelopes from '../airtable/docusignEnvelopes.js';
import * as docusignLib from '../lib/docusign.js';
import * as faTracker from '../airtable/faTracker.js';
import * as leases from '../airtable/leases.js';
import * as dras from '../airtable/dras.js';
import { airtable } from '../airtable/client.js';
import { DOCUSIGN_ENVELOPES, FA_TRACKER, TABLE } from '../airtable/tables.js';
import { logger } from '../util/logger.js';
import { BadRequestError, NotFoundError } from '../util/errors.js';

// ── Public webhook router (mounted without auth so DocuSign can POST here) ──

export const docusignWebhookRouter = Router();

// DocuSign Connect sends `application/xml` or `application/json` up to ~50 MB.
docusignWebhookRouter.use(express.json({ limit: '50mb', type: ['application/json'] }));
docusignWebhookRouter.use(express.text({ limit: '50mb', type: ['application/xml', 'text/xml'] }));

// GET /docusign/health — verify env vars + JWT auth without sending an envelope.
// Public (no auth) so it's easy to hit from a browser to smoke-test the setup.
// The endpoint only reveals a boolean + error message; no credentials leak.
docusignWebhookRouter.get('/health', async (_req: Request, res: Response) => {
  const result = await docusignLib.healthCheck();
  res.json(result);
});

docusignWebhookRouter.post('/webhook', async (req: Request, res: Response) => {
  const hmacKey = config.DOCUSIGN_WEBHOOK_HMAC_KEY;
  if (!hmacKey) {
    logger.error('DocuSign webhook fired but DOCUSIGN_WEBHOOK_HMAC_KEY not set');
    res.status(500).json({ error: 'webhook not configured' });
    return;
  }
  // Verify HMAC signature (DocuSign sends X-DocuSign-Signature-1)
  const providedSig = String(req.header('X-DocuSign-Signature-1') ?? '');
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const expectedSig = crypto.createHmac('sha256', hmacKey).update(rawBody).digest('base64');
  if (providedSig !== expectedSig) {
    logger.warn({ providedSig }, 'DocuSign webhook HMAC signature mismatch — rejecting');
    res.status(401).json({ error: 'invalid signature' });
    return;
  }

  // JSON payload — extract envelope info and update our record
  const payload = typeof req.body === 'string' ? safeParseJson(req.body) : req.body;
  const envelopeId = payload?.data?.envelopeId ?? payload?.envelopeId;
  const status     = payload?.data?.envelopeSummary?.status ?? payload?.status;
  if (!envelopeId || !status) {
    logger.warn({ payload }, 'DocuSign webhook missing envelopeId/status');
    res.status(200).json({ ok: true, warn: 'no envelopeId' });
    return;
  }

  try {
    await syncEnvelopeStatus(envelopeId);
    logger.info({ envelopeId, status }, 'DocuSign webhook processed');
    res.status(200).json({ ok: true });
  } catch (err) {
    logger.error({ err, envelopeId }, 'DocuSign webhook processing failed');
    // Always return 200 — DocuSign retries on non-2xx, we don't want infinite loops
    // for our own downstream bugs.
    res.status(200).json({ ok: false, warn: 'processing failed' });
  }
});

// ── Admin routes ──

export const docusignRouter = Router();
docusignRouter.use(requireAuth, requireAdmin);

// JWT consent redirect landing — DocuSign redirects here after the user grants
// consent. There's nothing to do; just show a success page.
docusignRouter.get('/callback', (_req: Request, res: Response) => {
  res.status(200).send('<html><body><h2>DocuSign consent granted.</h2><p>You can close this tab.</p></body></html>');
});

const recipientSchema = z.object({
  name:  z.string().min(1).max(200),
  email: z.string().email(),
  role:  z.enum(['franchisor', 'franchisee', 'guarantor']),
  guarantorIndex: z.number().int().min(1).max(20).optional(),
});

const documentSchema = z.object({
  name:       z.string().min(1).max(200),
  base64:     z.string().min(10),
  documentId: z.string().min(1).max(10),
});

const createEnvelopeSchema = z.object({
  subject:      z.string().min(1).max(300),
  message:      z.string().max(2000).optional(),
  documentType: z.enum(['Franchise Agreement', 'Franchise Agreement Package', 'Lease', 'DRA', 'Standing Addendum', 'Other']),
  documents:    z.array(documentSchema).min(1).max(10),
  recipients:   z.array(recipientSchema).min(1).max(20),
  relatedLocationId: z.string().startsWith('rec').length(17).optional(),
  relatedFaId:       z.string().startsWith('rec').length(17).optional(),
  relatedLeaseId:    z.string().startsWith('rec').length(17).optional(),
  relatedDraId:      z.string().startsWith('rec').length(17).optional(),
});

// POST /docusign/envelope — send + record
docusignRouter.post('/envelope', async (req: Request, res: Response) => {
  const parsed = createEnvelopeSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError('Invalid envelope payload', parsed.error.flatten());
  const f = parsed.data;

  // Send to DocuSign
  const sent = await docusignLib.sendEnvelope({
    subject:    f.subject,
    message:    f.message,
    documents:  f.documents,
    recipients: f.recipients,
  });

  // Persist a tracking record
  const nowIso = new Date().toISOString();
  const rec = await envelopes.create({
    [DOCUSIGN_ENVELOPES.SUBJECT]:       f.subject,
    [DOCUSIGN_ENVELOPES.ENVELOPE_ID]:   sent.envelopeId,
    [DOCUSIGN_ENVELOPES.STATUS]:        capitalize(sent.status),
    [DOCUSIGN_ENVELOPES.DOCUMENT_TYPE]: f.documentType,
    [DOCUSIGN_ENVELOPES.RECIPIENTS]:    JSON.stringify(f.recipients, null, 2),
    [DOCUSIGN_ENVELOPES.SENT_AT]:       nowIso,
    [DOCUSIGN_ENVELOPES.SENT_BY]:       req.user!.email ?? req.user!.sub,
    ...(f.relatedLocationId ? { [DOCUSIGN_ENVELOPES.RELATED_LOCATION]: [f.relatedLocationId] } : {}),
    ...(f.relatedFaId       ? { [DOCUSIGN_ENVELOPES.RELATED_FA]:       [f.relatedFaId] }       : {}),
    ...(f.relatedLeaseId    ? { [DOCUSIGN_ENVELOPES.RELATED_LEASE]:    [f.relatedLeaseId] }    : {}),
    ...(f.relatedDraId      ? { [DOCUSIGN_ENVELOPES.RELATED_DRA]:      [f.relatedDraId] }      : {}),
  });

  logger.info({ envelopeId: sent.envelopeId, recordId: rec.id, subject: f.subject }, 'DocuSign envelope tracked');
  res.status(201).json({
    envelopeId: sent.envelopeId,
    status:     sent.status,
    recordId:   rec.id,
  });
});

// GET /docusign/envelope/:envelopeId — force a status sync (calls DocuSign)
docusignRouter.get('/envelope/:envelopeId', async (req: Request, res: Response) => {
  const { envelopeId } = req.params;
  const status = await syncEnvelopeStatus(envelopeId);
  res.json(status);
});

// GET /docusign/envelopes — recent envelopes (dashboard)
docusignRouter.get('/envelopes', async (_req: Request, res: Response) => {
  const rows = await envelopes.listAll();
  res.json({ envelopes: rows.slice(0, 100).map(serializeEnvelope) });
});

// GET /docusign/envelopes/for-location/:id
docusignRouter.get('/envelopes/for-location/:id', async (req: Request, res: Response) => {
  const rows = await envelopes.listForLocation(req.params.id);
  res.json({ envelopes: rows.map(serializeEnvelope) });
});

// ── Helpers ──────────────────────────────────────────────────

async function syncEnvelopeStatus(envelopeId: string): Promise<{ status: string; completedAt?: string; alreadyDownloaded?: boolean }> {
  const record = await envelopes.findByEnvelopeId(envelopeId);
  if (!record) throw new NotFoundError('Envelope not found in tracker');

  const live = await docusignLib.getEnvelope(envelopeId);
  const normalizedStatus = capitalize(live.status);

  const currentStatus = record.fields[DOCUSIGN_ENVELOPES.STATUS] as string | undefined;
  const alreadyCompleted = currentStatus === 'Completed';

  const patch: Record<string, unknown> = {
    [DOCUSIGN_ENVELOPES.STATUS]: normalizedStatus,
  };
  if (live.completedAt && normalizedStatus === 'Completed') {
    patch[DOCUSIGN_ENVELOPES.COMPLETED_AT] = live.completedAt;
  }
  await envelopes.updateById(record.id, patch);

  // On first transition to Completed, download the signed PDF + propagate.
  // The signed PDF lands on THREE places:
  //   1. The DocuSign Envelopes tracker record (always)
  //   2. Every linked source record (FA Tracker / Lease / DRA) — the file
  //      shows up on the shop's Franchise Agreement / Real Estate / DRA tab
  //   3. For FA Tracker records specifically, we also set Status=Active and
  //      Execution Date=envelope completedAt. PUB Franchisor signs last, so
  //      completedAt IS the Effective Date per the FA template.
  if (normalizedStatus === 'Completed' && !alreadyCompleted) {
    try {
      const pdf = await docusignLib.downloadSignedPdf(envelopeId);
      const subject  = String(record.fields[DOCUSIGN_ENVELOPES.SUBJECT] ?? 'Envelope');
      const filename = safeFilename(subject) + '-Signed.pdf';
      const file = {
        filename,
        contentType: 'application/pdf',
        base64:      pdf.toString('base64'),
      };

      // 1. Envelope tracker record
      await envelopes.attachSignedPdf(record.id, file);
      logger.info({ envelopeId, filename }, 'Signed PDF attached to envelope record');

      const faLinks    = (record.fields[DOCUSIGN_ENVELOPES.RELATED_FA]    as string[] | undefined) ?? [];
      const leaseLinks = (record.fields[DOCUSIGN_ENVELOPES.RELATED_LEASE] as string[] | undefined) ?? [];
      const draLinks   = (record.fields[DOCUSIGN_ENVELOPES.RELATED_DRA]   as string[] | undefined) ?? [];

      // 2 + 3. FA Tracker: attach + flip Status/ExecDate
      for (const faId of faLinks) {
        try {
          await faTracker.attachFile(faId, file);
          const execDate = (live.completedAt ?? new Date().toISOString()).slice(0, 10);
          await airtable.update('LEGAL', TABLE.FA_TRACKER, faId, {
            [FA_TRACKER.STATUS]:         'Active',
            [FA_TRACKER.EXECUTION_DATE]: execDate,
          }, true);
          logger.info({ envelopeId, faId, execDate }, 'Signed PDF attached to FA Tracker record and Status flipped to Active');
        } catch (err) {
          logger.error({ err, envelopeId, faId }, 'Failed to attach signed PDF / update FA Tracker record');
        }
      }

      // 2. Leases
      for (const leaseId of leaseLinks) {
        try {
          await leases.attachFile(leaseId, file);
          logger.info({ envelopeId, leaseId }, 'Signed PDF attached to Lease record');
        } catch (err) {
          logger.error({ err, envelopeId, leaseId }, 'Failed to attach signed PDF to Lease record');
        }
      }

      // 2. DRAs
      for (const draId of draLinks) {
        try {
          await dras.attachDraFile(draId, file);
          logger.info({ envelopeId, draId }, 'Signed PDF attached to DRA record');
        } catch (err) {
          logger.error({ err, envelopeId, draId }, 'Failed to attach signed PDF to DRA record');
        }
      }
    } catch (err) {
      logger.error({ err, envelopeId }, 'Failed to download/attach signed PDF');
    }
  }

  return { status: normalizedStatus, completedAt: live.completedAt };
}

function serializeEnvelope(r: envelopes.DocusignEnvelopeRecord) {
  return {
    id:            r.id,
    subject:       r.fields[DOCUSIGN_ENVELOPES.SUBJECT] ?? null,
    envelopeId:    r.fields[DOCUSIGN_ENVELOPES.ENVELOPE_ID] ?? null,
    status:        r.fields[DOCUSIGN_ENVELOPES.STATUS] ?? null,
    documentType:  r.fields[DOCUSIGN_ENVELOPES.DOCUMENT_TYPE] ?? null,
    sentAt:        r.fields[DOCUSIGN_ENVELOPES.SENT_AT] ?? null,
    completedAt:   r.fields[DOCUSIGN_ENVELOPES.COMPLETED_AT] ?? null,
    sentBy:        r.fields[DOCUSIGN_ENVELOPES.SENT_BY] ?? null,
    recipients:    parseRecipients(r.fields[DOCUSIGN_ENVELOPES.RECIPIENTS] as string | undefined),
    signedDocuments: (r.fields[DOCUSIGN_ENVELOPES.SIGNED_DOCUMENTS] as { url: string; filename: string }[] | undefined) ?? [],
  };
}

function parseRecipients(raw: string | undefined): Array<{ name: string; email: string; role: string }> {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch { return []; }
}

function safeParseJson(s: string): Record<string, unknown> | null {
  try { return JSON.parse(s); } catch { return null; }
}

function capitalize(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function safeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '-').slice(0, 120);
}
