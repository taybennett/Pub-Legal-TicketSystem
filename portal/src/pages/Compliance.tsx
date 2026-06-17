import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { ChecklistItem, ComplianceResponse, ShopComplianceReport } from '../api/types';

export function Compliance() {
  const [data, setData]   = useState<ComplianceResponse | null>(null);
  const [err, setErr]     = useState<string | null>(null);
  const [busy, setBusy]   = useState(false);

  function load() {
    setBusy(true);
    setErr(null);
    api.get<ComplianceResponse>('/compliance')
      .then(r => setData(r))
      .catch(e => setErr(e.message))
      .finally(() => setBusy(false));
  }

  useEffect(() => { load(); }, []);

  function downloadCsv() {
    if (!data) return;
    const rows = [
      ['Shop', 'Shop #', 'Type', 'Compliant', 'Gaps',
       'Lease record', 'Lease PDF', 'Lease exec date',
       'FA record', 'FA PDF', 'FA exec date'],
      ...data.reports.map(r => [
        r.shopName,
        r.shopId,
        r.isPubCorp ? 'PUB Corp' : 'Franchise',
        r.fullyCompliant ? 'YES' : 'NO',
        r.gapCount,
        b(r.lease.present.ok),
        b(r.lease.pdfAttached.ok),
        b(r.lease.execDate.ok),
        r.fa ? b(r.fa.present.ok)     : 'N/A',
        r.fa ? b(r.fa.pdfAttached.ok) : 'N/A',
        r.fa ? b(r.fa.execDate.ok)    : 'N/A',
      ]),
    ];
    const csv = rows.map(row =>
      row.map(cell => {
        const s = String(cell ?? '');
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(',')
    ).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `pub-legal-compliance-${date}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  if (err) return <div className="state state--error">{err}</div>;
  if (!data) return <div className="state state--loading">Loading compliance report…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Compliance Check</h1>
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button className="btn-secondary" onClick={downloadCsv} disabled={busy}>Export CSV</button>
          <button className="btn-secondary" onClick={load} disabled={busy}>{busy ? 'Refreshing…' : 'Refresh'}</button>
        </div>
      </div>

      <div className="compliance-summary">
        <div className="compliance-summary-item compliance-summary-item--ok">
          <div className="compliance-summary-num">{data.summary.fullyCompliant}</div>
          <div className="compliance-summary-label">Fully compliant</div>
        </div>
        <div className="compliance-summary-item compliance-summary-item--gap">
          <div className="compliance-summary-num">{data.summary.withGaps}</div>
          <div className="compliance-summary-label">With gaps</div>
        </div>
        <div className="compliance-summary-item">
          <div className="compliance-summary-num">{data.summary.totalOpen}</div>
          <div className="compliance-summary-label">Open shops</div>
        </div>
      </div>

      <p className="muted" style={{ marginBottom: '1rem', fontSize: '0.78rem' }}>
        Showing all shops currently in the Open bucket (Pipeline status = Open). PUB Corp shops are exempt from FA checks.
      </p>

      <div className="compliance-list">
        {data.reports.map(r => <ReportRow key={r.locationId} r={r} />)}
      </div>
    </div>
  );
}

function ReportRow({ r }: { r: ShopComplianceReport }) {
  const statusClass = r.fullyCompliant ? 'comp-ok' : r.gapCount >= 3 ? 'comp-critical' : 'comp-warn';
  const statusIcon  = r.fullyCompliant ? '✓' : '✗';
  return (
    <Link to={`/locations/${r.locationId}/real-estate`} className={`compliance-row ${statusClass}`}>
      <div className="compliance-row-head">
        <div className="compliance-row-status">{statusIcon}</div>
        <div className="compliance-row-name">
          {r.shopName}
          {r.shopId && <span className="compliance-row-shopid"> · #{r.shopId}</span>}
          {r.isPubCorp && <span className="pill pill--gray" style={{ marginLeft: '0.5rem' }}>PUB Corp</span>}
        </div>
        <div className="compliance-row-gaps">
          {r.fullyCompliant ? 'OK' : `${r.gapCount} gap${r.gapCount === 1 ? '' : 's'}`}
        </div>
      </div>
      <div className="compliance-checks">
        <CheckGroup label="Lease" items={[r.lease.present, r.lease.pdfAttached, r.lease.execDate]} />
        {r.fa
          ? <CheckGroup label="FA" items={[r.fa.present, r.fa.pdfAttached, r.fa.execDate]} />
          : <div className="compliance-check-group compliance-check-group--na">FA — N/A (PUB Corp)</div>}
      </div>
    </Link>
  );
}

function CheckGroup({ label, items }: { label: string; items: ChecklistItem[] }) {
  return (
    <div className="compliance-check-group">
      <div className="compliance-check-label">{label}</div>
      <div className="compliance-check-pills">
        {items.map((c, i) => (
          <span key={i} className={`compliance-pill ${c.ok ? 'compliance-pill--ok' : 'compliance-pill--fail'}`}>
            {c.ok ? '✓' : '✗'} {c.label.replace(label + ' ', '')}
          </span>
        ))}
      </div>
    </div>
  );
}

function b(ok: boolean): string {
  return ok ? '✓' : '✗';
}
