import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import type { DraDetail, DraFa, DraSummary } from '../api/types';

export function Dras() {
  const [summaries, setSummaries] = useState<DraSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string>('');
  const [detail, setDetail] = useState<DraDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    api.get<{ dras: DraSummary[] }>('/dras')
      .then(r => {
        setSummaries(r.dras);
        if (r.dras.length > 0) setSelectedId(r.dras[0].id);
      })
      .catch(e => setErr(e.message));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoadingDetail(true);
    setDetail(null);
    api.get<{ dra: DraDetail }>(`/dras/${selectedId}`)
      .then(r => setDetail(r.dra))
      .catch(e => setErr(e.message))
      .finally(() => setLoadingDetail(false));
  }, [selectedId]);

  if (err) return <div className="state state--error">{err}</div>;
  if (!summaries) return <div className="state state--loading">Loading DRAs…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Development Rights Agreements</h1>
      </div>

      <div className="dra-picker">
        <label htmlFor="dra-select" className="dra-picker-label">Select a DRA</label>
        <select
          id="dra-select"
          className="dra-select"
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
        >
          {summaries.map(d => (
            <option key={d.id} value={d.id}>
              {d.name} — {d.fasExecuted}/{d.totalObligation} executed
            </option>
          ))}
        </select>
      </div>

      {loadingDetail && <div className="state state--loading">Loading DRA details…</div>}
      {detail && <DraDetailView detail={detail} />}
    </div>
  );
}

function DraDetailView({ detail }: { detail: DraDetail }) {
  const scheduleYears = useMemo(
    () => Object.keys(detail.schedule).sort(),
    [detail.schedule],
  );
  const aheadBehind = detail.outstanding === 0
    ? '✓ Fully executed'
    : `${detail.outstanding} outstanding`;

  return (
    <div className="dra-panel">
      <div className="dra-panel-head">
        <h2 className="dra-panel-title">{detail.name}</h2>
        {detail.termEndDate && (
          <span className="dra-term">Term ends {detail.termEndDate}</span>
        )}
      </div>

      <div className="dra-metrics">
        <Metric label="Total obligation"      value={detail.totalObligation} />
        <Metric label="FAs executed"          value={detail.fasExecuted} />
        <Metric label="Currently open"        value={detail.currentlyOpen} />
        <Metric label="Outstanding"           value={detail.outstanding} highlight={detail.outstanding > 0 ? 'red' : 'green'} />
      </div>

      <div className="dra-actions">
        {detail.draFile[0]
          ? <a href={detail.draFile[0].url} target="_blank" rel="noreferrer" className="btn-secondary">📎 Open DRA</a>
          : <span className="muted">No DRA PDF on file</span>}
      </div>

      {scheduleYears.length > 0 && (
        <div className="dra-schedule">
          <div className="dra-schedule-label">Development schedule</div>
          <div className="dra-schedule-row">
            {scheduleYears.map(y => (
              <div key={y} className="dra-schedule-cell">
                <div className="dra-schedule-year">{y}</div>
                <div className="dra-schedule-count">{detail.schedule[y]}</div>
              </div>
            ))}
          </div>
          <div className="muted dra-schedule-note">{aheadBehind}</div>
        </div>
      )}

      <div className="dra-fas">
        <div className="dra-fas-header">
          <div className="dra-fas-title">Executed franchise agreements</div>
          <div className="muted">{detail.fas.length} record{detail.fas.length === 1 ? '' : 's'}</div>
        </div>
        {detail.fas.length === 0 ? (
          <div className="state state--empty">No FAs executed under this DRA yet.</div>
        ) : (
          <div className="dra-fa-list">
            {detail.fas.map(fa => <FaRow key={fa.id} fa={fa} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function FaRow({ fa }: { fa: DraFa }) {
  const term = termText(fa.termYears, fa.termEnd);
  return (
    <div className="dra-fa">
      <div className="dra-fa-main">
        <div className="dra-fa-title">
          {fa.shopName || '(unnamed shop)'}
          {fa.shopNumber && <span className="dra-fa-shopid"> · #{fa.shopNumber}</span>}
          {fa.isOpen && <span className="pill pill--green-soft dra-fa-pill">Open</span>}
          {!fa.isOpen && <span className="pill pill--gray dra-fa-pill">Not yet open</span>}
        </div>
        <div className="dra-fa-meta">
          {fa.executionDate && <>Executed {fa.executionDate}</>}
          {term && <> · {term}</>}
          {fa.entityName && <> · {fa.entityName}</>}
          {fa.signatory && <> · Signatory: {fa.signatory}</>}
        </div>
      </div>
      <div className="dra-fa-actions">
        {fa.file[0]
          ? <a href={fa.file[0].url} target="_blank" rel="noreferrer" className="btn-secondary">📎 View FA</a>
          : <span className="muted">No PDF</span>}
      </div>
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: number; highlight?: 'red' | 'green' }) {
  const color = highlight === 'red' ? '#721c24' : highlight === 'green' ? '#1b5e20' : undefined;
  return (
    <div className="dra-metric">
      <div className="dra-metric-label">{label}</div>
      <div className="dra-metric-value" style={color ? { color, fontWeight: 700 } : undefined}>{value}</div>
    </div>
  );
}

function termText(years: number | null, end: string | null): string | null {
  if (years && end) return `${years}yr (ends ${end})`;
  if (years)        return `${years}yr term`;
  if (end)          return `Ends ${end}`;
  return null;
}
