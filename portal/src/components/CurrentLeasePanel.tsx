import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { ConfirmDialog } from './ConfirmDialog';
import { LeaseUploadModal } from './LeaseUploadModal';
import { useOpenPdf } from './PdfViewerProvider';
import type { Lease, LeaseDocumentType } from '../api/types';

/* ────────────────────────────────────────────────────────────
   Slot-based UI for lease documents on a Location.

   The underlying storage is still one Leases table with a Document Type
   per row. This component organizes those rows into explicit slots so the
   user sees clearly which docs are present vs missing:
       Original Lease
       1st Amendment, 2nd Amendment, … (at least 3 visible, more if needed)
       Landlord Work Letter
       + Additional documents (Guaranty, Estoppel, Side Letter, Other)
─────────────────────────────────────────────────────────── */

type SingularKind = 'Original Lease' | 'Landlord Work Letter';
type Slot =
  | { kind: 'singular';  docType: SingularKind; lease: Lease | null }
  | { kind: 'amendment'; number: number;        lease: Lease | null }
  | { kind: 'other';     lease: Lease };

interface UploadIntent {
  docType:          LeaseDocumentType;
  amendmentNumber?: number;
  lockDocType:      boolean;
}

export function CurrentLeasePanel({ locationId }: { locationId: string }) {
  const { me } = useAuth();
  const [leases, setLeases]     = useState<Lease[] | null>(null);
  const [err, setErr]           = useState<string | null>(null);
  const [reload, setReload]     = useState(0);
  const [toDelete, setToDelete] = useState<Lease | null>(null);
  const [upload, setUpload]     = useState<UploadIntent | null>(null);

  useEffect(() => {
    api.get<{ leases: Lease[] }>(`/locations/${locationId}/leases`)
      .then(r => setLeases(r.leases))
      .catch(e => setErr(e.message));
  }, [locationId, reload]);

  async function handleDelete(lease: Lease) {
    await api.delete(`/locations/${locationId}/leases/${lease.id}`);
    setReload(k => k + 1);
  }

  const isAdmin = me?.userType === 'Admin';

  if (err)      return null;
  if (!leases)  return null;

  const slots         = buildSlots(leases);
  const singulars     = slots.filter(s => s.kind === 'singular' && s.docType === 'Original Lease');
  const amendments    = slots.filter(s => s.kind === 'amendment');
  const workLetter    = slots.find(s => s.kind === 'singular' && s.docType === 'Landlord Work Letter')!;
  const otherDocs     = slots.filter(s => s.kind === 'other');

  return (
    <div className="lease-panel">

      {/* ── Original Lease ── */}
      {singulars.map((s, i) => (
        <OriginalSlot
          key={i}
          slot={s as Extract<Slot, { kind: 'singular' }>}
          isAdmin={isAdmin}
          onDelete={setToDelete}
          onUpload={() => setUpload({ docType: 'Original Lease', lockDocType: true })}
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
            onDelete={setToDelete}
            onUpload={n => setUpload({ docType: 'Amendment', amendmentNumber: n, lockDocType: true })}
          />
        ))}
      </div>

      {/* ── Landlord Work Letter ── */}
      <SlotGroupLabel>Landlord Work Letter</SlotGroupLabel>
      <div className="slot-group">
        <SingularSlot
          slot={workLetter as Extract<Slot, { kind: 'singular' }>}
          isAdmin={isAdmin}
          onDelete={setToDelete}
          onUpload={() => setUpload({ docType: 'Landlord Work Letter', lockDocType: true })}
        />
      </div>

      {/* ── Additional documents (Guaranty, Estoppel, Side Letter, Other) ── */}
      {(otherDocs.length > 0 || isAdmin) && (
        <>
          <SlotGroupLabel>Additional Documents</SlotGroupLabel>
          <div className="slot-group">
            {otherDocs.map(s => (
              <OtherDocRow
                key={(s as Extract<Slot, { kind: 'other' }>).lease.id}
                lease={(s as Extract<Slot, { kind: 'other' }>).lease}
                isAdmin={isAdmin}
                onDelete={setToDelete}
              />
            ))}
            {isAdmin && (
              <button
                type="button"
                className="slot-add-btn"
                onClick={() => setUpload({ docType: 'Guaranty', lockDocType: false })}
              >
                + Add Guaranty / Estoppel / Side Letter / Other
              </button>
            )}
          </div>
        </>
      )}

      {/* ── Modals ── */}
      {toDelete && (
        <ConfirmDialog
          title={`Delete ${toDelete.documentType ?? 'lease'} record?`}
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
                {toDelete.status       && <li><strong>Status:</strong> {toDelete.status}</li>}
              </ul>
            </>
          }
        />
      )}

      {upload && (
        <LeaseUploadModal
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

function OriginalSlot({ slot, isAdmin, onDelete, onUpload }: {
  slot: Extract<Slot, { kind: 'singular' }>;
  isAdmin: boolean;
  onDelete: (l: Lease) => void;
  onUpload: () => void;
}) {
  const l = slot.lease;
  const isGhost = l && !l.file[0] && !l.executionDate && !l.monthlyRent && !l.termYears;

  return (
    <>
      <div className="lease-panel-head">
        <div className="lease-panel-title">Original Lease</div>
        {l?.status && <span className={statusPillClass(l.status)}>{l.status}</span>}
      </div>
      {l ? (
        <>
          {isGhost && (
            <div className="slot-warning">
              ⚠ Placeholder record — no PDF or terms on file. Delete it and re-upload the actual original.
            </div>
          )}
          <LeaseRow lease={l} isAdmin={isAdmin} onDelete={onDelete} />
        </>
      ) : (
        <EmptySlotRow
          label="No Original Lease on file"
          uploadLabel="Upload Original Lease"
          onUpload={onUpload}
          isAdmin={isAdmin}
        />
      )}
    </>
  );
}

function AmendmentSlot({ slot, isAdmin, onDelete, onUpload }: {
  slot: Extract<Slot, { kind: 'amendment' }>;
  isAdmin: boolean;
  onDelete: (l: Lease) => void;
  onUpload: (n: number) => void;
}) {
  const label = `${ordinal(slot.number)} Amendment`;
  const openPdf = useOpenPdf();
  const l = slot.lease;
  if (l) {
    const date = l.documentDate ?? l.executionDate ?? null;
    return (
      <div className="slot-row slot-row--filled">
        <span className="slot-label">{label}</span>
        <span className="slot-date">{date ?? 'No date'}</span>
        <div className="slot-actions">
          {l.file[0]
            ? <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => openPdf({
                  url: l.file[0].url, filename: l.file[0].filename,
                  title: label, subtitle: 'Lease document',
                })}
              >📎 Open</button>
            : <span className="muted">No PDF</span>}
          {isAdmin && (
            <button type="button" className="btn-trash" title={`Delete ${label}`} onClick={() => onDelete(l)}>🗑</button>
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

function SingularSlot({ slot, isAdmin, onDelete, onUpload }: {
  slot: Extract<Slot, { kind: 'singular' }>;
  isAdmin: boolean;
  onDelete: (l: Lease) => void;
  onUpload: () => void;
}) {
  const label = slot.docType;
  const openPdf = useOpenPdf();
  const l = slot.lease;
  if (l) {
    const date = l.documentDate ?? l.executionDate ?? null;
    return (
      <div className="slot-row slot-row--filled">
        <span className="slot-label">{label}</span>
        <span className="slot-date">{date ?? 'No date'}</span>
        <div className="slot-actions">
          {l.file[0]
            ? <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => openPdf({
                  url: l.file[0].url, filename: l.file[0].filename,
                  title: label, subtitle: 'Lease document',
                })}
              >📎 Open</button>
            : <span className="muted">No PDF</span>}
          {isAdmin && (
            <button type="button" className="btn-trash" title={`Delete ${label}`} onClick={() => onDelete(l)}>🗑</button>
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

function OtherDocRow({ lease, isAdmin, onDelete }: {
  lease: Lease;
  isAdmin: boolean;
  onDelete: (l: Lease) => void;
}) {
  const type = lease.documentType ?? 'Other';
  const date = lease.documentDate ?? lease.executionDate ?? null;
  const openPdf = useOpenPdf();
  return (
    <div className="slot-row slot-row--filled">
      <span className="slot-label">
        <span className={`pill ${docTypePillClass(type)}`}>{type}</span>
      </span>
      <span className="slot-date">{date ?? 'No date'}</span>
      <div className="slot-actions">
        {lease.file[0]
          ? <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => openPdf({
                url: lease.file[0].url, filename: lease.file[0].filename,
                title: type, subtitle: 'Lease document',
              })}
            >📎 Open</button>
          : <span className="muted">No PDF</span>}
        {isAdmin && (
          <button type="button" className="btn-trash" title={`Delete ${type}`} onClick={() => onDelete(lease)}>🗑</button>
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

/* ────────────────── Original-lease full row (terms grid) ────────────────── */

function LeaseRow({ lease, isAdmin, onDelete }: { lease: Lease; isAdmin: boolean; onDelete: (l: Lease) => void }) {
  const openPdf = useOpenPdf();
  return (
    <div className="lease-row">
      <Field label="Executed"      value={lease.executionDate} />
      <Field label="Term"          value={termText(lease.termYears, lease.termEnd)} />
      <Field label="Monthly rent"  value={fmtMoney(lease.monthlyRent)} />
      <Field label="Annual rent"   value={fmtMoney(lease.annualRent)} />
      <div className="lease-row-actions">
        {lease.file[0]
          ? <button
              type="button"
              className="btn-secondary"
              onClick={() => openPdf({
                url: lease.file[0].url, filename: lease.file[0].filename,
                title: 'Original Lease', subtitle: 'Lease document',
              })}
            >📎 Open lease</button>
          : <span className="muted">No PDF on file</span>}
        {isAdmin && (
          <button type="button" className="btn-trash" title="Delete this lease record" onClick={() => onDelete(lease)}>🗑</button>
        )}
      </div>
    </div>
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

function buildSlots(leases: Lease[]): Slot[] {
  const slots: Slot[] = [];

  // Original Lease (singular; treat null documentType as Original).
  const original = leases.find(l => l.documentType === 'Original Lease' || l.documentType === null) ?? null;
  slots.push({ kind: 'singular', docType: 'Original Lease', lease: original });

  // Amendments — show at least 3 slots; more if any beyond that exist.
  const amends = leases.filter(l => l.documentType === 'Amendment');
  const maxN   = amends.reduce((m, a) => Math.max(m, a.amendmentNumber ?? 0), 0);
  const count  = Math.max(3, maxN);
  for (let n = 1; n <= count; n++) {
    const lease = amends.find(a => a.amendmentNumber === n) ?? null;
    slots.push({ kind: 'amendment', number: n, lease });
  }
  // Any unnumbered amendments fall through to "other"
  const unnumbered = amends.filter(a => a.amendmentNumber == null);
  for (const u of unnumbered) slots.push({ kind: 'other', lease: u });

  // Landlord Work Letter (singular)
  slots.push({
    kind: 'singular',
    docType: 'Landlord Work Letter',
    lease: leases.find(l => l.documentType === 'Landlord Work Letter') ?? null,
  });

  // Everything else
  const others = leases.filter(l =>
    l.documentType === 'Guaranty' ||
    l.documentType === 'Estoppel' ||
    l.documentType === 'Side Letter' ||
    l.documentType === 'Other'
  );
  others.sort((a, b) => (a.documentType ?? '').localeCompare(b.documentType ?? ''));
  for (const o of others) slots.push({ kind: 'other', lease: o });

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

function fmtMoney(n: number | null): string | null {
  if (n === null || n === undefined) return null;
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function statusPillClass(status: string): string {
  const lower = status.toLowerCase();
  if (lower === 'active')                              return 'pill pill--green-soft';
  if (lower === 'expired')                             return 'pill pill--red';
  if (lower.includes('expiring') || lower === 'on holdover') return 'pill pill--blue';
  return 'pill';
}

function docTypePillClass(t: LeaseDocumentType): string {
  switch (t) {
    case 'Amendment':            return 'pill--yellow';
    case 'Guaranty':             return 'pill--purple';
    case 'Landlord Work Letter': return 'pill--teal';
    case 'Estoppel':             return 'pill--orange';
    case 'Side Letter':          return 'pill--gray';
    case 'Other':                return 'pill--gray';
    default:                     return 'pill--blue-soft';
  }
}
