/**
 * DocuSign client wrapper. JWT server-to-server auth (no user browser flow).
 *
 * Anchor-based tab placement: the templates embed invisible anchor strings
 * (e.g., `\sig_franchisee\`) that DocuSign finds in the rendered PDF and
 * uses to place signature/date tabs. No pixel coordinates — the template
 * can be edited freely and tabs re-anchor to the same markers.
 *
 * Routing: franchisee + guarantors sign in parallel (routingOrder=1),
 * then PUB Franchisor countersigns (routingOrder=2). Franchisor date
 * becomes the Effective Date.
 */

import docusign from 'docusign-esign';
import { config } from '../config.js';
import { logger } from '../util/logger.js';

/** Recipient in an envelope we're about to create. */
export interface EnvelopeRecipient {
  name:          string;
  email:         string;
  /** 'franchisor' | 'franchisee' | 'guarantor' — drives anchor prefix + routing. */
  role:          'franchisor' | 'franchisee' | 'guarantor';
  /** For guarantors, 1-based index used in anchor strings (e.g. \sig_guarantor_2\). */
  guarantorIndex?: number;
}

/** Individual document in an envelope. */
export interface EnvelopeDocument {
  name:       string;   // e.g., "Ardmore Franchise Agreement.pdf"
  base64:     string;   // base64-encoded PDF content
  /** Order the docs appear in the DocuSign envelope UI. Starts at 1. */
  documentId: string;
}

/** Input to createEnvelope. */
export interface CreateEnvelopeInput {
  subject:    string;
  message?:   string;
  documents:  EnvelopeDocument[];
  recipients: EnvelopeRecipient[];
}

// ── JWT auth (server-to-server) ──────────────────────────────

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

/** Get a bearer access token, refreshing via JWT grant if needed. */
async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60_000) {
    return cachedAccessToken.token;
  }
  const key    = config.DOCUSIGN_INTEGRATION_KEY;
  const userId = config.DOCUSIGN_USER_ID;
  const rsa    = config.DOCUSIGN_RSA_PRIVATE_KEY;
  const baseUrl = config.DOCUSIGN_BASE_URL;
  if (!key || !userId || !rsa || !baseUrl) {
    throw new Error('DocuSign is not configured. Set DOCUSIGN_INTEGRATION_KEY, DOCUSIGN_USER_ID, DOCUSIGN_ACCOUNT_ID, DOCUSIGN_BASE_URL, DOCUSIGN_RSA_PRIVATE_KEY, DOCUSIGN_WEBHOOK_HMAC_KEY.');
  }

  const apiClient = new docusign.ApiClient();
  // JWT auth always goes to account.docusign.com (or account-d for demo);
  // the base URL is only used for envelope operations after the token exists.
  apiClient.setOAuthBasePath(baseUrl.includes('demo') ? 'account-d.docusign.com' : 'account.docusign.com');

  const result = await apiClient.requestJWTUserToken(
    key,
    userId,
    ['signature', 'impersonation'],
    Buffer.from(rsa),
    3600,  // token lifetime in seconds
  );

  const body = result.body as { access_token: string; expires_in: number };
  cachedAccessToken = {
    token:     body.access_token,
    expiresAt: now + (body.expires_in * 1000),
  };
  return body.access_token;
}

/** Configured ApiClient with bearer token set on the correct base URL. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getApiClient(): Promise<any> {
  const token = await getAccessToken();
  const client = new docusign.ApiClient();
  client.setBasePath(`${config.DOCUSIGN_BASE_URL!}/restapi`);
  client.addDefaultHeader('Authorization', `Bearer ${token}`);
  return client;
}

// ── Envelope creation ─────────────────────────────────────────

/**
 * Build a DocuSign EnvelopeDefinition with anchor-based signer tabs.
 * Templates use invisible white anchor strings that DocuSign auto-finds.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildEnvelopeDefinition(input: CreateEnvelopeInput): any {
  const env = new docusign.EnvelopeDefinition();
  env.emailSubject = input.subject;
  if (input.message) env.emailBlurb = input.message;
  env.status = 'sent';

  // Documents (DocuSign wants { name, fileExtension, documentId, documentBase64 })
  env.documents = input.documents.map(d => {
    const doc = new docusign.Document();
    doc.documentBase64 = d.base64;
    doc.name = d.name;
    doc.fileExtension = d.name.split('.').pop() ?? 'pdf';
    doc.documentId = d.documentId;
    return doc;
  });

  // Signers with anchor tabs. RoutingOrder:
  //   1 = franchisee + guarantors sign in parallel
  //   2 = PUB Franchisor countersigns
  const signers = input.recipients.map((r, idx) => {
    const signer = new docusign.Signer();
    signer.email = r.email;
    signer.name  = r.name;
    signer.recipientId = String(idx + 1);
    signer.routingOrder = r.role === 'franchisor' ? '2' : '1';

    const anchor = buildAnchor(r);
    signer.tabs = new docusign.Tabs();
    signer.tabs.signHereTabs = [
      Object.assign(new docusign.SignHere(), {
        anchorString:       `\\sig_${anchor}\\`,
        anchorUnits:        'pixels',
        anchorXOffset:      '0',
        anchorYOffset:      '0',
        anchorIgnoreIfNotPresent: 'true',  // don't error if anchor missing in a doc
      }),
    ];
    signer.tabs.dateSignedTabs = [
      Object.assign(new docusign.DateSigned(), {
        anchorString:       `\\date_${anchor}\\`,
        anchorUnits:        'pixels',
        anchorXOffset:      '0',
        anchorYOffset:      '0',
        anchorIgnoreIfNotPresent: 'true',
      }),
    ];
    return signer;
  });

  env.recipients = new docusign.Recipients();
  env.recipients.signers = signers;
  return env;
}

function buildAnchor(r: EnvelopeRecipient): string {
  if (r.role === 'franchisor')  return 'franchisor';
  if (r.role === 'franchisee')  return 'franchisee';
  if (r.role === 'guarantor')   return `guarantor_${r.guarantorIndex ?? 1}`;
  return r.role;
}

/** Send an envelope. Returns the DocuSign envelope UUID. */
export async function sendEnvelope(input: CreateEnvelopeInput): Promise<{ envelopeId: string; status: string }> {
  const client = await getApiClient();
  const api = new docusign.EnvelopesApi(client);
  const accountId = config.DOCUSIGN_ACCOUNT_ID!;
  const def = buildEnvelopeDefinition(input);
  const result = await api.createEnvelope(accountId, { envelopeDefinition: def });
  logger.info({ envelopeId: result.envelopeId, status: result.status, subject: input.subject }, 'DocuSign envelope sent');
  return {
    envelopeId: result.envelopeId ?? '',
    status:     result.status ?? 'sent',
  };
}

