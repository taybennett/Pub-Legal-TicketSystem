import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { Composer } from '../components/Composer';
import { MessageThread } from '../components/MessageThread';
import { useAuth } from '../hooks/useAuth';
import type { Message, Ticket } from '../api/types';

interface DocumentRow {
  id: string;
  Filename?: string;
  'Document Type'?: string;
  Version?: number;
  'Uploaded By'?: string;
  'Uploaded By Role'?: string;
  'Uploaded At'?: string;
  File?: { url: string; filename: string }[];
}

export function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const { me } = useAuth();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [t, m, d] = await Promise.all([
        api.get<{ ticket: Ticket }>(`/tickets/${id}`),
        api.get<{ messages: Message[] }>(`/tickets/${id}/messages`),
        api.get<{ documents: DocumentRow[] }>(`/tickets/${id}/documents`),
      ]);
      setTicket(t.ticket);
      setMessages(m.messages);
      setDocs(d.documents);
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load');
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (err) return <div className="state state--error">{err}</div>;
  if (!ticket || !messages || !docs) return <div className="state state--loading">Loading conversation…</div>;

  const canMarkInternal = me?.userType === 'Employee' || me?.userType === 'Admin';
  const backLink = ticket.locationIds?.[0]
    ? `/locations/${ticket.locationIds[0]}/${workstreamToTab(ticket.workstream)}`
    : '/locations';

  return (
    <div className="page">
      <div className="detail-header">
        <div>
          <div className="detail-crumb"><Link to={backLink}>← Back</Link></div>
          <h1 className="page-title">{ticket.title}</h1>
          <div className="detail-sub">
            {ticket.workstream && <span className="pill pill--blue">{ticket.workstream}</span>}
            {ticket.requestType && <span>{ticket.requestType}</span>}
            {ticket.status && <span>Status: {ticket.status}</span>}
          </div>
        </div>
      </div>

      {ticket.description && (
        <div className="ticket-description">{ticket.description}</div>
      )}

      {docs.length > 0 && (
        <div className="ticket-docs">
          <div className="ticket-docs-label">Attached documents</div>
          <div className="ticket-docs-list">
            {docs.map(d => (
              <div key={d.id} className="ticket-doc">
                <div>
                  <div className="ticket-doc-name">{d.Filename ?? '(unnamed)'}</div>
                  <div className="ticket-doc-meta">
                    {d['Document Type'] ?? '—'}
                    {d.Version ? ` · v${d.Version}` : ''}
                    {d['Uploaded By'] ? ` · ${d['Uploaded By']}` : ''}
                  </div>
                </div>
                {Array.isArray(d.File) && d.File[0] && (
                  <a className="doc-row-open" href={d.File[0].url} target="_blank" rel="noreferrer">Open</a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <MessageThread messages={messages} />

      <Composer ticketId={ticket.id} onPosted={load} canMarkInternal={canMarkInternal} />
    </div>
  );
}

function workstreamToTab(ws: string | null): string {
  switch (ws) {
    case 'Real Estate':         return 'real-estate';
    case 'Franchise Agreement': return 'franchise-agreement';
    case 'Construction':        return 'construction';
    default:                    return '';
  }
}
