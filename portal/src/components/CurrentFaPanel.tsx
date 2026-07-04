import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { AttachPdfButton } from './AttachPdfButton';
import { ConfirmDialog } from './ConfirmDialog';
import { FaUploadModal } from './FaUploadModal';
import { useOpenPdf } from './PdfViewerProvider';
import type { FaDocumentType, FaTracker } from '../api/types';

/* ────────────────────────────────────────────────────────────
   Slot-based UI for FA documents on a Location — mirrors CurrentLeasePanel.

   Storage is one FA Tracker table with a Document Type per row. This
   component organizes those rows into explicit slots:
       Franchise Agreement (primary)
       1st Amendment, 2nd Amendment, … (at least 3 visible)
       Guaranty
       + Additional documents (Addendum, Renewal, Assignment,
                               Termination, Side Letter, Other)
─────────────────────────────────────────────────────────── */

type SingularKind = 'Franchise Agreement' | 'Guaranty';
type Slot =
  | { kind: 'singular';  docType: SingularKind; fa: FaTracker | null }
  | { kind: 'amendment'; number: number;        fa: FaTracker | null }
  | { kind: 'other';     fa: FaTracker };

interface UploadIntent {
  docType:          FaDocumentType;
  amendmentNumber?: number;
  lockDocType:      boolean;
}

export function CurrentFaPanel({ locationId }: { locationId: string }) {
  const { me } = useAuth();
  const [items, setItems]       = useState<FaTracker[] | null>(null);
  const [err, setErr]           = useState<string | null>(null);
  const [reload, setReload]     = useState(0);
  const [toDelete, setToDelete] = useState<FaTracker | null>(null);
  const [upload, setUpload]     = useState<UploadIntent | null>(null);

  useEffect(() => {
    api.get<{ faTrackers: FaTracker[] }>(`/locations/${locationId}/fa-trackers`)
      .then(r => setItems(r.faTrackers))
      .catch(e => setErr(e.message));
  }, [locationId, reload]);

  async function handleDelete(fa: FaTracker) {
    await api.delete(`/locations/${locationId}/fa-trackers/${fa.id}`);
    setReload(k => k + 1);
  }

  const isAdmin = me?.userType === 'Admin';

  if (err)   return null;
  if (!items) return null;

  const slots      = buildSlots(items);
  const primaries  = slots.filter(s => s.kind === 'singular' && s.docType === 'Franchise Agreement');
  const amendments = slots.filter(s => s.kind === 'amendment');
  const guaranty   = slots.find(s => s.kind === 'singular' && s.docType === 'Guaranty')!;
  const others     = slots.filter(s => s.kind === 'other');

  return (
    <div className="lease-panel">

      {/* ── Franchise Agreement (primary) ── */}
      {primaries.map((s, i) => (
        <PrimaryFaSlot
          key={i}
          slot={s as Extract<Slot, { kind: 'singular' }>}
          isAdmin={isAdmin}
          locationId={locationId}
          onChanged={() => setReload(k => k + 1)}
          onDelete={setToDelete}
          onUpload={() => setUpload({ docType: 'Franchise Agreement', lockDocType: true })}
        />
      ))}

      {/* ── Amendments ── */}
      <SlotGroupLabel>Amendments</SlotGroupLabel>
      <div className="slot-group">
        {amendments.map((a, i) => (
          <AmendmentSlot
            key={i}
            slot={a as Extract<Slot, { kind: 'amendment' }>}
            isAdmin={isAdmin}
            locationId={locationId}
            onChanged={() => setReload(k => k + 1)}
            onDelete={setToDelete}
            onUpload={n => setUpload({ docType: 'Amendment', amendmentNumber: n, lockDocType: true })}
          />
        ))}
      </div>

      {/* ── Guaranty ── */}
      <SlotGroupLabel>Guaranty & Assumption of Obligations</SlotGroupLabel>
      <div className="slot-group">
        <SingularSlot
          slot={guaranty as Extract<Slot, { kind: 'singular' }>}
          isAdmin={isAdmin}
          locationId={locationId}
          onChanged={() => setReload(k => k + 1)}
          onDelete={setToDelete}
          onUpload={() => setUpload({ docType: 'Guaranty', lockDocType: true })}
        />
      </div>

      {/* ── Additional documents ── */}
      {(others.length > 0 || isAdmin) && (
        <>
          <SlotGroupLabel>Additional Documents</SlotGroupLabel>
          <div className="slot-group">
            {others.map(s => (
              <OtherDocRow
                key={(s as Extract<Slot, { kind: 'other' }>).fa.id}
                fa={(s as Extract<Slot, { kind: 'other' }>).fa}
                isAdmin={isAdmin}
                locationId={locationId}
                onChanged={() => setReload(k => k + 1)}
                onDelete={setToDelete}
              />
            ))}
            {isAdmin && (
              <button
                type="button"
                className="slot-add-btn"
                onClick={() => setUpload({ docType: 'Addendum', lockDocType: false })}
              >
                + Add Addendum / Renewal / Assignment / Termination / Side Letter / Other
              </button>
            )}
          </div>
        </>
      )}

      {/* ── Modals ── */}
      {toDelete && (
        <ConfirmDialog
          title={`Delete ${toDelete.documentType ?? 'FA'} record?`}
          destructive
          confirmLabel="Delete record"
          onClose={() => setToDelete(null)}
          onConfirm={() => handleDelete(toDelete)}
          message={
            <>
              <p style={{ marginTop: 0 }}>
                This permanently removes the record and its PDF from Airtable. <strong>Cannot be undone.</strong>
              </p>
              <ul className="confirm-detail">
                {toDelete.documentType && <li><strong>Type:</strong> {toDelete.documentType}</li>}
                {toDelete.file[0]      && <li><strong>File:</strong> {toDelete.file[0].filename}</li>}
                {toDelete.documentDate && <li><strong>Document date:</strong> {toDelete.documentDate}</li>}
                {toDelete.executionDate && !toDelete.documentDate && <li><strong>Executed:</strong> {toDelete.executionDate}</li>}
                {toDelete.entityName    && <li><strong>Entity:</strong> {toDelete.entityName}</li>}
                {toDelete.status        && <li><strong>Status:</strong> {toDelete.status}</li>}
              </ul>
            </>
          }
        />
      )}

      {upload && (
        <FaUploadModal
          locationId={locationId}
          initialDocType={upload.docType}
          initialAmendmentNumber={upload.amendmentNumber}
          lockDocType={upload.lockDocType}
          onClose={() => setUpload(null)}
          onSaved={() => setReload(k => k + 1)}
        />
      )}
    </div>
  );
}

