import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, fileProxyUrl } from '../api/client';
import { downloadBlob, generateFa, generateExecutionPackage, type AddendumTemplate, type FaInputs, type FaOwner, type FaSignatory, type FaGuarantor } from '../lib/faTemplate';

interface DraSummary {
  id: string;
  name: string;
  totalObligation: number;
  executionDate:   string | null;
  signatoryEntity: string | null;
}
interface StandingAddendum {
  id: string;
  name: string;
  description: string;
  notes: string;
  file: { url: string; filename: string }[];
}

interface DraftPayload {
  entity:      string;
  shopName:    string;
  shopNumber:  string;
  execDate:    string;
  signatoryName: string;
}

const ENTITY_TYPES = [
  'limited liability company',
  'corporation',
  'limited partnership',
  'general partnership',
];

const blankSig:  FaSignatory = { name: '', title: '' };
const blankOwn:  FaOwner     = { name: '', pct: '' };
const blankGuar: FaGuarantor = { name: '', pct: '' };

export function FaGenerator() {
  // Required core fields
  const [entity, setEntity]         = useState('');
  const [state, setState]           = useState('');
  const [entityType, setEntityType] = useState(ENTITY_TYPES[0]);
  const [shopName, setShopName]     = useState('');
  const [shopNumber, setShopNumber] = useState('');
  const [addr1, setAddr1]           = useState('');
  const [addr2, setAddr2]           = useState('');
  const [execDate, setExecDate]     = useState('');
  const [signatoryName, setSignatoryName]   = useState('');
  const [signatoryTitle, setSignatoryTitle] = useState('');
  const [formationDate, setFormationDate]   = useState('');
  const [opName, setOpName]                 = useState('');
  const [opAddr1, setOpAddr1]               = useState('');
  const [opAddr2, setOpAddr2]               = useState('');
  const [opTel, setOpTel]                   = useState('');
  const [opEmail, setOpEmail]               = useState('');
  const [director2Name, setDirector2Name]   = useState('');
  const [director2Title, setDirector2Title] = useState('');

  // Section 25 Notices address (page 70)
  const [noticeLine1, setNoticeLine1] = useState('');
  const [noticeLine2, setNoticeLine2] = useState('');
  const [noticeLine3, setNoticeLine3] = useState('');

  const [extraSignatories, setExtraSignatories] = useState<FaSignatory[]>([blankSig, blankSig, blankSig]);
  const [owners, setOwners]                     = useState<FaOwner[]>([blankOwn, blankOwn, blankOwn, blankOwn, blankOwn]);
  const [guarantors, setGuarantors]             = useState<FaGuarantor[]>([blankGuar, blankGuar, blankGuar, blankGuar, blankGuar]);

  const [busy, setBusy]       = useState(false);
  const [status, setStatus]   = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);

  // DRA selector + standing addendums callout
  const [draList, setDraList] = useState<DraSummary[]>([]);
  const [selectedDraId, setSelectedDraId] = useState<string>('');
  const [addendums, setAddendums] = useState<StandingAddendum[]>([]);
  const [includeAddendumIds, setIncludeAddendumIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.get<{ dras: DraSummary[] }>('/dras')
      .then(r => setDraList(r.dras.filter(d => d.totalObligation > 0)))
      .catch(() => setDraList([]));
  }, []);

  useEffect(() => {
    if (!selectedDraId) { setAddendums([]); setIncludeAddendumIds(new Set()); return; }
    api.get<{ standingAddendums: StandingAddendum[] }>(`/dras/${selectedDraId}/standing-addendums`)
      .then(r => {
        setAddendums(r.standingAddendums);
        // Default-check every addendum that has a template file on record.
        setIncludeAddendumIds(new Set(r.standingAddendums.filter(a => a.file[0]).map(a => a.id)));
      })
      .catch(() => { setAddendums([]); setIncludeAddendumIds(new Set()); });
  }, [selectedDraId]);

  function toggleIncludeAddendum(id: string) {
    setIncludeAddendumIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const selectedDra = draList.find(d => d.id === selectedDraId) ?? null;

  const addendumsToBundle: AddendumTemplate[] = addendums
    .filter(a => includeAddendumIds.has(a.id) && a.file[0])
    .map(a => ({
      name:             a.name,
      templateUrl:      fileProxyUrl(a.file[0].url),
      templateFilename: a.file[0].filename,
    }));

  function patchExtraSig(i: number, patch: Partial<FaSignatory>) {
    setExtraSignatories(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  }
  function patchOwner(i: number, patch: Partial<FaOwner>) {
    setOwners(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  }
  function patchGuarantor(i: number, patch: Partial<FaGuarantor>) {
    setGuarantors(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    setError(null);
    try {
      setStatus('Filling template…');
      const input: FaInputs = {
        entity, state, entityType,
        shopName, shopNumber, addr1, addr2,
        execDate,
        signatoryName, signatoryTitle,
        extraSignatories: extraSignatories.filter(s => s.name.trim()),
        formationDate,
        opName, opAddr1, opAddr2, opTel, opEmail,
        director2Name, director2Title,
        noticeLine1, noticeLine2, noticeLine3,
        owners:     owners.filter(o => o.name.trim()),
        guarantors: guarantors.filter(g => g.name.trim()),
        dra: selectedDra ? {
          name:            selectedDra.name,
          signatoryEntity: selectedDra.signatoryEntity,
          executionDate:   selectedDra.executionDate,
          totalObligation: selectedDra.totalObligation,
        } : undefined,
      };
      let blob: Blob;
      let filename: string;
      let statusMsg: string;
      if (addendumsToBundle.length > 0) {
        setStatus(`Filling FA + ${addendumsToBundle.length} addendum${addendumsToBundle.length === 1 ? '' : 's'}…`);
        const pkg = await generateExecutionPackage(input, addendumsToBundle);
        blob = pkg.blob;
        filename = pkg.filename;
        const failed = pkg.entries.filter(e => !e.ok);
        statusMsg = failed.length === 0
          ? `✓ Generated ${filename} (${pkg.entries.length} documents: FA + ${addendumsToBundle.length} addendum${addendumsToBundle.length === 1 ? '' : 's'}).`
          : `⚠ Generated ${filename} — ${pkg.entries.length - failed.length}/${pkg.entries.length} documents succeeded. Failed: ${failed.map(f => f.name).join(', ')}`;
      } else {
        const fa = await generateFa(input);
        blob = fa.blob;
        filename = fa.filename;
        statusMsg = `✓ Generated ${filename} · draft saved to FA Tracker. Upload the executed copy from the shop's FA tab once signed.`;
      }

      setStatus('Saving draft to FA Tracker…');
      const draft: DraftPayload = {
        entity, shopName, shopNumber, execDate, signatoryName,
      };
      await api.post('/fa-trackers', draft);

      setStatus('Downloading…');
      downloadBlob(blob, filename);
      setStatus(statusMsg);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message ?? 'Generation failed');
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Generate Franchise Agreement</h1>
      </div>

      <p className="muted" style={{ marginBottom: '1.5rem' }}>
        Fill in the fields below to generate a completed Franchise Agreement (.docx).
        A draft record is saved to the FA Tracker; upload the fully-executed copy from
        the shop's FA tab once all parties have signed.
      </p>

      <div className="fa-dra-picker">
        <label className="fa-dra-picker-label">
          DRA / Franchisee Group <span className="muted">(optional — surfaces required standing addendums)</span>
        </label>
        <select
          value={selectedDraId}
          onChange={e => setSelectedDraId(e.target.value)}
          className="fa-dra-picker-select"
        >
          <option value="">— None / Standalone FA —</option>
          {draList.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {addendums.length > 0 && (
        <div className="fa-addendums-callout">
          <div className="fa-addendums-callout-title">
            ⚠ This FA requires {addendums.length === 1 ? 'the following document' : `${addendums.length} additional documents`} to be executed contemporaneously:
          </div>
          <ul className="fa-addendums-list">
            {addendums.map(a => {
              const hasTemplate = !!a.file[0];
              return (
                <li key={a.id}>
                  <div className="fa-addendum-row">
                    {hasTemplate && (
                      <label className="fa-addendum-check">
                        <input
                          type="checkbox"
                          checked={includeAddendumIds.has(a.id)}
                          onChange={() => toggleIncludeAddendum(a.id)}
                        />
                        <span>Include in execution package</span>
                      </label>
                    )}
                    <div className="fa-addendum-name">{a.name}</div>
                    {a.description && <div className="fa-addendum-desc">{a.description}</div>}
                    {a.notes && <div className="fa-addendum-notes"><em>{a.notes}</em></div>}
                    {hasTemplate ? (
                      <a
                        href={fileProxyUrl(a.file[0].url)}
                        download={a.file[0].filename}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="fa-addendum-download"
                      >
                        ⬇ Download blank template ({a.file[0].filename})
                      </a>
                    ) : (
                      <div className="fa-addendum-no-template muted">
                        No template on file in Airtable — upload a tokenized .docx to the Standing Addendums record to enable auto-generation.
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <form onSubmit={handleSubmit} className="fa-form">

        <SectionLabel>Franchisee Entity</SectionLabel>
        <Row>
          <Field label="Entity Name" required>
            <input value={entity} onChange={e => setEntity(e.target.value)} placeholder="e.g. BBP A2, LLC" required />
          </Field>
          <Field label="State of Formation" required>
            <input value={state} onChange={e => setState(e.target.value)} placeholder="e.g. Massachusetts" required />
          </Field>
        </Row>
        <Row>
          <Field label="Entity Type" required>
            <select value={entityType} onChange={e => setEntityType(e.target.value)} required>
              {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        </Row>

        <SectionLabel>Shop Details</SectionLabel>
        <Row>
          <Field label="Shop Location / Name" required>
            <input value={shopName} onChange={e => setShopName(e.target.value)} placeholder="e.g. Assembly Row" required />
          </Field>
          <Field label="Shop Number" required>
            <input value={shopNumber} onChange={e => setShopNumber(e.target.value)} placeholder="e.g. 2002" required />
          </Field>
        </Row>
        <Row>
          <Field label="Address Line 1 (uppercase)" required>
            <input value={addr1} onChange={e => setAddr1(e.target.value)} placeholder="e.g. 495 REVOLUTION DRIVE" required />
          </Field>
          <Field label="Address Line 2 (City, ST ZIP uppercase)" required>
            <input value={addr2} onChange={e => setAddr2(e.target.value)} placeholder="e.g. SOMERVILLE, MA 02145" required />
          </Field>
        </Row>

        <SectionLabel>Execution Date</SectionLabel>
        <Row>
          <Field label="Execution Date" required>
            <input type="date" value={execDate} onChange={e => setExecDate(e.target.value)} required />
          </Field>
        </Row>

        <SectionLabel>Franchisee Signatory (Primary)</SectionLabel>
        <Row>
          <Field label="Full Name" required>
            <input value={signatoryName} onChange={e => setSignatoryName(e.target.value)} placeholder="e.g. Brian Harrington" required />
          </Field>
          <Field label="Title" required>
            <input value={signatoryTitle} onChange={e => setSignatoryTitle(e.target.value)} placeholder="e.g. Manager" required />
          </Field>
        </Row>

        <SectionLabel>Additional Franchisee Signatories</SectionLabel>
        <p className="fa-hint">Optional. Up to three more people signing for the Franchisee.</p>
        {[0, 1, 2].map(i => (
          <Row key={i}>
            <Field label={`${ordinal(i + 2)} Signatory Name`}>
              <input value={extraSignatories[i].name} onChange={e => patchExtraSig(i, { name: e.target.value })} placeholder="Full name" />
            </Field>
            <Field label={`${ordinal(i + 2)} Signatory Title`}>
              <input value={extraSignatories[i].title} onChange={e => patchExtraSig(i, { title: e.target.value })} placeholder="Title" />
            </Field>
          </Row>
        ))}

        <SectionLabel>Franchisee Formation (Exhibit C)</SectionLabel>
        <Row>
          <Field label="Date of Formation" required>
            <input value={formationDate} onChange={e => setFormationDate(e.target.value)} placeholder="e.g. January 15, 2025" required />
          </Field>
        </Row>

        <SectionLabel>Operating Principal Contact</SectionLabel>
        <Row>
          <Field label="Full Name" required>
            <input value={opName} onChange={e => setOpName(e.target.value)} placeholder="e.g. Brian Harrington" required />
          </Field>
        </Row>
        <Row>
          <Field label="Address Line 1" required>
            <input value={opAddr1} onChange={e => setOpAddr1(e.target.value)} placeholder="e.g. 514 Wyndmoor Avenue" required />
          </Field>
          <Field label="City, State ZIP" required>
            <input value={opAddr2} onChange={e => setOpAddr2(e.target.value)} placeholder="e.g. Wyndmoor, PA 19038" required />
          </Field>
        </Row>
        <Row>
          <Field label="Phone" required>
            <input value={opTel} onChange={e => setOpTel(e.target.value)} placeholder="e.g. 215-901-9941" required />
          </Field>
          <Field label="Email" required>
            <input type="email" value={opEmail} onChange={e => setOpEmail(e.target.value)} placeholder="e.g. name@email.com" required />
          </Field>
        </Row>

        <SectionLabel>Notices to Franchisee (Section 25, page 70)</SectionLabel>
        <p className="fa-hint">Address where notices to the Franchisee should be sent. Up to 3 lines. Leave blank to keep the underlined blanks in the FA.</p>
        <Row>
          <Field label="Notice Line 1">
            <input value={noticeLine1} onChange={e => setNoticeLine1(e.target.value)} placeholder="e.g. Brian Harrington, Manager" />
          </Field>
          <Field label="Notice Line 2">
            <input value={noticeLine2} onChange={e => setNoticeLine2(e.target.value)} placeholder="e.g. 514 Wyndmoor Avenue" />
          </Field>
        </Row>
        <Row>
          <Field label="Notice Line 3">
            <input value={noticeLine3} onChange={e => setNoticeLine3(e.target.value)} placeholder="e.g. Wyndmoor, PA 19038" />
          </Field>
        </Row>

        <SectionLabel>Second Director / Manager (Exhibit C)</SectionLabel>
        <p className="fa-hint">Defaults to the Operating Principal if left blank. The primary signatory is automatically the first director.</p>
        <Row>
          <Field label="Name">
            <input value={director2Name} onChange={e => setDirector2Name(e.target.value)} placeholder="e.g. Kevin Kelly" />
          </Field>
          <Field label="Title">
            <input value={director2Title} onChange={e => setDirector2Title(e.target.value)} placeholder="e.g. Manager" />
          </Field>
        </Row>

        <SectionLabel>Ownership Table (Exhibit C)</SectionLabel>
        <p className="fa-hint">Enter all owners and their ownership percentages.</p>
        {owners.map((o, i) => (
          <div key={i} className="fa-owner-row">
            <span className="fa-owner-num">{i + 1}</span>
            <input value={o.name}  onChange={e => patchOwner(i, { name: e.target.value })}  placeholder="Owner name" />
            <input value={o.pct}   onChange={e => patchOwner(i, { pct:  e.target.value })}  placeholder="%" />
          </div>
        ))}

        <SectionLabel>Guarantor Signatures (Exhibit B-1)</SectionLabel>
        <p className="fa-hint">Optional. Names appear in the guarantor signature blocks at the back of the FA.</p>
        {guarantors.map((g, i) => (
          <div key={i} className="fa-owner-row">
            <span className="fa-owner-num">{i + 1}</span>
            <input value={g.name} onChange={e => patchGuarantor(i, { name: e.target.value })} placeholder="Guarantor name" />
            <input value={g.pct}  onChange={e => patchGuarantor(i, { pct:  e.target.value })} placeholder="%" />
          </div>
        ))}

        <div className="fa-actions">
          <button className="btn-primary" type="submit" disabled={busy}>
            {busy ? 'Generating…' : addendumsToBundle.length > 0
              ? `Generate execution package (.zip) — FA + ${addendumsToBundle.length} addendum${addendumsToBundle.length === 1 ? '' : 's'}`
              : 'Generate FA'}
          </button>
          {status && <span className="fa-status">{status}</span>}
          {error  && <span className="fa-status fa-status--err">{error}</span>}
        </div>
      </form>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="fa-section-label">{children}</div>;
}
function Row({ children }: { children: React.ReactNode }) {
  return <div className="fa-row">{children}</div>;
}
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="fa-field">
      <label>{label}{required && <span className="req"> *</span>}</label>
      {children}
    </div>
  );
}
function ordinal(n: number): string {
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}
