import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { FaTracker } from '../api/types';

export function CurrentFaPanel({ locationId }: { locationId: string }) {
  const [items, setItems] = useState<FaTracker[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ faTrackers: FaTracker[] }>(`/locations/${locationId}/fa-trackers`)
      .then(r => setItems(r.faTrackers))
      .catch(e => setErr(e.message));
  }, [locationId]);

  if (err) return null;
  if (!items) return null;
  if (items.length === 0) return null;

  const [primary, ...rest] = items;

  return (
    <div className="lease-panel">
      <div className="lease-panel-head">
        <div className="lease-panel-title">Current franchise agreement</div>
        {primary.status && <span className={statusPillClass(primary.status)}>{primary.status}</span>}
      </div>
      <FaRow item={primary} />
      {rest.length > 0 && (
        <div className="lease-history">
          <div className="lease-history-label">Prior agreements</div>
          {rest.map(it => <FaRow key={it.id} item={it} compact />)}
        </div>
      )}
    </div>
  );
}

function FaRow({ item, compact = false }: { item: FaTracker; compact?: boolean }) {
  return (
    <>
      <div className={compact ? 'lease-row lease-row--compact' : 'lease-row'}>
        <Field label="Executed"  value={item.executionDate} />
        <Field label="Term"      value={termText(item.termYears, item.termEnd)} />
        <Field label="Entity"    value={item.entityName} />
        <Field label="Signatory" value={item.signatory} />
        <div className="lease-row-file">
          {item.file[0]
            ? <a href={item.file[0].url} target="_blank" rel="noreferrer" className="btn-secondary">📎 Open FA</a>
            : <span className="muted">No PDF on file</span>}
        </div>
      </div>
      {(item.draName || item.attorney) && (
        <div className="fa-secondary-row">
          {item.draName  && <span><strong>DRA:</strong> {item.draName}</span>}
          {item.attorney && <span><strong>Attorney:</strong> {item.attorney}</span>}
        </div>
      )}
    </>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="lease-field">
      <div className="lease-field-label">{label}</div>
      <div className="lease-field-value">{value ?? '—'}</div>
    </div>
  );
}

function termText(years: number | null, end: string | null): string | null {
  if (years && end) return `${years} years (ends ${end})`;
  if (years)        return `${years} years`;
  if (end)          return `Ends ${end}`;
  return null;
}

function statusPillClass(status: string): string {
  const lower = status.toLowerCase();
  if (lower === 'active')             return 'pill pill--green-soft';
  if (lower === 'expired')            return 'pill pill--red';
  if (lower.includes('expiring'))     return 'pill pill--blue';
  return 'pill';
}
