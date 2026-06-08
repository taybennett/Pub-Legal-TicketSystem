import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { CurrentFaPanel } from '../components/CurrentFaPanel';
import { CurrentLeasePanel } from '../components/CurrentLeasePanel';
import { NewTicketModal } from '../components/NewTicketModal';
import { StagePill } from '../components/StagePill';
import type { LocationDetail as LocationDetailType, Ticket, Workstream } from '../api/types';

type Tab = 'overview' | 'real-estate' | 'franchise-agreement' | 'construction' | 'documents';

const TAB_ORDER: { key: Tab; label: string; workstream?: Workstream }[] = [
  { key: 'overview',            label: 'Overview' },
  { key: 'real-estate',         label: 'Real Estate',         workstream: 'Real Estate' },
  { key: 'franchise-agreement', label: 'Franchise Agreement', workstream: 'Franchise Agreement' },
  { key: 'construction',        label: 'Construction' },
  { key: 'documents',           label: 'Documents' },
];

export function LocationDetail() {
  const { id, tab } = useParams<{ id: string; tab?: Tab }>();
  const [loc, setLoc] = useState<LocationDetailType | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const activeTab = (tab ?? 'overview') as Tab;

  useEffect(() => {
    if (!id) return;
    api.get<{ location: LocationDetailType }>(`/locations/${id}`)
      .then(r => setLoc(r.location))
      .catch(e => setErr(e.message));
  }, [id]);

  if (err) return <div className="state state--error">{err}</div>;
  if (!loc) return <div className="state state--loading">Loading shop…</div>;

  return (
    <div className="page">
      <div className="detail-header">
        <div>
          <div className="detail-crumb"><Link to="/locations">← All shops</Link></div>
          <h1 className="page-title">{loc.shopName}</h1>
          <div className="detail-sub">
            {loc.shopId && <span>#{loc.shopId}</span>}
            {loc.address && <span>{loc.address}</span>}
            {loc.city && <span>{loc.city}, {loc.state} {loc.zip}</span>}
          </div>
        </div>
        <StagePill stage={loc.lifecycleStage} />
      </div>

      <nav className="tabs">
        {TAB_ORDER.map(t => (
          <NavLink
            key={t.key}
            to={t.key === 'overview' ? `/locations/${id}` : `/locations/${id}/${t.key}`}
            end={t.key === 'overview'}
            className={({ isActive }) => isActive ? 'tab tab--active' : 'tab'}
          >
            {t.label}
          </NavLink>
        ))}
      </nav>

      <div className="tab-body">
        {activeTab === 'overview'            && <Overview loc={loc} />}
        {activeTab === 'real-estate'         && <WorkstreamTab id={id!} workstream="Real Estate" />}
        {activeTab === 'franchise-agreement' && <WorkstreamTab id={id!} workstream="Franchise Agreement" />}
        {activeTab === 'construction'        && <ConstructionTab id={id!} />}
        {activeTab === 'documents'           && <DocumentsTab id={id!} />}
      </div>
    </div>
  );
}

function Overview({ loc }: { loc: LocationDetailType }) {
  const dateRows: [string, string | null][] = [
    ['LOI signed',    loc.dates.loiSigned],
    ['Lease signed',  loc.dates.leaseSigned],
    ['FA signed',     loc.dates.faSigned],
    ['Target open',   loc.dates.targetOpen],
    ['Actual open',   loc.dates.actualOpen],
  ];
  return (
    <div className="overview">
      <div className="overview-grid">
        {dateRows.map(([label, value]) => (
          <div key={label} className="overview-cell">
            <div className="overview-label">{label}</div>
            <div className="overview-value">{value ?? '—'}</div>
          </div>
        ))}
        <div className="overview-cell">
          <div className="overview-label">240d KPI</div>
          <div className="overview-value">{renderKpi(loc.dates.daysVs240)}</div>
        </div>
      </div>
    </div>
  );
}

function renderKpi(days: number | null) {
  if (days === null) return '—';
  if (days === 0)   return <span>0</span>;
  const sign = days > 0 ? '+' : '-';
  const color = days > 0 ? '#721c24' : '#1b5e20';
  return <span style={{ color, fontWeight: 600 }}>{sign}{Math.abs(days)}</span>;
}

function WorkstreamTab({ id, workstream }: { id: string; workstream: Workstream }) {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    api.get<{ tickets: Ticket[] }>(`/locations/${id}/tickets?workstream=${encodeURIComponent(workstream)}`)
      .then(r => setTickets(r.tickets))
      .catch(e => setErr(e.message));
  }, [id, workstream]);

  if (err) return <div className="state state--error">{err}</div>;
  if (!tickets) return <div className="state state--loading">Loading conversations…</div>;

  return (
    <>
      {workstream === 'Real Estate'         && <CurrentLeasePanel locationId={id} />}
      {workstream === 'Franchise Agreement' && <CurrentFaPanel    locationId={id} />}

      <div className="workstream-header">
        <div className="workstream-header-title">Conversations</div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>+ New conversation</button>
      </div>

      {tickets.length === 0 ? (
        <div className="state state--empty">
          <p>No {workstream.toLowerCase()} conversations yet.</p>
        </div>
      ) : (
        <div className="ticket-list">
          {tickets.map(t => (
            <button
              key={t.id}
              type="button"
              className="ticket-row ticket-row--link"
              onClick={() => navigate(`/tickets/${t.id}`)}
            >
              <div className="ticket-row-title">{t.title}</div>
              <div className="ticket-row-meta">
                {t.requestType} · {t.submitterName} · {t.submittedAt?.slice(0, 10) ?? ''}
              </div>
            </button>
          ))}
        </div>
      )}

      {showModal && (
        <NewTicketModal
          locationId={id}
          workstream={workstream}
          onClose={() => setShowModal(false)}
          onCreated={(ticketId) => navigate(`/tickets/${ticketId}`)}
        />
      )}
    </>
  );
}

