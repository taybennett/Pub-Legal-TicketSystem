/**
 * One-shot test page for the DocuSign integration.
 *
 * Generates the Ardmore (Suburban Square) FA under Seeded Capital Partners
 * — PA/NJ DRA, then sends the envelope to a hardcoded set of recipient
 * emails so the operator can verify the whole pipeline end-to-end without
 * filling out the FA Generator form.
 *
 * Delete this page once the DocuSign integration is proven out in prod.
 */

import { useState } from 'react';
import { api, ApiError } from '../api/client';
import { generateFa, type FaInputs } from '../lib/faTemplate';

const RECIPIENTS = [
  { role: 'franchisee', name: 'Brian Harrington',   email: 'taybennett@gmail.com' },
  { role: 'guarantor',  name: 'Brian Harrington',   email: 'taylor@taylorbennettlaw.com', guarantorIndex: 1 },
  { role: 'guarantor',  name: 'Kevin Kelly',        email: 'taylor@bennettsills.com',      guarantorIndex: 2 },
  { role: 'franchisor', name: 'Taylor Bennett',     email: 'taylorb@popupbagels.com' },
] as const;

const ARDMORE_INPUT: FaInputs = {
  entity:     'BBP SS 4, LLC',
  state:      'Pennsylvania',
  entityType: 'limited liability company',
  shopName:   'Ardmore (Suburban Square)',
  shopNumber: '2004',
  addr1:      '10 COULTER AVE',
  addr2:      'ARDMORE, PA 19003',
  execDate:   '2026-07-04',
  signatoryName:  'Brian Harrington',
  signatoryTitle: 'Manager',
  extraSignatories: [],
  formationDate:  '2025-06-10',
  opName:    'Brian Harrington',
  opAddr1:   '514 Wyndmoor Avenue',
  opAddr2:   'Wyndmoor, PA 19038',
  opTel:     '215-901-9941',
  opEmail:   'bcharrington13@gmail.com',
  director2Name:  'Kevin Kelly',
  director2Title: 'Manager',
  noticeLine1: '514 Wyndmoor Avenue',
  noticeLine2: 'Wyndmoor, PA 19038',
  noticeLine3: 'Attn: Brian Harrington',
  owners: [
    { name: 'BBP Operations, LLC', pct: '100' },
  ],
  guarantors: [
    { name: 'Brian Harrington', pct: '' },
    { name: 'Kevin Kelly',      pct: '' },
  ],
  dra: {
    name:            'Seeded Capital Partners — PA/NJ DRA',
    signatoryEntity: 'BBP Operations, LLC',
    executionDate:   null,
    totalObligation: 15,
  },
};

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function DocusignTest() {
  const [busy, setBusy]       = useState(false);
  const [status, setStatus]   = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [result, setResult]   = useState<{ envelopeId: string; status: string; recordId: string } | null>(null);

  async function handleSend() {
    setBusy(true);
    setStatus('Generating Ardmore FA docx…');
    setError(null);
    setResult(null);
    try {
      const fa = await generateFa(ARDMORE_INPUT);

      setStatus('Base64-encoding & posting to /docusign/envelope…');
      const base64 = await blobToBase64(fa.blob);

      const res = await api.post<{ envelopeId: string; status: string; recordId: string }>('/docusign/envelope', {
        subject:      'TEST — Ardmore Suburban Square — Franchise Agreement (Seeded Capital PA/NJ DRA)',
        message:      'This is a test envelope from the PUB Legal Portal DocuSign integration. Feel free to sign or void.',
        documentType: 'Franchise Agreement',
        documents: [{
          name:       fa.filename,
          base64,
          documentId: '1',
        }],
        recipients: RECIPIENTS,
      });

      setResult(res);
      setStatus(`✓ Envelope sent — recipients should receive it shortly.`);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e instanceof Error ? e.message : String(e));
      setError(msg);
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <div className="page-header">
        <h1 className="page-title">DocuSign Test Send</h1>
      </div>

      <p className="muted" style={{ marginBottom: '1.5rem' }}>
        One-click smoke test for the DocuSign pipeline. Generates the Ardmore (Suburban Square) FA using the Seeded Capital
        Partners PA/NJ DRA data and sends it to the hardcoded recipient set below. No form to fill out.
      </p>

      <div style={{ background: '#fafafa', border: '1px solid #ddd', padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#666', marginBottom: '0.6rem' }}>Recipients</div>
        <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.9rem', lineHeight: '1.6' }}>
          {RECIPIENTS.map((r, i) => (
            <li key={i}>
              <strong>{r.role}</strong>
              {'guarantorIndex' in r && r.guarantorIndex ? ` #${r.guarantorIndex}` : ''}
              {': '}
              {r.name} – <code>{r.email}</code>
            </li>
          ))}
        </ul>
      </div>

      <button
        className="btn-primary"
        style={{ background: '#5b3a99' }}
        onClick={handleSend}
        disabled={busy}
      >
        {busy ? 'Sending…' : '📧 Send Ardmore Test Envelope'}
      </button>

      {status && (
        <div style={{ marginTop: '1.25rem', padding: '0.75rem 1rem', background: '#e6f7ec', border: '1px solid #7cc48d', fontSize: '0.9rem' }}>
          {status}
        </div>
      )}
      {error && (
        <div style={{ marginTop: '1.25rem', padding: '0.75rem 1rem', background: '#fbe6e6', border: '1px solid #c88', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>
          <strong>Error:</strong> {error}
        </div>
      )}
      {result && (
        <div style={{ marginTop: '1.25rem', padding: '0.75rem 1rem', background: '#fafafa', border: '1px solid #ddd', fontSize: '0.85rem' }}>
          <div><strong>Envelope ID:</strong> <code>{result.envelopeId}</code></div>
          <div><strong>Status:</strong> {result.status}</div>
          <div><strong>Airtable Record:</strong> <code>{result.recordId}</code></div>
          <div style={{ marginTop: '0.5rem' }}>
            Track live status on <a href="/envelopes" style={{ color: 'var(--black)', textDecoration: 'underline' }}>the Envelopes page</a>.
          </div>
        </div>
      )}
    </div>
  );
}
