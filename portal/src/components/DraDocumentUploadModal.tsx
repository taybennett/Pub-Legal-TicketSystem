import { useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { DraDocumentType } from '../api/types';

type Stage = 'idle' | 'saving' | 'done';

interface Props {
  draId:     string;
  draName:   string;
  onClose:   () => void;
  onSaved:   () => void;
  /** When opened from a specific slot, lock the type so the user can't accidentally
   *  upload the wrong kind into that slot. */
  initialDocType?:         DraDocumentType;
  initialAmendmentNumber?: number;
  lockDocType?:            boolean;
}

const DOC_TYPES: { value: DraDocumentType; label: string }[] = [
  { value: 'Amendment',             label: 'Amendment' },
  { value: 'Addendum',              label: 'Addendum (custom-named, e.g. Silent Investor)' },
  { value: 'Exhibit',               label: 'Exhibit / Schedule' },
  { value: 'Guaranty',              label: 'Guaranty' },
  { value: 'Side Letter',           label: 'Side Letter' },
  { value: 'Assignment',            label: 'Assignment of Development Rights' },
  { value: 'Memorandum',            label: 'Memorandum' },
  { value: 'Termination Agreement', label: 'Termination / Surrender Agreement' },
  { value: 'Other',                 label: 'Other' },
];

export function DraDocumentUploadModal({
  draId, draName, onClose, onSaved,
  initialDocType, initialAmendmentNumber, lockDocType,
}: Props) {
  const [stage, setStage]     = useState<Stage>('idle');
  const [file, setFile]       = useState<File | null>(null);
  const [docType, setDocType] = useState<DraDocumentType>(initialDocType ?? 'Amendment');
  const [amendmentNumber, setAmendmentNumber] = useState<string>(
    initialAmendmentNumber != null ? String(initialAmendmentNumber) : ''
  );
  const [addendumName, setAddendumName]   = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [signatories, setSignatories]     = useState('');
  const [notes, setNotes]                 = useState('');
  const [err, setErr]                     = useState<string | null>(null);
  const fileInputRef                      = useRef<HTMLInputElement>(null);

  async function handleSave() {
    if (!file) return;
    setStage('saving');
    setErr(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('documentType', docType);
      if (docType === 'Amendment' && amendmentNumber.trim()) fd.append('amendmentNumber', amendmentNumber.trim());
      if (docType === 'Addendum'  && addendumName.trim())    fd.append('addendumName', addendumName.trim());
      if (effectiveDate) fd.append('effectiveDate', effectiveDate);
      if (signatories.trim()) fd.append('signatories', signatories.trim());
      if (notes.trim())       fd.append('notes', notes.trim());

      await api.upload(`/dras/${draId}/documents`, fd);
      setStage('done');
      setTimeout(() => { onSaved(); onClose(); }, 1000);
    } catch (e) {
      setErr(e instanceof ApiError ? formatApiError(e) : 'Save failed');
      setStage('idle');
    }
  }

  function formatApiError(e: ApiError): string {
    const d = e.details as { fieldErrors?: Record<string, string[]> } | undefined;
    if (d?.fieldErrors) {
      const parts: string[] = [];
      for (const [field, msgs] of Object.entries(d.fieldErrors)) {
        if (msgs && msgs.length) parts.push(`${field}: ${msgs[0]}`);
      }
      if (parts.length) return `${e.message} — ${parts.join('; ')}`;
    }
    return e.message;
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--lease" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Upload DRA Document</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {stage === 'idle' && (
          <div className="lease-modal-body">
            <p className="muted">Parent DRA: <strong>{draName}</strong></p>

            <div className="lease-modal-field">
              <label>
                Document Type
                {lockDocType && <span className="muted" style={{ marginLeft: '0.4rem', fontSize: '0.7rem' }}>(slot)</span>}
              </label>
              <select
                value={docType}
                onChange={e => setDocType(e.target.value as DraDocumentType)}
                disabled={lockDocType}
                style={{ width: '100%' }}
              >
                {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            <div className="lease-modal-grid">
              {docType === 'Amendment' && (
                <div className="lease-modal-field">
                  <label>
                    Amendment Number
                    {lockDocType && initialAmendmentNumber != null && (
                      <span className="muted" style={{ marginLeft: '0.4rem', fontSize: '0.7rem' }}>(slot)</span>
                    )}
                  </label>
                  <input
                    type="number" min={1} max={99}
                    value={amendmentNumber}
                    onChange={e => setAmendmentNumber(e.target.value)}
                    placeholder="e.g. 1"
                    disabled={lockDocType && initialAmendmentNumber != null}
                  />
                </div>
              )}
              {docType === 'Addendum' && (
                <div className="lease-modal-field">
                  <label>Addendum Name</label>
                  <input
                    type="text"
                    value={addendumName}
                    onChange={e => setAddendumName(e.target.value)}
                    placeholder="e.g. Silent Investor"
                  />
                </div>
              )}
              <div className="lease-modal-field">
                <label>Effective Date</label>
                <input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} />
              </div>
              <div className="lease-modal-field" style={{ gridColumn: '1 / -1' }}>
                <label>Signatories</label>
                <input
                  type="text"
                  value={signatories}
                  onChange={e => setSignatories(e.target.value)}
                  placeholder="Comma-separated, e.g. Brian Harrington, Jane Doe"
                />
              </div>
              <div className="lease-modal-field" style={{ gridColumn: '1 / -1' }}>
                <label>Notes</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  style={{ border: '1px solid var(--border)', padding: '0.5rem 0.6rem', fontFamily: 'inherit', fontSize: '0.9rem' }}
                />
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="lease-modal-file"
            />
            {file && <div className="muted">📎 {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)</div>}

            {err && <div className="lease-modal-warning">{err}</div>}

            <div className="modal-actions">
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
              <button
                className="btn-primary"
                onClick={handleSave}
                disabled={
                  !file ||
                  (docType === 'Amendment' && !amendmentNumber.trim()) ||
                  (docType === 'Addendum'  && !addendumName.trim())
                }
              >
                Save document
              </button>
            </div>
          </div>
        )}

        {stage === 'saving' && (
          <div className="lease-modal-body lease-modal-progress">
            <div className="spinner" />
            <p>Creating DRA document and attaching PDF…</p>
          </div>
        )}

        {stage === 'done' && (
          <div className="lease-modal-body lease-modal-progress">
            <p style={{ color: '#1b5e20', fontSize: '1.2rem' }}>✓ Saved</p>
          </div>
        )}
      </div>
    </div>
  );
}
