import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { AttachPdfButton } from '../components/AttachPdfButton';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DraDocumentUploadModal } from '../components/DraDocumentUploadModal';
import { useOpenPdf } from '../components/PdfViewerProvider';
import type { DraDetail, DraDocument, DraDocumentType, DraFa, DraShopId, DraSignatory, DraSummary } from '../api/types';

interface UploadIntent {
  docType:          DraDocumentType;
  amendmentNumber?: number;
  lockDocType:      boolean;
}

export function Dras() {
  const [summaries, setSummaries] = useState<DraSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string>('');
  const [detail, setDetail] = useState<DraDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

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
  }, [selectedId, reloadKey]);

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
      {detail && <DraDetailView detail={detail} onChanged={() => setReloadKey(k => k + 1)} />}
    </div>
  );
}

function DraDetailView({ detail, onChanged }: { detail: DraDetail; onChanged: () => void }) {
  const { me } = useAuth();
  const isAdmin = me?.userType === 'Admin';
  const scheduleYears = useMemo(
    () => Object.keys(detail.schedule).sort(),
    [detail.schedule],
  );
  const aheadBehind = detail.outstanding === 0
    ? '✓ Fully executed'
    : `${detail.outstanding} outstanding`;

  const [upload, setUpload]     = useState<UploadIntent | null>(null);
  const [toDelete, setToDelete] = useState<DraDocument | null>(null);
  const openPdf                 = useOpenPdf();

  async function handleDelete(doc: DraDocument) {
    await api.delete(`/dras/${detail.id}/documents/${doc.id}`);
    onChanged();
  }

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
          ? <button
              type="button"
              className="btn-secondary"
              onClick={() => openPdf({
                url:      detail.draFile[0].url,
                filename: detail.draFile[0].filename,
                title:    'Original DRA',
                subtitle: detail.name,
              })}
            >
              📎 Open original DRA
            </button>
          : isAdmin
            ? <AttachPdfButton
                uploadPath={`/dras/${detail.id}/attach`}
                label="Attach Original DRA"
                onAttached={onChanged}
              />
            : <span className="muted">No original DRA PDF on file</span>}
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

      {/* ── Shop IDs allocated to this DRA ── */}
      {detail.shopIds && detail.shopIds.length > 0 && (
        <ShopIdsPanel shopIds={detail.shopIds} />
      )}

      {/* ── Signatories & Contacts ── */}
      <SignatoriesPanel
        draId={detail.id}
        signatories={detail.signatories ?? []}
        onChanged={onChanged}
      />


      {/* ── DRA Documents (Amendments + Addendums) ── */}
      <DraDocumentsSection
        documents={detail.documents}
        isAdmin={isAdmin}
        onUpload={intent => setUpload(intent)}
        onDelete={setToDelete}
        onOpen={doc => {
          if (!doc.file[0]) return;
          openPdf({
            url:      doc.file[0].url,
            filename: doc.file[0].filename,
            title:    doc.title ?? 'Document',
            subtitle: detail.name,
          });
        }}
      />

      <div className="dra-fas">
        <div className="dra-fas-header">
          <div className="dra-fas-title">Executed franchise agreements</div>
          <div className="muted">{detail.fas.length} record{detail.fas.length === 1 ? '' : 's'}</div>
        </div>
        {detail.fas.length === 0 ? (
          <div className="state state--empty">No FAs executed under this DRA yet.</div>
        ) : (
          <div className="dra-fa-list">
            {detail.fas.map(fa => (
              <FaRow
                key={fa.id}
                fa={fa}
                onOpen={() => {
                  if (!fa.file[0]) return;
                  openPdf({
                    url:      fa.file[0].url,
                    filename: fa.file[0].filename,
                    title:    `${fa.shopName || 'Shop'} — Franchise Agreement`,
                    subtitle: detail.name,
                  });
                }}
              />
            ))}
          </div>
        )}
      </div>

      {upload && (
        <DraDocumentUploadModal
          draId={detail.id}
          draName={detail.name}
          initialDocType={upload.docType}
          initialAmendmentNumber={upload.amendmentNumber}
          lockDocType={upload.lockDocType}
          onClose={() => setUpload(null)}
          onSaved={onChanged}
        />
      )}

      {toDelete && (
        <ConfirmDialog
          title="Delete DRA document?"
          destructive
          confirmLabel="Delete document"
          onClose={() => setToDelete(null)}
          onConfirm={() => handleDelete(toDelete)}
          message={
            <>
              <p style={{ marginTop: 0 }}>
                This permanently removes the document and its PDF from Airtable. <strong>Cannot be undone.</strong>
              </p>
              <ul className="confirm-detail">
                {toDelete.title         && <li><strong>Title:</strong> {toDelete.title}</li>}
                {toDelete.documentType  && <li><strong>Type:</strong> {toDelete.documentType}</li>}
                {toDelete.effectiveDate && <li><strong>Effective:</strong> {toDelete.effectiveDate}</li>}
                {toDelete.file[0]       && <li><strong>File:</strong> {toDelete.file[0].filename}</li>}
              </ul>
            </>
          }
        />
      )}
    </div>
  );
}

