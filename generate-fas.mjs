/**
 * Batch FA generator — Node port of portal/src/lib/faTemplate.ts.
 * Reads portal/public/templates/fa-template-v2.7.26.docx, applies token replacement
 * for each SHOP in the SHOPS array below, writes 6 .docx files to
 * generated-fas/2026-07-04/.
 *
 * Run:  node generate-fas.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from './portal/node_modules/jszip/dist/jszip.min.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(__dirname, 'portal', 'public', 'templates', 'fa-template-v2.7.26.docx');
const OUT_DIR       = path.join(__dirname, 'generated-fas', '2026-07-04');

// ── 6 shops needing FAs generated ──
const EXEC_DATE = '2026-07-04';
const PUB_SIG = { name: 'Taylor Bennett', title: 'General Counsel' };

// Ownership + Operating Principal groups reused across multiple shops.
// Sourced from prior executed FAs (see file comments below).

// BBP family — Ardmore mirrors Georgetown per user 2026-07-04.
// From BBP G 5, LLC (Georgetown) Franchise Agreement Exhibit C.
// Guarantors mirror Georgetown B-1: Brian Harrington + Kevin Kelly.
const BBP_GROUP = {
  owners:    [{ name: 'BBP Operations, LLC', pct: '100' }],
  opName:    'Brian Harrington',
  opAddr1:   '514 Wyndmoor Avenue',
  opAddr2:   'Wyndmoor, PA 19038',
  opTel:     '215-901-9941',
  opEmail:   'bcharrington13@gmail.com',
  director2Name:  'Kevin Kelly',
  director2Title: 'Manager',
  signatoryName:  'Brian Harrington',
  signatoryTitle: 'Manager',
  noticeLine1: '514 Wyndmoor Avenue',
  noticeLine2: 'Wyndmoor, PA 19038',
  noticeLine3: 'Attn: Brian Harrington',
  guarantors: [
    { name: 'Brian Harrington', pct: '' },
    { name: 'Kevin Kelly',      pct: '' },
  ],
};

// MPZ POP, LLC — from Shop 2051 Carrollwood Franchise Agreement Exhibit C.
// Guarantor mirrors Carrollwood/Tampa (Kennedy) pattern per user 2026-07-04:
// Kalyan Gullapalli as Operating Principal.
const MPZ_POP_GROUP = {
  owners: [
    { name: 'Boitsfort, LLC',                pct: '50' },
    { name: 'Simple Ventures Holdings, LLC', pct: '33' },
    { name: 'Anil Atluri',                   pct: '17' },
  ],
  opName:    'Kalyan Gullapalli',
  opAddr1:   '12817 N Dale Mabry',
  opAddr2:   'Tampa, FL 33618',
  opTel:     '260-460-7290',
  opEmail:   'kal@mpzholdings.com',
  director2Name:  '',   // no second manager in Carrollwood FA Exhibit C
  director2Title: '',
  signatoryName:  'Kalyan Gullapalli',
  signatoryTitle: 'Manager',
  formationDate:  '2025-01-15',
  noticeLine1: '12817 N Dale Mabry',
  noticeLine2: 'Tampa, FL 33618',
  noticeLine3: 'Attn: Kalyan Gullapalli',
  guarantors: [
    { name: 'Kalyan Gullapalli', pct: '' },
  ],
};

const SHOPS = [
  {
    // Ardmore — BBP SS 4, LLC (Pennsylvania LLC). Ownership/OP mirrored from
    // BBP G 5, LLC (Georgetown) per user instruction 2026-07-04.
    label:      'Ardmore-Suburban-Square',
    entity:     'BBP SS 4, LLC',
    state:      'Pennsylvania',
    entityType: 'limited liability company',
    shopName:   'Ardmore (Suburban Square)',
    shopNumber: '2004',
    addr1:      '10 COULTER AVE',
    addr2:      'ARDMORE, PA 19003',
    formationDate: '2025-06-10',
    ...BBP_GROUP,
  },
  {
    // Charleston — Palmedough, LLC (South Carolina LLC).
    // Membership + formation date provided by user 2026-07-04.
    // Signatory Braxton DeCamp = Richard Braxton DeCamp per member list.
    label:      'Charleston',
    entity:     'Palmedough, LLC',
    state:      'South Carolina',
    entityType: 'limited liability company',
    shopName:   'Charleston',
    shopNumber: '2203',
    addr1:      '83 MARY ST',
    addr2:      'CHARLESTON, SC 29403',
    signatoryName:  'Braxton DeCamp',
    signatoryTitle: 'Manager',
    formationDate:  '2025-02-06',
    owners: [
      { name: 'James A. Cornish',        pct: '33.33' },
      { name: 'Richard Braxton DeCamp',  pct: '33.33' },
      { name: 'Kimberly K. DeCamp',      pct: '33.33' },
    ],
    opName:    'Braxton DeCamp',
    opAddr1:   '734 Waites Dr.',
    opAddr2:   'Charleston, SC 29412',
    opTel:     '859-420-2052',
    opEmail:   'braxtondecamp@gmail.com',
    noticeLine1: '734 Waites Dr.',
    noticeLine2: 'Charleston, SC 29412',
    noticeLine3: 'Attn: Braxton DeCamp',
    guarantors: [
      { name: 'James A. Cornish',       pct: '33.33' },
      { name: 'Richard Braxton DeCamp', pct: '33.33' },
      { name: 'Kimberly K. DeCamp',     pct: '33.33' },
    ],
  },
  {
    // University Park (Town & Country) — LONE STAR BAGELS TOWN & COUNTRY LLC
    // (Texas LLC). Formation + ownership + OP + notice address provided by
    // user 2026-07-04. 100% owned by Lone Star Bagels LLC.
    label:      'University-Park-Town-and-Country',
    entity:     'LONE STAR BAGELS TOWN & COUNTRY LLC',
    state:      'Texas',
    entityType: 'limited liability company',
    shopName:   'University Park (Town & Country)',
    shopNumber: '2233',
    addr1:      '700 TOWN AND COUNTRY BOULEVARD, SUITE 2640',
    addr2:      'HOUSTON, TX 77024',
    signatoryName:  'Don Meij',
    signatoryTitle: 'Manager',
    formationDate:  '2026-01-28',
    owners: [
      { name: 'Lone Star Bagels LLC', pct: '100' },
    ],
    opName:    'Don Meij',
    opAddr1:   '2911 Turtle Creek Boulevard, Suite 300, Office 21',
    opAddr2:   'Dallas, TX 75219',
    opTel:     '945-248-6934',
    opEmail:   'don@meijorleague.com.au',
    noticeLine1: '2911 Turtle Creek Boulevard, Suite 300, Office 21',
    noticeLine2: 'Dallas, TX 75219',
    noticeLine3: 'Attn: Don Meij',
    guarantors: [
      { name: 'Lone Star Bagels LLC', pct: '100' },
    ],
  },
  {
    // Viera — MPZ POP, LLC (Florida LLC). Ownership + OP from Carrollwood FA.
    label:      'Viera',
    entity:     'MPZ POP, LLC',
    state:      'Florida',
    entityType: 'limited liability company',
    shopName:   'Viera',
    shopNumber: '2056',
    addr1:      '2105 VIERA BLVD STE 106',
    addr2:      'ROCKLEDGE, FL 32955',
    ...MPZ_POP_GROUP,
  },
  {
    // Westhampton — GSP Bagels, LLC. Per user 2026-07-04 final instruction:
    // Delaware LLC, registered to do business in New York. entityType carries
    // the foreign-registration language so the Recitals produce:
    //   "GSP Bagels, LLC, a Delaware limited liability company, registered
    //    to do business in New York".
    // Ownership chain (per user's image): GSP Bagels LLC is 100% owned by
    // GSP Snacks Corp., which is 100% owned by GSP Snacks Holdings, LLC.
    // Individual owners of GSP Snacks Holdings intentionally omitted.
    // Guarantor: Kevin Bush per user 2026-07-04.
    label:      'Westhampton',
    entity:     'GSP Bagels, LLC',
    state:      'Delaware',
    entityType: 'limited liability company, registered to do business in New York',
    shopName:   'Westhampton',
    shopNumber: '2153',
    addr1:      '130 MAIN STREET',
    addr2:      'WESTHAMPTON, NY 11978',
    signatoryName:  'Kevin Bush',
    signatoryTitle: 'Manager',
    formationDate:  '2025-05-28',
    owners: [
      { name: 'GSP Bagels, LLC',                                                       pct: '100% (Direct Owner)' },
      { name: 'GSP Snacks Corp.',                                                      pct: '100% Owner of GSP Bagels, LLC' },
      { name: 'GSP Snacks Holdings, LLC',                                              pct: '100% Owner of GSP Snacks Corp.' },
      { name: 'Individual Owners of GSP Snacks Holdings, LLC Intentionally Omitted',   pct: '' },
    ],
    opName:    'Kevin Bush',
    opAddr1:   '600 Ponce De Leon Blvd, FL 10',
    opAddr2:   'Coral Gables, FL 33134',
    opTel:     '303-916-5676',
    opEmail:   'kbush@freshdiningconcepts.com',
    noticeLine1: '600 Ponce De Leon Blvd, FL 10',
    noticeLine2: 'Coral Gables, FL 33134',
    noticeLine3: 'Attn: Kevin Bush',
    guarantors: [
      { name: 'Kevin Bush', pct: '' },
    ],
  },
  {
    // Winter Park (S Orlando) — MPZ POP, LLC. Same ownership group as Viera.
    label:      'Winter-Park-S-Orlando',
    entity:     'MPZ POP, LLC',
    state:      'Florida',
    entityType: 'limited liability company',
    shopName:   'Winter Park (S Orlando)',
    shopNumber: '2053',
    addr1:      '646 SOUTH ORLANDO AVENUE',
    addr2:      'WINTER PARK, FL 32789',
    ...MPZ_POP_GROUP,
  },
];

// ── Helpers ported verbatim from portal/src/lib/faTemplate.ts ──

function formatDateFull(iso) {
  if (!iso) return { full: '', day: '', month: '', year: '' };
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const ordinal = (n) => {
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

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtPct(raw) {
  const v = String(raw ?? '').trim();
  if (!v) return '';
  // If the value already contains a % (e.g. "100% (Direct Owner)"), leave alone.
  if (v.includes('%')) return v;
  return v + '%';
}

// Port of buildGuarantorBlocks from portal/src/lib/faTemplate.ts.
// Builds a borderless 2-column table with one cell per guarantor.
function buildGuarantorBlocks(guarantors, execDateFull) {
  const list = guarantors.length ? guarantors : [{ name: '[Guarantor Name]', pct: '' }];
  const noBorder =
    '<w:tcBorders>' +
      '<w:top w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
      '<w:left w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
      '<w:bottom w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
      '<w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
    '</w:tcBorders>';
  const cell = (g) => {
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
  const rows = [];
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

function buildTokens(input) {
  const dt = formatDateFull(input.execDate);
  const addrInline = `${input.addr1} ${input.addr2}`;
  const footerId = `${input.entity} (${input.shopName})`;
  // Pad owners to 5 slots so all OWNER_N tokens get replaced.
  const owners = [...(input.owners ?? [])];
  while (owners.length < 5) owners.push({ name: '', pct: '' });
  const ownerName = (i, fallback) => owners[i].name || fallback;
  const ownerPct  = (i) => fmtPct(owners[i].pct) || '[%]';

  return {
    '{{FRANCHISEE_ENTITY}}':          input.entity,
    '{{FRANCHISEE_STATE}}':           input.state,
    '{{ENTITY_TYPE}}':                input.entityType,
    '{{SHOP_NUMBER}}':                input.shopNumber,
    '{{SHOP_ADDRESS_LINE1}}':         input.addr1,
    '{{SHOP_ADDRESS_LINE2}}':         input.addr2,
    '{{SHOP_ADDRESS_INLINE}}':        addrInline,
    '{{EXEC_DATE_FULL}}':             dt.full,
    '{{EXEC_DATE_DAY}}':              dt.day,
    '{{EXEC_DATE_MONTH}}':            dt.month,
    '{{EXEC_DATE_YEAR}}':             dt.year,
    '{{FRANCHISEE_SIGNATORY_NAME}}':  input.signatoryName,
    '{{FRANCHISEE_SIGNATORY_TITLE}}': input.signatoryTitle,
    '{{FORMATION_DATE}}':             input.formationDate ?? '[Formation Date — VERIFY]',
    '{{OP_NAME}}':                    input.opName ?? input.signatoryName,
    '{{OP_ADDRESS_LINE1}}':           input.opAddr1 ?? '[Operating Principal Address Line 1]',
    '{{OP_ADDRESS_LINE2}}':           input.opAddr2 ?? '[Operating Principal Address Line 2]',
    '{{OP_TEL}}':                     input.opTel   ?? '[Operating Principal Phone]',
    '{{OP_EMAIL}}':                   input.opEmail ?? '[Operating Principal Email]',
    '{{DIRECTOR_2_NAME}}':            input.director2Name  || input.opName || input.signatoryName || '[Director 2 Name]',
    '{{DIRECTOR_2_TITLE}}':           input.director2Title || 'Manager',
    '{{OWNER_1_NAME}}':               ownerName(0, input.signatoryName ?? '[Owner 1]'),
    '{{OWNER_1_INTEREST}}':           ownerPct(0),
    '{{OWNER_2_NAME}}':               ownerName(1, '[Owner 2]'),
    '{{OWNER_2_INTEREST}}':           ownerPct(1),
    '{{OWNER_3_NAME}}':               ownerName(2, '[Owner 3]'),
    '{{OWNER_3_INTEREST}}':           ownerPct(2),
    '{{OWNER_4_NAME}}':               ownerName(3, '[Owner 4]'),
    '{{OWNER_4_INTEREST}}':           ownerPct(3),
    '{{OWNER_5_NAME}}':               ownerName(4, '[Owner 5]'),
    '{{OWNER_5_INTEREST}}':           ownerPct(4),
    '{{FOOTER_ID}}':                  footerId,
    '<w:p><w:r><w:t>{{GUARANTOR_SIGNATURE_BLOCKS}}</w:t></w:r></w:p>':  buildGuarantorBlocks(input.guarantors ?? [], dt.full),
    '<w:p><w:r><w:t>{{FRANCHISEE_SIGNATORY_BLOCKS}}</w:t></w:r></w:p>': '',
  };
}

// Section 25 Notices address — paraId-targeted replacement (ported from portal/src/lib/faTemplate.ts).
function fillNoticesAddress(xml, lines) {
  const paraIds = ['20ACC4D7', '1F082D38', '17BB9144'];
  const UNDERSCORES = '_____________________________';
  let out = xml;
  paraIds.forEach((paraId, i) => {
    const v = (lines[i] ?? '').trim();
    if (!v) return;
    const re = new RegExp(
      `(<w:p w14:paraId="${paraId}"[^>]*>[\\s\\S]*?<w:t[^>]*>)${UNDERSCORES}(<\\/w:t>[\\s\\S]*?<\\/w:p>)`,
    );
    out = out.replace(re, `$1${esc(v)}$2`);
  });
  return out;
}

async function generateOne(input, templateBuffer) {
  const tokens = buildTokens(input);
  const zip = await JSZip.loadAsync(templateBuffer);
  const dec = new TextDecoder('utf-8');
  const enc = new TextEncoder();

  const blockTokens  = [];
  const inlineTokens = [];
  for (const [k, v] of Object.entries(tokens)) {
    if (k.startsWith('<w:p>')) blockTokens.push([k, v]);
    else inlineTokens.push([k, v]);
  }

  for (const filePath of Object.keys(zip.files)) {
    if (!(filePath.endsWith('.xml') || filePath.endsWith('.rels'))) continue;
    const file = zip.files[filePath];
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
    // Section 25 Notices address paraId-targeted fill (document.xml only)
    if (filePath === 'word/document.xml') {
      const lines = [input.noticeLine1 ?? '', input.noticeLine2 ?? '', input.noticeLine3 ?? ''];
      if (lines.some(l => l && l.trim())) {
        const filled = fillNoticesAddress(content, lines);
        if (filled !== content) { content = filled; changed = true; }
      }
    }
    if (changed) zip.file(filePath, enc.encode(content));
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// ── Main ──

const templateBuffer = fs.readFileSync(TEMPLATE_PATH);
console.log(`Loaded template: ${TEMPLATE_PATH} (${templateBuffer.length} bytes)`);
fs.mkdirSync(OUT_DIR, { recursive: true });

for (const shop of SHOPS) {
  const input = { ...shop, execDate: EXEC_DATE };
  const buffer = await generateOne(input, templateBuffer);
  const filename = `${shop.label}-Franchise-Agreement-${EXEC_DATE}.docx`;
  const outPath = path.join(OUT_DIR, filename);
  fs.writeFileSync(outPath, buffer);
  console.log(`✓ ${filename} (${buffer.length} bytes)`);
}

console.log(`\nAll 6 FAs written to ${OUT_DIR}`);
