/**
 * DRA Analysis Modal
 *
 * Comprehensive read-only view of a single Development Rights Agreement:
 *   1. Overview — key facts (reuses .dra-metrics)
 *   2. Territory & Deployment — states/regions inferred from DRA name +
 *      shop-ID breakdown (.dra-analysis-territory-*, .dra-analysis-tile-*)
 *   3. Document Timeline — Original DRA + every Amendment/Addendum/etc.
 *      chronologically, click to open PDF (.dra-analysis-timeline-*)
 *   4. Development Progress — bars + year schedule
 *      (.dra-analysis-progress-*, reuses .dra-schedule)
 *
 * All styling lives in styles.css so the modal inherits DM Mono, --black /
 * --mid / --border tokens, and the flat / no-radius aesthetic of the rest
 * of the app. Uploads still happen from the DRA Documents section on the
 * page — this modal is analysis-only.
 */
import { useMemo } from 'react';
import type { DraDetail, DraDocument } from '../api/types';

type OnOpenPdf = (file: { url: string; filename: string }, title: string) => void;

interface Props {
  detail:    DraDetail;
  onClose:   () => void;
  onOpenPdf: OnOpenPdf;
}

// ─── Territory inference ──────────────────────────────────────────────
interface TerritoryHit {
  label:  string;
  states: string[];
}

const TERRITORY_PATTERNS: Array<[RegExp, TerritoryHit]> = [
  [/\bDMV\b/i,                    { label: 'DMV',          states: ['DC', 'MD', 'VA'] }],
  [/\bLong Island\b/i,            { label: 'Long Island',  states: ['NY'] }],
  [/\bNew Jersey\s*\(North\)/i,   { label: 'North NJ',     states: ['NJ'] }],
  [/\bNew Jersey\s*\(South\)/i,   { label: 'South NJ',     states: ['NJ'] }],
  [/\bNew Jersey\b/i,             { label: 'New Jersey',   states: ['NJ'] }],
  [/\bNew York\b/i,               { label: 'New York',     states: ['NY'] }],
  [/\bPennsylvania\b|\bPA\b/i,    { label: 'Pennsylvania', states: ['PA'] }],
  [/\bPittsburgh\b/i,             { label: 'Pittsburgh',   states: ['PA'] }],
  [/\bPhiladelphia\b/i,           { label: 'Philadelphia', states: ['PA'] }],
  [/\bBoston\b/i,                 { label: 'Boston',       states: ['MA'] }],
  [/\bMassachusetts\b/i,          { label: 'Massachusetts',states: ['MA'] }],
  [/\bConnecticut\b|\bCT\b/i,     { label: 'Connecticut',  states: ['CT'] }],
  [/\bChicago\b/i,                { label: 'Chicago',      states: ['IL'] }],
  [/\bIllinois\b/i,               { label: 'Illinois',     states: ['IL'] }],
  [/\bMinnesota\b/i,              { label: 'Minnesota',    states: ['MN'] }],
  [/\bMichigan\b/i,               { label: 'Michigan',     states: ['MI'] }],
  [/\bOhio\b/i,                   { label: 'Ohio',         states: ['OH'] }],
  [/\bAlabama\b/i,                { label: 'Alabama',      states: ['AL'] }],
  [/\bGeorgia\b/i,                { label: 'Georgia',      states: ['GA'] }],
  [/\bAtlanta\b/i,                { label: 'Atlanta',      states: ['GA'] }],
  [/\bTennessee\b/i,              { label: 'Tennessee',    states: ['TN'] }],
  [/\bNashville\b/i,              { label: 'Nashville',    states: ['TN'] }],
  [/\bNorth Carolina\b/i,         { label: 'North Carolina', states: ['NC'] }],
  [/\bCharlotte\b/i,              { label: 'Charlotte',    states: ['NC'] }],
  [/\bSouth Carolina\b/i,         { label: 'South Carolina', states: ['SC'] }],
  [/\bCharleston\b/i,             { label: 'Charleston',   states: ['SC'] }],
  [/\bFlorida\b/i,                { label: 'Florida',      states: ['FL'] }],
  [/\bMiami\b/i,                  { label: 'Miami',        states: ['FL'] }],
  [/\bTexas\b/i,                  { label: 'Texas',        states: ['TX'] }],
  [/\bDallas\b/i,                 { label: 'Dallas',       states: ['TX'] }],
  [/\bAustin\b/i,                 { label: 'Austin',       states: ['TX'] }],
  [/\bHouston\b/i,                { label: 'Houston',      states: ['TX'] }],
  [/\bArizona\b/i,                { label: 'Arizona',      states: ['AZ'] }],
  [/\bPhoenix\b/i,                { label: 'Phoenix',      states: ['AZ'] }],
  [/\bScottsdale\b/i,             { label: 'Scottsdale',   states: ['AZ'] }],
  [/\bColorado\b/i,               { label: 'Colorado',     states: ['CO'] }],
  [/\bDenver\b/i,                 { label: 'Denver',       states: ['CO'] }],
  [/\bLouisiana\b/i,              { label: 'Louisiana',    states: ['LA'] }],
  [/\bArkansas\b/i,               { label: 'Arkansas',     states: ['AR'] }],
  [/\bMississippi\b/i,            { label: 'Mississippi',  states: ['MS'] }],
  [/\bKansas\b/i,                 { label: 'Kansas',       states: ['KS'] }],
  [/\bMissouri\b/i,               { label: 'Missouri',     states: ['MO'] }],
  [/\bCajun\b/i,                  { label: 'Cajun region', states: ['LA', 'AR', 'KS', 'MO'] }],
  [/\bLone Star\b/i,              { label: 'Lone Star',    states: ['TX'] }],
  [/\bVirginia\b|\bVA\b/i,        { label: 'Virginia',     states: ['VA'] }],
  [/\bMaryland\b|\bMD\b/i,        { label: 'Maryland',     states: ['MD'] }],
];

