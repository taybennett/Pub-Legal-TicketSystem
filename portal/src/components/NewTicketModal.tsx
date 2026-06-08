import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import { REQUEST_TYPES_BY_WORKSTREAM } from '../api/requestTypes';
import type { Workstream } from '../api/types';

interface NewTicketModalProps {
  locationId?: string;
  workstream: Workstream;
  onClose: () => void;
  onCreated: (ticketId: string) => void;
}

export function NewTicketModal({ locationId, workstream, onClose, onCreated }: NewTicketModalProps) {
  const scoped = workstream === 'Construction' ? [] : REQUEST_TYPES_BY_WORKSTREAM[workstream];
  const [requestType, setRequestType] = useState<string>(scoped[0] ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !requestType) return;
    setBusy(true);
    setErr(null);
    try {
      const resp = await api.post<{ ticket: { id: string } }>('/tickets', {
        locationId,
        workstream,
        requestType,
        title: title.trim(),
        description: description.trim() || undefined,
      });
      onCreated(resp.ticket.id);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to create');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">New {workstream} conversation</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          {scoped.length > 0 && (
            <>
              <label className="form-label">What's this about?</label>
              <select
                className="form-input"
                value={requestType}
                onChange={e => setRequestType(e.target.value)}
                disabled={busy}
              >
                {scoped.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </>
          )}
          <label className="form-label">Subject</label>
          <input
            className="form-input"
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Short summary"
            disabled={busy}
            maxLength={200}
            autoFocus
          />
          <label className="form-label">Details (optional)</label>
          <textarea
            className="form-input"
            rows={4}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Give the legal team the context they'll need…"
            disabled={busy}
            maxLength={10000}
          />
          {err && <div className="form-error">{err}</div>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy || !title.trim() || !requestType}>
              {busy ? 'Creating…' : 'Create conversation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
