import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';

interface ReportColumn {
  key:    string;
  label:  string;
  align?: 'left' | 'right';
  type?:  'string' | 'number' | 'currency' | 'date' | 'boolean';
}

interface ReportResult {
  slug:        string;
  title:       string;
  description: string;
  columns:     ReportColumn[];
  rows:        Array<Record<string, unknown>>;
  generatedAt: string;
  notes?:      string;
  query?:      string;
}

interface ReportListItem {
  slug:        string;
  title:       string;
  description: string;
}

type SortState = { key: string; dir: 'asc' | 'desc' } | null;

export function Reports() {
  const [templates, setTemplates] = useState<ReportListItem[] | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState>(null);
  const [nlqInput, setNlqInput] = useState<string>('');
  const [nlqLoading, setNlqLoading] = useState<boolean>(false);

  useEffect(() => {
    api.get<{ reports: ReportListItem[] }>('/reports')
      .then(r => {
        setTemplates(r.reports);
        if (r.reports.length > 0) {
          setSelectedSlug(r.reports[0].slug);
        }
      })
      .catch(e => setErr(e.message));
  }, []);

  useEffect(() => {
    if (!selectedSlug || selectedSlug === '__nlq__') return;
    setLoading(true);
    setResult(null);
    setErr(null);
    setSort(null);
    api.get<ReportResult>(`/reports/template/${selectedSlug}`)
      .then(r => setResult(r))
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [selectedSlug]);

  async function handleNlq(e: FormEvent) {
    e.preventDefault();
    const query = nlqInput.trim();
    if (!query) return;
    setNlqLoading(true);
    setErr(null);
    setSort(null);
    setSelectedSlug('__nlq__');
    setResult(null);
    try {
      const r = await api.post<ReportResult>('/reports/nlq', { query });
      setResult(r);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'NL query failed');
    } finally {
      setNlqLoading(false);
    }
  }

  const sortedRows = useMemo(() => {
    if (!result || !sort) return result?.rows ?? [];
    const rows = [...result.rows];
    const { key, dir } = sort;
    rows.sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return dir === 'asc' ? 1 : -1;
      if (bv == null) return dir === 'asc' ? -1 : 1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return dir === 'asc' ? av - bv : bv - av;
      }
      return dir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return rows;
  }, [result, sort]);

  function toggleSort(key: string) {
    setSort(cur => {
      if (!cur || cur.key !== key) return { key, dir: 'asc' };
      if (cur.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  }

  function downloadCsv() {
    if (!result) return;
    const cols = result.columns;
    const header = cols.map(c => escapeCsv(c.label)).join(',');
    const rows = sortedRows.map(row =>
      cols.map(c => {
        const v = row[c.key];
        if (v == null) return '';
        return escapeCsv(String(v));
      }).join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `${result.slug}-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (!templates) return <div className="state state--loading">Loading reports…</div>;

  return (
    <div className="page reports-page">
      <div className="page-header">
        <h1 className="page-title">Reports</h1>
      </div>

      <form onSubmit={handleNlq} className="reports-nlq">
        <span className="reports-nlq-label">✨ Ask about your data</span>
        <input
          type="text"
          className="reports-nlq-input"
          placeholder="e.g. all open shops with rent over $15,000 and their landlords"
          value={nlqInput}
          onChange={e => setNlqInput(e.target.value)}
          disabled={nlqLoading}
        />
        <button type="submit" className="btn-primary" disabled={nlqLoading || nlqInput.trim().length < 3}>
          {nlqLoading ? 'Thinking…' : 'Ask'}
        </button>
      </form>

      <div className="reports-layout">
        <aside className="reports-sidebar">
          <div className="reports-sidebar-label">Templates</div>
          {templates.map(t => (
            <button
              key={t.slug}
              type="button"
              className={`reports-sidebar-item ${selectedSlug === t.slug ? 'reports-sidebar-item--active' : ''}`}
              onClick={() => setSelectedSlug(t.slug)}
            >
              <div className="reports-sidebar-item-title">{t.title}</div>
              <div className="reports-sidebar-item-desc">{t.description}</div>
            </button>
          ))}
        </aside>

        <div className="reports-main">
          {loading && <div className="state state--loading">Running report…</div>}
          {err && <div className="state state--error">{err}</div>}

          {result && (
            <>
              <div className="reports-header">
                <div>
                  <h2 className="reports-title">{result.title}</h2>
                  {result.description && <p className="reports-desc muted">{result.description}</p>}
                  {result.query && (
                    <p className="reports-query muted">
                      <em>Query:</em> {result.query}
                    </p>
                  )}
                  {result.notes && (
                    <div className="reports-notes">
                      <strong>Claude's notes:</strong> {result.notes}
                    </div>
                  )}
                </div>
                <div className="reports-actions">
                  <button type="button" className="btn-secondary btn-sm" onClick={downloadCsv} disabled={result.rows.length === 0}>
                    ⬇ Download CSV
                  </button>
                </div>
              </div>

              <div className="reports-meta muted">
                {result.rows.length} row{result.rows.length === 1 ? '' : 's'} · Generated {new Date(result.generatedAt).toLocaleString()}
              </div>

              {result.rows.length === 0 ? (
                <div className="state state--empty">No rows match this report.</div>
              ) : (
                <div className="reports-table-wrap">
                  <table className="reports-table">
                    <thead>
                      <tr>
                        {result.columns.map(c => (
                          <th
                            key={c.key}
                            className={c.align === 'right' ? 'align-right' : ''}
                            onClick={() => toggleSort(c.key)}
                          >
                            {c.label}
                            {sort?.key === c.key && (sort.dir === 'asc' ? ' ▲' : ' ▼')}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRows.map((row, i) => (
                        <tr key={i}>
                          {result.columns.map(c => (
                            <td
                              key={c.key}
                              className={c.align === 'right' ? 'align-right' : ''}
                            >
                              {formatCell(row[c.key], c.type)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function formatCell(v: unknown, type?: ReportColumn['type']): string {
  if (v == null || v === '') return '—';
  if (type === 'currency' && typeof v === 'number') {
    return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
  }
  if (type === 'number' && typeof v === 'number') {
    return v.toLocaleString('en-US');
  }
  if (type === 'boolean') {
    return v ? '✓' : '—';
  }
  return String(v);
}

function escapeCsv(v: string): string {
  if (v == null) return '';
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}
