/**
 * Franchise Agreement generator. Ported from the legacy index.html flow:
 *   - Loads /templates/fa-template-v2.7.26.docx (pre-tokenized with {{TOKEN}} markers)
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
  // Parent DRA (only relevant when generating standing addendums via a DRA-scoped
  // template). Populated by the FA Generator when the user picks a DRA.
  dra?: {
    name:            string;
    signatoryEntity: string | null;  // "parent company" that signed the DRA
    executionDate:   string | null;  // ISO YYYY-MM-DD
    totalObligation: number;         // # of shops in the DRA
  };
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

/** Spell out an integer (1-99), returning e.g. "fifteen (15)". Falls back to
 *  just the numeric string for anything outside 1-99 (rare for DRA shop counts). */
function spellOutWithNumeric(n: number): string {
  const abs = Math.abs(Math.floor(n));
  if (abs < 1 || abs > 99) return String(n);
  const ones = ['', 'one','two','three','four','five','six','seven','eight','nine',
                'ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen',
                'seventeen','eighteen','nineteen'];
  const tens = ['', '', 'twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
  let words: string;
  if (abs < 20) {
    words = ones[abs];
  } else {
    const t = Math.floor(abs / 10);
    const o = abs % 10;
    words = o === 0 ? tens[t] : `${tens[t]}-${ones[o]}`;
  }
  return `${words} (${abs})`;
}

function esc(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Block builders (port of legacy buildGuarantorBlocks / buildFranchiseeSignatoryBlocks) ──

/**
 * Invisible white 1pt paragraph carrying a DocuSign anchor string. When the
 * generated docx is sent through DocuSign, the SDK's anchor matcher finds
 * the string in the PDF text stream and places a signature/date tab exactly
 * where the paragraph is positioned. The paragraph renders as a hairline
 * of blank space in wet-sign scenarios.
 *
 * The explicit pPr forces line=20 (1pt exact) with zero before/after spacing
 * so the paragraph collapses to a true 1pt hairline. Without this, Word
 * would apply the default paragraph height (~11pt line + ~8pt after) even
 * though the RUN text is 1pt — leaving unwanted whitespace under every
 * signature and date anchor.
 */
function docusignAnchor(anchor: string): string {
  return (
    '<w:p>' +
      '<w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr>' +
      '<w:r>' +
        '<w:rPr><w:color w:val="FFFFFF"/><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr>' +
        '<w:t>' + esc(anchor) + '</w:t>' +
      '</w:r>' +
    '</w:p>'
  );
}

function buildGuarantorBlocks(guarantors: FaGuarantor[], execDateFull: string): string {
  const list = guarantors.length ? guarantors : [{ name: '[Guarantor Name]', pct: '' }];
  const noBorder =
    '<w:tcBorders>' +
      '<w:top w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
      '<w:left w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
      '<w:bottom w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
      '<w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
    '</w:tcBorders>';
  const cell = (g: FaGuarantor, idx: number) => {
    const pct = fmtPct(g.pct);
    const ownLine = pct
      ? '<w:p><w:r><w:rPr><w:spacing w:val="-2"/></w:rPr><w:t xml:space="preserve">Ownership: ' + esc(pct) + '</w:t></w:r></w:p>'
      : '';
    // Layout (top to bottom):
    //   ______________     ← identifier line
    //   <Name>
    //   Ownership: X%
    //   [blank]            ← just enough room for the DocuSign "Signed by"
    //                        caption not to overlap the Ownership line
    //   \sig_guarantor_N\  ← invisible anchor; sig image lands here
    //   [blank]
    //   ______________________  ← sig underline
    //   \date_guarantor_N\ ← invisible date anchor
    //   Date: <full>
    //   [blank]
    return (
      '<w:tc>' +
        '<w:tcPr><w:tcW w:w="4500" w:type="dxa"/>' + noBorder + '</w:tcPr>' +
        '<w:p><w:r><w:rPr><w:spacing w:val="-2"/></w:rPr><w:t>_______________</w:t></w:r></w:p>' +
        '<w:p><w:r><w:rPr><w:spacing w:val="-2"/></w:rPr><w:t xml:space="preserve">' + esc(g.name) + '</w:t></w:r></w:p>' +
        ownLine +
        '<w:p/>' +
        docusignAnchor('\\sig_guarantor_' + idx + '\\') +
        '<w:p/>' +
        '<w:p><w:r><w:rPr><w:spacing w:val="-2"/></w:rPr><w:t>________________________________________</w:t></w:r></w:p>' +
        docusignAnchor('\\date_guarantor_' + idx + '\\') +
        '<w:p><w:r><w:rPr><w:spacing w:val="-2"/></w:rPr><w:t xml:space="preserve">Date: ' + esc(execDateFull) + '</w:t></w:r></w:p>' +
        '<w:p/>' +
      '</w:tc>'
    );
  };
  const emptyCell = '<w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/>' + noBorder + '</w:tcPr><w:p/></w:tc>';
  const rows: string[] = [];
  for (let i = 0; i < list.length; i += 2) {
    // guarantor indices are 1-based to match \sig_guarantor_1\ / \sig_guarantor_2\ etc.
    const right = (i + 1 < list.length) ? cell(list[i + 1], i + 2) : emptyCell;
    rows.push('<w:tr>' + cell(list[i], i + 1) + right + '</w:tr>');
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
  // Every extra franchisee-side signatory signs as the franchisee recipient
  // (routing order 1). Since `anchorIgnoreIfNotPresent: true` is set on the
  // tab config and each block emits `\sig_franchisee\` again, DocuSign
  // places one signature tab per block — the franchisee sees a stack of
  // tabs to sign, one per person listed here (typically B-2 Owner blocks).
  const group = (s: FaSignatory) => (
    // blank separator
    '<w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="4104"/></w:tabs><w:jc w:val="both"/><w:rPr><w:szCs w:val="22"/></w:rPr></w:pPr></w:p>' +
    // DocuSign anchor at the top of THIS block.
    docusignAnchor('\\sig_franchisee\\') +
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
    // DocuSign anchor for THIS block's auto-date.
    docusignAnchor('\\date_franchisee\\') +
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
    // Shop name is available under both conventions so authors can use either.
    '{{SHOP_NAME}}':                   input.shopName,
    '{{Shop Name}}':                   input.shopName,
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
    // DRA-scoped tokens for standing addendum templates. Empty when no DRA
    // is selected (standalone FA generation).
    '{{DRA_NAME}}':                    input.dra?.name ?? '',
    '{{DRA_ENTITY}}':                  input.dra?.signatoryEntity ?? '',
    '{{DRA_EXECUTION_DATE_FULL}}':     input.dra?.executionDate ? formatDateFull(input.dra.executionDate).full : '',
    '{{DRA_TOTAL_OBLIGATION_FULL}}':   input.dra?.totalObligation ? spellOutWithNumeric(input.dra.totalObligation) : '',
    // Block-paragraph tokens — applyTokensToBuffer swaps the ENTIRE containing
    // <w:p ...>{{TOKEN}}</w:p> paragraph (including attributes like paraId,
    // rsid, etc. that Word adds automatically) for the generated block XML.
    // A previous version required an exact-match on <w:p><w:r>...</w:p> with
    // no attributes, which silently failed on any template Word had touched.
    'BLOCK:{{GUARANTOR_SIGNATURE_BLOCKS}}':  buildGuarantorBlocks(input.guarantors, dt.full),
    'BLOCK:{{FRANCHISEE_SIGNATORY_BLOCKS}}': buildFranchiseeSignatoryBlocks(input.extraSignatories, dt.full),
  };
}

// ── Reusable token application ─────────────────────────────────

/** Sanitize a string for use in a filename (letters, digits, spaces → hyphens). */
export function safeFilenamePart(s: string): string {
  return s.replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '-');
}

/**
 * Merge Word runs that have fragmented a `{{TOKEN}}` boundary. Word will
 * split a run mid-token when editing history introduces an rPr change,
 * autocorrect tweak, comment anchor, or grammar-check marker in the
 * middle of the token — producing XML like:
 *   <w:t>{{EXEC_DATE_</w:t></w:r>
 *   <w:r ...><w:t>FULL}}</w:t>       (Pattern A: name chars split)
 * or:
 *   <w:t>Date: {{EXEC_DATE_FULL</w:t></w:r>
 *   <w:r ...><w:t>}}*</w:t>          (Pattern B: closing }} in next run)
 * or:
 *   <w:t>Date: {{</w:t></w:r>
 *   <w:r ...><w:t>EXEC_DATE_FULL}}</w:t>   (Pattern C: entire body in next run)
 *
 * The downstream inline-token pass is a plain string replace, so a
 * fragmented token can never match. This pass strips the intermediate
 * XML between the two runs, yielding a contiguous `{{TOKEN}}`.
 *
 * REQUIREMENTS on the pattern to avoid false-positive merges:
 *  - `{{` and `}}` must both be involved — no over-joining across
 *    unrelated content
 *  - The intermediate XML can't cross a `<w:t>` (would skip a valid
 *    token boundary), `<w:p>` / `</w:p>` (paragraph boundary), or
 *    a stray `}}` (token close somewhere unexpected)
 *  - Only merges TWO adjacent runs per iteration; 3+ way splits need
 *    the loop to converge
 */
function defragmentTokens(xml: string, knownTokenNames: string[]): string {
  // Pass A: strict two-way. Second run has the closing }}, so we know the
  // join is at a real token boundary and there's no risk of over-joining.
  //   Pattern A ({{TOKEN_ split)  : {{TOKEN_}</w:t>...<w:t>NAME}}
  //   Pattern B ({{ split alone)  : {{</w:t>...<w:t>TOKEN_NAME}}
  //   Pattern C ({{NAME_END split) : {{TOKEN_NAME</w:t>...<w:t>}}*
  const twoWayRe =
    /(\{\{[A-Z_0-9]*)<\/w:t>((?:(?!<w:t\b|<w:p\b|<\/w:p\b|\}\})[\s\S])*?)<w:t\b[^>]*>([A-Z_0-9]*\}\})/g;
  // Pass B: three-plus-way. Second run has more name chars but NO }} yet.
  // We only accept the join if the resulting joined name is still a valid
  // prefix of some known token — otherwise we risk grabbing an uppercase
  // word from unrelated content (e.g. joining {{FRANCHISEE_ with LLC).
  const nameOnlyRe =
    /(\{\{[A-Z_0-9]*)<\/w:t>((?:(?!<w:t\b|<w:p\b|<\/w:p\b|\}\})[\s\S])*?)<w:t\b[^>]*>([A-Z_0-9]+)(?!\}\})/g;
  const isValidJoin = (prefix: string, suffix: string): boolean => {
    const joinedName = (prefix + suffix).slice(2); // strip leading {{
    if (!joinedName) return false;
    return knownTokenNames.some(name => name.startsWith(joinedName));
  };

  let previous: string;
  do {
    previous = xml;
    xml = xml.replace(twoWayRe, '$1$3');
    xml = xml.replace(nameOnlyRe, (match, prefix, _middle, suffix) =>
      isValidJoin(prefix, suffix) ? prefix + suffix : match,
    );
  } while (xml !== previous);
  return xml;
}

