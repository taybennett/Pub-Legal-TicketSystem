import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { ChecklistItem, ComplianceResponse, ExcludedShop, ShopComplianceReport } from '../api/types';

type FilterKey = 'all' | 'issues' | 'compliant' | 'franchise' | 'franchiseOperating' | 'pubcorp';

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
    if (!data) return { all: 0, issues: 0, compliant: 0, franchise: 0, franchiseOperating: 0, pubcorp: 0 };
    return {
      all:                data.reports.length,
      issues:             data.summary.withGaps,
      compliant:          data.summary.fullyCompliant,
      franchise:          data.reports.filter(r => !r.isPubCorp).length,
      franchiseOperating: data.reports.filter(r => !r.isPubCorp && r.isOperating).length,
      pubcorp:            data.reports.filter(r =>  r.isPubCorp).length,
    };
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    switch (filter) {
      case 'issues':             return data.reports.filter(r => !r.fullyCompliant);
      case 'compliant':          return data.reports.filter(r =>  r.fullyCompliant);
      case 'franchise':          return data.reports.filter(r => !r.isPubCorp);
      case 'franchiseOperating': return data.reports.filter(r => !r.isPubCorp && r.isOperating);
      case 'pubcorp':            return data.reports.filter(r =>  r.isPubCorp);
      default:                   return data.reports;
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
  const refreshedLabel = data.refreshedAt ? relativeTime(data.refreshedAt) : null;
  const missing        = data.missingFromLocations ?? [];
  const missingShopId  = data.locationsMissingShopId ?? [];
  const excluded       = data.excludedFromScope ?? [];

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Compliance Check</h1>
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button className="btn-secondary" onClick={downloadCsv} disabled={busy}>Export CSV</button>
          <button className="btn-secondary" onClick={load} disabled={busy}>{busy ? 'Refreshing…' : 'Refresh'}</button>
        </div>
      </div>

      {refreshedLabel && (
        <div style={{ fontSize: '0.85rem', color: 'var(--muted, #6b7280)', marginTop: '-0.5rem', marginBottom: '1rem' }}>
          Last refreshed {refreshedLabel} · Scope: {total} {total === 1 ? 'shop' : 'shops'} with a signed Original Lease
        </div>
      )}

      {missing.length > 0 && (
        <div
          style={{
            background:   '#FEF3C7',
            border:       '1px solid #F59E0B',
            borderRadius: 4,
            padding:      '0.85rem 1.1rem',
            marginBottom: '1rem',
            fontSize:     '0.9rem',
            lineHeight:   1.55,
          }}
        >
          <strong style={{ color: '#92400E' }}>
            ⚠ {missing.length} operating {missing.length === 1 ? 'shop' : 'shops'} in the Pipeline
            {missing.length === 1 ? ' is' : ' are'} missing from your Locations table
          </strong>
          <div style={{ marginTop: '0.35rem', color: '#78350F' }}>
            {missing.length === 1 ? 'It is' : 'They are'} excluded from this report until added.
            Add {missing.length === 1 ? 'a Locations record' : 'Locations records'} in Airtable to pull {missing.length === 1 ? 'it' : 'them'} into scope:
          </div>
          <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem', color: '#78350F' }}>
            {missing.map(m => (
              <li key={m.shopId} style={{ marginBottom: '0.15rem' }}>
                <strong>{m.shopName}</strong> <code style={{ fontSize: '0.85em' }}>#{m.shopId}</code>
                {' '}
                <span style={{ opacity: 0.75 }}>· Pipeline status: {m.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {missingShopId.length > 0 && (
        <div
          style={{
            background:   '#FEE2E2',
            border:       '1px solid #EF4444',
            borderRadius: 4,
            padding:      '0.85rem 1.1rem',
            marginBottom: '1rem',
            fontSize:     '0.9rem',
            lineHeight:   1.55,
          }}
        >
          <strong style={{ color: '#991B1B' }}>
            ⚠ {missingShopId.length} Location {missingShopId.length === 1 ? 'record has' : 'records have'} no Shop ID
          </strong>
          <div style={{ marginTop: '0.35rem', color: '#7F1D1D' }}>
            The FA compliance check joins on Shop ID, so the FA-side checks silently return "no FA found" for
            {' '}{missingShopId.length === 1 ? 'this shop' : 'these shops'}. Populate the Shop ID field on
            {' '}{missingShopId.length === 1 ? 'the' : 'each'} Locations record so the report reflects reality:
          </div>
          <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem', color: '#7F1D1D' }}>
            {missingShopId.map(l => (
              <li key={l.locationId} style={{ marginBottom: '0.15rem' }}>
                <Link
                  to={`/locations/${l.locationId}`}
                  style={{ color: '#7F1D1D', textDecoration: 'underline' }}
                >
                  <strong>{l.shopName}</strong>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {excluded.length > 0 && (
        <ExcludedBanner shops={excluded} />
      )}

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
        <FilterTab label="All"                 n={counts.all}                active={filter === 'all'}                onClick={() => setFilter('all')} />
        <FilterTab label="With gaps"           n={counts.issues}             active={filter === 'issues'}             onClick={() => setFilter('issues')}     tone="red" />
        <FilterTab label="Compliant"           n={counts.compliant}          active={filter === 'compliant'}          onClick={() => setFilter('compliant')}  tone="green" />
        <FilterTab label="Franchise"           n={counts.franchise}          active={filter === 'franchise'}          onClick={() => setFilter('franchise')} />
        <FilterTab label="Franchise-Operating" n={counts.franchiseOperating} active={filter === 'franchiseOperating'} onClick={() => setFilter('franchiseOperating')} />
        <FilterTab label="PUB Corp"            n={counts.pubcorp}            active={filter === 'pubcorp'}            onClick={() => setFilter('pubcorp')} />
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
        Scope: every shop with a signed Original Lease (execution date set). PUB Corp shops are exempt from FA checks.
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

/**
 * Diagnostic banner: shops that ARE in Locations but got filtered out of the
 * compliance scope because their Pipeline status doesn't map to Operating.
 * Grouped by reason so a "Remodel × 4" or "Under Construction × 7" cluster
 * jumps out. Collapsed by default — the list can get long.
 */
function ExcludedBanner({ shops }: { shops: ExcludedShop[] }) {
  const [open, setOpen] = useState(false);

  // Bucket by the leading reason phrase (before parenthetical detail) so
  // the summary is scannable even without expanding.
  const groups = useMemo(() => {
    const m = new Map<string, ExcludedShop[]>();
    for (const s of shops) {
      const key = s.reason.split(';')[0].trim();
      const list = m.get(key) ?? [];
      list.push(s);
      m.set(key, list);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [shops]);

  return (
    <div
      style={{
        background:   '#EFF6FF',
        border:       '1px solid #93C5FD',
        borderRadius: 4,
        padding:      '0.85rem 1.1rem',
        marginBottom: '1.5rem',
        fontSize:     '0.9rem',
        lineHeight:   1.55,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <strong style={{ color: '#1E3A8A' }}>
          ℹ {shops.length} {shops.length === 1 ? 'shop is' : 'shops are'} in Locations but excluded from the compliance report
        </strong>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          style={{
            background:   'transparent',
            border:       '1px solid #93C5FD',
            color:        '#1E3A8A',
            padding:      '0.15rem 0.7rem',
            fontSize:     '0.8rem',
            cursor:       'pointer',
            borderRadius: 3,
          }}
        >
          {open ? 'Hide' : 'Show'} details
        </button>
      </div>
      <div style={{ marginTop: '0.35rem', color: '#1E40AF' }}>
        Scope is every shop with a signed Original Lease. These shops are excluded because their
        Original Lease is missing, unsigned, or unrecorded.
      </div>
      <div style={{ marginTop: '0.35rem', color: '#1E40AF' }}>
        By reason: {groups.map(([reason, list], i) => (
          <span key={reason}>
            {i > 0 ? ' · ' : ''}
            <strong>{list.length}</strong> {reason.toLowerCase()}
          </span>
        ))}
      </div>
      {open && (
        <div style={{ marginTop: '0.7rem' }}>
          {groups.map(([reason, list]) => (
            <div key={reason} style={{ marginTop: '0.6rem' }}>
              <div style={{
                fontSize:       '0.75rem',
                textTransform:  'uppercase',
                letterSpacing:  '0.05em',
                color:          '#1E3A8A',
                marginBottom:   '0.25rem',
              }}>
                {reason} ({list.length})
              </div>
              <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#1E40AF' }}>
                {list.map(s => (
                  <li key={s.locationId} style={{ marginBottom: '0.1rem' }}>
                    <Link
                      to={`/locations/${s.locationId}`}
                      style={{ color: '#1E40AF', textDecoration: 'underline' }}
                    >
                      <strong>{s.shopName}</strong>
                    </Link>
                    {s.shopId && (
                      <> <code style={{ fontSize: '0.85em' }}>#{s.shopId}</code></>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function relativeTime(iso: string): string {
  const then  = new Date(iso).getTime();
  const now   = Date.now();
  const delta = Math.max(0, now - then);
  const s = Math.floor(delta / 1000);
  if (s < 5)   return 'just now';
  if (s < 60)  return `${s} seconds ago`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}
