import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { ConfirmDialog } from './ConfirmDialog';
import { useOpenPdf } from './PdfViewerProvider';
import type { FaTracker } from '../api/types';

export function CurrentFaPanel({ locationId }: { locationId: string }) {
  const { me } = useAuth();
  const [items, setItems]       = useState<FaTracker[] | null>(null);
  const [err, setErr]           = useState<string | null>(null);
  const [reload, setReload]     = useState(0);
  const [toDelete, setToDelete] = useState<FaTracker | null>(null);

  useEffect(() => {
    api.get<{ faTrackers: FaTracker[] }>(`/locations/${locationId}/fa-trackers`)
      .then(r => setItems(r.faTrackers))
      .catch(e => setErr(e.message));
  }, [locationId, reload]);

  async function handleDelete(fa: FaTracker) {
    await api.delete(`/fa-trackers/${fa.id}`);
    setReload(k => k + 1);
  }

  if (err) return null;
  if (!items) return null;
  if (items.length === 0) return null;

  const [primary, ...rest] = items;
  const isAdmin = me?.userType === 'Admin';

  return (
    <div className="lease-panel">
      <div className="lease-panel-head">
        <div className="lease-panel-title">Current franchise agreement</div>
        {primary.status && <span className={statusPillClass(primary.status)}>{primary.status}</span>}
      </div>
      <FaRow item={primary} isAdmin={isAdmin} onDelete={setToDelete} />
      {rest.length > 0 && (
        <div className="lease-history">
          <div className="lease-history-label">Prior agreements</div>
          {rest.map(it => <FaRow key={it.id} item={it} compact isAdmin={isAdmin} onDelete={setToDelete} />)}
        </div>
      )}
      {toDelete && (
        <ConfirmDialog
          title="Delete FA Tracker record?"
          destructive
          confirmLabel="Delete FA"
          onClose={() => setToDelete(null)}
          onConfirm={() => handleDelete(toDelete)}
          message={
            <>
              <p style={{ marginTop: 0 }}>
                This permanently removes the FA Tracker record and its PDF from Airtable. <strong>Cannot be undone.</strong>
              </p>
              <ul className="confirm-detail">
                {toDelete.file[0] && <li><strong>File:</strong> {toDelete.file[0].filename}</li>}
                {toDelete.entityName    && <li><strong>Entity:</strong> {toDelete.entityName}</li>}
                {toDelete.executionDate && <li><strong>Executed:</strong> {toDelete.executionDate}</li>}
                {toDelete.draName       && <li><strong>DRA:</strong> {toDelete.draName}</li>}
              </ul>
            </>
          }
        />
      )}
    </div>
  );
}

function FaRow({ item, compact = false, isAdmin, onDelete }: { item: FaTracker; compact?: boolean; isAdmin: boolean; onDelete: (fa: FaTracker) => void }) {
  const openPdf = useOpenPdf();
  return (
    <>
      <div className={compact ? 'lease-row lease-row--compact' : 'lease-row'}>
        <Field label="Executed"  value={item.executionDate} />
        <Field label="Term"      value={termText(item.termYears, item.termEnd)} />
        <Field label="Entity"    value={item.entityName} />
        <Field label="Signatory" value={item.signatory} />
        <div className="lease-row-actions">
          {item.file[0]
            ? <button
                type="button"
                className="btn-secondary"
                onClick={() => openPdf({
                  url: item.file[0].url, filename: item.file[0].filename,
                  title: 'Franchise Agreement',
                  subtitle: [item.entityName, item.executionDate ? `Executed ${item.executionDate}` : null].filter(Boolean).join(' · '),
                })}
              >📎 Open FA</button>
            : <span className="muted">No PDF on file</span>}
          {isAdmin && (
            <button
              type="button"
              className="btn-trash"
              title="Delete this FA record"
              onClick={() => onDelete(item)}>
              🗑
            </button>
          )}
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