/* ────────────────── slot components ────────────────── */

function PrimaryFaSlot({ slot, isAdmin, locationId, onChanged, onDelete, onUpload }: {
  slot: Extract<Slot, { kind: 'singular' }>;
  isAdmin: boolean;
  locationId: string;
  onChanged: () => void;
  onDelete: (fa: FaTracker) => void;
  onUpload: () => void;
}) {
  const fa = slot.fa;
  const isGhost = fa && !fa.file[0] && !fa.executionDate && !fa.entityName && !fa.termYears;

  return (
    <>
      <div className="lease-panel-head">
        <div className="lease-panel-title">Franchise Agreement</div>
        {fa?.status && <span className={statusPillClass(fa.status)}>{fa.status}</span>}
      </div>
      {fa ? (
        <>
          {isGhost && (
            <div className="slot-warning">
              ⚠ Placeholder record — no PDF or terms on file. Delete it and re-upload the actual FA.
            </div>
          )}
          <FaRow
            fa={fa}
            isAdmin={isAdmin}
            locationId={locationId}
            onChanged={onChanged}
            onDelete={onDelete}
          />
        </>
      ) : (
        <EmptySlotRow
          label="No Franchise Agreement on file"
          uploadLabel="Upload Franchise Agreement"
          onUpload={onUpload}
          isAdmin={isAdmin}
        />
      )}
    </>
  );
}

