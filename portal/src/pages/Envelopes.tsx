import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { fileProxyUrl } from '../api/client';

interface EnvelopeRow {
  id:            string;
  subject:       string | null;
  envelopeId:    string | null;
  status:        string | null;
  documentType:  string | null;
  sentAt:        string | null;
  completedAt:   string | null;
  sentBy:        string | null;
  recipients:    Array<{ name: string; email: string; role: string }>;
  signedDocuments: Array<{ url: string; filename: string }>;
}

export function Envelopes() {
  const [envs, setEnvs]         = useState<EnvelopeRow[] | null>(null);
  const [err, setErr]           = useState<string | null>(null);
  const [syncing, setSyncing]   = useState<string | null>(null);

  useEffect(() => {
    api.get<{ envelopes: EnvelopeRow[] }>('/docusign/envelopes')
      .then(r => setEnvs(r.envelopes))
      .catch(e => setErr(e.message));
  }, []);

  async function refreshOne(envelopeId: string) {
    setSyncing(envelopeId);
    try {
      await api.get(`/docusign/envelope/${envelopeId}`);
      const r = await api.get<{ envelopes: EnvelopeRow[] }>('/docusign/envelopes');
      setEnvs(r.envelopes);
    } finally {
      setSyncing(null);
    }
  }

  if (err) return <div className="state state--error">{err}</div>;
  if (!envs) return <div className="state state--loading">Loading envelopes…</div>;

  return (
    <div className="page envelopes-page">
      <div className="page-header">
        <h1 className="page-title">DocuSign Envelopes</h1>
      </div>

      <p className="muted" style={{ marginBottom: '1.5rem' }}>
        Every envelope sent from the portal. Status updates automatically via DocuSign Connect webhook. Click a row to
        manually sync status if you suspect a delay.
      </p>

      {envs.length === 0 && <div className="state state--empty">No envelopes have been sent yet.</div>}

      {envs.length > 0 && (
        <div className="envelopes-table-wrap">
          <table className="envelopes-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Type</th>
                <th>Recipients</th>
                <th>Status</th>
                <th>Sent</th>
                <th>Completed</th>
                <th>Signed PDF</th>
              </tr>
            </thead>
            <tbody>
              {envs.map(e => (
                <tr key={e.id}>
                  <td style={{ maxWidth: 260 }}>
                    <div style={{ fontWeight: 600 }}>{e.subject ?? '—'}</div>
                    {e.envelopeId && (
                      <div className="muted" style={{ fontSize: '0.7rem', fontFamily: 'monospace' }}>{e.envelopeId}</div>
                    )}
                  </td>
                  <td>{e.documentType ?? '—'}</td>
                  <td>
                    {e.recipients.length === 0 && <span className="muted">—</span>}
                    {e.recipients.map((r, i) => (
                      <div key={i} style={{ fontSize: '0.78rem' }}>
                        <strong>{r.role}:</strong> {r.name} · {r.email}
                      </div>
                    ))}
                  </td>
                  <td>
                    <span className={`envelope-status-pill envelope-status-${e.status ?? 'Created'}`}>
                      {e.status ?? 'Created'}
                    </span>
                    {e.envelopeId && (
                      <button
                        type="button"
                        className="btn-link"
                        style={{ display: 'block', marginTop: 4, fontSize: '0.75rem', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer' }}
                        disabled={syncing === e.envelopeId}
                        onClick={() => refreshOne(e.envelopeId!)}
                      >
                        {syncing === e.envelopeId ? 'Syncing…' : '↻ Sync'}
                      </button>
                    )}
                  </td>
                  <td>{formatDate(e.sentAt)}</td>
                  <td>{formatDate(e.completedAt)}</td>
                  <td>
                    {e.signedDocuments.length === 0
                      ? <span className="muted">—</span>
                      : e.signedDocuments.map((d, i) => (
                          <a
                            key={i}
                            href={fileProxyUrl(d.url)}
                            download={d.filename}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ display: 'block', fontSize: '0.8rem' }}
                          >
                            ⬇ {d.filename}
                          </a>
                        ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch { return iso; }
}