function ConstructionTab({ id }: { id: string }) {
  const [data, setData] = useState<{ construction: any; reason?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get<typeof data>(`/locations/${id}/construction`)
      .then(setData)
      .catch(e => setErr(e.message));
  }, [id]);

  if (err) return <div className="state state--error">{err}</div>;
  if (!data) return <div className="state state--loading">Loading construction status…</div>;

  if (!data.construction) {
    const why =
      data.reason === 'no_shop_number' ? 'No shop number on file — contact your PUB Development rep.' :
      data.reason === 'not_in_pipeline' ? "Not yet tracked in PUB Development's Pipeline." :
      'Construction details unavailable.';
    return <div className="state state--empty">{why}</div>;
  }

  const c = data.construction;
  const row = (label: string, value: any) => (
    <div className="overview-cell">
      <div className="overview-label">{label}</div>
      <div className="overview-value">{value ?? '—'}</div>
    </div>
  );

  return (
    <div className="overview">
      <div className="overview-grid">
        {row('Development status', c.developmentStatus)}
        {row('Lease status',       c.leaseStatus)}
        {row('Projected opening',  c.projectedOpening)}
        {row('Weeks out from open', c.weeksOutFromOpen)}
        {row('Test fit approved',  c.testFitApproved)}
        {row('Permit submitted',   c.permitSubmitted)}
        {row('Permit approved',    c.permitApproved)}
        {row('Construction start', c.constructionStart)}
      </div>
      <div className="muted">Live from PUB Development · questions go to Asher S. on the Development team for Records Questions</div>
    </div>
  );
}

function DocumentsTab({ id }: { id: string }) {
  const [docs, setDocs] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ documents: any[] }>(`/locations/${id}/documents`)
      .then(r => setDocs(r.documents))
      .catch(e => setErr(e.message));
  }, [id]);

  if (err) return <div className="state state--error">{err}</div>;
  if (!docs) return <div className="state state--loading">Loading documents…</div>;
  if (docs.length === 0) return <div className="state state--empty">No documents yet for this shop.</div>;

  return (
    <div className="doc-list">
      {docs.map(d => (
        <div key={d.id} className="doc-row">
          <div className="doc-row-main">
            <div className="doc-row-name">{d.filename}</div>
            <div className="doc-row-meta">
              {d.documentType ?? '—'}{d.version ? ` · v${d.version}` : ''}{d.uploadedBy ? ` · ${d.uploadedBy}` : ''}
            </div>
          </div>
          {Array.isArray(d.file) && d.file.length > 0 && (
            <a className="doc-row-open" href={d.file[0].url} target="_blank" rel="noreferrer">Open</a>
          )}
        </div>
      ))}
    </div>
  );
}
