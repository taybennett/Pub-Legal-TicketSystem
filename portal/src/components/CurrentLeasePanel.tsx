import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { ConfirmDialog } from './ConfirmDialog';
import type { Lease } from '../api/types';

export function CurrentLeasePanel({ locationId }: { locationId: string }) {
  const { me } = useAuth();
  const [leases, setLeases]   = useState<Lease[] | null>(null);
  const [err, setErr]         = useState<string | null>(null);
  const [reload, setReload]   = useState(0);
  const [toDelete, setToDelete] = useState<Lease | null>(null);

  useEffect(() => {
    api.get<{ leases: Lease[] }>(`/locations/${locationId}/leases`)
      .then(r => setLeases(r.leases))
      .catch(e => setErr(e.message));
  }, [locationId, reload]);

  async function handleDelete(lease: Lease) {
    await api.delete(`/locations/${locationId}/leases/${lease.id}`);
    setReload(k => k + 1);
  }

  if (err) return null;
  if (!leases) return null;
  if (leases.length === 0) return null;

  const [primary, ...rest] = leases;
  const isAdmin = me?.userType === 'Admin';

  return (
    <div className="lease-panel">
      <div className="lease-panel-head">
        <div className="lease-panel-title">Current lease</div>
        {primary.status && <span className={statusPillClass(primary.status)}>{primary.status}</span>}
      </div>
      <LeaseRow lease={primary} isAdmin={isAdmin} onDelete={setToDelete} />
      {rest.length > 0 && (
        <div className="lease-history">
          <div className="lease-history-label">Prior leases</div>
          {rest.map(l => <LeaseRow key={l.id} lease={l} compact isAdmin={isAdmin} onDelete={setToDelete} />)}
        </div>
      )}
      {toDelete && (
        <ConfirmDialog
          title="Delete lease record?"
          destructive
          confirmLabel="Delete lease"
          onClose={() => setToDelete(null)}
          onConfirm={() => handleDelete(toDelete)}
          message={
            <>
              <p style={{ marginTop: 0 }}>
                This permanently removes the lease record and its PDF from Airtable. <strong>Cannot be undone.</strong>
              </p>
              <ul className="confirm-detail">
                {toDelete.file[0] && <li><strong>File:</strong> {toDelete.file[0].filename}</li>}
                {toDelete.executionDate && <li><strong>Executed:</strong> {toDelete.executionDate}</li>}
                {toDelete.status && <li><strong>Status:</strong> {toDelete.status}</li>}
              </ul>
            </>
          }
        />
      )}
    </div>
  );
}

function LeaseRow({ lease, compact = false, isAdmin, onDelete }: { lease: Lease; compact?: boolean; isAdmin: boolean; onDelete: (l: Lease) => void }) {
  return (
    <div className={compact ? 'lease-row lease-row--compact' : 'lease-row'}>
      <Field label="Executed"      value={lease.executionDate} />
      <Field label="Term"          value={termText(lease.termYears, lease.termEnd)} />
      <Field label="Monthly rent"  value={fmtMoney(lease.monthlyRent)} />
      <Field label="Annual rent"   value={fmtMoney(lease.annualRent)} />
      <div className="lease-row-actions">
        {lease.file[0]
          ? <a href={lease.file[0].url} target="_blank" rel="noreferrer" className="btn-secondary">📎 Open lease</a>
          : <span className="muted">No PDF on file</span>}
        {isAdmin && (
          <button
            type="button"
            className="btn-trash"
            title="Delete this lease record"
            onClick={() => onDelete(lease)}>
            🗑
          </button>
        )}
      </div>
    </div>
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

function fmtMoney(n: number | null): string | null {
  if (n === null || n === undefined) return null;
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function statusPillClass(status: string): string {
  const lower = status.toLowerCase();
  if (lower === 'active')                              return 'pill pill--green-soft';
  if (lower === 'expired')                             return 'pill pill--red';
  if (lower.includes('expiring') || lower === 'on holdover') return 'pill pill--blue';
  return 'pill';
}
