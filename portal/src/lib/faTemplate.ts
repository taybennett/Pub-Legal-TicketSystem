/**
 * Franchise Agreement generator. Ported from the legacy index.html flow:
 *   - Loads /templates/fa-template.docx (pre-tokenized with {{TOKEN}} markers)
 *   - Token replacement in all .xml/.rels files inside the zip
 *   - Re-packages and returns a Blob for download
 *
 * The template was prepared by tokenize_fa.py — see legacy code at outputs/
 * for the upstream script that maps form fields to token placeholders.
 */

import JSZip from 'jszip';

export interface FaSignatory {
  name:  string;
  title: string;
}

export interface FaOwner {
  name: string;
  pct:  string;
}

export interface FaGuarantor {
  name: string;
  pct:  string;
}

export interface FaInputs {
  // Franchisee entity
  entity:      string;
  state:       string;
  entityType:  string;
  // Shop
  shopName:    string;
  shopNumber:  string;
  addr1:       string;
  addr2:       string;
  // Execution
  execDate:    string;  // YYYY-MM-DD
  // Primary signatory
  signatoryName:  string;
  signatoryTitle: string;
  // Optional extras
  extraSignatories: FaSignatory[];  // up to 3
  // Formation
  formationDate: string;
  // Operating principal
  opName:   string;
  opAddr1:  string;
  opAddr2:  string;
  opTel:    string;
  opEmail:  string;
  // Section 25 Notices address (3 free-form lines, displayed on FA page 70)
  noticeLine1: string;
  noticeLine2: string;
  noticeLine3: string;
  // Second director (Exhibit C)
  director2Name:  string;
  director2Title: string;
  // Owners (up to 5)
  owners: FaOwner[];
  // Guarantors
  guarantors: FaGuarantor[];
}

interface DateParts {
  full:  string;
  day:   string;
  month: string;
  year:  string;
}

