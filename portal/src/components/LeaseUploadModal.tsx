import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { Confidence, Lease, LeaseDocumentType, LeaseExtraction } from '../api/types';

type Stage = 'idle' | 'extracting' | 'review' | 'review-doc' | 'saving' | 'done' | 'error';

interface Props {
  locationId: string;
  onClose:    () => void;
  onSaved:    () => void;
  /** When opened from a specific slot, lock the document type so the user
   *  can't accidentally upload the wrong kind into that slot. */
  initialDocType?:         LeaseDocumentType;
  initialAmendmentNumber?: number;
  lockDocType?:            boolean;
}

interface FormState {
  executionDate:        string;
  rentCommencementDate: string;
  termEnd:              string;
  termYears:            string;
  monthlyRent:          string;
  annualRent:           string;
  landlord:             string;
  renewalOptions:       string;
  securityDeposit:      string;
}

const blank: FormState = {
  executionDate: '', rentCommencementDate: '', termEnd: '', termYears: '',
  monthlyRent: '', annualRent: '', landlord: '', renewalOptions: '', securityDeposit: '',
};

const DOC_TYPES: { value: LeaseDocumentType; label: string }[] = [
  { value: 'Original Lease',       label: 'Original Lease' },
  { value: 'Amendment',            label: 'Amendment' },
  { value: 'Guaranty',             label: 'Guaranty' },
  { value: 'Landlord Work Letter', label: 'Landlord Work Letter' },
  { value: 'Estoppel',             label: 'Estoppel' },
  { value: 'Side Letter',          label: 'Side Letter' },
  { value: 'Other',                label: 'Other' },
];

