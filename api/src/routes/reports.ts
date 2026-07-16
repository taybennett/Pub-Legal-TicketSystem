import { Router, type Request, type Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

import { config } from '../config.js';
import { requireAdmin, requireAuth } from '../auth/middleware.js';
import { loadReportBundle, type ReportBundle, type ShopRow } from '../lib/reportsData.js';
import { logger } from '../util/logger.js';
import { BadRequestError, NotFoundError } from '../util/errors.js';

export const reportsRouter = Router();
reportsRouter.use(requireAuth, requireAdmin);

/* ────────── shared shapes ────────── */

export interface ReportColumn {
  key:   string;
  label: string;
  /** hint for the frontend on how to right-align / format */
  align?: 'left' | 'right';
  type?:  'string' | 'number' | 'currency' | 'date' | 'boolean';
}

export interface ReportResult {
  slug:        string;
  title:       string;
  description: string;
  columns:     ReportColumn[];
  rows:        Array<Record<string, unknown>>;
  generatedAt: string;
}

interface ReportTemplate {
  slug:        string;
  title:       string;
  description: string;
  run:         (bundle: ReportBundle) => Omit<ReportResult, 'generatedAt'>;
}

/* ────────── report catalog ────────── */

const REPORTS: ReportTemplate[] = [
  {
    slug:        'rent-roll',
    title:       'Rent Roll',
    description: 'Every currently-open shop with monthly and annual rent, landlord, execution date, and term end.',
    run: bundle => {
      const rows = bundle.shops
        .filter(s => s.isOpen)
        .sort((a, b) => a.shopName.localeCompare(b.shopName))
        .map(s => ({
          shopName:      s.shopName,
          shopId:        s.shopId,
          landlord:      s.landlord,
          monthlyRent:   s.monthlyRent,
          annualRent:    s.annualRent,
          leaseExecDate: s.leaseExecDate,
          leaseTermEnd:  s.leaseTermEnd,
        }));
      return {
        slug: 'rent-roll',
        title: 'Rent Roll',
        description: 'Every currently-open shop with monthly and annual rent, landlord, execution date, and term end.',
        columns: [
          { key: 'shopName',      label: 'Shop' },
          { key: 'shopId',        label: 'Shop #' },
          { key: 'landlord',      label: 'Landlord' },
          { key: 'monthlyRent',   label: 'Monthly Rent',  type: 'currency', align: 'right' },
          { key: 'annualRent',    label: 'Annual Rent',   type: 'currency', align: 'right' },
          { key: 'leaseExecDate', label: 'Executed',      type: 'date' },
          { key: 'leaseTermEnd',  label: 'Term End',      type: 'date' },
        ],
        rows,
      };
    },
  },

  {
    slug:        'cost-per-sqft',
    title:       'Cost per Sq Ft',
    description: 'Open shops with square footage, annual rent, and computed cost per usable sq ft.',
    run: bundle => {
      const rows = bundle.shops
        .filter(s => s.isOpen)
        .sort((a, b) => (b.costPerSqFt ?? 0) - (a.costPerSqFt ?? 0))
        .map(s => ({
          shopName:    s.shopName,
          shopId:      s.shopId,
          city:        s.city,
          state:       s.state,
          squareFeet:  s.squareFeet,
          annualRent:  s.annualRent,
          costPerSqFt: s.costPerSqFt,
        }));
      return {
        slug: 'cost-per-sqft',
        title: 'Cost per Sq Ft',
        description: 'Open shops with square footage, annual rent, and computed cost per usable sq ft. Sorted highest-to-lowest.',
        columns: [
          { key: 'shopName',    label: 'Shop' },
          { key: 'shopId',      label: 'Shop #' },
          { key: 'city',        label: 'City' },
          { key: 'state',       label: 'State' },
          { key: 'squareFeet',  label: 'Sq Ft',      type: 'number',   align: 'right' },
          { key: 'annualRent',  label: 'Annual Rent', type: 'currency', align: 'right' },
          { key: 'costPerSqFt', label: '$/Sq Ft',     type: 'currency', align: 'right' },
        ],
        rows,
      };
    },
  },

  {
    slug:        'lease-expirations',
    title:       'Lease Expiration Timeline',
    description: 'All shops with lease expirations, sorted soonest first. Bucketed by <12mo / 12-24mo / 24-36mo / >36mo.',
    run: bundle => {
      const today = new Date();
      const rows = bundle.shops
        .filter(s => s.leaseTermEnd)
        .map(s => {
          const end = new Date(s.leaseTermEnd!);
          const monthsRemaining = Math.max(0, Math.round((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
          let bucket: string;
          if (monthsRemaining < 12)      bucket = '< 12 months';
          else if (monthsRemaining < 24) bucket = '12-24 months';
          else if (monthsRemaining < 36) bucket = '24-36 months';
          else                           bucket = '> 36 months';
          return {
            shopName:        s.shopName,
            shopId:          s.shopId,
            landlord:        s.landlord,
            leaseTermEnd:    s.leaseTermEnd,
            monthsRemaining,
            bucket,
          };
        })
        .sort((a, b) => (a.leaseTermEnd ?? '').localeCompare(b.leaseTermEnd ?? ''));
      return {
        slug: 'lease-expirations',
        title: 'Lease Expiration Timeline',
        description: 'All shops with lease expirations, sorted soonest first.',
        columns: [
          { key: 'shopName',        label: 'Shop' },
          { key: 'shopId',          label: 'Shop #' },
          { key: 'landlord',        label: 'Landlord' },
          { key: 'leaseTermEnd',    label: 'Term End',           type: 'date' },
          { key: 'monthsRemaining', label: 'Months Remaining',   type: 'number', align: 'right' },
          { key: 'bucket',          label: 'Bucket' },
        ],
        rows,
      };
    },
  },

  {
    slug:        'dra-progress',
    title:       'DRA Progress',
    description: 'Every DRA with total obligation, executed FAs, currently open shops, outstanding, on-track status, and per-year opening schedule.',
    run: bundle => {
      // Only surface year columns that have at least one non-zero value across
      // any DRA — keeps the report tight instead of showing empty 2033/34/35
      // columns for every reader.
      const ALL_YEARS = [2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035];
      const yearsWithData = ALL_YEARS.filter(y =>
        bundle.dras.some(d => (d.yearSchedule?.[String(y)] ?? 0) > 0),
      );

      const rows = bundle.dras
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(d => {
          const row: Record<string, unknown> = {
            name:            d.name,
            totalObligation: d.totalObligation,
            executed:        d.executed,
            open:            d.open,
            outstanding:     d.outstanding,
            termEnd:         d.termEnd,
            onSchedule:      d.onSchedule ? 'On track' : 'Behind',
          };
          for (const y of yearsWithData) {
            row[`y${y}`] = d.yearSchedule?.[String(y)] ?? 0;
          }
          return row;
        });

      // Totals row across the entire portfolio — a scan-friendly "how many
      // shops do we owe in 2027 total" answer without doing mental math.
      const totalsRow: Record<string, unknown> = {
        name:            'ALL DRAs (total)',
        totalObligation: rows.reduce((s, r) => s + (r.totalObligation as number), 0),
        executed:        rows.reduce((s, r) => s + (r.executed        as number), 0),
        open:            rows.reduce((s, r) => s + (r.open            as number), 0),
        outstanding:     rows.reduce((s, r) => s + (r.outstanding     as number), 0),
        termEnd:         null,
        onSchedule:      '',
      };
      for (const y of yearsWithData) {
        totalsRow[`y${y}`] = rows.reduce((s, r) => s + ((r[`y${y}`] as number) ?? 0), 0);
      }

      return {
        slug: 'dra-progress',
        title: 'DRA Progress',
        description: 'Every DRA with total obligation, executed FAs, currently open shops, outstanding count, and per-year opening schedule.',
        columns: [
          { key: 'name',            label: 'DRA' },
          { key: 'totalObligation', label: 'Total',       type: 'number', align: 'right' },
          { key: 'executed',        label: 'Executed',    type: 'number', align: 'right' },
          { key: 'open',            label: 'Open',        type: 'number', align: 'right' },
          { key: 'outstanding',     label: 'Outstanding', type: 'number', align: 'right' },
          ...yearsWithData.map(y => ({
            key:   `y${y}`,
            label: String(y),
            type:  'number' as const,
            align: 'right' as const,
          })),
          { key: 'termEnd',         label: 'Term End',    type: 'date' },
          { key: 'onSchedule',      label: 'Schedule' },
        ],
        rows: [...rows, totalsRow],
      };
    },
  },

  {
    slug:        'fa-roster',
    title:       'FA Roster',
    description: 'Every Franchise Agreement with shop, entity, signatory, execution date, and term end.',
    run: bundle => {
      const rows = bundle.shops
        .filter(s => s.faId)
        .sort((a, b) => (b.faExecDate ?? '').localeCompare(a.faExecDate ?? ''))
        .map(s => ({
          shopName:     s.shopName,
          shopId:       s.shopId,
          entityName:   s.faEntityName ?? s.entityName,
          signatory:    s.faSignatory,
          faExecDate:   s.faExecDate,
          faTermEnd:    s.faTermEnd,
          faTermYears:  s.faTermYears,
        }));
      return {
        slug: 'fa-roster',
        title: 'FA Roster',
        description: 'Every executed Franchise Agreement, sorted by execution date (most recent first).',
        columns: [
          { key: 'shopName',    label: 'Shop' },
          { key: 'shopId',      label: 'Shop #' },
          { key: 'entityName',  label: 'Franchisee Entity' },
          { key: 'signatory',   label: 'Signatory' },
          { key: 'faExecDate',  label: 'Executed', type: 'date' },
          { key: 'faTermEnd',   label: 'Term End', type: 'date' },
          { key: 'faTermYears', label: 'Term Years', type: 'number', align: 'right' },
        ],
        rows,
      };
    },
  },

  {
    slug:        'compliance-gaps',
    title:       'Compliance Gaps',
    description: 'Every open shop with a list of what\'s missing — lease record, PDF, exec date; FA record, PDF, exec date.',
    run: bundle => {
      const rows = bundle.shops
        .filter(s => s.isOpen)
        .map(s => {
          const gaps: string[] = [];
          if (!s.leaseId)        gaps.push('No lease record');
          if (s.leaseId && !s.leasePdf)      gaps.push('No lease PDF');
          if (s.leaseId && !s.leaseExecDate) gaps.push('No lease exec date');
          if (!s.isPubCorp) {
            if (!s.faId)                  gaps.push('No FA record');
            if (s.faId && !s.faPdf)       gaps.push('No FA PDF');
            if (s.faId && !s.faExecDate)  gaps.push('No FA exec date');
          }
          return {
            shopName:  s.shopName,
            shopId:    s.shopId,
            isPubCorp: s.isPubCorp ? 'PUB Corp' : 'Franchise',
            gapCount:  gaps.length,
            gaps:      gaps.join('; ') || '—',
          };
        })
        .filter(r => r.gapCount > 0)
        .sort((a, b) => b.gapCount - a.gapCount || a.shopName.localeCompare(b.shopName));
      return {
        slug: 'compliance-gaps',
        title: 'Compliance Gaps',
        description: 'Every open shop with a list of missing compliance items.',
        columns: [
          { key: 'shopName',  label: 'Shop' },
          { key: 'shopId',    label: 'Shop #' },
          { key: 'isPubCorp', label: 'Type' },
          { key: 'gapCount',  label: 'Gaps', type: 'number', align: 'right' },
          { key: 'gaps',      label: 'What\'s Missing' },
        ],
        rows,
      };
    },
  },

  {
    slug:        'shop-directory',
    title:       'Shop Directory',
    description: 'Every location on file — name, shop number, address, city, state, lifecycle stage, corp/franchise, entity.',
    run: bundle => {
      const rows = bundle.shops
        .sort((a, b) => a.shopName.localeCompare(b.shopName))
        .map(s => ({
          shopName:       s.shopName,
          shopId:         s.shopId,
          address:        s.address,
          city:           s.city,
          state:          s.state,
          lifecycleStage: s.lifecycleStage,
          type:           s.isPubCorp ? 'PUB Corp' : 'Franchise',
          entityName:     s.entityName,
        }));
      return {
        slug: 'shop-directory',
        title: 'Shop Directory',
        description: 'Every location on file across all lifecycle stages.',
        columns: [
          { key: 'shopName',       label: 'Shop' },
          { key: 'shopId',         label: 'Shop #' },
          { key: 'address',        label: 'Address' },
          { key: 'city',           label: 'City' },
          { key: 'state',          label: 'State' },
          { key: 'lifecycleStage', label: 'Lifecycle Stage' },
          { key: 'type',           label: 'Type' },
          { key: 'entityName',     label: 'Entity' },
        ],
        rows,
      };
    },
  },

  {
    slug:        'franchisee-portfolio',
    title:       'Franchisee Portfolio',
    description: 'Grouped by DRA / Franchisee Group — every shop under each group, with lease + FA status per row.',
    run: bundle => {
      const rows = bundle.shops
        .filter(s => !s.isPubCorp)
        .sort((a, b) =>
          (a.franchiseeGroup ?? 'zz').localeCompare(b.franchiseeGroup ?? 'zz') ||
          a.shopName.localeCompare(b.shopName))
        .map(s => ({
          franchiseeGroup: s.franchiseeGroup,
          entityName:      s.entityName,
          shopName:        s.shopName,
          shopId:          s.shopId,
          leaseExecDate:   s.leaseExecDate,
          leasePdf:        s.leasePdf ? '✓' : '—',
          faExecDate:      s.faExecDate,
          faPdf:           s.faPdf ? '✓' : '—',
        }));
      return {
        slug: 'franchisee-portfolio',
        title: 'Franchisee Portfolio',
        description: 'Every franchise-side shop grouped by DRA, with lease and FA status per row.',
        columns: [
          { key: 'franchiseeGroup', label: 'DRA / Group' },
          { key: 'entityName',      label: 'Entity' },
          { key: 'shopName',        label: 'Shop' },
          { key: 'shopId',          label: 'Shop #' },
          { key: 'leaseExecDate',   label: 'Lease Exec', type: 'date' },
          { key: 'leasePdf',        label: 'Lease PDF' },
          { key: 'faExecDate',      label: 'FA Exec', type: 'date' },
          { key: 'faPdf',           label: 'FA PDF' },
        ],
        rows,
      };
    },
  },
];

/* ────────── routes ────────── */

// List available templates
reportsRouter.get('/', (_req: Request, res: Response) => {
  res.json({
    reports: REPORTS.map(r => ({ slug: r.slug, title: r.title, description: r.description })),
  });
});

// Run a template
reportsRouter.get('/template/:slug', async (req: Request, res: Response) => {
  const { slug } = req.params;
  const template = REPORTS.find(r => r.slug === slug);
  if (!template) throw new NotFoundError('Unknown report');
  const bundle = await loadReportBundle();
  const result = template.run(bundle);
  res.json({ ...result, generatedAt: bundle.generatedAt } as ReportResult);
});

/* ────────── NL query (Claude-backed) ────────── */

const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

const nlqSchema = z.object({
  query: z.string().min(3).max(500),
});

reportsRouter.post('/nlq', async (req: Request, res: Response) => {
  const parsed = nlqSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError('Missing or invalid query');

  const bundle = await loadReportBundle();
  const compactShops = bundle.shops.map(compactShopForClaude);
  const compactDras = bundle.dras;

  const systemPrompt = buildSystemPrompt();
  const userMessage = buildUserMessage(parsed.data.query, compactShops, compactDras);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      tools: [nlqReportTool],
      tool_choice: { type: 'tool', name: 'return_report' },
    });

    // Find the tool_use block
    const toolUse = response.content.find(c => c.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      throw new Error('Claude did not return a tool_use block');
    }
    const output = toolUse.input as { title: string; columns: ReportColumn[]; rows: Array<Record<string, unknown>>; notes?: string };

    const result: ReportResult & { notes?: string; query: string } = {
      slug: 'nl-query',
      title: output.title ?? 'Ad-hoc report',
      description: output.notes ?? '',
      columns: output.columns ?? [],
      rows: output.rows ?? [],
      generatedAt: bundle.generatedAt,
      notes: output.notes,
      query: req.body.query,
    };

    logger.info({
      query: req.body.query,
      rows: result.rows.length,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    }, 'NL query answered');

    res.json(result);
  } catch (err) {
    logger.error({ err, query: req.body.query }, 'NL query failed');
    res.status(502).json({
      error: {
        code: 'nlq_failed',
        message: err instanceof Error ? err.message : 'Claude could not answer that query. Try rephrasing, or use a template report.',
      },
    });
  }
});

/* ────────── NL query — helpers ────────── */

/** Reduce ShopRow to just what Claude needs so we don't burn tokens on IDs and PDF booleans. */
function compactShopForClaude(s: ShopRow) {
  return {
    shop:            s.shopName,
    shopNumber:      s.shopId,
    address:         s.address,
    city:            s.city,
    state:           s.state,
    lifecycleStage:  s.lifecycleStage,
    open:            s.isOpen,
    type:            s.isPubCorp ? 'PUB Corp' : 'Franchise',
    entity:          s.entityName,
    franchiseeGroup: s.franchiseeGroup,
    lease: {
      execDate:    s.leaseExecDate,
      termEnd:     s.leaseTermEnd,
      termYears:   s.leaseTermYears,
      monthlyRent: s.monthlyRent,
      annualRent:  s.annualRent,
      landlord:    s.landlord,
      squareFeet:  s.squareFeet,
      costPerSqFt: s.costPerSqFt,
    },
    fa: {
      execDate:  s.faExecDate,
      termEnd:   s.faTermEnd,
      termYears: s.faTermYears,
      entity:    s.faEntityName,
      signatory: s.faSignatory,
    },
  };
}

function buildSystemPrompt(): string {
  return `You are the reporting engine for PUB Legal, an in-house franchisor operations tool.

You will be given the current state of every shop, lease, franchise agreement, and DRA in JSON, plus a natural-language reporting question from the user (an in-house General Counsel).

Your job: answer the question by returning a structured report via the return_report tool. The report must contain:
- title: short label
- columns: array of { key, label, align?, type? } where type is 'string'|'number'|'currency'|'date'|'boolean'
- rows: array of objects keyed by column.key
- notes: optional 1-2 sentence explanation of caveats, missing data, or assumptions

Rules:
- Only report on the data you're given. Do not invent shops, dates, or figures.
- If the user's question needs data that isn't present (e.g., asks about payroll), return an empty rows array and explain in notes.
- Prefer sorting sensibly (e.g., soonest expiration first, highest rent first) unless the user specifies otherwise.
- When a field is null/missing in the source data, keep it null in the row (don't fabricate a value).
- Use ISO date strings (YYYY-MM-DD) — never pretty-formatted dates.
- Currency values are raw numbers (e.g., 15000 not "$15,000"). The frontend formats them.
- Column keys should be short camelCase; labels should be Title Case, human-readable.

Never include personally-identifying information beyond what's already in the source (names of signatories on the record are fine; anything else is not).`;
}

function buildUserMessage(query: string, shops: unknown[], dras: unknown[]): string {
  return `SHOPS (JSON):
${JSON.stringify(shops, null, 0)}

DRAS (JSON):
${JSON.stringify(dras, null, 0)}

USER QUESTION:
${query}

Answer using the return_report tool.`;
}

const nlqReportTool = {
  name: 'return_report',
  description: 'Return a structured report answering the user\'s question.',
  input_schema: {
    type: 'object' as const,
    properties: {
      title: { type: 'string', description: 'Short label for the report' },
      columns: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key:   { type: 'string' },
            label: { type: 'string' },
            align: { type: 'string', enum: ['left', 'right'] },
            type:  { type: 'string', enum: ['string', 'number', 'currency', 'date', 'boolean'] },
          },
          required: ['key', 'label'],
        },
      },
      rows: {
        type: 'array',
        items: { type: 'object', additionalProperties: true },
      },
      notes: { type: 'string', description: 'Optional caveats, assumptions, or missing-data notes' },
    },
    required: ['title', 'columns', 'rows'],
  },
};
