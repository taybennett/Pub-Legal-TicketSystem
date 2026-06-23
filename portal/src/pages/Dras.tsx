import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DraDocumentUploadModal } from '../components/DraDocumentUploadModal';
import { PdfViewerModal } from '../components/PdfViewerModal';
import type { DraDetail, DraDocument, DraDocumentType, DraFa, DraSummary } from '../api/types';

interface UploadIntent {
  docType:          DraDocumentType;
  amendmentNumber?: number;
  lockDocType:      boolean;
}

interface PdfTarget {
  url:      string;
  filename: string;
  title:    string;
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
  const [viewing, setViewing]   = useState<PdfTarget | null>(null);

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
              onClick={() => setViewing({
                url:      detail.draFile[0].url,
                filename: detail.draFile[0].filename,
                title:    `${detail.name} — Original DRA`,
              })}
            >
              📎 Open original DRA
            </button>
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

      {/* ── DRA Documents (Amendments + Addendums) ── */}
      <DraDocumentsSection
        documents={detail.documents}
        isAdmin={isAdmin}
        onUpload={intent => setUpload(intent)}
        onDelete={setToDelete}
        onOpen={doc => {
          if (!doc.file[0]) return;
          setViewing({
            url:      doc.file[0].url,
            filename: doc.file[0].filename,
            title:    `${detail.name} — ${doc.title ?? 'Document'}`,
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
            {detail.fas.map(fa => <FaRow key={fa.id} fa={fa} />)}
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

      {viewing && (
        <PdfViewerModal
          url={viewing.url}
          filename={viewing.filename}
          title={viewing.title}
          onClose={() => setViewing(null)}
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
  const others     = documents.filter(d => d.documentType === 'Other' || d.documentType === null);

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

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
