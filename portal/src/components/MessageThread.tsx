import type { Message } from '../api/types';

function formatWhen(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch { return iso; }
}

function roleClass(role: string | null): string {
  if (role === 'Franchisee' || role === 'Partner') return 'msg--franchisee';
  return 'msg--franchisor';
}

export function MessageThread({ messages }: { messages: Message[] }) {
  if (messages.length === 0) {
    return <div className="state state--empty">No messages yet. Start the conversation below.</div>;
  }
  return (
    <div className="msg-thread">
      {messages.map(m => (
        <div key={m.id} className={`msg ${roleClass(m.senderRole)} ${m.internal ? 'msg--internal' : ''}`}>
          <div className="msg-header">
            <span className="msg-sender">{m.sender}</span>
            {m.senderRole && <span className="msg-role">{m.senderRole}</span>}
            {m.internal && <span className="msg-internal-pill">Internal</span>}
            <span className="msg-when">{formatWhen(m.sentAt)}</span>
          </div>
          <div className="msg-body">{m.body}</div>
        </div>
      ))}
    </div>
  );
}