/**
 * Grid of every Shop ID allocated to this DRA. Each cell shows the Shop ID
 * on top and either the shop name or "TBD" underneath. Cells with an executed
 * FA get a subtle green accent. Placeholder cells are muted to make it easy
 * to eyeball how much inventory is left.
 */
function ShopIdsPanel({ shopIds }: { shopIds: DraShopId[] }) {
  const assignedCount = shopIds.filter(s => !!s.shopName).length;
  const tbdCount      = shopIds.length - assignedCount;

  return (
    <div style={{ marginTop: '2rem' }}>
      <div className="dra-schedule-label" style={{ marginBottom: '0.6rem' }}>
        Shop IDs — {assignedCount} assigned · {tbdCount} TBD
      </div>
      <div
        style={{
          display:             'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap:                 '0.6rem',
        }}
      >
        {shopIds.map(s => {
          const assigned = !!s.shopName;
          const executed = s.hasFa;
          return (
            <div
              key={s.shopId}
              style={{
                background:      executed ? '#EAF7EE'
                                : assigned ? '#F7F5F0'
                                : '#FAFAFA',
                border:          `1px solid ${executed ? '#8FBF9B' : '#E0DDD5'}`,
                borderRadius:    3,
                padding:         '0.55rem 0.75rem',
                minHeight:       50,
                display:         'flex',
                flexDirection:   'column',
                justifyContent:  'center',
              }}
              title={s.status ?? undefined}
            >
              <div
                style={{
                  fontSize:      '0.72rem',
                  color:         executed ? '#2F6A3E' : 'var(--muted, #7A8391)',
                  letterSpacing: '0.04em',
                  fontWeight:    600,
                }}
              >
                #{s.shopId}
                {executed && <span style={{ marginLeft: 6 }}>·  FA executed</span>}
              </div>
              <div
                style={{
                  fontSize:   '0.95rem',
                  fontWeight: assigned ? 600 : 400,
                  color:      assigned ? 'var(--black, #0F1B2D)' : '#B0B0B0',
                  fontStyle:  assigned ? 'normal' : 'italic',
                  marginTop:  2,
                  lineHeight: 1.25,
                  wordBreak:  'break-word',
                }}
              >
                {s.shopName ?? 'TBD'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DraDocumentsSection({
  documents, isAdmin, onUpload, onDelete, onOpen,
}: {
  documents: DraDocument[];
  isAdmin: boolean;
  onUpload: (intent: UploadIntent) => void;
  onDelete: (d: DraDocument) => void;
  onOpen:   (d: DraDocument) => void;
}) {
  const amendments = documents.filter(d => d.documentType === 'Amendment');
  const addendums  = documents.filter(d => d.documentType === 'Addendum');
  // Everything that isn't an Amendment or Addendum lives under "Other Documents".
  // Exclusion rule so new types added directly in Airtable flow in automatically.
  const others     = documents.filter(d =>
    d.documentType !== 'Amendment' && d.documentType !== 'Addendum'
  );

  const maxAmendN  = amendments.reduce((m, a) => Math.max(m, a.amendmentNumber ?? 0), 0);
  const slotCount  = Math.max(3, maxAmendN);

  return (
    <div className="dra-docs">
      {/* Amendments — fixed slots */}
      <div className="dra-docs-group">
        <div className="dra-docs-label">Amendments</div>
        <div className="slot-group">
          {Array.from({ length: slotCount }, (_, i) => i + 1).map(n => {
            const doc = amendments.find(a => a.amendmentNumber === n) ?? null;
            return doc
              ? <FilledDocRow key={`amend-${n}`} doc={doc} label={`${ordinal(n)} Amendment`} isAdmin={isAdmin} onDelete={onDelete} onOpen={onOpen} />
              : <EmptyDocRow
                  key={`amend-${n}-empty`}
                  label={`${ordinal(n)} Amendment`}
                  uploadLabel={`Upload ${ordinal(n)} Amendment`}
                  isAdmin={isAdmin}
                  onUpload={() => onUpload({ docType: 'Amendment', amendmentNumber: n, lockDocType: true })}
                />;
          })}
          {amendments.filter(a => a.amendmentNumber == null).map(doc => (
            <FilledDocRow key={doc.id} doc={doc} label="Amendment (unnumbered)" isAdmin={isAdmin} onDelete={onDelete} onOpen={onOpen} />
          ))}
        </div>
      </div>

      {/* Addendums — only shown if any exist, plus an add button */}
      {(addendums.length > 0 || isAdmin) && (
        <div className="dra-docs-group">
          <div className="dra-docs-label">Addendums</div>
          <div className="slot-group">
            {addendums.length === 0 && (
              <div className="slot-row slot-row--empty">
                <span className="slot-empty-msg muted">No addendums on file</span>
              </div>
            )}
            {addendums.map(doc => (
              <FilledDocRow
                key={doc.id}
                doc={doc}
                label={doc.addendumName ? `${doc.addendumName} Addendum` : (doc.title ?? 'Addendum')}
                isAdmin={isAdmin}
                onDelete={onDelete}
                onOpen={onOpen}
              />
            ))}
            {isAdmin && (
              <button
                type="button"
                className="slot-add-btn"
                onClick={() => onUpload({ docType: 'Addendum', lockDocType: true })}
              >
                + Add Addendum (e.g. Silent Investor, Schmear)
              </button>
            )}
          </div>
        </div>
      )}

      {/* Other — only shown if any exist */}
      {others.length > 0 && (
        <div className="dra-docs-group">
          <div className="dra-docs-label">Other Documents</div>
          <div className="slot-group">
            {others.map(doc => (
              <FilledDocRow
                key={doc.id}
                doc={doc}
                label={doc.title ?? 'Document'}
                isAdmin={isAdmin}
                onDelete={onDelete}
                onOpen={onOpen}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FilledDocRow({ doc, label, isAdmin, onDelete, onOpen }: {
  doc: DraDocument;
  label: string;
  isAdmin: boolean;
  onDelete: (d: DraDocument) => void;
  onOpen:   (d: DraDocument) => void;
}) {
  return (
    <div className="slot-row slot-row--filled dra-doc-row">
      <span className="slot-label">{label}</span>
      <span className="slot-date">{doc.effectiveDate ?? 'No date'}</span>
      <div className="slot-actions">
        {doc.signatories && <span className="muted dra-doc-sig" title={`Signed by ${doc.signatories}`}>✎ {doc.signatories}</span>}
        {doc.file[0]
          ? <button type="button" className="btn-secondary btn-sm" onClick={() => onOpen(doc)}>📎 Open</button>
          : <span className="muted">No PDF</span>}
        {isAdmin && (
          <button type="button" className="btn-trash" title={`Delete ${label}`} onClick={() => onDelete(doc)}>🗑</button>
        )}
      </div>
    </div>
  );
}

function EmptyDocRow({ label, uploadLabel, isAdmin, onUpload }: {
  label: string;
  uploadLabel: string;
  isAdmin: boolean;
  onUpload: () => void;
}) {
  return (
    <div className="slot-row slot-row--empty">
      <span className="slot-label">{label}</span>
      <span className="muted slot-empty-msg">Empty</span>
      <div className="slot-actions">
        {isAdmin && (
          <button type="button" className="btn-secondary btn-sm" onClick={onUpload}>
            + {uploadLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function FaRow({ fa, onOpen }: { fa: DraFa; onOpen: () => void }) {
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
          ? <button type="button" className="btn-secondary" onClick={onOpen}>📎 View FA</button>
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

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ── Signatories panel ────────────────────────────────────────────

interface SigForm {
  name:      string;
  email:     string;
  ownership: string;  // percent as a string for input control (e.g. "40")
  title:     string;
  phone:     string;
  notes:     string;
}

const emptySigForm: SigForm = { name: '', email: '', ownership: '', title: '', phone: '', notes: '' };

function toForm(s: DraSignatory): SigForm {
  return {
    name:      s.name,
    email:     s.email ?? '',
    ownership: s.ownership != null ? String(Math.round(s.ownership * 10000) / 100) : '',
    title:     s.title ?? '',
    phone:     s.phone ?? '',
    notes:     s.notes ?? '',
  };
}

function SignatoriesPanel({
  draId,
  signatories,
  onChanged,
}: {
  draId: string;
  signatories: DraSignatory[];
  onChanged: () => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing]     = useState<DraSignatory | null>(null);
  const [form, setForm]           = useState<SigForm>(emptySigForm);
  const [saving, setSaving]       = useState(false);
  const [err, setErr]             = useState<string | null>(null);

  const totalOwnership = signatories
    .map(s => s.ownership ?? 0)
    .reduce((sum, v) => sum + v, 0);
  const totalPct = Math.round(totalOwnership * 10000) / 100;
  const ownershipOk = signatories.some(s => s.ownership != null) ? Math.abs(totalPct - 100) < 0.01 : true;

  function openAdd() {
    setEditing(null);
    setForm(emptySigForm);
    setErr(null);
    setModalOpen(true);
  }

  function openEdit(s: DraSignatory) {
    setEditing(s);
    setForm(toForm(s));
    setErr(null);
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { setErr('Name is required'); return; }
    const ownership = form.ownership.trim() === '' ? null : parseFloat(form.ownership);
    if (ownership !== null && (isNaN(ownership) || ownership < 0 || ownership > 100)) {
      setErr('Ownership must be a number between 0 and 100'); return;
    }
    const body = {
      name:      form.name.trim(),
      email:     form.email.trim() || null,
      ownership: ownership,
      title:     form.title.trim() || null,
      phone:     form.phone.trim() || null,
      notes:     form.notes.trim() || null,
    };
    setSaving(true);
    setErr(null);
    try {
      if (editing) {
        await api.patch(`/dras/${draId}/signatories/${editing.id}`, body);
      } else {
        await api.post(`/dras/${draId}/signatories`, body);
      }
      setModalOpen(false);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(s: DraSignatory) {
    if (!confirm(`Remove ${s.name} from this DRA's signatories?`)) return;
    try {
      await api.delete(`/dras/${draId}/signatories/${s.id}`);
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div style={{ marginTop: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
        <div className="dra-schedule-label">
          Signatories & Contacts
          {signatories.length > 0 && (
            <span className="muted" style={{ marginLeft: '0.75rem', fontWeight: 400 }}>
              {signatories.length} {signatories.length === 1 ? 'person' : 'people'}
              {signatories.some(s => s.ownership != null) && (
                <> · <span style={{ color: ownershipOk ? 'inherit' : '#B94E23', fontWeight: ownershipOk ? 400 : 600 }}>
                  {totalPct}% total ownership{!ownershipOk && ' (should be 100%)'}
                </span></>
              )}
            </span>
          )}
        </div>
        <button className="btn-secondary" onClick={openAdd}>+ Add Signatory</button>
      </div>

      {signatories.length === 0 ? (
        <div style={{
          padding:      '1rem 1.25rem',
          border:       '1px dashed #E0DDD5',
          borderRadius: 3,
          background:   '#FAFAFA',
          color:        'var(--muted, #7A8391)',
          fontSize:     '0.9rem',
        }}>
          No signatories or contacts recorded for this DRA. Click <strong>+ Add Signatory</strong> to record the owners (from Exhibit C) and/or corporate signatories from the LLC bylaws.
        </div>
      ) : (
        <div style={{ border: '1px solid #E0DDD5', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            display:              'grid',
            gridTemplateColumns:  'minmax(140px, 1.4fr) 80px minmax(180px, 1.6fr) minmax(120px, 1fr) 90px',
            columnGap:            '0.75rem',
            padding:              '0.5rem 0.9rem',
            background:           '#F7F5F0',
            fontSize:             '0.7rem',
            textTransform:        'uppercase',
            letterSpacing:        '0.05em',
            color:                'var(--muted, #7A8391)',
            fontWeight:           600,
            borderBottom:         '1px solid #E0DDD5',
          }}>
            <div>Name</div>
            <div style={{ textAlign: 'right' }}>Ownership</div>
            <div>Email</div>
            <div>Title</div>
            <div />
          </div>
          {signatories.map((s, i) => (
            <div
              key={s.id}
              style={{
                display:              'grid',
                gridTemplateColumns:  'minmax(140px, 1.4fr) 80px minmax(180px, 1.6fr) minmax(120px, 1fr) 90px',
                columnGap:            '0.75rem',
                padding:              '0.65rem 0.9rem',
                borderBottom:         i < signatories.length - 1 ? '1px solid #EFEDE7' : 'none',
                fontSize:             '0.92rem',
                alignItems:           'center',
              }}
            >
              <div style={{ fontWeight: 500 }}>{s.name}</div>
              <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {s.ownership != null ? `${Math.round(s.ownership * 10000) / 100}%` : <span className="muted">—</span>}
              </div>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.email
                  ? <a href={`mailto:${s.email}`} style={{ color: 'inherit' }}>{s.email}</a>
                  : <span className="muted">—</span>}
              </div>
              <div className="muted">{s.title || '—'}</div>
              <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => openEdit(s)}
                  title="Edit"
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.9rem', padding: '0.15rem 0.4rem' }}
                >✎</button>
                <button
                  onClick={() => handleDelete(s)}
                  title="Remove"
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.9rem', padding: '0.15rem 0.4rem', color: '#B94E23' }}
                >🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div
          onClick={() => !saving && setModalOpen(false)}
          style={{
            position:  'fixed',
            inset:     0,
            background: 'rgba(15,27,45,0.35)',
            display:   'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex:    100,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background:   '#FFF',
              borderRadius: 4,
              padding:      '1.5rem 1.75rem',
              width:        '480px',
              maxWidth:     '92vw',
              boxShadow:    '0 8px 30px rgba(15,27,45,0.2)',
            }}
          >
            <h2 style={{ margin: '0 0 1rem', fontSize: '1.15rem' }}>
              {editing ? 'Edit Signatory' : 'Add Signatory'}
            </h2>
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <label style={{ fontSize: '0.85rem' }}>
                Name*
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  style={{ width: '100%', padding: '0.4rem 0.6rem', marginTop: '0.15rem', border: '1px solid #DAD3C4', borderRadius: 3 }}
                  autoFocus
                />
              </label>
              <label style={{ fontSize: '0.85rem' }}>
                Email
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  style={{ width: '100%', padding: '0.4rem 0.6rem', marginTop: '0.15rem', border: '1px solid #DAD3C4', borderRadius: 3 }}
                />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <label style={{ fontSize: '0.85rem' }}>
                  Ownership %
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    placeholder="e.g. 40"
                    value={form.ownership}
                    onChange={e => setForm(f => ({ ...f, ownership: e.target.value }))}
                    style={{ width: '100%', padding: '0.4rem 0.6rem', marginTop: '0.15rem', border: '1px solid #DAD3C4', borderRadius: 3 }}
                  />
                  <div className="muted" style={{ fontSize: '0.72rem', marginTop: '0.2rem' }}>
                    Blank if signatory-only (no equity)
                  </div>
                </label>
                <label style={{ fontSize: '0.85rem' }}>
                  Title
                  <input
                    placeholder="President, Managing Member…"
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    style={{ width: '100%', padding: '0.4rem 0.6rem', marginTop: '0.15rem', border: '1px solid #DAD3C4', borderRadius: 3 }}
                  />
                </label>
              </div>
              <label style={{ fontSize: '0.85rem' }}>
                Phone
                <input
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  style={{ width: '100%', padding: '0.4rem 0.6rem', marginTop: '0.15rem', border: '1px solid #DAD3C4', borderRadius: 3 }}
                />
              </label>
              <label style={{ fontSize: '0.85rem' }}>
                Notes
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  style={{ width: '100%', padding: '0.4rem 0.6rem', marginTop: '0.15rem', border: '1px solid #DAD3C4', borderRadius: 3, resize: 'vertical' }}
                />
              </label>
              {err && <div style={{ color: '#B94E23', fontSize: '0.85rem' }}>{err}</div>}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button
                onClick={() => setModalOpen(false)}
                disabled={saving}
                className="btn-secondary"
              >Cancel</button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary"
              >{saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Signatory'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