function AmendmentSlot({ slot, isAdmin, locationId, onChanged, onDelete, onUpload }: {
  slot: Extract<Slot, { kind: 'amendment' }>;
  isAdmin: boolean;
  locationId: string;
  onChanged: () => void;
  onDelete: (fa: FaTracker) => void;
  onUpload: (n: number) => void;
}) {
  const label = `${ordinal(slot.number)} Amendment`;
  const openPdf = useOpenPdf();
  const fa = slot.fa;
  if (fa) {
    const date = fa.documentDate ?? fa.executionDate ?? null;
    return (
      <div className="slot-row slot-row--filled">
        <span className="slot-label">{label}</span>
        <span className="slot-date">{date ?? 'No date'}</span>
        <div className="slot-actions">
          {fa.file[0]
            ? <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => openPdf({
                  url: fa.file[0].url, filename: fa.file[0].filename,
                  title: label, subtitle: 'FA document',
                })}
              >📎 Open</button>
            : isAdmin
              ? <AttachPdfButton
                  uploadPath={`/locations/${locationId}/fa-trackers/${fa.id}/attach`}
                  label={`Attach ${label} PDF`}
                  onAttached={onChanged}
                />
              : <span className="muted">No PDF</span>}
          {isAdmin && (
            <button type="button" className="btn-trash" title={`Delete ${label}`} onClick={() => onDelete(fa)}>🗑</button>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="slot-row slot-row--empty">
      <span className="slot-label">{label}</span>
      <span className="muted slot-empty-msg">Empty</span>
      <div className="slot-actions">
        {isAdmin && (
          <button type="button" className="btn-secondary btn-sm" onClick={() => onUpload(slot.number)}>
            + Upload {label}
          </button>
        )}
      </div>
    </div>
  );
}

function SingularSlot({ slot, isAdmin, locationId, onChanged, onDelete, onUpload }: {
  slot: Extract<Slot, { kind: 'singular' }>;
  isAdmin: boolean;
  locationId: string;
  onChanged: () => void;
  onDelete: (fa: FaTracker) => void;
  onUpload: () => void;
}) {
  const label = slot.docType;
  const openPdf = useOpenPdf();
  const fa = slot.fa;
  if (fa) {
    const date = fa.documentDate ?? fa.executionDate ?? null;
    return (
      <div className="slot-row slot-row--filled">
        <span className="slot-label">{label}</span>
        <span className="slot-date">{date ?? 'No date'}</span>
        <div className="slot-actions">
          {fa.file[0]
            ? <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => openPdf({
                  url: fa.file[0].url, filename: fa.file[0].filename,
                  title: label, subtitle: 'FA document',
                })}
              >📎 Open</button>
            : isAdmin
              ? <AttachPdfButton
                  uploadPath={`/locations/${locationId}/fa-trackers/${fa.id}/attach`}
                  label={`Attach ${label} PDF`}
                  onAttached={onChanged}
                />
              : <span className="muted">No PDF</span>}
          {isAdmin && (
            <button type="button" className="btn-trash" title={`Delete ${label}`} onClick={() => onDelete(fa)}>🗑</button>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="slot-row slot-row--empty">
      <span className="slot-label">{label}</span>
      <span className="muted slot-empty-msg">Empty</span>
      <div className="slot-actions">
        {isAdmin && (
          <button type="button" className="btn-secondary btn-sm" onClick={onUpload}>
            + Upload {label}
          </button>
        )}
      </div>
    </div>
  );
}

function OtherDocRow({ fa, isAdmin, locationId, onChanged, onDelete }: {
  fa: FaTracker;
  isAdmin: boolean;
  locationId: string;
  onChanged: () => void;
  onDelete: (fa: FaTracker) => void;
}) {
  const type = fa.documentType ?? 'Other';
  const label = type === 'Addendum' && fa.addendumName
    ? `${fa.addendumName} Addendum`
    : type;
  const date = fa.documentDate ?? fa.executionDate ?? null;
  const openPdf = useOpenPdf();
  return (
    <div className="slot-row slot-row--filled">
      <span className="slot-label">
        <span className={`pill ${docTypePillClass(type)}`}>{label}</span>
      </span>
      <span className="slot-date">{date ?? 'No date'}</span>
      <div className="slot-actions">
        {fa.file[0]
          ? <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => openPdf({
                url: fa.file[0].url, filename: fa.file[0].filename,
                title: label, subtitle: 'FA document',
              })}
            >📎 Open</button>
          : isAdmin
            ? <AttachPdfButton
                uploadPath={`/locations/${locationId}/fa-trackers/${fa.id}/attach`}
                label={`Attach ${label} PDF`}
                onAttached={onChanged}
              />
            : <span className="muted">No PDF</span>}
        {isAdmin && (
          <button type="button" className="btn-trash" title={`Delete ${label}`} onClick={() => onDelete(fa)}>🗑</button>
        )}
      </div>
    </div>
  );
}

function EmptySlotRow({ label, uploadLabel, onUpload, isAdmin }: {
  label: string;
  uploadLabel: string;
  onUpload: () => void;
  isAdmin: boolean;
}) {
  return (
    <div className="slot-row slot-row--empty">
      <span className="slot-empty-msg muted">{label}</span>
      {isAdmin && (
        <div className="slot-actions">
          <button type="button" className="btn-secondary btn-sm" onClick={onUpload}>
            + {uploadLabel}
          </button>
        </div>
      )}
    </div>
  );
}

function SlotGroupLabel({ children }: { children: React.ReactNode }) {
  return <div className="slot-group-label">{children}</div>;
}

/* ────────────────── Primary FA full row (terms grid) ────────────────── */

function FaRow({ fa, isAdmin, locationId, onChanged, onDelete }: {
  fa: FaTracker;
  isAdmin: boolean;
  locationId: string;
  onChanged: () => void;
  onDelete: (fa: FaTracker) => void;
}) {
  const openPdf = useOpenPdf();
  return (
    <>
      <div className="lease-row">
        <Field label="Executed"  value={fa.executionDate} />
        <Field label="Term"      value={termText(fa.termYears, fa.termEnd)} />
        <Field label="Entity"    value={fa.entityName} />
        <Field label="Signatory" value={fa.signatory} />
        <div className="lease-row-actions">
          {fa.file[0]
            ? <button
                type="button"
                className="btn-secondary"
                onClick={() => openPdf({
                  url: fa.file[0].url, filename: fa.file[0].filename,
                  title: 'Franchise Agreement',
                  subtitle: [fa.entityName, fa.executionDate ? `Executed ${fa.executionDate}` : null].filter(Boolean).join(' · '),
                })}
              >📎 Open FA</button>
            : isAdmin
              ? <AttachPdfButton
                  uploadPath={`/locations/${locationId}/fa-trackers/${fa.id}/attach`}
                  label="Attach FA PDF"
                  onAttached={onChanged}
                />
              : <span className="muted">No PDF on file</span>}
          {isAdmin && (
            <button type="button" className="btn-trash" title="Delete this FA record" onClick={() => onDelete(fa)}>🗑</button>
          )}
        </div>
      </div>
      {(fa.draName || fa.attorney) && (
        <div className="fa-secondary-row">
          {fa.draName  && <span><strong>DRA:</strong> {fa.draName}</span>}
          {fa.attorney && <span><strong>Attorney:</strong> {fa.attorney}</span>}
        </div>
      )}
    </>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="lease-field">
      <div className="lease-field-label">{label}</div>
      <div className="lease-field-value">{value ?? '—'}</div>
    </div>
  );
}

/* ────────────────── helpers ────────────────── */

function buildSlots(items: FaTracker[]): Slot[] {
  const slots: Slot[] = [];

  // Franchise Agreement (primary; null documentType treated as primary for back-compat)
  const primary = items.find(f => f.documentType === 'Franchise Agreement' || f.documentType === null) ?? null;
  slots.push({ kind: 'singular', docType: 'Franchise Agreement', fa: primary });

  // Amendments — at least 3 slots visible
  const amends = items.filter(f => f.documentType === 'Amendment');
  const maxN   = amends.reduce((m, a) => Math.max(m, a.amendmentNumber ?? 0), 0);
  const count  = Math.max(3, maxN);
  for (let n = 1; n <= count; n++) {
    const fa = amends.find(a => a.amendmentNumber === n) ?? null;
    slots.push({ kind: 'amendment', number: n, fa });
  }
  // Any unnumbered amendments fall to "other"
  const unnumbered = amends.filter(a => a.amendmentNumber == null);
  for (const u of unnumbered) slots.push({ kind: 'other', fa: u });

  // Guaranty (singular)
  slots.push({
    kind: 'singular',
    docType: 'Guaranty',
    fa: items.find(f => f.documentType === 'Guaranty') ?? null,
  });

  // Everything else — anything not Franchise Agreement / Amendment / Guaranty
  const others = items.filter(f =>
    f.documentType != null &&
    f.documentType !== 'Franchise Agreement' &&
    f.documentType !== 'Amendment' &&
    f.documentType !== 'Guaranty'
  );
  others.sort((a, b) => (a.documentType ?? '').localeCompare(b.documentType ?? ''));
  for (const o of others) slots.push({ kind: 'other', fa: o });

  return slots;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function termText(years: number | null, end: string | null): string | null {
  if (years && end) return `${years} years (ends ${end})`;
  if (years)        return `${years} years`;
  if (end)          return `Ends ${end}`;
  return null;
}

function statusPillClass(status: string): string {
  const lower = status.toLowerCase();
  if (lower === 'active')             return 'pill pill--green-soft';
  if (lower === 'expired')            return 'pill pill--red';
  if (lower.includes('expiring'))     return 'pill pill--blue';
  return 'pill';
}

function docTypePillClass(t: FaDocumentType): string {
  switch (t) {
    case 'Amendment':             return 'pill--yellow';
    case 'Guaranty':              return 'pill--purple';
    case 'Addendum':              return 'pill--cyan';
    case 'Renewal Agreement':     return 'pill--green-soft';
    case 'Assignment':            return 'pill--blue';
    case 'Termination Agreement': return 'pill--red';
    case 'Side Letter':           return 'pill--gray';
    case 'Other':                 return 'pill--gray';
    default:                      return 'pill--blue-soft';
  }
}
