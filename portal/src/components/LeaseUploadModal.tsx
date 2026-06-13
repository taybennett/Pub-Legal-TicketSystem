import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { Confidence, LeaseExtraction } from '../api/types';

type Stage = 'idle' | 'extracting' | 'review' | 'saving' | 'done' | 'error';

interface Props {
  locationId: string;
  onClose:    () => void;
  onSaved:    () => void;
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

export function LeaseUploadModal({ locationId, onClose, onSaved }: Props) {
  const [stage, setStage]         = useState<Stage>('idle');
  const [file, setFile]           = useState<File | null>(null);
  const [existingCount, setExistingCount] = useState<number | null>(null);
  const [extraction, setExtraction] = useState<LeaseExtraction | null>(null);
  const [form, setForm]           = useState<FormState>(blank);
  const [confidence, setConfidence] = useState<Partial<Record<keyof FormState, Confidence>>>({});
  const [err, setErr]             = useState<string | null>(null);
  const [notes, setNotes]         = useState<string>('');
  const fileInputRef              = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Check for existing leases (duplicate detection warning)
    api.get<{ count: number }>(`/locations/${locationId}/leases/existing`)
      .then(r => setExistingCount(r.count))
      .catch(() => setExistingCount(0));
  }, [locationId]);

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

  async function handleSave() {
    if (!file) return;
    setStage('saving');
    setErr(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      Object.entries(form).forEach(([k, v]) => {
        if (v) fd.append(k, v);
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
      await api.upload(`/locations/${locationId}/leases`, fd);
      setStage('done');
      setTimeout(() => { onSaved(); onClose(); }, 1200);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Save failed');
      setStage('review');
    }
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
          <h2 className="modal-title">Upload Lease</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {existingCount != null && existingCount > 0 && stage === 'idle' && (
          <div className="lease-modal-warning">
            ⚠ This shop already has {existingCount} lease record{existingCount === 1 ? '' : 's'} on file.
            Uploading will add this as an additional record. Remove or rename the old one in Airtable afterward if needed.
          </div>
        )}

        {stage === 'idle' && (
          <div className="lease-modal-body">
            <p className="muted">
              Upload the executed Lease PDF. Claude AI will extract the lease terms in ~10 seconds.
              You'll review and edit before anything is saved.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="lease-modal-file"
            />
            {file && <div className="muted">📎 {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)</div>}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={handleSkipAI} disabled={!file}>Skip AI · enter manually</button>
              <button className="btn-primary" onClick={handleExtract} disabled={!file}>Extract with AI</button>
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

        {stage === 'saving' && (
          <div className="lease-modal-body lease-modal-progress">
            <div className="spinner" />
            <p>Creating Lease record and attaching PDF…</p>
          </div>
        )}

        {stage === 'done' && (
          <div className="lease-modal-body lease-modal-progress">
            <p style={{ color: '#1b5e20', fontSize: '1.2rem' }}>✓ Lease saved</p>
          </div>
        )}
      </div>
    </div>
  );
}