/**
 * Apply the FA token map to an arbitrary docx buffer. Works for the primary
 * FA template AND for any standing-addendum template that shares the same
 * {{TOKEN}} conventions. Notice-address paraId targeting is FA-template-specific
 * so is only applied when `applyNoticesFill` is true (default true).
 */
export async function applyTokensToBuffer(
  buffer: ArrayBuffer,
  input: FaInputs,
  opts: { applyNoticesFill?: boolean } = {},
): Promise<Blob> {
  const tokens = buildTokens(input);
  const zip = await JSZip.loadAsync(buffer);
  const dec = new TextDecoder('utf-8');
  const enc = new TextEncoder();

  // Two flavors of token:
  //  - BLOCK:{{TOKEN}} — replace the entire <w:p ...>...{{TOKEN}}...</w:p>
  //    paragraph (including Word-added paraId/rsid attributes) with a block
  //    of XML (e.g. a full <w:tbl> of guarantor signature cells)
  //  - {{TOKEN}} — plain string substitution
  const blockTokens: Array<[string, string]> = [];
  const inlineTokens: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(tokens)) {
    if (k.startsWith('BLOCK:')) {
      const bareToken = k.slice('BLOCK:'.length);   // e.g. {{GUARANTOR_SIGNATURE_BLOCKS}}
      blockTokens.push([bareToken, v]);
    } else {
      inlineTokens.push([k, v]);
    }
  }

  // Escape a literal string for safe use inside a RegExp.
  const reEscape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Every token name (stripped of {{ }}) that the defragmenter should
  // accept as a valid join target. Includes BLOCK tokens too so their
  // fragmented occurrences (if any) get merged.
  const knownTokenNames = Object.keys(tokens).map(k =>
    (k.startsWith('BLOCK:') ? k.slice('BLOCK:'.length) : k).slice(2, -2),
  );

  for (const path of Object.keys(zip.files)) {
    if (!(path.endsWith('.xml') || path.endsWith('.rels'))) continue;
    const file = zip.files[path];
    if (file.dir) continue;
    const bytes = await file.async('uint8array');
    let content = dec.decode(bytes);
    let changed = false;
    // Word fragments {{TOKEN}} across multiple <w:r> runs as editing
    // history accumulates (e.g. an rPr change mid-token, autocorrect,
    // review pass). Plain content.includes() cannot find a token split
    // across runs, so we merge fragmented tokens back together first.
    // Verified against fa-template-v2.7.26.docx: many exhibit-page
    // tokens like {{FRANCHISEE_SIGNATORY_NAME}} exist ONLY in fragments.
    const defragmented = defragmentTokens(content, knownTokenNames);
    if (defragmented !== content) { content = defragmented; changed = true; }
    // BLOCK tokens next — swap the whole paragraph so the inline pass
    // never sees the token still wrapped in a stray <w:t>.
    //
    // The middle-content matcher uses a negative lookahead so it CAN'T
    // cross a </w:p> boundary. Without this guard, the regex greedily
    // consumes from the first <w:p ...> in the document all the way to
    // the token paragraph and replaces that whole span — wiping every
    // preceding page.
    for (const [bareToken, blockXml] of blockTokens) {
      // <w:p ...> [chars, no </w:p>] TOKEN [chars, no </w:p>] </w:p>
      const paraRegex = new RegExp(
        `<w:p\\b[^>]*>(?:(?!</w:p>)[\\s\\S])*?${reEscape(bareToken)}(?:(?!</w:p>)[\\s\\S])*?</w:p>`,
        'g',
      );
      const newContent = content.replace(paraRegex, blockXml);
      if (newContent !== content) { content = newContent; changed = true; }
    }
    for (const [token, value] of inlineTokens) {
      if (content.includes(token)) { content = content.split(token).join(value); changed = true; }
    }
    if ((opts.applyNoticesFill ?? true) && path === 'word/document.xml') {
      const lines = [input.noticeLine1, input.noticeLine2, input.noticeLine3];
      if (lines.some(l => l && l.trim())) {
        const filled = fillNoticesAddress(content, lines);
        if (filled !== content) { content = filled; changed = true; }
      }
    }
    if (changed) zip.file(path, enc.encode(content));
  }

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