/** Query envelope status. */
export async function getEnvelope(envelopeId: string): Promise<{ status: string; statusChangedAt?: string; completedAt?: string }> {
  const client = await getApiClient();
  const api = new docusign.EnvelopesApi(client);
  const accountId = config.DOCUSIGN_ACCOUNT_ID!;
  const env = await api.getEnvelope(accountId, envelopeId, {});
  return {
    status:          env.status ?? 'unknown',
    statusChangedAt: env.statusChangedDateTime ?? undefined,
    completedAt:     env.completedDateTime ?? undefined,
  };
}

/** Verify configuration + JWT auth without sending an envelope. */
export async function healthCheck(): Promise<{ configured: boolean; jwtWorks: boolean; error?: string; hint?: string; baseUrl?: string; keyPrefix?: string }> {
  const missing: string[] = [];
  if (!config.DOCUSIGN_INTEGRATION_KEY)  missing.push('DOCUSIGN_INTEGRATION_KEY');
  if (!config.DOCUSIGN_USER_ID)          missing.push('DOCUSIGN_USER_ID');
  if (!config.DOCUSIGN_ACCOUNT_ID)       missing.push('DOCUSIGN_ACCOUNT_ID');
  if (!config.DOCUSIGN_BASE_URL)         missing.push('DOCUSIGN_BASE_URL');
  if (!config.DOCUSIGN_RSA_PRIVATE_KEY)  missing.push('DOCUSIGN_RSA_PRIVATE_KEY');
  if (!config.DOCUSIGN_WEBHOOK_HMAC_KEY) missing.push('DOCUSIGN_WEBHOOK_HMAC_KEY');
  if (missing.length > 0) {
    return { configured: false, jwtWorks: false, error: `Missing env vars: ${missing.join(', ')}` };
  }
  // Bypass the token cache so we exercise the full JWT grant path.
  cachedAccessToken = null;
  try {
    await getAccessToken();
    return { configured: true, jwtWorks: true };
  } catch (err) {
    // DocuSign SDK throws Axios-style errors — dig out the actual response body.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyErr = err as any;
    const responseBody = anyErr?.response?.data ?? anyErr?.response?.body ?? null;
    const errorCode = responseBody?.error ?? '';
    const errorDesc = responseBody?.error_description ?? '';
    const combined  = errorCode ? `${errorCode}${errorDesc ? ': ' + errorDesc : ''}` : (err instanceof Error ? err.message : String(err));

    // Map common DocuSign JWT grant errors to concrete fixes.
    let hint: string | undefined;
    if (errorCode === 'consent_required') {
      hint = 'You have not granted JWT consent. Visit https://account.docusign.com/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=' + (config.DOCUSIGN_INTEGRATION_KEY ?? '') + '&redirect_uri=https://pub-legal-api-production.up.railway.app/api/v1/docusign/callback in a browser and click Accept.';
    } else if (errorCode === 'invalid_grant' || errorCode === 'invalid_signature') {
      hint = 'The RSA private key in Railway does not match the public key DocuSign has for this app. Regenerate the keypair in DocuSign admin (delete the old one first), copy the NEW private key including BEGIN/END lines, and paste it into Railway.';
    } else if (errorCode === 'invalid_client') {
      hint = 'DOCUSIGN_INTEGRATION_KEY is wrong. Copy it from the app you registered in Settings → Apps and Keys.';
    } else if (errorCode === 'invalid_request') {
      hint = 'DOCUSIGN_USER_ID is likely wrong. It must be the API Username UUID (Settings → Users → click your user → API Username), NOT your login email address.';
    }

    return {
      configured: true,
      jwtWorks: false,
      error: combined,
      hint,
      baseUrl:   config.DOCUSIGN_BASE_URL ?? undefined,
      keyPrefix: config.DOCUSIGN_RSA_PRIVATE_KEY?.slice(0, 40) ?? undefined,
    };
  }
}

/** Download the fully-executed combined PDF for a completed envelope. */
export async function downloadSignedPdf(envelopeId: string): Promise<Buffer> {
  const client = await getApiClient();
  const api = new docusign.EnvelopesApi(client);
  const accountId = config.DOCUSIGN_ACCOUNT_ID!;
  // 'combined' returns a single PDF of all documents merged with certificate.
  const result = await api.getDocument(accountId, envelopeId, 'combined');
  return result as unknown as Buffer;
}
