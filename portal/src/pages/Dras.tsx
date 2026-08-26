import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { AttachPdfButton } from '../components/AttachPdfButton';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DraDocumentUploadModal } from '../components/DraDocumentUploadModal';
import { useOpenPdf } from '../components/PdfViewerProvider';
import { DraAnalysisModal } from './DraAnalysisModal';
import type { DraDetail, DraDocument, DraDocumentType, DraEntity, DraFa, DraShopId, DraSignatory, DraSummary, EntityDocumentType, EntityLevel } from '../api/types';

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
  const [entityDocsOpen, setEntityDocsOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
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

      <div className="dra-actions" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
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
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setEntityDocsOpen(true)}
        >
          🗂 Entity Documents
          {(detail.entities?.length ?? 0) > 0 && (
            <span style={{ marginLeft: '0.4rem', opacity: 0.7 }}>
              ({detail.entities.length} {detail.entities.length === 1 ? 'entity' : 'entities'})
            </span>
          )}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setAnalysisOpen(true)}
          title="Full DRA analysis: document timeline, territory, progress"
        >
          🔍 DRA Analysis
          {detail.documents.length > 0 && (
            <span style={{ marginLeft: '0.4rem', opacity: 0.7 }}>
              ({detail.documents.length + 1} {detail.documents.length + 1 === 1 ? 'doc' : 'docs'})
            </span>
          )}
        </button>
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

      {/* ── Entity Documents modal ── */}
      {entityDocsOpen && (
        <EntityDocumentsModal
          draId={detail.id}
          draName={detail.name}
          entities={detail.entities ?? []}
          onClose={() => setEntityDocsOpen(false)}
          onChanged={onChanged}
          onOpenPdf={(file, title) => openPdf({
            url:      file.url,
            filename: file.filename,
            title,
            subtitle: detail.name,
          })}
        />
      )}

      {/* ── DRA Analysis modal ── */}
      {analysisOpen && (
        <DraAnalysisModal
          detail={detail}
          onClose={() => setAnalysisOpen(false)}
          onOpenPdf={(file, title) => openPdf({
            url:      file.url,
            filename: file.filename,
            title,
            subtitle: detail.name,
          })}
        />
      )}


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

// ── Entity Documents modal ─────────────────────────────────────────

const ENTITY_DOC_TYPES: EntityDocumentType[] = [
  'Operating Agreement', 'SS-4 Letter',
  'Articles of Formation', 'Articles of Incorporation',
  'Bylaws', 'Amendment to Operating Agreement',
  'Certificate of Good Standing', 'EIN Verification', 'Other',
];

const ENTITY_LEVELS: EntityLevel[] = ['Parent (DRA Signatory)', 'Shop-Level (FA Signatory)'];

/**
 * Two-pane view of Franchisee Entities for a DRA:
 *   TOP    — visual hierarchy chart. Parent entity centered, shop-level
 *            entities below in a horizontal row with connecting lines.
 *            Each card is a clickable node; the currently-selected card
 *            gets a highlight ring. Click switches the detail pane.
 *   BOTTOM — detail pane for the selected entity: metadata, documents
 *            list with open/delete, and an upload button.
 * A separate "Add Entity" mini-modal creates new entities.
 */