function inferTerritory(draName: string): TerritoryHit[] {
  const hits: TerritoryHit[] = [];
  const seen = new Set<string>();
  for (const [rx, hit] of TERRITORY_PATTERNS) {
    if (rx.test(draName)) {
      const fresh = hit.states.filter(s => !seen.has(s));
      if (fresh.length > 0) {
        hits.push(hit);
        fresh.forEach(s => seen.add(s));
      }
    }
  }
  return hits;
}

// ─── Timeline helpers ─────────────────────────────────────────────────
function docSortKey(d: DraDocument): number {
  if (d.effectiveDate) {
    const t = Date.parse(d.effectiveDate);
    if (!Number.isNaN(t)) return -t;
  }
  if (d.documentType === 'Amendment' && d.amendmentNumber != null) {
    return -d.amendmentNumber;
  }
  return 0;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function docTitle(d: DraDocument): string {
  if (d.title) return d.title;
  if (d.documentType === 'Amendment' && d.amendmentNumber != null) {
    return `${ordinal(d.amendmentNumber)} Amendment`;
  }
  if (d.documentType === 'Addendum' && d.addendumName) {
    return `Addendum — ${d.addendumName}`;
  }
  return d.documentType ?? 'Document';
}

// ─── Component ────────────────────────────────────────────────────────
export function DraAnalysisModal({ detail, onClose, onOpenPdf }: Props) {
  const territory = useMemo(() => inferTerritory(detail.name), [detail.name]);

  const timeline = useMemo(() => {
    interface Item {
      key:      string;
      title:    string;
      subtitle: string | null;
      date:     string | null;
      type:     string;
      isOriginal: boolean;
      notes:    string | null;
      file:     { url: string; filename: string } | null;
      sortKey:  number;
    }
    const items: Item[] = [];

    items.push({
      key:        'original',
      title:      'Original Development Rights Agreement',
      subtitle:   null,
      date:       null,
      type:       'Original',
      isOriginal: true,
      notes:      null,
      file:       detail.draFile[0] ?? null,
      sortKey:    Number.POSITIVE_INFINITY, // anchors to bottom (newest-first sort)
    });

    for (const doc of detail.documents) {
      items.push({
        key:        doc.id,
        title:      docTitle(doc),
        subtitle:   doc.signatories,
        date:       doc.effectiveDate,
        type:       doc.documentType ?? 'Document',
        isOriginal: false,
        notes:      doc.notes,
        file:       doc.file[0] ?? null,
        sortKey:    docSortKey(doc),
      });
    }

    items.sort((a, b) => a.sortKey - b.sortKey);
    return items;
  }, [detail.documents, detail.draFile]);

  const deployment = useMemo(() => {
    const shops       = detail.shopIds ?? [];
    const assigned    = shops.filter(s => s.shopName && s.shopName.trim());
    const placeholder = shops.filter(s => !s.shopName || !s.shopName.trim());
    const withFa      = shops.filter(s => s.hasFa);
    return { total: shops.length, assigned, placeholder, withFa };
  }, [detail.shopIds]);

  const progress = useMemo(() => {
    const obligation  = detail.totalObligation || 0;
    const executed    = detail.fasExecuted || 0;
    const open        = detail.currentlyOpen || 0;
    const pctExecuted = obligation > 0 ? (executed / obligation) * 100 : 0;
    const pctOpen     = obligation > 0 ? (open / obligation) * 100 : 0;
    return { obligation, executed, open, pctExecuted, pctOpen };
  }, [detail]);

  const scheduleYears = useMemo(
    () => Object.keys(detail.schedule || {}).sort(),
    [detail.schedule],
  );

  const amendmentCount = detail.documents.filter(d => d.documentType === 'Amendment').length;
  const addendumCount  = detail.documents.filter(d => d.documentType === 'Addendum').length;
  const otherDocCount  = detail.documents.length - amendmentCount - addendumCount;

  return (
    <div
      className="dra-analysis-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Analysis: ${detail.name}`}
      onClick={onClose}
    >
      <div className="dra-analysis-card" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="dra-analysis-head">
          <div>
            <div className="dra-analysis-eyebrow">DRA Analysis</div>
            <h2 className="dra-analysis-title">{detail.name}</h2>
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="dra-analysis-body">

          {/* ── Overview ─────────────────────────────────────── */}
          <section className="dra-analysis-section">
            <div className="dra-analysis-section-label">Overview</div>
            <div className="dra-metrics">
              <div>
                <div className="dra-metric-label">Total obligation</div>
                <div className="dra-metric-value">{detail.totalObligation}</div>
              </div>
              <div>
                <div className="dra-metric-label">Term ends</div>
                <div className="dra-metric-value" style={{ fontSize: detail.termEndDate ? '1rem' : '1.6rem' }}>
                  {detail.termEndDate || '—'}
                </div>
              </div>
              <div>
                <div className="dra-metric-label">Amendments</div>
                <div className="dra-metric-value">{amendmentCount}</div>
              </div>
              <div>
                <div className="dra-metric-label">Addendums</div>
                <div className="dra-metric-value">{addendumCount}</div>
              </div>
              <div>
                <div className="dra-metric-label">Other docs</div>
                <div className="dra-metric-value">{otherDocCount}</div>
              </div>
              <div>
                <div className="dra-metric-label">Original PDF</div>
                <div className="dra-metric-value" style={{ fontSize: '1rem' }}>
                  {detail.draFile[0] ? 'On file' : <span className="dra-analysis-missing">Missing</span>}
                </div>
              </div>
            </div>
          </section>

          {/* ── Territory & Deployment ───────────────────────── */}
          <section className="dra-analysis-section">
            <div className="dra-analysis-section-label">Territory & Deployment</div>

            {territory.length === 0 ? (
              <div className="muted" style={{ fontSize: '0.82rem' }}>
                Could not infer territory from the DRA name.
              </div>
            ) : (
              <div className="dra-analysis-territory-list">
                {territory.map(t => (
                  <div key={t.label} className="dra-analysis-territory-pill">
                    <strong>{t.label}</strong>
                    <span>{t.states.join(' · ')}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="dra-analysis-tile-row">
              <div className="dra-analysis-tile">
                <div className="dra-analysis-tile-label">Shop IDs allocated</div>
                <div className="dra-analysis-tile-value">{deployment.total}</div>
              </div>
              <div className="dra-analysis-tile">
                <div className="dra-analysis-tile-label">Sites secured</div>
                <div className="dra-analysis-tile-value">{deployment.assigned.length}</div>
              </div>
              <div className="dra-analysis-tile">
                <div className="dra-analysis-tile-label">Placeholders</div>
                <div className="dra-analysis-tile-value">{deployment.placeholder.length}</div>
              </div>
              <div className="dra-analysis-tile">
                <div className="dra-analysis-tile-label">FAs executed</div>
                <div className="dra-analysis-tile-value">{deployment.withFa.length}</div>
              </div>
            </div>

            {deployment.assigned.length > 0 && (
              <details>
                <summary style={{ cursor: 'pointer', fontSize: '0.78rem', color: 'var(--mid)',
                                  letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
                  Show {deployment.assigned.length} assigned {deployment.assigned.length === 1 ? 'site' : 'sites'}
                </summary>
                <div className="dra-analysis-shops">
                  {deployment.assigned.map(s => (
                    <div
                      key={s.shopId}
                      className={`dra-analysis-shop${s.hasFa ? ' dra-analysis-shop--has-fa' : ''}`}
                    >
                      <div className="dra-analysis-shop-id">#{s.shopId}</div>
                      <div className="dra-analysis-shop-name">{s.shopName}</div>
                      {s.hasFa && <div className="dra-analysis-shop-fa">✓ FA executed</div>}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </section>

          {/* ── Document Timeline ───────────────────────────── */}
          <section className="dra-analysis-section">
            <div className="dra-analysis-section-label">
              Document Timeline · {timeline.length}
            </div>
            {timeline.length === 0 ? (
              <div className="muted" style={{ fontSize: '0.82rem' }}>No documents on file.</div>
            ) : (
              <ol className="dra-analysis-timeline">
                {timeline.map(item => (
                  <li key={item.key}>
                    <div className={`dra-analysis-timeline-dot${item.isOriginal ? ' dra-analysis-timeline-dot--original' : ''}`} />
                    <div className="dra-analysis-timeline-item">
                      <div className="dra-analysis-timeline-row">
                        <div className="dra-analysis-timeline-title">
                          <span className={`dra-analysis-badge${item.isOriginal ? ' dra-analysis-badge--original' : ''}`}>
                            {item.type}
                          </span>
                          <span>{item.title}</span>
                        </div>
                        <span className="dra-analysis-timeline-date">
                          {item.date ?? (item.isOriginal ? 'Baseline' : '(no date)')}
                        </span>
                      </div>
                      {item.subtitle && (
                        <div className="dra-analysis-timeline-sub">
                          Signatories: {item.subtitle}
                        </div>
                      )}
                      {item.notes && (
                        <div className="dra-analysis-timeline-notes">{item.notes}</div>
                      )}
                      <div className="dra-analysis-timeline-actions">
                        {item.file ? (
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => onOpenPdf(item.file!, item.title)}
                          >
                            📎 Open PDF
                          </button>
                        ) : (
                          <span className="dra-analysis-missing">⚠ No PDF attached</span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* ── Development Progress ────────────────────────── */}
          <section className="dra-analysis-section">
            <div className="dra-analysis-section-label">Development Progress</div>

            <div className="dra-analysis-progress">
              <ProgressBar label="FAs executed" current={progress.executed} total={progress.obligation} pct={progress.pctExecuted} />
              <ProgressBar label="Currently open" current={progress.open} total={progress.obligation} pct={progress.pctOpen} />
            </div>

            {scheduleYears.length > 0 && (
              <div>
                <div className="dra-schedule-label" style={{ marginBottom: '0.4rem' }}>
                  Scheduled openings by year
                </div>
                <div className="dra-schedule-row">
                  {scheduleYears.map(y => (
                    <div key={y} className="dra-schedule-cell">
                      <div className="dra-schedule-year">{y}</div>
                      <div className="dra-schedule-count">{detail.schedule[y]}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

        </div>
      </div>
    </div>
  );
}

function ProgressBar({
  label, current, total, pct,
}: {
  label: string; current: number; total: number; pct: number;
}) {
  const width = Math.min(100, Math.max(0, pct));
  return (
    <div className="dra-analysis-progress-row">
      <div className="dra-analysis-progress-head">
        <span className="dra-analysis-progress-label">{label}</span>
        <span className="dra-analysis-progress-nums">
          <strong>{current}</strong>
          <span>/ {total} ({pct.toFixed(0)}%)</span>
        </span>
      </div>
      <div className="dra-analysis-progress-track">
        <div className="dra-analysis-progress-fill" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
