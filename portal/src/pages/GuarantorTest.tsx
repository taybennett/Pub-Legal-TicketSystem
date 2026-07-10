/**
 * Layout-iteration harness for the Exhibit B-1 guarantor signature block.
 *
 * Generates a tiny 1-page docx containing ONLY the guarantor signature
 * table (the same buildGuarantorBlocks() the real FA uses), then ships it
 * through the DocuSign pipeline so you can see how each spacing/anchor
 * tweak lands without waiting on a full FA re-generation.
 */

import { useState } from 'react';
import { api, ApiError } from '../api/client';
import { generateGuarantorTestDoc, type FaGuarantor } from '../lib/faTemplate';

const GUARANTORS: FaGuarantor[] = [
  { name: 'Braxton DeCamp', pct: '33.33' },
  { name: 'Jim Cornish',    pct: '33.33' },
  { name: 'Kim DeCamp',     pct: '33.33' },
];

const RECIPIENTS = [
  { role: 'guarantor',  name: 'Braxton DeCamp', email: 'taybennett@gmail.com',          guarantorIndex: 1 },
  { role: 'guarantor',  name: 'Jim Cornish',    email: 'taylor@taylorbennettlaw.com',   guarantorIndex: 2 },
  { role: 'guarantor',  name: 'Kim DeCamp',     email: 'taylor@bennettsills.com',       guarantorIndex: 3 },
  { role: 'franchisor', name: 'Taylor Bennett', email: 'taylorb@popupbagels.com' },
] as const;

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function GuarantorTest() {
  const [busy, setBusy]     = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [result, setResult] = useState<{ envelopeId: string; status: string; recordId: string } | null>(null);

  async function handleSend() {
    setBusy(true);
    setStatus('Generating minimal guarantor-block docx…');
    setError(null);
    setResult(null);
    try {
      const doc = await generateGuarantorTestDoc(GUARANTORS, new Date().toISOString().slice(0, 10));

      setStatus('Base64-encoding and posting to /docusign/envelope…');
      const base64 = await blobToBase64(doc.blob);

      const res = await api.post<{ envelopeId: string; status: string; recordId: string }>('/docusign/envelope', {
        subject:      'LAYOUT TEST — Exhibit B-1 Guarantor Signature Block',
        message:      'One-page layout iteration test. Please sign; then void or archive.',
        documentType: 'Franchise Agreement',
        documents:    [{ name: doc.filename, base64, documentId: '1' }],
        recipients:   RECIPIENTS,
      });

      setResult(res);
      setStatus('✓ Envelope sent. Sign, complete, then eyeball the executed PDF.');
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e instanceof Error ? e.message : String(e));
      setError(msg);
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleDownloadOnly() {
    try {
      const doc = await generateGuarantorTestDoc(GUARANTORS, new Date().toISOString().slice(0, 10));
      const url = URL.createObjectURL(doc.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <div className="page-header">
        <h1 className="page-title">Guarantor Block — Layout Test</h1>
      </div>

      <p className="muted" style={{ marginBottom: '1.5rem' }}>
        Generates a 1-page docx containing only the Exhibit B-1 guarantor signature table
        (built from the same buildGuarantorBlocks the real FA uses) and sends it via DocuSign
        to the hardcoded test recipients. Fast iteration for spacing / anchor placement without
        rebuilding a full FA.
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

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button
          className="btn-primary"
          style={{ background: '#5b3a99' }}
          onClick={handleSend}
          disabled={busy}
        >
          {busy ? 'Sending…' : '📧 Send Test Envelope'}
        </button>
        <button
          className="btn-primary"
          style={{ background: '#666' }}
          onClick={handleDownloadOnly}
          disabled={busy}
        >
          ⬇ Download docx only (skip DocuSign)
        </button>
      </div>

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