// ── Public generator ───────────────────────────────────────────

/** Fetches the FA template, fills tokens, returns { blob, filename } for download. */
export async function generateFa(input: FaInputs): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch('/templates/fa-template-v2.7.26.docx');
  if (!res.ok) throw new Error(`Template fetch failed: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();

  const blob = await applyTokensToBuffer(arrayBuffer, input);
  const filename = `${safeFilenamePart(input.shopName)}-${safeFilenamePart(input.entity)}-Franchise-Agreement.docx`;
  return { blob, filename };
}

// ── Execution package (FA + standing addendums) ────────────────

export interface AddendumTemplate {
  name:            string;   // e.g. "Seeded Capital FA Addendum"
  templateUrl:     string;   // full URL to the .docx (usually via /files/proxy)
  templateFilename: string;  // e.g. "seeded-capital-fa-addendum.docx"
}

/**
 * Build a single .zip containing the FA plus every addendum whose template
 * we can fetch and token-fill. Addendums are shipped as separate files so
 * you can drag each one into DocuSign independently.
 */
export async function generateExecutionPackage(
  input:     FaInputs,
  addendums: AddendumTemplate[],
): Promise<{
  blob:      Blob;
  filename:  string;
  entries:   Array<{ name: string; filename: string; ok: boolean; error?: string }>;
  /** Individual filled documents in the order they were added to the zip — safe to hand to DocuSign one-by-one. */
  documents: Array<{ name: string; filename: string; blob: Blob }>;
}> {
  const bundle = new JSZip();
  const entries: Array<{ name: string; filename: string; ok: boolean; error?: string }> = [];
  const documents: Array<{ name: string; filename: string; blob: Blob }> = [];

  // 1) The FA itself
  const fa = await generateFa(input);
  bundle.file(fa.filename, fa.blob);
  entries.push({ name: 'Franchise Agreement', filename: fa.filename, ok: true });
  documents.push({ name: 'Franchise Agreement', filename: fa.filename, blob: fa.blob });

  // 2) Each standing addendum with a template
  for (const a of addendums) {
    try {
      const res = await fetch(a.templateUrl, { credentials: 'include' });
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const buf = await res.arrayBuffer();
      // Addendums use only FA tokens; skip FA-specific notices paraId fill.
      const filled = await applyTokensToBuffer(buf, input, { applyNoticesFill: false });
      const cleanName = safeFilenamePart(a.name);
      const outName = `${safeFilenamePart(input.shopName)}-${cleanName}.docx`;
      bundle.file(outName, filled);
      entries.push({ name: a.name, filename: outName, ok: true });
      documents.push({ name: a.name, filename: outName, blob: filled });
    } catch (e) {
      entries.push({
        name: a.name,
        filename: a.templateFilename,
        ok: false,
        error: e instanceof Error ? e.message : 'Unknown error',
      });
    }
  }

  const zipName = `${safeFilenamePart(input.shopName)}-${safeFilenamePart(input.entity)}-Execution-Package.zip`;
  const blob = await bundle.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  return { blob, filename: zipName, entries, documents };
}

// ── Minimal test docs (for DocuSign layout iteration) ──────────

/**
 * Build a tiny standalone .docx containing ONLY the Exhibit B-1 guarantor
 * signature table. Used by the /guarantor-test page so we can iterate on
 * signature-block layout via DocuSign without regenerating the full FA
 * each time. The doc uses the same buildGuarantorBlocks() the real FA
 * generator uses, so any spacing / anchor tweak takes effect here too.
 */
export async function generateGuarantorTestDoc(
  guarantors:    FaGuarantor[],
  execDateISO:   string,
): Promise<{ blob: Blob; filename: string }> {
  const dt = formatDateFull(execDateISO);
  const guarantorTable = buildGuarantorBlocks(guarantors, dt.full);

  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:body>` +
        `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>` +
          `<w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr>` +
            `<w:t>Exhibit B-1 — Layout Test</w:t></w:r></w:p>` +
        `<w:p/>` +
        `<w:p><w:r><w:t xml:space="preserve">` +
          `IN WITNESS WHEREOF, each of the undersigned has affixed his or her signature ` +
          `on the same day and year as the Agreement was executed.` +
          `</w:t></w:r></w:p>` +
        `<w:p/>` +
        guarantorTable +
        `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>` +
      `</w:body>` +
    `</w:document>`;

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `</Types>`;

  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.file('_rels/.rels', rootRels);
  zip.file('word/document.xml', documentXml);

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  return { blob, filename: 'guarantor-layout-test.docx' };
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