/** YYYY-MM-DD → { full: "January 15, 2026", day: "15th", month: "January", year: "2026" } */
function formatDateFull(iso: string): DateParts {
  if (!iso) return { full: '', day: '', month: '', year: '' };
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const ordinal = (n: number) => {
    const s = ['th','st','nd','rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  return {
    full:  `${months[m - 1]} ${d}, ${y}`,
    day:   ordinal(d),
    month: months[m - 1],
    year:  String(y),
  };
}

function fmtPct(raw: string): string {
  const v = (raw || '').trim();
  if (!v) return '';
  return /%\s*$/.test(v) ? v : v + '%';
}

function esc(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Block builders (port of legacy buildGuarantorBlocks / buildFranchiseeSignatoryBlocks) ──

function buildGuarantorBlocks(guarantors: FaGuarantor[], execDateFull: string): string {
  const list = guarantors.length ? guarantors : [{ name: '[Guarantor Name]', pct: '' }];
  const noBorder =
    '<w:tcBorders>' +
      '<w:top w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
      '<w:left w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
      '<w:bottom w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
      '<w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
    '</w:tcBorders>';
  const cell = (g: FaGuarantor) => {
    const pct = fmtPct(g.pct);
    const ownLine = pct
      ? '<w:p><w:r><w:rPr><w:spacing w:val="-2"/></w:rPr><w:t xml:space="preserve">Ownership: ' + esc(pct) + '</w:t></w:r></w:p>'
      : '';
    return (
      '<w:tc>' +
        '<w:tcPr><w:tcW w:w="4500" w:type="dxa"/>' + noBorder + '</w:tcPr>' +
        '<w:p><w:r><w:rPr><w:spacing w:val="-2"/></w:rPr><w:t>_______________</w:t></w:r></w:p>' +
        '<w:p><w:r><w:rPr><w:spacing w:val="-2"/></w:rPr><w:t xml:space="preserve">' + esc(g.name) + '</w:t></w:r></w:p>' +
        ownLine +
        '<w:p/>' +
        '<w:p><w:r><w:rPr><w:spacing w:val="-2"/></w:rPr><w:t>________________________________________</w:t></w:r></w:p>' +
        '<w:p><w:r><w:rPr><w:spacing w:val="-2"/></w:rPr><w:t>[Signature]</w:t></w:r></w:p>' +
        '<w:p><w:r><w:rPr><w:spacing w:val="-2"/></w:rPr><w:t xml:space="preserve">Date: ' + esc(execDateFull) + '</w:t></w:r></w:p>' +
        '<w:p/>' +
      '</w:tc>'
    );
  };
  const emptyCell = '<w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/>' + noBorder + '</w:tcPr><w:p/></w:tc>';
  const rows: string[] = [];
  for (let i = 0; i < list.length; i += 2) {
    const right = (i + 1 < list.length) ? cell(list[i + 1]) : emptyCell;
    rows.push('<w:tr>' + cell(list[i]) + right + '</w:tr>');
  }
  return (
    '<w:tbl>' +
      '<w:tblPr><w:tblW w:w="9000" w:type="dxa"/>' +
        '<w:tblBorders>' +
          '<w:top w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
          '<w:left w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
          '<w:bottom w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
          '<w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
          '<w:insideH w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
          '<w:insideV w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
        '</w:tblBorders>' +
      '</w:tblPr>' +
      '<w:tblGrid><w:gridCol w:w="4500"/><w:gridCol w:w="4500"/></w:tblGrid>' +
      rows.join('') +
    '</w:tbl><w:p/>'
  );
}

/**
 * Extra franchisee signatory blocks stacked beneath the primary signatory.
 * Uses tab + underline (w:u single) for the signature line — matches the
 * template's existing block style instead of literal underscore chars,
 * which render unpredictably with compressed letter spacing.
 */
function buildFranchiseeSignatoryBlocks(extras: FaSignatory[], execDateFull: string): string {
  if (!extras.length) return '';
  const group = (s: FaSignatory) => (
    // blank separator
    '<w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="4104"/></w:tabs><w:jc w:val="both"/><w:rPr><w:szCs w:val="22"/></w:rPr></w:pPr></w:p>' +
    // By: ____ (underlined tab — produces the horizontal sig line)
    '<w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="4104"/></w:tabs><w:jc w:val="both"/><w:rPr><w:szCs w:val="22"/></w:rPr></w:pPr>' +
      '<w:r><w:rPr><w:szCs w:val="22"/></w:rPr><w:t>By:</w:t></w:r>' +
      '<w:r><w:rPr><w:szCs w:val="22"/><w:u w:val="single"/></w:rPr><w:tab/></w:r></w:p>' +
    // Name:
    '<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="360"/><w:tab w:val="right" w:pos="4104"/></w:tabs><w:jc w:val="both"/><w:rPr><w:szCs w:val="22"/></w:rPr></w:pPr>' +
      '<w:r><w:rPr><w:szCs w:val="22"/></w:rPr><w:tab/><w:t xml:space="preserve">Name: ' + esc(s.name) + '</w:t></w:r></w:p>' +
    // Title:
    '<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="360"/><w:tab w:val="right" w:pos="4104"/></w:tabs><w:jc w:val="both"/><w:rPr><w:szCs w:val="22"/></w:rPr></w:pPr>' +
      '<w:r><w:rPr><w:szCs w:val="22"/></w:rPr><w:tab/><w:t xml:space="preserve">Title: ' + esc(s.title) + '</w:t></w:r></w:p>' +
    // Date:
    '<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="360"/><w:tab w:val="right" w:pos="4104"/></w:tabs><w:ind w:firstLine="360"/><w:jc w:val="both"/><w:rPr><w:szCs w:val="22"/></w:rPr></w:pPr>' +
      '<w:r><w:rPr><w:szCs w:val="22"/></w:rPr><w:t xml:space="preserve">Date: ' + esc(execDateFull) + '</w:t></w:r></w:p>'
  );
  return extras.map(group).join('');
}

/**
 * Section 25 (Notices) address — the template has three blank-underscore
 * paragraphs with stable paraIds. Runtime targeted replacement: find the
 * `_____________________________` placeholder inside each paragraph and
 * swap it for the user's value. Empty lines are skipped (placeholder stays).
 */
function fillNoticesAddress(xml: string, lines: string[]): string {
  const paraIds = ['20ACC4D7', '1F082D38', '17BB9144'];
  const UNDERSCORES = '_____________________________';  // 29
  let out = xml;
  paraIds.forEach((paraId, i) => {
    const v = (lines[i] ?? '').trim();
    if (!v) return;
    // Match the paragraph with this paraId, then within it find and replace
    // the underscore <w:t>...</w:t> content. The [\s\S]*? non-greedy chunks
    // are bounded by the surrounding <w:p> tags to avoid leaking.
    const re = new RegExp(
      `(<w:p w14:paraId="${paraId}"[^>]*>[\\s\\S]*?<w:t[^>]*>)${UNDERSCORES}(<\\/w:t>[\\s\\S]*?<\\/w:p>)`,
    );
    out = out.replace(re, `$1${esc(v)}$2`);
  });
  return out;
}

// ── Token map ────────────────────────────────────────────────────

function buildTokens(input: FaInputs): Record<string, string> {
  const dt = formatDateFull(input.execDate);
  const addrInline = `${input.addr1} ${input.addr2}`;
  const footerId   = `${input.entity} (${input.shopName})`;

  const owners = [...input.owners];
  while (owners.length < 5) owners.push({ name: '', pct: '' });

  return {
    '{{FRANCHISEE_ENTITY}}':           input.entity,
    '{{FRANCHISEE_STATE}}':            input.state,
    '{{ENTITY_TYPE}}':                 input.entityType,
    '{{SHOP_NUMBER}}':                 input.shopNumber,
    '{{SHOP_ADDRESS_LINE1}}':          input.addr1,
    '{{SHOP_ADDRESS_LINE2}}':          input.addr2,
    '{{SHOP_ADDRESS_INLINE}}':         addrInline,
    '{{EXEC_DATE_FULL}}':              dt.full,
    '{{EXEC_DATE_DAY}}':               dt.day,
    '{{EXEC_DATE_MONTH}}':             dt.month,
    '{{EXEC_DATE_YEAR}}':              dt.year,
    '{{FRANCHISEE_SIGNATORY_NAME}}':   input.signatoryName,
    '{{FRANCHISEE_SIGNATORY_TITLE}}':  input.signatoryTitle,
    '{{FORMATION_DATE}}':              input.formationDate,
    '{{OP_NAME}}':                     input.opName,
    '{{OP_ADDRESS_LINE1}}':            input.opAddr1,
    '{{OP_ADDRESS_LINE2}}':            input.opAddr2,
    '{{OP_TEL}}':                      input.opTel,
    '{{OP_EMAIL}}':                    input.opEmail,
    // Director 2 defaults to the Operating Principal if not explicitly set,
    // since the OP is most commonly the second director/manager.
    '{{DIRECTOR_2_NAME}}':             input.director2Name  || input.opName  || '[Director 2 Name]',
    '{{DIRECTOR_2_TITLE}}':            input.director2Title || 'Manager',
    '{{OWNER_1_NAME}}':                owners[0].name,
    '{{OWNER_1_INTEREST}}':            fmtPct(owners[0].pct) || '[%]',
    '{{OWNER_2_NAME}}':                owners[1].name || '[Owner 2]',
    '{{OWNER_2_INTEREST}}':            fmtPct(owners[1].pct) || '[%]',
    '{{OWNER_3_NAME}}':                owners[2].name || '[Owner 3]',
    '{{OWNER_3_INTEREST}}':            fmtPct(owners[2].pct) || '[%]',
    '{{OWNER_4_NAME}}':                owners[3].name || '[Owner 4]',
    '{{OWNER_4_INTEREST}}':            fmtPct(owners[3].pct) || '[%]',
    '{{OWNER_5_NAME}}':                owners[4].name || '[Owner 5]',
    '{{OWNER_5_INTEREST}}':            fmtPct(owners[4].pct) || '[%]',
    '{{FOOTER_ID}}':                   footerId,
    '<w:p><w:r><w:t>{{GUARANTOR_SIGNATURE_BLOCKS}}</w:t></w:r></w:p>':   buildGuarantorBlocks(input.guarantors, dt.full),
    '<w:p><w:r><w:t>{{FRANCHISEE_SIGNATORY_BLOCKS}}</w:t></w:r></w:p>':  buildFranchiseeSignatoryBlocks(input.extraSignatories, dt.full),
  };
}

// ── Public generator ───────────────────────────────────────────

/** Fetches the template, fills tokens, returns { blob, filename } for download. */
export async function generateFa(input: FaInputs): Promise<{ blob: Blob; filename: string }> {
  const tokens = buildTokens(input);

  const res = await fetch('/templates/fa-template.docx');
  if (!res.ok) throw new Error(`Template fetch failed: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();

  const zip = await JSZip.loadAsync(arrayBuffer);
  const dec = new TextDecoder('utf-8');
  const enc = new TextEncoder();

  // Iterate every XML / rels file in the docx and run token replacement.
  // Order matters: the multi-line block tokens (which include enclosing
  // <w:p>...</w:p>) must be replaced before the bare-token versions, since
  // both forms can appear and one substring contains the other.
  const blockTokens: Array<[string, string]> = [];
  const inlineTokens: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(tokens)) {
    if (k.startsWith('<w:p>')) blockTokens.push([k, v]);
    else inlineTokens.push([k, v]);
  }

  for (const path of Object.keys(zip.files)) {
    if (!(path.endsWith('.xml') || path.endsWith('.rels'))) continue;
    const file = zip.files[path];
    if (file.dir) continue;
    const bytes = await file.async('uint8array');
    let content = dec.decode(bytes);
    let changed = false;
    for (const [token, value] of blockTokens) {
      if (content.includes(token)) { content = content.split(token).join(value); changed = true; }
    }
    for (const [token, value] of inlineTokens) {
      if (content.includes(token)) { content = content.split(token).join(value); changed = true; }
    }
    // Notices address — paraId-targeted (document.xml only)
    if (path === 'word/document.xml') {
      const lines = [input.noticeLine1, input.noticeLine2, input.noticeLine3];
      if (lines.some(l => l && l.trim())) {
        const filled = fillNoticesAddress(content, lines);
        if (filled !== content) { content = filled; changed = true; }
      }
    }
    if (changed) zip.file(path, enc.encode(content));
  }

  const safe = (s: string) => s.replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '-');
  const filename = `${safe(input.shopName)}-${safe(input.entity)}-Franchise-Agreement.docx`;
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  return { blob, filename };
}

/** Trigger a download of the generated blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