export function LeaseUploadModal({
  locationId, onClose, onSaved,
  initialDocType, initialAmendmentNumber, lockDocType,
}: Props) {
  const [stage, setStage]         = useState<Stage>('idle');
  const [file, setFile]           = useState<File | null>(null);
  const [docType, setDocType]     = useState<LeaseDocumentType>(initialDocType ?? 'Original Lease');
  const [existingLeases, setExistingLeases] = useState<Lease[] | null>(null);
  const [extraction, setExtraction] = useState<LeaseExtraction | null>(null);
  const [form, setForm]           = useState<FormState>(blank);
  const [confidence, setConfidence] = useState<Partial<Record<keyof FormState, Confidence>>>({});
  // Child-doc form state
  const [documentDate, setDocumentDate]       = useState<string>('');
  const [amendmentNumber, setAmendmentNumber] = useState<string>(initialAmendmentNumber != null ? String(initialAmendmentNumber) : '');
  const [parentLeaseId, setParentLeaseId]     = useState<string>('');
  const [err, setErr]             = useState<string | null>(null);
  const [notes, setNotes]         = useState<string>('');
  const fileInputRef              = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Pull existing leases so we can warn about duplicates AND auto-pick the
    // parent Original Lease when uploading an Amendment/Guaranty/etc.
    api.get<{ leases: Lease[] }>(`/locations/${locationId}/leases`)
      .then(r => {
        setExistingLeases(r.leases);
        const orig = r.leases.find(l => l.documentType === 'Original Lease' || l.documentType === null);
        if (orig) setParentLeaseId(orig.id);
      })
      .catch(() => setExistingLeases([]));
  }, [locationId]);

  const isOriginal     = docType === 'Original Lease';
  const originalLeases = (existingLeases ?? []).filter(l => l.documentType === 'Original Lease' || l.documentType === null);
  const existingCount  = existingLeases?.length ?? 0;

  async function handleExtract() {
    if (!file) return;
    setStage('extracting');
    setErr(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.upload<{ extraction: LeaseExtraction }>(`/locations/${locationId}/leases/extract`, fd);
      const e = r.extraction;
      setExtraction(e);
      setForm({
        executionDate:        e.executionDate.value        ?? '',
        rentCommencementDate: e.commencementDate.value     ?? '',
        termEnd:              e.termEnd.value              ?? '',
        termYears:            e.termYears.value != null ? String(e.termYears.value) : '',
        monthlyRent:          e.monthlyRent.value != null ? String(e.monthlyRent.value) : '',
        annualRent:           e.annualRent.value != null ? String(e.annualRent.value) : '',
        landlord:             e.landlord.value             ?? '',
        renewalOptions:       e.renewalOptions.value       ?? '',
        securityDeposit:      e.securityDeposit.value != null ? String(e.securityDeposit.value) : '',
      });
      setConfidence({
        executionDate:        e.executionDate.confidence,
        rentCommencementDate: e.commencementDate.confidence,
        termEnd:              e.termEnd.confidence,
        termYears:            e.termYears.confidence,
        monthlyRent:          e.monthlyRent.confidence,
        annualRent:           e.annualRent.confidence,
        landlord:             e.landlord.confidence,
        renewalOptions:       e.renewalOptions.confidence,
        securityDeposit:      e.securityDeposit.confidence,
      });
      setNotes(e.notes);
      setStage('review');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Extraction failed. You can still enter the lease fields manually below.');
      setStage('review');  // fall back to manual entry with blank fields
    }
  }

  function handleSkipAI() {
    setExtraction(null);
    setForm(blank);
    setConfidence({});
    setNotes('');
    setStage('review');
  }

  function handleProceedDoc() {
    // For non-Original docs, skip AI entirely — go to the light review form.
    setStage('review-doc');
  }

  async function handleSave() {
    if (!file) return;
    setStage('saving');
    setErr(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('documentType', docType);

      if (isOriginal) {
        // Original Lease: send the full extracted/edited terms.
        const numericKeys = new Set(['termYears', 'monthlyRent', 'annualRent', 'securityDeposit']);
        Object.entries(form).forEach(([k, v]) => {
          if (!v) return;
          const clean = numericKeys.has(k) ? v.replace(/[$,\s]/g, '') : v.trim();
          if (clean) fd.append(k, clean);
        });
        if (extraction) {
          const log = JSON.stringify({
            model: extraction.model,
            extractedAt: new Date().toISOString(),
            tokens: {
              input: extraction.inputTokens,
              output: extraction.outputTokens,
              cacheRead: extraction.cacheReadTokens,
              cacheWrite: extraction.cacheWriteTokens,
            },
            fields: {
              executionDate:    extraction.executionDate,
              commencementDate: extraction.commencementDate,
              termYears:        extraction.termYears,
              termEnd:          extraction.termEnd,
              monthlyRent:      extraction.monthlyRent,
              annualRent:       extraction.annualRent,
              landlord:         extraction.landlord,
              renewalOptions:   extraction.renewalOptions,
              securityDeposit:  extraction.securityDeposit,
            },
            notes: extraction.notes,
          }, null, 2);
          fd.append('aiExtractionLog', log);
        }
      } else {
        // Child doc: just file + type + date + (optional) amendment# + parent link.
        if (documentDate)    fd.append('documentDate', documentDate);
        if (parentLeaseId)   fd.append('parentLeaseId', parentLeaseId);
        if (docType === 'Amendment' && amendmentNumber.trim()) {
          fd.append('amendmentNumber', amendmentNumber.trim());
        }
      }

      await api.upload(`/locations/${locationId}/leases`, fd);
      setStage('done');
      setTimeout(() => { onSaved(); onClose(); }, 1200);
    } catch (e) {
      setErr(e instanceof ApiError ? formatApiError(e) : 'Save failed');
      setStage(isOriginal ? 'review' : 'review-doc');
    }
  }

  function formatApiError(e: ApiError): string {
    const d = e.details as { fieldErrors?: Record<string, string[]> } | undefined;
    if (d?.fieldErrors) {
      const parts: string[] = [];
      for (const [field, msgs] of Object.entries(d.fieldErrors)) {
        if (msgs && msgs.length) parts.push(`${prettyField(field)}: ${msgs[0]}`);
      }
      if (parts.length) return `${e.message} — ${parts.join('; ')}`;
    }
    return e.message;
  }

  function prettyField(k: string): string {
    return ({
      executionDate:        'Execution Date',
      rentCommencementDate: 'Rent Commencement Date',
      termEnd:              'Term End Date',
      termYears:            'Term (years)',
      monthlyRent:          'Monthly Rent',
      annualRent:           'Annual Rent',
      landlord:             'Landlord',
      renewalOptions:       'Renewal Options',
      securityDeposit:      'Security Deposit',
      documentDate:         'Document Date',
      amendmentNumber:      'Amendment Number',
      parentLeaseId:        'Parent Lease',
    } as Record<string, string>)[k] ?? k;
  }

  function field(key: keyof FormState, label: string, type: 'text' | 'date' | 'number' = 'text') {
    const conf = confidence[key];
    return (
      <div className="lease-modal-field">
        <label>
          {label}
          {conf && <span className={`conf-pill conf-${conf}`}>{conf}</span>}
        </label>
        <input
          type={type}
          value={form[key]}
          onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
        />
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--lease" onClick={e => e.stopPropagation()}>

        <div className="modal-header">
          <h2 className="modal-title">Upload Lease Document</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* Duplicate-original warning, only shown when uploading another Original and one already exists */}
        {isOriginal && originalLeases.length > 0 && stage === 'idle' && (
          <div className="lease-modal-warning">
            ⚠ This shop already has {originalLeases.length} Original Lease record{originalLeases.length === 1 ? '' : 's'} on file.
            If you're adding an Amendment or related document, change the Document Type below instead of uploading another Original.
          </div>
        )}

        {stage === 'idle' && (
          <div className="lease-modal-body">
            <div className="lease-modal-field" style={{ marginBottom: '1rem' }}>
              <label>
                Document Type
                {lockDocType && <span className="muted" style={{ marginLeft: '0.4rem', fontSize: '0.7rem' }}>(slot)</span>}
              </label>
              <select
                value={docType}
                onChange={e => setDocType(e.target.value as LeaseDocumentType)}
                style={{ width: '100%' }}
                disabled={lockDocType}
              >
                {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            {isOriginal ? (
              <p className="muted">
                Upload the executed Lease PDF. Claude AI will extract the lease terms in ~10 seconds.
                You'll review and edit before anything is saved.
              </p>
            ) : (
              <p className="muted">
                Upload the {docType} PDF. We'll store it linked to the Original Lease — you'll add a date and (optional) amendment number on the next screen. No AI extraction in this Phase.
              </p>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="lease-modal-file"
            />
            {file && <div className="muted">📎 {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)</div>}

            {!isOriginal && originalLeases.length === 0 && existingCount === 0 && (
              <div className="lease-modal-warning">
                ⚠ No Original Lease on file yet. You can still upload this document, but it won't be linked to a parent until an Original Lease is added.
              </div>
            )}

            <div className="modal-actions">
              {isOriginal ? (
                <>
                  <button className="btn-secondary" onClick={handleSkipAI} disabled={!file}>Skip AI · enter manually</button>
                  <button className="btn-primary" onClick={handleExtract} disabled={!file}>Extract with AI</button>
                </>
              ) : (
                <button className="btn-primary" onClick={handleProceedDoc} disabled={!file}>Next</button>
              )}
            </div>
          </div>
        )}

        {stage === 'extracting' && (
          <div className="lease-modal-body lease-modal-progress">
            <div className="spinner" />
            <p>Analyzing lease with Claude AI…</p>
            <p className="muted">Typically 10-20 seconds for a 50-page lease.</p>
          </div>
        )}

        {stage === 'review' && (
          <div className="lease-modal-body">
            {err && <div className="lease-modal-warning">{err}</div>}
            {notes && (
              <div className="lease-modal-notes">
                <strong>Claude's notes:</strong> {notes}
              </div>
            )}
            <div className="lease-modal-grid">
              {field('executionDate',        'Execution Date',         'date')}
              {field('rentCommencementDate', 'Rent Commencement Date', 'date')}
              {field('termYears',            'Term (years)',           'number')}
              {field('termEnd',              'Term End Date',          'date')}
              {field('monthlyRent',          'Monthly Rent ($)',       'number')}
              {field('annualRent',           'Annual Rent ($)',        'number')}
              {field('landlord',             'Landlord',               'text')}
              {field('renewalOptions',       'Renewal Options',        'text')}
              {field('securityDeposit',      'Security Deposit ($)',   'number')}
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn-primary" onClick={handleSave}>Save Lease to Airtable</button>
            </div>
          </div>
        )}

        {stage === 'review-doc' && (
          <div className="lease-modal-body">
            {err && <div className="lease-modal-warning">{err}</div>}
            <p className="muted">
              Phase 1: we'll save this {docType} as a linked PDF. You can extract terms manually
              in Airtable later, or wait for AI extraction support in a future phase.
            </p>
            <div className="lease-modal-grid">
              <div className="lease-modal-field">
                <label>Document Date</label>
                <input
                  type="date"
                  value={documentDate}
                  onChange={e => setDocumentDate(e.target.value)}
                />
              </div>
              {docType === 'Amendment' && (
                <div className="lease-modal-field">
                  <label>
                    Amendment Number
                    {lockDocType && initialAmendmentNumber != null && (
                      <span className="muted" style={{ marginLeft: '0.4rem', fontSize: '0.7rem' }}>(slot)</span>
                    )}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={amendmentNumber}
                    onChange={e => setAmendmentNumber(e.target.value)}
                    placeholder="e.g. 1"
                    disabled={lockDocType && initialAmendmentNumber != null}
                  />
                </div>
              )}
              {originalLeases.length > 0 && (
                <div className="lease-modal-field" style={{ gridColumn: '1 / -1' }}>
                  <label>Parent Lease</label>
                  <select value={parentLeaseId} onChange={e => setParentLeaseId(e.target.value)}>
                    <option value="">— None —</option>
                    {originalLeases.map(l => (
                      <option key={l.id} value={l.id}>
                        Original Lease{l.executionDate ? ` · executed ${l.executionDate}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setStage('idle')}>Back</button>
              <button className="btn-primary" onClick={handleSave}>Save {docType}</button>
            </div>
          </div>
        )}

        {stage === 'saving' && (
          <div className="lease-modal-body lease-modal-progress">
            <div className="spinner" />
            <p>Creating Lease record and attaching PDF…</p>
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
