import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { FaDocumentType, FaTracker } from '../api/types';

type Stage = 'idle' | 'saving' | 'done';

interface Props {
  locationId: string;
  onClose:    () => void;
  onSaved:    () => void;
  /** When opened from a specific slot, lock the type so the user can't accidentally
   *  upload the wrong kind into that slot. */
  initialDocType?:         FaDocumentType;
  initialAmendmentNumber?: number;
  lockDocType?:            boolean;
}

const DOC_TYPES: { value: FaDocumentType; label: string }[] = [
  { value: 'Franchise Agreement',   label: 'Franchise Agreement (primary)' },
  { value: 'Amendment',             label: 'Amendment' },
  { value: 'Guaranty',              label: 'Guaranty and Assumption of Obligations' },
  { value: 'Addendum',              label: 'Addendum (custom-named, e.g. California FDD)' },
  { value: 'Renewal Agreement',     label: 'Renewal / Extension Agreement' },
  { value: 'Assignment',            label: 'Assignment / Transfer Agreement' },
  { value: 'Termination Agreement', label: 'Termination Agreement' },
  { value: 'Side Letter',           label: 'Side Letter' },
  { value: 'Other',                 label: 'Other' },
];

export function FaUploadModal({
  locationId, onClose, onSaved,
  initialDocType, initialAmendmentNumber, lockDocType,
}: Props) {
  const [stage, setStage]     = useState<Stage>('idle');
  const [file, setFile]       = useState<File | null>(null);
  const [docType, setDocType] = useState<FaDocumentType>(initialDocType ?? 'Franchise Agreement');
  const [existingFas, setExistingFas] = useState<FaTracker[] | null>(null);

  // Primary FA fields
  const [executionDate, setExecutionDate] = useState('');
  const [termEnd, setTermEnd]             = useState('');
  const [termYears, setTermYears]         = useState('');
  const [entityName, setEntityName]       = useState('');
  const [signatory, setSignatory]         = useState('');
  const [draName, setDraName]             = useState('');
  const [attorney, setAttorney]           = useState('');
  const [status, setStatus]               = useState('Active');

  // Child-doc fields
  const [documentDate, setDocumentDate]         = useState('');
  const [amendmentNumber, setAmendmentNumber]   = useState<string>(
    initialAmendmentNumber != null ? String(initialAmendmentNumber) : ''
  );
  const [addendumName, setAddendumName]         = useState('');
  const [parentFaId, setParentFaId]             = useState<string>('');

  const [err, setErr] = useState<string | null>(null);
  const fileInputRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Load existing FAs so we can auto-pick the primary parent for child docs.
    api.get<{ faTrackers: FaTracker[] }>(`/locations/${locationId}/fa-trackers`)
      .then(r => {
        setExistingFas(r.faTrackers);
        const primary = r.faTrackers.find(f => f.documentType === 'Franchise Agreement' || f.documentType === null);
        if (primary) setParentFaId(primary.id);
      })
      .catch(() => setExistingFas([]));
  }, [locationId]);

  const isPrimary   = docType === 'Franchise Agreement';
  const primaryFas  = (existingFas ?? []).filter(f => f.documentType === 'Franchise Agreement' || f.documentType === null);

  async function handleSave() {
    if (!file) return;
    setStage('saving');
    setErr(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('documentType', docType);
      if (isPrimary) {
        if (executionDate) fd.append('executionDate', executionDate);
        if (termEnd)       fd.append('termEnd',       termEnd);
        if (termYears.trim()) fd.append('termYears', termYears.trim());
        if (entityName)    fd.append('entityName',    entityName);
        if (signatory)     fd.append('signatory',     signatory);
        if (draName)       fd.append('draName',       draName);
        if (attorney)      fd.append('attorney',      attorney);
        if (status)        fd.append('status',        status);
      } else {
        if (documentDate)  fd.append('documentDate',  documentDate);
        if (docType === 'Amendment' && amendmentNumber.trim()) fd.append('amendmentNumber', amendmentNumber.trim());
        if (docType === 'Addendum'  && addendumName.trim())    fd.append('addendumName',    addendumName.trim());
        if (parentFaId)    fd.append('parentFaId',    parentFaId);
      }

      await api.upload(`/locations/${locationId}/fa-trackers`, fd);
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
          <h2 className="modal-title">Upload Franchise Agreement Document</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {stage === 'idle' && (
          <div className="lease-modal-body">
            <div className="lease-modal-field" style={{ marginBottom: '1rem' }}>
              <label>
                Document Type
                {lockDocType && <span className="muted" style={{ marginLeft: '0.4rem', fontSize: '0.7rem' }}>(slot)</span>}
              </label>
              <select
                value={docType}
                onChange={e => setDocType(e.target.value as FaDocumentType)}
                disabled={lockDocType}
                style={{ width: '100%' }}
              >
                {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            {isPrimary ? (
              <>
                <p className="muted">
                  The primary Franchise Agreement — fill in the key terms. All fields optional; enter what you have.
                </p>
                <div className="lease-modal-grid">
                  <div className="lease-modal-field">
                    <label>Execution Date</label>
                    <input type="date" value={executionDate} onChange={e => setExecutionDate(e.target.value)} />
                  </div>
                  <div className="lease-modal-field">
                    <label>Term End</label>
                    <input type="date" value={termEnd} onChange={e => setTermEnd(e.target.value)} />
                  </div>
                  <div className="lease-modal-field">
                    <label>Term (years)</label>
                    <input type="number" min={1} max={99} value={termYears} onChange={e => setTermYears(e.target.value)} placeholder="e.g. 10" />
                  </div>
                  <div className="lease-modal-field">
                    <label>Status</label>
                    <select value={status} onChange={e => setStatus(e.target.value)}>
                      <option value="Active">Active</option>
                      <option value="Expiring Within 1 Year">Expiring Within 1 Year</option>
                      <option value="Expiring Within 6 Months">Expiring Within 6 Months</option>
                      <option value="Expired">Expired</option>
                    </select>
                  </div>
                  <div className="lease-modal-field" style={{ gridColumn: '1 / -1' }}>
                    <label>Franchisee Entity</label>
                    <input type="text" value={entityName} onChange={e => setEntityName(e.target.value)} placeholder="e.g. BBP Assembly, LLC" />
                  </div>
                  <div className="lease-modal-field">
                    <label>Signatory</label>
                    <input type="text" value={signatory} onChange={e => setSignatory(e.target.value)} placeholder="e.g. Brian Harrington" />
                  </div>
                  <div className="lease-modal-field">
                    <label>DRA / Group</label>
                    <input type="text" value={draName} onChange={e => setDraName(e.target.value)} placeholder="e.g. P.C. MAE — New England DRA" />
                  </div>
                  <div className="lease-modal-field" style={{ gridColumn: '1 / -1' }}>
                    <label>Attorney</label>
                    <input type="text" value={attorney} onChange={e => setAttorney(e.target.value)} placeholder="e.g. Taylor Bennett" />
                  </div>
                </div>
              </>
            ) : (
              <>
                <p className="muted">
                  Upload the {docType} PDF. It'll be linked to the primary Franchise Agreement.
                </p>
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
                        placeholder="e.g. California FDD"
                      />
                    </div>
                  )}
                  <div className="lease-modal-field">
                    <label>Document Date</label>
                    <input type="date" value={documentDate} onChange={e => setDocumentDate(e.target.value)} />
                  </div>
                  {primaryFas.length > 0 && (
                    <div className="lease-modal-field" style={{ gridColumn: '1 / -1' }}>
                      <label>Parent Franchise Agreement</label>
                      <select value={parentFaId} onChange={e => setParentFaId(e.target.value)}>
                        <option value="">— None —</option>
                        {primaryFas.map(fa => (
                          <option key={fa.id} value={fa.id}>
                            Franchise Agreement{fa.executionDate ? ` · executed ${fa.executionDate}` : ''}{fa.entityName ? ` · ${fa.entityName}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </>
            )}

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
                Save {docType}
              </button>
            </div>
          </div>
        )}

        {stage === 'saving' && (
          <div className="lease-modal-body lease-modal-progress">
            <div className="spinner" />
            <p>Creating FA record and attaching PDF…</p>
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
