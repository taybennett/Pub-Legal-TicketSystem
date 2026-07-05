import { useState } from 'react';
import { api, ApiError } from '../api/client';

export interface DocusignDocInput {
  name:   string;   // filename with extension
  blob:   Blob;     // PDF or DOCX blob
}

export type DocusignDocumentType =
  | 'Franchise Agreement' | 'Franchise Agreement Package'
  | 'Lease' | 'DRA' | 'Standing Addendum' | 'Other';

interface Recipient {
  name:            string;
  email:           string;
  role:            'franchisor' | 'franchisee' | 'guarantor';
  guarantorIndex?: number;
}

interface Props {
  onClose:        () => void;
  onSent:         (envelopeId: string, recordId: string) => void;
  documents:      DocusignDocInput[];
  documentType:   DocusignDocumentType;
  defaultSubject: string;
  /** Which shop/lease/DRA/FA this envelope is for — passed to the backend for linking. */
  relatedLocationId?: string;
  relatedFaId?:       string;
  relatedLeaseId?:    string;
  relatedDraId?:      string;
  /** Pre-fill the franchisee signer(s). */
  initialFranchisee?: { name: string; email: string };
  /** Pre-fill any guarantors. */
  initialGuarantors?: Array<{ name: string; email: string }>;
}

const PUB_FRANCHISOR_DEFAULT = {
  name:  'Taylor Bennett',
  email: 'taylor@taylorbennettlaw.com',
};

export function DocusignSendModal({
  onClose, onSent, documents, documentType, defaultSubject,
  relatedLocationId, relatedFaId, relatedLeaseId, relatedDraId,
  initialFranchisee, initialGuarantors,
}: Props) {
  const [subject, setSubject]     = useState(defaultSubject);
  const [message, setMessage]     = useState('Please review and execute this document. Signatures are set to the anchor markers embedded in the file.');
  const [franchisor, setFranchisor] = useState(PUB_FRANCHISOR_DEFAULT);
  const [franchisee, setFranchisee] = useState(initialFranchisee ?? { name: '', email: '' });
  const [guarantors, setGuarantors] = useState<Array<{ name: string; email: string }>>(initialGuarantors ?? []);
  const [busy, setBusy]           = useState(false);
  const [err, setErr]             = useState<string | null>(null);

  function addGuarantor() { setGuarantors(g => [...g, { name: '', email: '' }]); }
  function updateGuarantor(i: number, patch: Partial<{ name: string; email: string }>) {
    setGuarantors(g => g.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }
  function removeGuarantor(i: number) { setGuarantors(g => g.filter((_, idx) => idx !== i)); }

  async function handleSend() {
    setBusy(true);
    setErr(null);
    try {
      // Build the recipients array
      const recipients: Recipient[] = [
        { role: 'franchisee', name: franchisee.name, email: franchisee.email },
        ...guarantors.map((g, i) => ({ role: 'guarantor' as const, name: g.name, email: g.email, guarantorIndex: i + 1 })),
        { role: 'franchisor', name: franchisor.name, email: franchisor.email },
      ];

      // Convert blobs to base64
      const docs = await Promise.all(documents.map(async (d, i) => ({
        name:       d.name,
        base64:     await blobToBase64(d.blob),
        documentId: String(i + 1),
      })));

      const res = await api.post<{ envelopeId: string; status: string; recordId: string }>('/docusign/envelope', {
        subject,
        message,
        documentType,
        documents:   docs,
        recipients,
        ...(relatedLocationId ? { relatedLocationId } : {}),
        ...(relatedFaId       ? { relatedFaId }       : {}),
        ...(relatedLeaseId    ? { relatedLeaseId }    : {}),
        ...(relatedDraId      ? { relatedDraId }      : {}),
      });

      onSent(res.envelopeId, res.recordId);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : (e instanceof Error ? e.message : 'Send failed'));
      setBusy(false);
    }
  }

  const canSend =
    subject.trim().length > 0 &&
    franchisor.name.trim() && franchisor.email.includes('@') &&
    franchisee.name.trim() && franchisee.email.includes('@') &&
    guarantors.every(g => g.name.trim() && g.email.includes('@'));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--lease" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">📧 Send via DocuSign</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="lease-modal-body">
          <p className="muted">
            Documents will be sent as a single envelope. Franchisee + Guarantors sign in parallel (routingOrder 1);
            PUB Franchisor countersigns after (routingOrder 2). Signature and date tabs are placed on anchor markers
            embedded in the templates (e.g. <code>\sig_franchisee\</code>).
          </p>

          <div className="lease-modal-field" style={{ marginBottom: '1rem' }}>
            <label>Subject</label>
            <input type="text" value={subject} onChange={e => setSubject(e.target.value)} style={{ width: '100%' }} />
          </div>

          <div className="lease-modal-field" style={{ marginBottom: '1rem' }}>
            <label>Message to signers</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={2} style={{ width: '100%' }} />
          </div>

          <div className="docusign-docs-preview">
            <div className="docusign-docs-label">Documents ({documents.length})</div>
            <ul>
              {documents.map((d, i) => <li key={i}>{d.name} <span className="muted">({(d.blob.size / 1024).toFixed(0)} KB)</span></li>)}
            </ul>
          </div>

          <h3 className="docusign-section-h">Signers</h3>

          <div className="docusign-signer-block">
            <div className="docusign-signer-label">Franchisee (signs first)</div>
            <div className="lease-modal-grid">
              <div className="lease-modal-field">
                <label>Name</label>
                <input type="text" value={franchisee.name} onChange={e => setFranchisee({ ...franchisee, name: e.target.value })} />
              </div>
              <div className="lease-modal-field">
                <label>Email</label>
                <input type="email" value={franchisee.email} onChange={e => setFranchisee({ ...franchisee, email: e.target.value })} />
              </div>
            </div>
          </div>

          {guarantors.map((g, i) => (
            <div key={i} className="docusign-signer-block">
              <div className="docusign-signer-label">
                Guarantor {i + 1}
                <button type="button" className="btn-link" onClick={() => removeGuarantor(i)}>Remove</button>
              </div>
              <div className="lease-modal-grid">
                <div className="lease-modal-field">
                  <label>Name</label>
                  <input type="text" value={g.name} onChange={e => updateGuarantor(i, { name: e.target.value })} />
                </div>
                <div className="lease-modal-field">
                  <label>Email</label>
                  <input type="email" value={g.email} onChange={e => updateGuarantor(i, { email: e.target.value })} />
                </div>
              </div>
            </div>
          ))}
          <button type="button" className="btn-secondary btn-sm" onClick={addGuarantor} style={{ marginBottom: '1rem' }}>
            + Add Guarantor
          </button>

          <div className="docusign-signer-block">
            <div className="docusign-signer-label">PUB Franchisor (countersigns)</div>
            <div className="lease-modal-grid">
              <div className="lease-modal-field">
                <label>Name</label>
                <input type="text" value={franchisor.name} onChange={e => setFranchisor({ ...franchisor, name: e.target.value })} />
              </div>
              <div className="lease-modal-field">
                <label>Email</label>
                <input type="email" value={franchisor.email} onChange={e => setFranchisor({ ...franchisor, email: e.target.value })} />
              </div>
            </div>
          </div>

          {err && <div className="lease-modal-warning">{err}</div>}

          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="btn-primary" onClick={handleSend} disabled={!canSend || busy}>
              {busy ? 'Sending…' : `📧 Send to ${1 + guarantors.length + 1} signer${guarantors.length === 0 ? 's' : 's'}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const b64 = dataUrl.split(',')[1] ?? '';
      resolve(b64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
