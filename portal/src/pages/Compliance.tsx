import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { ChecklistItem, ComplianceResponse, ShopComplianceReport } from '../api/types';

type FilterKey = 'all' | 'issues' | 'compliant' | 'franchise' | 'pubcorp';

export function Compliance() {
  const [data, setData] = useState<ComplianceResponse | null>(null);
  const [err, setErr]   = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');

  function load() {
    setBusy(true);
    setErr(null);
    api.get<ComplianceResponse>('/compliance')
      .then(r => setData(r))
      .catch(e => setErr(e.message))
      .finally(() => setBusy(false));
  }
  useEffect(() => { load(); }, []);

  const counts = useMemo(() => {
    if (!data) return { all: 0, issues: 0, compliant: 0, franchise: 0, pubcorp: 0 };
    return {
      all:        data.reports.length,
      issues:     data.summary.withGaps,
      compliant:  data.summary.fullyCompliant,
      franchise:  data.reports.filter(r => !r.isPubCorp).length,
      pubcorp:    data.reports.filter(r =>  r.isPubCorp).length,
    };
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    switch (filter) {
      case 'issues':    return data.reports.filter(r => !r.fullyCompliant);
      case 'compliant': return data.reports.filter(r =>  r.fullyCompliant);
      case 'franchise': return data.reports.filter(r => !r.isPubCorp);
      case 'pubcorp':   return data.reports.filter(r =>  r.isPubCorp);
      default:          return data.reports;
    }
  }, [data, filter]);

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

  const total = data.summary.totalOpen;
  const rate  = total > 0 ? Math.round((data.summary.fullyCompliant / total) * 100) : 0;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Compliance Check</h1>
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button className="btn-secondary" onClick={downloadCsv} disabled={busy}>Export CSV</button>
          <button className="btn-secondary" onClick={load} disabled={busy}>{busy ? 'Refreshing…' : 'Refresh'}</button>
        </div>
      </div>

      {/* Compliance rate bar */}
      <div className="comp-hero">
        <div className="comp-hero-row">
          <div className="comp-hero-rate">
            <div className="comp-hero-num">{rate}%</div>
            <div className="comp-hero-cap">Compliance rate</div>
          </div>
          <div className="comp-hero-bar-wrap">
            <div className="comp-hero-bar">
              <div className="comp-hero-bar-fill" style={{ width: `${rate}%` }} />
            </div>
            <div className="comp-hero-stats">
              <span><strong>{data.summary.fullyCompliant}</strong> compliant</span>
              <span className="comp-hero-sep">·</span>
              <span><strong>{data.summary.withGaps}</strong> with gaps</span>
              <span className="comp-hero-sep">·</span>
              <span><strong>{total}</strong> total Open shops</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="comp-tabs">
        <FilterTab label="All"        n={counts.all}       active={filter === 'all'}        onClick={() => setFilter('all')} />
        <FilterTab label="With gaps"  n={counts.issues}    active={filter === 'issues'}     onClick={() => setFilter('issues')}     tone="red" />
        <FilterTab label="Compliant"  n={counts.compliant} active={filter === 'compliant'}  onClick={() => setFilter('compliant')}  tone="green" />
        <FilterTab label="Franchise"  n={counts.franchise} active={filter === 'franchise'}  onClick={() => setFilter('franchise')} />
        <FilterTab label="PUB Corp"   n={counts.pubcorp}   active={filter === 'pubcorp'}    onClick={() => setFilter('pubcorp')} />
      </div>

      {/* Report table */}
      <div className="comp-table">
        <div className="comp-table-head">
          <div className="ct-col ct-col-shop">Shop</div>
          <div className="ct-col ct-col-type">Type</div>
          <div className="ct-col ct-col-check">
            <span>Lease</span>
            <span className="comp-legend">Record · PDF · Date</span>
          </div>
          <div className="ct-col ct-col-check">
            <span>FA</span>
            <span className="comp-legend">Record · PDF · Date</span>
          </div>
          <div className="ct-col ct-col-gap">Gaps</div>
          <div className="ct-col ct-col-arrow" />
        </div>
        {filtered.length === 0 && (
          <div className="comp-empty">No shops match this filter.</div>
        )}
        {filtered.map(r => <Row key={r.locationId} r={r} />)}
      </div>

      <p className="muted comp-foot">
        Scope: every shop in the Open bucket (Pipeline status = Open). PUB Corp shops are exempt from FA checks.
      </p>
    </div>
  );
}

function FilterTab({ label, n, active, onClick, tone }: { label: string; n: number; active: boolean; onClick: () => void; tone?: 'red' | 'green' }) {
  const cls = 'comp-tab' + (active ? ' comp-tab--active' : '') + (tone ? ` comp-tab--${tone}` : '');
  return (
    <button type="button" className={cls} onClick={onClick}>
      {label}
      <span className="comp-tab-num">{n}</span>
    </button>
  );
}

function Row({ r }: { r: ShopComplianceReport }) {
  const tone = r.fullyCompliant ? 'ok' : r.gapCount >= 3 ? 'critical' : 'warn';
  return (
    <Link to={`/locations/${r.locationId}/real-estate`} className={`comp-row comp-row--${tone}`}>
      <div className="ct-col ct-col-shop">
        <div className="comp-shop-name">{r.shopName}</div>
        {r.shopId && <div className="comp-shop-id">#{r.shopId}</div>}
      </div>
      <div className="ct-col ct-col-type">
        {r.isPubCorp ? <span className="comp-type-tag comp-type-tag--corp">PUB Corp</span>
                     : <span className="comp-type-tag">Franchise</span>}
      </div>
      <CheckCell items={[r.lease.present, r.lease.pdfAttached, r.lease.execDate]} />
      <CheckCell items={r.fa ? [r.fa.present, r.fa.pdfAttached, r.fa.execDate] : null} />
      <div className="ct-col ct-col-gap">
        {r.fullyCompliant
          ? <span className="comp-gap-ok">✓</span>
          : <span className="comp-gap-num">{r.gapCount}</span>}
      </div>
      <div className="ct-col ct-col-arrow">›</div>
    </Link>
  );
}

function CheckCell({ items }: { items: ChecklistItem[] | null }) {
  if (!items) {
    return (
      <div className="ct-col ct-col-check">
        <span className="comp-na">— N/A</span>
      </div>
    );
  }
  return (
    <div className="ct-col ct-col-check">
      <div className="comp-dots">
        {items.map((c, i) => (
          <span key={i}
            className={`comp-dot comp-dot--${c.ok ? 'ok' : 'fail'}`}
            title={c.label + (c.ok ? ' — OK' : ' — MISSING')}>
            {c.ok ? '✓' : '✗'}
          </span>
        ))}
      </div>
    </div>
  );
}

function b(ok: boolean): string {
  return ok ? '✓' : '✗';
}
