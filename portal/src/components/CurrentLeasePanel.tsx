import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Lease } from '../api/types';

export function CurrentLeasePanel({ locationId }: { locationId: string }) {
  const [leases, setLeases] = useState<Lease[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ leases: Lease[] }>(`/locations/${locationId}/leases`)
      .then(r => setLeases(r.leases))
      .catch(e => setErr(e.message));
  }, [locationId]);

  if (err) return null;            // fail quiet — tab still usable without panel
  if (!leases) return null;        // brief loading flicker is fine
  if (leases.length === 0) return null;

  const [primary, ...rest] = leases;

  return (
    <div className="lease-panel">
      <div className="lease-panel-head">
        <div className="lease-panel-title">Current lease</div>
        {primary.status && <span className={statusPillClass(primary.status)}>{primary.status}</span>}
      </div>
      <LeaseRow lease={primary} />
      {rest.length > 0 && (
        <div className="lease-history">
          <div className="lease-history-label">Prior leases</div>
          {rest.map(l => <LeaseRow key={l.id} lease={l} compact />)}
        </div>
      )}
    </div>
  );
}

function LeaseRow({ lease, compact = false }: { lease: Lease; compact?: boolean }) {
  return (
    <div className={compact ? 'lease-row lease-row--compact' : 'lease-row'}>
      <Field label="Executed"      value={lease.executionDate} />
      <Field label="Term"          value={termText(lease.termYears, lease.termEnd)} />
      <Field label="Monthly rent"  value={fmtMoney(lease.monthlyRent)} />
      <Field label="Annual rent"   value={fmtMoney(lease.annualRent)} />
      <div className="lease-row-file">
        {lease.file[0]
          ? <a href={lease.file[0].url} target="_blank" rel="noreferrer" className="btn-secondary">📎 Open lease</a>
          : <span className="muted">No PDF on file</span>}
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
