/**
 * DRA Analysis Modal
 *
 * Comprehensive read-only view of a single Development Rights Agreement:
 *   1. Overview card — key facts (executed, term end, obligation, signatory entity)
 *   2. Document Timeline — every DRA-level doc (Original, Amendments, Addendums,
 *      Guaranties, etc.) sorted chronologically. Click to open PDF.
 *   3. Territory — states/regions inferred from DRA name + shop deployment breakdown
 *   4. Development Progress — obligation vs executed vs open bars + year schedule
 *
 * Uploads still happen from the existing DRA Documents section on the page.
 * This modal is analysis-only; no writes.
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
// Parse states/regions from the DRA name. Order matters — longest / most
// specific patterns first so "Long Island" wins over "New York", "DMV" wins
// over "MD", etc.
interface TerritoryHit {
  label:  string;   // human-friendly ("DMV", "Long Island", "Alabama")
  states: string[]; // 2-letter codes
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
  const seenStates = new Set<string>();
  for (const [rx, hit] of TERRITORY_PATTERNS) {
    if (rx.test(draName)) {
      const fresh = hit.states.filter(s => !seenStates.has(s));
      if (fresh.length > 0) {
        hits.push(hit);
        fresh.forEach(s => seenStates.add(s));
      }
    }
  }
  return hits;
}

// ─── Document timeline helpers ────────────────────────────────────────
function docSortKey(d: DraDocument): number {
  // Newest first: return negative timestamp for descending sort.
  if (d.effectiveDate) {
    const t = Date.parse(d.effectiveDate);
    if (!Number.isNaN(t)) return -t;
  }
  // Fallback: put amendments by number descending (newer amendments = higher #)
  if (d.documentType === 'Amendment' && d.amendmentNumber != null) {
    return -d.amendmentNumber;
  }
  return 0;
}

function docBadgeColor(type: string | null): string {
  switch (type) {
    case 'Amendment':          return '#7c3aed'; // purple
    case 'Addendum':           return '#0891b2'; // cyan
    case 'Guaranty':           return '#dc2626'; // red
    case 'Assignment':         return '#ea580c'; // orange
    case 'Termination Agreement': return '#991b1b'; // dark red
    case 'Exhibit':            return '#059669'; // green
    case 'Side Letter':        return '#6366f1'; // indigo
    case 'Memorandum':         return '#64748b'; // slate
    default:                   return '#6b7280'; // gray
  }
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

  // Build the full timeline: Original DRA + every DRA-level document.
  const timeline = useMemo(() => {
    const items: Array<{
      key:      string;
      title:    string;
      subtitle: string | null;
      date:     string | null;
      type:     string | null;
      color:    string;
      notes:    string | null;
      file:     { url: string; filename: string } | null;
      sortKey:  number;
    }> = [];

    // Original DRA anchor
    items.push({
      key:      'original',
      title:    'Original Development Rights Agreement',
      subtitle: null,
      // Original DRA has no execution-date field on the group itself; we key it
      // at -Infinity so it always sorts to the bottom (oldest in the story).
      date:     null,
      type:     'Original',
      color:    '#0f766e',
      notes:    null,
      file:     detail.draFile[0] ?? null,
      sortKey:  Number.POSITIVE_INFINITY, // pushes to bottom in newest-first sort
    });

    for (const doc of detail.documents) {
      items.push({
        key:      doc.id,
        title:    docTitle(doc),
        subtitle: doc.signatories,
        date:     doc.effectiveDate,
        type:     doc.documentType,
        color:    docBadgeColor(doc.documentType),
        notes:    doc.notes,
        file:     doc.file[0] ?? null,
        sortKey:  docSortKey(doc),
      });
    }

    items.sort((a, b) => a.sortKey - b.sortKey);
    return items;
  }, [detail.documents, detail.draFile]);

  // Aggregate shop deployment: assigned vs placeholder, executed FAs, etc.
  const deployment = useMemo(() => {
    const shops = detail.shopIds ?? [];
    const assigned    = shops.filter(s => s.shopName && s.shopName.trim());
    const placeholder = shops.filter(s => !s.shopName || !s.shopName.trim());
    const withFa      = shops.filter(s => s.hasFa);
    return { total: shops.length, assigned, placeholder, withFa };
  }, [detail.shopIds]);

  // Progress: obligation totals + year schedule
  const progress = useMemo(() => {
    const obligation = detail.totalObligation || 0;
    const executed   = detail.fasExecuted || 0;
    const open       = detail.currentlyOpen || 0;
    const outstanding = detail.outstanding || 0;
    const pctExecuted = obligation > 0 ? (executed / obligation) * 100 : 0;
    const pctOpen     = obligation > 0 ? (open / obligation) * 100 : 0;
    return { obligation, executed, open, outstanding, pctExecuted, pctOpen };
  }, [detail]);

  const scheduleYears = useMemo(
    () => Object.keys(detail.schedule || {}).sort(),
    [detail.schedule],
  );

  // Amendment/addendum counts for header chip
  const amendmentCount = detail.documents.filter(d => d.documentType === 'Amendment').length;
  const addendumCount  = detail.documents.filter(d => d.documentType === 'Addendum').length;
  const otherDocCount  = detail.documents.length - amendmentCount - addendumCount;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Analysis: ${detail.name}`}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100, padding: '1.5rem',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 12,
          width: 'min(1080px, 100%)', maxHeight: '92vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 25px 60px rgba(0,0,0,0.25)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '1.1rem 1.4rem',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '1rem',
        }}>
          <div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
              DRA Analysis
            </div>
            <h2 style={{ margin: '0.15rem 0 0', fontSize: '1.2rem' }}>{detail.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none', border: 'none',
              fontSize: '1.4rem', cursor: 'pointer', color: '#64748b',
              lineHeight: 1, padding: '0.25rem 0.5rem',
            }}
          >
            ✕
          </button>
        </div>

        {/* Body — scrollable */}
        <div style={{ overflow: 'auto', padding: '1.4rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* ── Section 1: Overview ────────────────────────────── */}
          <section>
            <SectionHeader icon="📋" title="Overview" />
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '0.75rem',
              marginTop: '0.75rem',
            }}>
              <OverviewCard label="Total obligation" value={String(detail.totalObligation)} />
              <OverviewCard label="Term ends" value={detail.termEndDate || '—'} />
              <OverviewCard label="Amendments on file" value={String(amendmentCount)} accent={amendmentCount > 0 ? '#7c3aed' : undefined} />
              <OverviewCard label="Addendums on file" value={String(addendumCount)} accent={addendumCount > 0 ? '#0891b2' : undefined} />
              <OverviewCard label="Other DRA docs" value={String(otherDocCount)} />
              <OverviewCard label="Original DRA PDF" value={detail.draFile[0] ? 'On file' : 'Missing'} accent={detail.draFile[0] ? '#059669' : '#dc2626'} />
            </div>
          </section>

          {/* ── Section 2: Territory ───────────────────────────── */}
          <section>
            <SectionHeader icon="📍" title="Territory & Deployment" />
            <div style={{ marginTop: '0.75rem' }}>
              {territory.length === 0 ? (
                <div style={{ color: '#64748b', fontSize: '0.9rem' }}>
                  Could not infer territory from the DRA name. Territory patterns can be added in
                  <code style={{ marginLeft: 4, padding: '1px 5px', background: '#f1f5f9', borderRadius: 4 }}>
                    DraAnalysisModal.tsx
                  </code>
                  .
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                  {territory.map(t => (
                    <div
                      key={t.label}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                        padding: '0.35rem 0.75rem',
                        background: '#eff6ff', color: '#1d4ed8',
                        border: '1px solid #bfdbfe',
                        borderRadius: 999, fontSize: '0.85rem', fontWeight: 500,
                      }}
                    >
                      <span>{t.label}</span>
                      <span style={{ opacity: 0.7, fontSize: '0.75rem' }}>
                        {t.states.join(' · ')}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Deployment breakdown */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '0.5rem',
              }}>
                <DeploymentTile label="Shop IDs allocated" value={deployment.total} />
                <DeploymentTile label="Sites secured" value={deployment.assigned.length} accent="#0891b2" />
                <DeploymentTile label="Placeholders" value={deployment.placeholder.length} accent="#64748b" />
                <DeploymentTile label="FAs executed" value={deployment.withFa.length} accent="#059669" />
              </div>

              {deployment.assigned.length > 0 && (
                <details style={{ marginTop: '0.75rem' }}>
                  <summary style={{ cursor: 'pointer', fontSize: '0.85rem', color: '#475569', fontWeight: 500 }}>
                    Show {deployment.assigned.length} assigned {deployment.assigned.length === 1 ? 'site' : 'sites'}
                  </summary>
                  <div style={{
                    marginTop: '0.5rem',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: '0.35rem',
                  }}>
                    {deployment.assigned.map(s => (
                      <div
                        key={s.shopId}
                        style={{
                          padding: '0.4rem 0.6rem',
                          background: s.hasFa ? '#ecfdf5' : '#f8fafc',
                          border: `1px solid ${s.hasFa ? '#a7f3d0' : '#e2e8f0'}`,
                          borderRadius: 6,
                          fontSize: '0.82rem',
                        }}
                      >
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>#{s.shopId}</div>
                        <div style={{ color: '#475569' }}>{s.shopName}</div>
                        {s.hasFa && (
                          <div style={{ fontSize: '0.72rem', color: '#059669', marginTop: 2 }}>✓ FA executed</div>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </section>

          {/* ── Section 3: Document Timeline ───────────────────── */}
          <section>
            <SectionHeader icon="🕒" title={`Document Timeline (${timeline.length})`} />
            <div style={{ marginTop: '0.75rem' }}>
              {timeline.length === 0 ? (
                <div style={{ color: '#64748b', fontSize: '0.9rem' }}>No documents on file.</div>
              ) : (
                <ol style={{ listStyle: 'none', margin: 0, padding: 0, position: 'relative' }}>
                  {/* Vertical rail */}
                  <div style={{
                    position: 'absolute', left: 8, top: 6, bottom: 6,
                    width: 2, background: '#e2e8f0',
                  }} />
                  {timeline.map((item, idx) => (
                    <li
                      key={item.key}
                      style={{
                        position: 'relative',
                        paddingLeft: '2rem',
                        paddingBottom: idx === timeline.length - 1 ? 0 : '1rem',
                      }}
                    >
                      {/* Dot */}
                      <div style={{
                        position: 'absolute', left: 2, top: 6,
                        width: 14, height: 14, borderRadius: '50%',
                        background: item.color,
                        border: '2px solid #fff',
                        boxShadow: '0 0 0 1px #e2e8f0',
                      }} />
                      <TimelineCard item={item} onOpenPdf={onOpenPdf} />
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>

          {/* ── Section 4: Development Progress ────────────────── */}
          <section>
            <SectionHeader icon="📈" title="Development Progress" />
            <div style={{ marginTop: '0.75rem' }}>
              {/* Executed bar */}
              <ProgressBar
                label="FAs executed"
                current={progress.executed}
                total={progress.obligation}
                pct={progress.pctExecuted}
                color="#7c3aed"
              />
              <div style={{ height: '0.5rem' }} />
              {/* Open bar */}
              <ProgressBar
                label="Currently open"
                current={progress.open}
                total={progress.obligation}
                pct={progress.pctOpen}
                color="#059669"
              />

              {/* Year-by-year schedule */}
              {scheduleYears.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.4rem' }}>
                    Scheduled openings by year
                  </div>
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    {scheduleYears.map(y => {
                      const count = detail.schedule[y] || 0;
                      return (
                        <div
                          key={y}
                          style={{
                            padding: '0.5rem 0.75rem',
                            background: count > 0 ? '#f8fafc' : '#f1f5f9',
                            border: '1px solid #e2e8f0',
                            borderRadius: 6,
                            minWidth: 60,
                            textAlign: 'center',
                          }}
                        >
                          <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>{y}</div>
                          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: count > 0 ? '#0f172a' : '#94a3b8' }}>
                            {count}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────
function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.5rem',
      paddingBottom: '0.4rem',
      borderBottom: '1px solid #e2e8f0',
    }}>
      <span style={{ fontSize: '1.05rem' }}>{icon}</span>
      <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#0f172a' }}>{title}</h3>
    </div>
  );
}

function OverviewCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{
      padding: '0.7rem 0.85rem',
      background: '#f8fafc',
      border: '1px solid #e2e8f0',
      borderRadius: 8,
    }}>
      <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
        {label}
      </div>
      <div style={{
        fontSize: '1.15rem',
        fontWeight: 700,
        color: accent ?? '#0f172a',
        marginTop: 2,
      }}>
        {value}
      </div>
    </div>
  );
}

function DeploymentTile({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div style={{
      padding: '0.55rem 0.75rem',
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: 6,
      display: 'flex', flexDirection: 'column',
    }}>
      <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: '1.35rem', fontWeight: 700, color: accent ?? '#0f172a' }}>{value}</span>
    </div>
  );
}

function TimelineCard({
  item,
  onOpenPdf,
}: {
  item: {
    title: string; subtitle: string | null; date: string | null;
    type: string | null; color: string; notes: string | null;
    file: { url: string; filename: string } | null;
  };
  onOpenPdf: OnOpenPdf;
}) {
  return (
    <div style={{
      padding: '0.75rem 0.9rem',
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: 8,
      boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-block',
            padding: '0.15rem 0.5rem',
            background: item.color,
            color: '#fff',
            borderRadius: 4,
            fontSize: '0.7rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}>
            {item.type ?? 'Doc'}
          </span>
          <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.95rem' }}>{item.title}</span>
        </div>
        <span style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 500 }}>
          {item.date ?? (item.type === 'Original' ? 'Baseline' : '(no date)')}
        </span>
      </div>
      {item.subtitle && (
        <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '0.35rem' }}>
          Signatories: {item.subtitle}
        </div>
      )}
      {item.notes && (
        <div style={{
          fontSize: '0.82rem', color: '#475569',
          marginTop: '0.4rem',
          padding: '0.4rem 0.6rem',
          background: '#f8fafc',
          borderLeft: `3px solid ${item.color}`,
          borderRadius: 3,
          whiteSpace: 'pre-wrap',
        }}>
          {item.notes}
        </div>
      )}
      <div style={{ marginTop: '0.5rem' }}>
        {item.file ? (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onOpenPdf(item.file!, item.title)}
            style={{ fontSize: '0.82rem', padding: '0.3rem 0.7rem' }}
          >
            📎 Open PDF
          </button>
        ) : (
          <span style={{ fontSize: '0.78rem', color: '#dc2626', fontStyle: 'italic' }}>
            ⚠ No PDF attached
          </span>
        )}
      </div>
    </div>
  );
}

function ProgressBar({
  label, current, total, pct, color,
}: {
  label: string; current: number; total: number; pct: number; color: string;
}) {
  const width = Math.min(100, Math.max(0, pct));
  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: '0.82rem', color: '#334155', marginBottom: '0.25rem',
      }}>
        <span style={{ fontWeight: 500 }}>{label}</span>
        <span>
          <strong style={{ color: '#0f172a' }}>{current}</strong>
          <span style={{ color: '#94a3b8' }}> / {total}</span>
          <span style={{ marginLeft: '0.4rem', color: '#64748b' }}>({pct.toFixed(0)}%)</span>
        </span>
      </div>
      <div style={{
        height: 10,
        background: '#f1f5f9',
        borderRadius: 999,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${width}%`,
          height: '100%',
          background: color,
          transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  );
}