function EntityDocumentsModal({
  draId,
  draName,
  entities,
  onClose,
  onChanged,
  onOpenPdf,
}: {
  draId:      string;
  draName:    string;
  entities:   DraEntity[];
  onClose:    () => void;
  onChanged:  () => void;
  onOpenPdf:  (file: { url: string; filename: string }, title: string) => void;
}) {
  const parents      = entities.filter(e => e.entityLevel === 'Parent (DRA Signatory)');
  const shopLevels   = entities.filter(e => e.entityLevel === 'Shop-Level (FA Signatory)');
  const unclassified = entities.filter(e => !e.entityLevel);

  // Default selection: first parent → first shop-level → first unclassified → null
  const defaultSelected =
    parents[0]?.id ?? shopLevels[0]?.id ?? unclassified[0]?.id ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(defaultSelected);
  const [addEntityOpen, setAddEntityOpen] = useState(false);
  const [uploadOpen, setUploadOpen]       = useState(false);
  const [editEntityOpen, setEditEntityOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const selected = entities.find(e => e.id === selectedId) ?? null;

  async function handleDeleteDoc(docId: string, docTitle: string) {
    if (!selected) return;
    if (!confirm(`Remove "${docTitle}" from ${selected.name}?`)) return;
    setBusyId(docId);
    try {
      await api.delete(`/dras/${draId}/entities/${selected.id}/documents/${docId}`);
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeleteEntity() {
    if (!selected) return;
    if (selected.documents.length > 0) {
      alert(`Can't delete ${selected.name} while it still has ${selected.documents.length} document(s). Remove the documents first.`);
      return;
    }
    if (!confirm(`Remove entity ${selected.name} from this DRA?`)) return;
    setBusyId(selected.id);
    try {
      await api.delete(`/dras/${draId}/entities/${selected.id}`);
      setSelectedId(null);
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,27,45,0.35)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        zIndex: 100, overflowY: 'auto', padding: '2rem 1rem',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#FFF', borderRadius: 4, padding: '1.25rem 1.5rem',
          width: '960px', maxWidth: '96vw',
          boxShadow: '0 8px 30px rgba(15,27,45,0.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.35rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.15rem' }}>Entity Documents</h2>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#7A8391' }}
            title="Close"
          >×</button>
        </div>
        <div className="muted" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
          {draName} · Click any entity to see its corporate documents.
        </div>

        {err && <div style={{ color: '#B94E23', fontSize: '0.85rem', marginBottom: '1rem' }}>{err}</div>}

        {entities.length === 0 ? (
          <div style={{
            padding: '2rem 1.5rem', border: '1px dashed #E0DDD5', borderRadius: 3, background: '#FAFAFA',
            color: 'var(--muted, #7A8391)', fontSize: '0.9rem', textAlign: 'center', marginBottom: '1rem',
          }}>
            No entities have been recorded for this DRA yet.<br />
            <span style={{ opacity: 0.8 }}>Add the parent entity (the LLC/Inc. that signed the DRA) or a shop-level entity (LLC that signed a specific FA) to start uploading corporate documents.</span>
          </div>
        ) : (
          <>
            <EntityHierarchyChart
              draName={draName}
              parents={parents}
              shopLevels={shopLevels}
              unclassified={unclassified}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />

            {selected && (
              <EntityDetailPane
                entity={selected}
                busyId={busyId}
                onOpenPdf={onOpenPdf}
                onDeleteDoc={handleDeleteDoc}
                onDeleteEntity={handleDeleteEntity}
                onUpload={() => setUploadOpen(true)}
                onEdit={() => setEditEntityOpen(true)}
              />
            )}
          </>
        )}

        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            className="btn-secondary"
            onClick={() => setAddEntityOpen(true)}
          >+ Add Entity</button>
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>

      {addEntityOpen && (
        <AddEntityModal
          draId={draId}
          onClose={() => setAddEntityOpen(false)}
          onCreated={id => { setAddEntityOpen(false); setSelectedId(id); onChanged(); }}
          onError={setErr}
        />
      )}

      {editEntityOpen && selected && (
        <EditEntityModal
          draId={draId}
          entity={selected}
          onClose={() => setEditEntityOpen(false)}
          onSaved={() => { setEditEntityOpen(false); onChanged(); }}
          onError={setErr}
        />
      )}

      {uploadOpen && selected && (
        <UploadEntityDocModal
          draId={draId}
          entity={selected}
          onClose={() => setUploadOpen(false)}
          onUploaded={() => { setUploadOpen(false); onChanged(); }}
          onError={setErr}
        />
      )}
    </div>
  );
}

/**
 * Visual org-chart of entities under a DRA. Parent(s) sit on top, then a
 * bracket-style connector to the row of shop-level entities beneath.
 * Unclassified entities appear in a third row with no bracket to signal
 * they need to be tagged. The whole chart scrolls horizontally on narrow
 * viewports so we don't clip cards.
 */
function EntityHierarchyChart({
  draName,
  parents,
  shopLevels,
  unclassified,
  selectedId,
  onSelect,
}: {
  draName:      string;
  parents:      DraEntity[];
  shopLevels:   DraEntity[];
  unclassified: DraEntity[];
  selectedId:   string | null;
  onSelect:     (id: string) => void;
}) {
  const hasBracket = parents.length > 0 && shopLevels.length > 0;
  return (
    <div style={{
      border: '1px solid #E0DDD5', borderRadius: 3, background: '#FAFAFA',
      padding: '1.25rem 1rem 1rem', overflowX: 'auto',
    }}>
      {/* DRA context label */}
      <div style={{
        textAlign: 'center', fontSize: '0.72rem', textTransform: 'uppercase',
        letterSpacing: '0.06em', color: 'var(--muted, #7A8391)', marginBottom: '0.75rem',
      }}>
        Development Rights Agreement
      </div>
      <div style={{
        textAlign: 'center', fontSize: '0.95rem', fontWeight: 600,
        color: 'var(--body, #0F1B2D)', marginBottom: '1.5rem',
      }}>
        {draName}
      </div>

      {/* Parent row */}
      {parents.length > 0 ? (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {parents.map(p => (
            <EntityCard
              key={p.id}
              entity={p}
              level="parent"
              selected={selectedId === p.id}
              onClick={() => onSelect(p.id)}
            />
          ))}
        </div>
      ) : (
        <div style={{
          margin: '0 auto', maxWidth: 320, padding: '0.75rem 1rem',
          border: '1px dashed #D0CDBF', borderRadius: 3, background: '#FFFEF9',
          color: 'var(--muted, #7A8391)', fontSize: '0.82rem', textAlign: 'center',
        }}>
          No parent entity yet · click <strong>+ Add Entity</strong> below with level "Parent"
        </div>
      )}

      {/* Bracket connector (only when there's both a parent and children) */}
      {hasBracket && (
        <div style={{ position: 'relative', height: 24, margin: '0.25rem 0' }}>
          {/* vertical drop from parent */}
          <div style={{
            position: 'absolute', top: 0, left: '50%', width: 1, height: 12,
            background: '#B7B0A1', transform: 'translateX(-0.5px)',
          }} />
          {/* horizontal bracket spanning children */}
          {shopLevels.length > 1 && (
            <div style={{
              position: 'absolute', top: 11, left: '10%', right: '10%', height: 1,
              background: '#B7B0A1',
            }} />
          )}
          {/* vertical drops to each child (only visually meaningful for 1 child; the row below has its own top edges) */}
        </div>
      )}

      {/* Shop-level row */}
      {shopLevels.length > 0 && (
        <div>
          <div style={{
            textAlign: 'center', fontSize: '0.68rem', textTransform: 'uppercase',
            letterSpacing: '0.06em', color: 'var(--muted, #7A8391)', marginBottom: '0.5rem',
          }}>
            Shop-Level Entities · {shopLevels.length}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            {shopLevels.map(s => (
              <EntityCard
                key={s.id}
                entity={s}
                level="shop"
                selected={selectedId === s.id}
                onClick={() => onSelect(s.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Unclassified row (needs tagging) */}
      {unclassified.length > 0 && (
        <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px dashed #D0CDBF' }}>
          <div style={{
            textAlign: 'center', fontSize: '0.68rem', textTransform: 'uppercase',
            letterSpacing: '0.06em', color: '#B94E23', marginBottom: '0.5rem',
          }}>
            Unclassified · needs level set
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            {unclassified.map(u => (
              <EntityCard
                key={u.id}
                entity={u}
                level="unclassified"
                selected={selectedId === u.id}
                onClick={() => onSelect(u.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EntityCard({
  entity, level, selected, onClick,
}: {
  entity:   DraEntity;
  level:    'parent' | 'shop' | 'unclassified';
  selected: boolean;
  onClick:  () => void;
}) {
  const width = level === 'parent' ? 260 : 200;
  const accent =
    level === 'parent'       ? '#7C4DB5' :
    level === 'shop'         ? '#3B7BD1' :
                               '#B94E23';
  const bg = selected ? '#FFF' : (level === 'parent' ? '#F3EDFA' : level === 'shop' ? '#EEF4FC' : '#FDECE3');
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width, textAlign: 'left', cursor: 'pointer',
        background: bg,
        border: `1px solid ${selected ? accent : '#D0CDBF'}`,
        boxShadow: selected ? `0 0 0 2px ${accent}33` : 'none',
        borderRadius: 3, padding: '0.55rem 0.7rem',
        transition: 'box-shadow 0.15s, background 0.15s',
        fontFamily: 'inherit',
      }}
    >
      <div style={{
        fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em',
        color: accent, fontWeight: 700, marginBottom: '0.2rem',
      }}>
        {level === 'parent' ? 'Parent · DRA Signatory' : level === 'shop' ? 'Shop-Level · FA Signatory' : 'Unclassified'}
      </div>
      <div style={{
        fontSize: '0.95rem', fontWeight: 600, color: 'var(--body, #0F1B2D)',
        lineHeight: 1.25, marginBottom: '0.2rem',
      }}>
        {entity.name}
      </div>
      <div className="muted" style={{ fontSize: '0.75rem' }}>
        {entity.documents.length} {entity.documents.length === 1 ? 'doc' : 'docs'}
        {entity.jurisdiction ? ` · ${entity.jurisdiction}` : ''}
      </div>
    </button>
  );
}

/**
 * Right-hand detail for the selected entity. Metadata block + documents
 * list + action buttons.
 */
function EntityDetailPane({
  entity, busyId, onOpenPdf, onDeleteDoc, onDeleteEntity, onUpload, onEdit,
}: {
  entity:         DraEntity;
  busyId:         string | null;
  onOpenPdf:      (file: { url: string; filename: string }, title: string) => void;
  onDeleteDoc:    (docId: string, title: string) => void;
  onDeleteEntity: () => void;
  onUpload:       () => void;
  onEdit:         () => void;
}) {
  return (
    <div style={{
      marginTop: '1rem', border: '1px solid #E0DDD5', borderRadius: 3, background: '#FFF',
    }}>
      {/* Header */}
      <div style={{
        padding: '0.75rem 1rem', borderBottom: '1px solid #E0DDD5', background: '#F7F5F0',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
          <div>
            <div style={{ fontSize: '1rem', fontWeight: 600 }}>{entity.name}</div>
            <div className="muted" style={{ fontSize: '0.78rem', marginTop: '0.1rem' }}>
              {entity.entityLevel ?? 'No level set'}
              {entity.jurisdiction && ` · ${entity.jurisdiction}`}
              {entity.formationDate && ` · Formed ${entity.formationDate}`}
            </div>
            {(entity.signatoryName || entity.signatoryTitle) && (
              <div className="muted" style={{ fontSize: '0.78rem', marginTop: '0.15rem' }}>
                Signatory: {entity.signatoryName ?? '—'}{entity.signatoryTitle ? ` (${entity.signatoryTitle})` : ''}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
            <button
              onClick={onEdit}
              className="btn-secondary"
              style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}
            >Edit</button>
            <button
              onClick={onDeleteEntity}
              disabled={busyId === entity.id}
              title="Remove this entity from the DRA"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.9rem', padding: '0.3rem 0.5rem', color: '#B94E23' }}
            >🗑</button>
          </div>
        </div>
      </div>

      {/* Docs */}
      <div style={{ padding: '0.75rem 1rem' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.55rem',
        }}>
          <div style={{
            fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em',
            fontWeight: 700, color: 'var(--muted, #7A8391)',
          }}>
            Corporate Documents · {entity.documents.length}
          </div>
          <button
            onClick={onUpload}
            className="btn-secondary"
            style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}
          >+ Upload Document</button>
        </div>

        {entity.documents.length === 0 ? (
          <div style={{
            padding: '1rem', border: '1px dashed #E0DDD5', borderRadius: 3, background: '#FAFAFA',
            color: 'var(--muted, #7A8391)', fontSize: '0.85rem', textAlign: 'center',
          }}>
            No documents yet. Upload an Operating Agreement, SS-4, Bylaws, or other corporate document to get started.
          </div>
        ) : (
          <div style={{ border: '1px solid #EFEDE7', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1.4fr 1fr 100px 110px',
              columnGap: '0.75rem', padding: '0.45rem 0.75rem', background: '#F7F5F0',
              fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em',
              fontWeight: 600, color: 'var(--muted, #7A8391)', borderBottom: '1px solid #EFEDE7',
            }}>
              <div>Title</div>
              <div>Type</div>
              <div>Effective</div>
              <div />
            </div>
            {entity.documents.map((doc, i) => (
              <div key={doc.id} style={{
                display: 'grid', gridTemplateColumns: '1.4fr 1fr 100px 110px',
                columnGap: '0.75rem', padding: '0.55rem 0.75rem',
                borderBottom: i < entity.documents.length - 1 ? '1px solid #EFEDE7' : 'none',
                fontSize: '0.9rem', alignItems: 'center',
              }}>
                <div>{doc.title}</div>
                <div className="muted" style={{ fontSize: '0.85rem' }}>{doc.documentType ?? '—'}</div>
                <div className="muted" style={{ fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' }}>
                  {doc.effectiveDate || ''}
                </div>
                <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'flex-end' }}>
                  {doc.file[0] && (
                    <button
                      onClick={() => onOpenPdf(doc.file[0], doc.title)}
                      className="btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '0.2rem 0.55rem' }}
                    >Open</button>
                  )}
                  <button
                    onClick={() => onDeleteDoc(doc.id, doc.title)}
                    disabled={busyId === doc.id}
                    title="Remove"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.85rem', padding: '0.2rem 0.4rem', color: '#B94E23' }}
                  >🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Shared entity form used by both Add and Edit modals.
interface EntityFormState {
  name:           string;
  entityLevel:    EntityLevel | '';
  jurisdiction:   string;
  formationDate:  string;
  signatoryName:  string;
  signatoryTitle: string;
  notes:          string;
}
const emptyEntityForm: EntityFormState = {
  name: '', entityLevel: '', jurisdiction: '',
  formationDate: '', signatoryName: '', signatoryTitle: '', notes: '',
};

function EntityForm({
  form, setForm, disabled,
}: {
  form:     EntityFormState;
  setForm:  (updater: (prev: EntityFormState) => EntityFormState) => void;
  disabled: boolean;
}) {
  const upd = (k: keyof EntityFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));
  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      <label style={{ fontSize: '0.85rem' }}>
        Entity Name*
        <input
          value={form.name}
          onChange={upd('name')}
          placeholder="e.g. Jip Dip BH, Inc."
          disabled={disabled}
          autoFocus
          style={{ width: '100%', padding: '0.4rem 0.6rem', marginTop: '0.15rem', border: '1px solid #DAD3C4', borderRadius: 3 }}
        />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <label style={{ fontSize: '0.85rem' }}>
          Entity Level
          <select
            value={form.entityLevel}
            onChange={upd('entityLevel')}
            disabled={disabled}
            style={{ width: '100%', padding: '0.4rem 0.6rem', marginTop: '0.15rem', border: '1px solid #DAD3C4', borderRadius: 3, background: '#FFF' }}
          >
            <option value="">— select —</option>
            {ENTITY_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        <label style={{ fontSize: '0.85rem' }}>
          Jurisdiction (State)
          <input
            value={form.jurisdiction}
            onChange={upd('jurisdiction')}
            placeholder="DE, NY, GA…"
            disabled={disabled}
            style={{ width: '100%', padding: '0.4rem 0.6rem', marginTop: '0.15rem', border: '1px solid #DAD3C4', borderRadius: 3 }}
          />
        </label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
        <label style={{ fontSize: '0.85rem' }}>
          Formation Date
          <input
            type="date"
            value={form.formationDate}
            onChange={upd('formationDate')}
            disabled={disabled}
            style={{ width: '100%', padding: '0.4rem 0.6rem', marginTop: '0.15rem', border: '1px solid #DAD3C4', borderRadius: 3 }}
          />
        </label>
        <label style={{ fontSize: '0.85rem' }}>
          Signatory Name
          <input
            value={form.signatoryName}
            onChange={upd('signatoryName')}
            disabled={disabled}
            style={{ width: '100%', padding: '0.4rem 0.6rem', marginTop: '0.15rem', border: '1px solid #DAD3C4', borderRadius: 3 }}
          />
        </label>
        <label style={{ fontSize: '0.85rem' }}>
          Signatory Title
          <input
            value={form.signatoryTitle}
            onChange={upd('signatoryTitle')}
            disabled={disabled}
            style={{ width: '100%', padding: '0.4rem 0.6rem', marginTop: '0.15rem', border: '1px solid #DAD3C4', borderRadius: 3 }}
          />
        </label>
      </div>
      <label style={{ fontSize: '0.85rem' }}>
        Notes
        <textarea
          value={form.notes}
          onChange={upd('notes')}
          rows={2}
          disabled={disabled}
          style={{ width: '100%', padding: '0.4rem 0.6rem', marginTop: '0.15rem', border: '1px solid #DAD3C4', borderRadius: 3, resize: 'vertical' }}
        />
      </label>
    </div>
  );
}

function AddEntityModal({
  draId, onClose, onCreated, onError,
}: {
  draId:     string;
  onClose:   () => void;
  onCreated: (newId: string) => void;
  onError:   (msg: string | null) => void;
}) {
  const [form, setForm] = useState<EntityFormState>(emptyEntityForm);
  const [saving, setSaving] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  async function handleCreate() {
    if (!form.name.trim()) { setLocalErr('Entity name is required'); return; }
    setSaving(true);
    setLocalErr(null);
    onError(null);
    try {
      const res = await api.post<{ entity: { id: string } }>(`/dras/${draId}/entities`, {
        name:           form.name.trim(),
        entityLevel:    form.entityLevel || undefined,
        jurisdiction:   form.jurisdiction.trim() || undefined,
        formationDate:  form.formationDate || undefined,
        signatoryName:  form.signatoryName.trim() || undefined,
        signatoryTitle: form.signatoryTitle.trim() || undefined,
        notes:          form.notes.trim() || undefined,
      });
      onCreated(res.entity.id);
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      onClick={() => !saving && onClose()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,27,45,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#FFF', borderRadius: 4, padding: '1.5rem 1.75rem',
          width: '560px', maxWidth: '92vw', boxShadow: '0 8px 30px rgba(15,27,45,0.2)',
        }}
      >
        <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>Add Entity</h3>
        <EntityForm form={form} setForm={setForm} disabled={saving} />
        {localErr && <div style={{ color: '#B94E23', fontSize: '0.85rem', marginTop: '0.75rem' }}>{localErr}</div>}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={handleCreate} disabled={saving}>
            {saving ? 'Adding…' : 'Add Entity'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditEntityModal({
  draId, entity, onClose, onSaved, onError,
}: {
  draId:    string;
  entity:   DraEntity;
  onClose:  () => void;
  onSaved:  () => void;
  onError:  (msg: string | null) => void;
}) {
  const [form, setForm] = useState<EntityFormState>({
    name:           entity.name,
    entityLevel:    entity.entityLevel ?? '',
    jurisdiction:   entity.jurisdiction ?? '',
    formationDate:  entity.formationDate ?? '',
    signatoryName:  entity.signatoryName ?? '',
    signatoryTitle: entity.signatoryTitle ?? '',
    notes:          entity.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  async function handleSave() {
    if (!form.name.trim()) { setLocalErr('Entity name is required'); return; }
    setSaving(true);
    setLocalErr(null);
    onError(null);
    try {
      await api.patch(`/dras/${draId}/entities/${entity.id}`, {
        name:           form.name.trim(),
        entityLevel:    form.entityLevel || undefined,
        jurisdiction:   form.jurisdiction.trim(),
        formationDate:  form.formationDate,
        signatoryName:  form.signatoryName.trim(),
        signatoryTitle: form.signatoryTitle.trim(),
        notes:          form.notes.trim(),
      });
      onSaved();
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      onClick={() => !saving && onClose()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,27,45,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#FFF', borderRadius: 4, padding: '1.5rem 1.75rem',
          width: '560px', maxWidth: '92vw', boxShadow: '0 8px 30px rgba(15,27,45,0.2)',
        }}
      >
        <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>Edit Entity</h3>
        <EntityForm form={form} setForm={setForm} disabled={saving} />
        {localErr && <div style={{ color: '#B94E23', fontSize: '0.85rem', marginTop: '0.75rem' }}>{localErr}</div>}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function UploadEntityDocModal({
  draId, entity, onClose, onUploaded, onError,
}: {
  draId:      string;
  entity:     DraEntity;
  onClose:    () => void;
  onUploaded: () => void;
  onError:    (msg: string | null) => void;
}) {
  const [file, setFile]                   = useState<File | null>(null);
  const [documentType, setDocumentType]   = useState<EntityDocumentType>('Operating Agreement');
  const [title, setTitle]                 = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [notes, setNotes]                 = useState('');
  const [saving, setSaving]               = useState(false);
  const [localErr, setLocalErr]           = useState<string | null>(null);

  async function handleUpload() {
    if (!file) { setLocalErr('Select a PDF file'); return; }
    if (file.type !== 'application/pdf') { setLocalErr('Only PDF files are supported'); return; }
    setSaving(true);
    setLocalErr(null);
    onError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('documentType', documentType);
      if (title.trim())         fd.append('title', title.trim());
      if (effectiveDate)        fd.append('effectiveDate', effectiveDate);
      if (notes.trim())         fd.append('notes', notes.trim());
      await api.upload(`/dras/${draId}/entities/${entity.id}/documents`, fd);
      onUploaded();
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      onClick={() => !saving && onClose()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,27,45,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#FFF', borderRadius: 4, padding: '1.5rem 1.75rem',
          width: '520px', maxWidth: '92vw', boxShadow: '0 8px 30px rgba(15,27,45,0.2)',
        }}
      >
        <h3 style={{ margin: '0 0 0.35rem', fontSize: '1.1rem' }}>Upload Document</h3>
        <div className="muted" style={{ fontSize: '0.82rem', marginBottom: '1rem' }}>
          For {entity.name}
        </div>
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <label style={{ fontSize: '0.85rem' }}>
            Document Type*
            <select
              value={documentType}
              onChange={e => setDocumentType(e.target.value as EntityDocumentType)}
              style={{ width: '100%', padding: '0.4rem 0.6rem', marginTop: '0.15rem', border: '1px solid #DAD3C4', borderRadius: 3, background: '#FFF' }}
            >
              {ENTITY_DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label style={{ fontSize: '0.85rem' }}>
            Title (optional)
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={`Defaults to "${documentType} — ${entity.name}"`}
              style={{ width: '100%', padding: '0.4rem 0.6rem', marginTop: '0.15rem', border: '1px solid #DAD3C4', borderRadius: 3 }}
            />
          </label>
          <label style={{ fontSize: '0.85rem' }}>
            Effective Date (optional)
            <input
              type="date"
              value={effectiveDate}
              onChange={e => setEffectiveDate(e.target.value)}
              style={{ width: '100%', padding: '0.4rem 0.6rem', marginTop: '0.15rem', border: '1px solid #DAD3C4', borderRadius: 3 }}
            />
          </label>
          <label style={{ fontSize: '0.85rem' }}>
            PDF File*
            <input
              type="file"
              accept="application/pdf"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              style={{ width: '100%', marginTop: '0.2rem', fontSize: '0.85rem' }}
            />
          </label>
          <label style={{ fontSize: '0.85rem' }}>
            Notes (optional)
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              style={{ width: '100%', padding: '0.4rem 0.6rem', marginTop: '0.15rem', border: '1px solid #DAD3C4', borderRadius: 3, resize: 'vertical' }}
            />
          </label>
          {localErr && <div style={{ color: '#B94E23', fontSize: '0.85rem' }}>{localErr}</div>}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={handleUpload} disabled={saving || !file}>
            {saving ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}
