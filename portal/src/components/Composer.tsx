import { useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import { DOCUMENT_TYPES } from '../api/requestTypes';

interface ComposerProps {
  ticketId: string;
  onPosted: () => void;
  canMarkInternal: boolean;
}

export function Composer({ ticketId, onPosted, canMarkInternal }: ComposerProps) {
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<string>('');
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim() && !file) return;
    setBusy(true);
    setErr(null);
    try {
      // Post the message first (if present)
      if (body.trim()) {
        await api.post(`/tickets/${ticketId}/messages`, {
          body: body.trim(),
          internal: canMarkInternal ? internal : undefined,
        });
      }
      // Then upload the file (if present)
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('ticketId', ticketId);
        if (docType) fd.append('documentType', docType);
        await api.upload(`/documents`, fd);
      }
      setBody('');
      setFile(null);
      setDocType('');
      setInternal(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onPosted();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to send');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="composer">
      <textarea
        className="composer-textarea"
        placeholder="Type a reply…"
        value={body}
        onChange={e => setBody(e.target.value)}
        rows={3}
        disabled={busy}
      />
      <div className="composer-toolbar">
        <label className="composer-attach">
          <input
            ref={fileInputRef}
            type="file"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            accept=".pdf,.docx,.doc,.dwg,.dxf,.png,.jpg,.jpeg"
            disabled={busy}
          />
          <span className="composer-attach-label">
            {file ? `📎 ${file.name}` : '+ Attach file'}
          </span>
        </label>
        {file && (
          <select
            className="composer-doctype"
            value={docType}
            onChange={e => setDocType(e.target.value)}
            disabled={busy}
          >
            <option value="">Document type…</option>
            {DOCUMENT_TYPES.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        {canMarkInternal && (
          <label className="composer-internal">
            <input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} disabled={busy} />
            Internal only
          </label>
        )}
        <div className="composer-spacer" />
        {err && <span className="form-error">{err}</span>}
        <button className="btn-primary" type="submit" disabled={busy || (!body.trim() && !file)}>
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
    </form>
  );
}
