import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { ConfirmDialog } from './ConfirmDialog';
import type { Lease, LeaseDocumentType } from '../api/types';

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

  // Treat null documentType as "Original Lease" (records created before multi-doc support).
  const originals = leases.filter(l => l.documentType === 'Original Lease' || l.documentType === null);
  const related   = leases.filter(l => l.documentType && l.documentType !== 'Original Lease');
  // Most recent Original first.
  originals.sort((a, b) => (b.executionDate ?? '').localeCompare(a.executionDate ?? ''));
  // Related docs: Amendments by number then date, then everything else by date.
  related.sort(compareRelated);

  const primary  = originals[0];
  const priorOgs = originals.slice(1);
  const isAdmin  = me?.userType === 'Admin';

  return (
    <div className="lease-panel">
      <div className="lease-panel-head">
        <div className="lease-panel-title">Original Lease</div>
        {primary && primary.status && <span className={statusPillClass(primary.status)}>{primary.status}</span>}
      </div>

      {primary
        ? <LeaseRow lease={primary} isAdmin={isAdmin} onDelete={setToDelete} />
        : <div className="muted" style={{ padding: '0.5rem 0' }}>No Original Lease on file.</div>}

      {priorOgs.length > 0 && (
        <div className="lease-history">
          <div className="lease-history-label">Prior Original Leases</div>
          {priorOgs.map(l => <LeaseRow key={l.id} lease={l} compact isAdmin={isAdmin} onDelete={setToDelete} />)}
        </div>
      )}

      {related.length > 0 && (
        <div className="lease-related">
          <div className="lease-related-label">
            Related Documents <span className="muted">· {related.length}</span>
          </div>
          {related.map(l => (
            <RelatedDocRow key={l.id} lease={l} isAdmin={isAdmin} onDelete={setToDelete} />
          ))}
        </div>
      )}

      {toDelete && (
        <ConfirmDialog
          title={`Delete ${toDelete.documentType ?? 'lease'} record?`}
          destructive
          confirmLabel="Delete record"
          onClose={() => setToDelete(null)}
          onConfirm={() => handleDelete(toDelete)}
          message={
            <>
              <p style={{ marginTop: 0 }}>
                This permanently removes the record and its PDF from Airtable. <strong>Cannot be undone.</strong>
              </p>
              <ul className="confirm-detail">
                {toDelete.documentType && <li><strong>Type:</strong> {toDelete.documentType}</li>}
                {toDelete.file[0]      && <li><strong>File:</strong> {toDelete.file[0].filename}</li>}
                {toDelete.documentDate && <li><strong>Document date:</strong> {toDelete.documentDate}</li>}
                {toDelete.executionDate && !toDelete.documentDate && <li><strong>Executed:</strong> {toDelete.executionDate}</li>}
                {toDelete.status       && <li><strong>Status:</strong> {toDelete.status}</li>}
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

function RelatedDocRow({ lease, isAdmin, onDelete }: { lease: Lease; isAdmin: boolean; onDelete: (l: Lease) => void }) {
  const type = lease.documentType ?? 'Other';
  const label = type === 'Amendment' && lease.amendmentNumber
    ? `Amendment #${lease.amendmentNumber}`
    : type;
  const date = lease.documentDate ?? lease.executionDate;
  return (
    <div className="lease-related-row">
      <span className={`pill ${docTypePillClass(type)}`}>{label}</span>
      <span className="lease-related-date">{date ?? 'No date'}</span>
      <div className="lease-related-actions">
        {lease.file[0]
          ? <a href={lease.file[0].url} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">📎 Open</a>
          : <span className="muted">No PDF</span>}
        {isAdmin && (
          <button
            type="button"
            className="btn-trash"
            title={`Delete this ${type} record`}
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

function docTypePillClass(t: LeaseDocumentType): string {
  switch (t) {
    case 'Amendment':            return 'pill--yellow';
    case 'Guaranty':             return 'pill--purple';
    case 'Landlord Work Letter': return 'pill--teal';
    case 'Estoppel':             return 'pill--orange';
    case 'Side Letter':          return 'pill--gray';
    case 'Other':                return 'pill--gray';
    default:                     return 'pill--blue-soft';
  }
}

// Amendments first (sorted by amendment number, then by document date), then
// everything else by document date. Keeps "Amendment #1, #2, #3, Guaranty, …" stable.
function compareRelated(a: Lease, b: Lease): number {
  const aIsAmend = a.documentType === 'Amendment';
  const bIsAmend = b.documentType === 'Amendment';
  if (aIsAmend && bIsAmend) {
    const an = a.amendmentNumber ?? 0;
    const bn = b.amendmentNumber ?? 0;
    if (an !== bn) return an - bn;
  }
  if (aIsAmend && !bIsAmend) return -1;
  if (!aIsAmend && bIsAmend) return 1;
  const ad = a.documentDate ?? a.executionDate ?? '';
  const bd = b.documentDate ?? b.executionDate ?? '';
  return bd.localeCompare(ad);
}
