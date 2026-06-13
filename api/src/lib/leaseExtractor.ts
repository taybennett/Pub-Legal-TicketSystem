/**
 * Claude-powered lease PDF extraction.
 *
 * Calls the Anthropic API with the lease PDF + a structured-output tool that
 * forces the model to return a strict JSON object with per-field confidence.
 * System prompt and tool definition are cached (5-min TTL) so repeated
 * extractions in the same session cost ~25% of the first call.
 *
 * Never auto-commits to Airtable — the route returns the extracted data so the
 * admin can review and edit before saving.
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { logger } from '../util/logger.js';

const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

// Anthropic hard PDF limit (32 MB). Caller should error before reaching this.
export const PDF_MAX_BYTES = 32 * 1024 * 1024;

export type Confidence = 'high' | 'medium' | 'low';

export interface ExtractedField<T> {
  value:      T | null;
  confidence: Confidence;
}

export interface LeaseExtraction {
  executionDate:     ExtractedField<string>;   // ISO YYYY-MM-DD
  commencementDate:  ExtractedField<string>;   // ISO YYYY-MM-DD
  termYears:         ExtractedField<number>;
  termEnd:           ExtractedField<string>;   // ISO YYYY-MM-DD
  monthlyRent:       ExtractedField<number>;
  annualRent:        ExtractedField<number>;
  landlord:          ExtractedField<string>;
  renewalOptions:    ExtractedField<string>;
  securityDeposit:   ExtractedField<number>;
  notes:             string;
  // Audit metadata
  model:             string;
  inputTokens:       number;
  outputTokens:      number;
  cacheReadTokens:   number;
  cacheWriteTokens:  number;
}

const SYSTEM_PROMPT = `You are a paralegal at a franchise legal team extracting structured data from commercial real estate lease agreements.

The shops are PopUp Bagels franchise locations across the U.S. Your extraction feeds an Airtable lease tracker — accuracy on rent figures and dates matters more than completeness.

For each field, set:
  - value to your best extraction, or null if you genuinely cannot find it
  - confidence to "high" (clearly stated in the lease), "medium" (inferred or paraphrased), or "low" (uncertain / multiple candidates / ambiguous)

Be conservative. If a number could be either monthly or annual rent, set the one you're sure about and leave the other null with a note. If renewal options are described in prose, summarize as "N × M years" format when possible (e.g., "2 × 5 years" for two five-year options).

Dates must be ISO YYYY-MM-DD. Monetary amounts must be plain numbers (no dollar sign, no commas).

Always call the record_lease_extraction tool. Do not return prose.`;

const EXTRACTION_TOOL: Anthropic.Tool = {
  name: 'record_lease_extraction',
  description: 'Record the structured fields extracted from the lease PDF.',
  input_schema: {
    type: 'object',
    properties: {
      executionDate:    confidenceProp('string', 'Date the lease was signed by both parties (ISO YYYY-MM-DD). Often labeled "Effective Date" or "Date" on the signature page.'),
      commencementDate: confidenceProp('string', 'Rent commencement date — when the tenant first owes rent (ISO YYYY-MM-DD). May differ from execution date.'),
      termYears:        confidenceProp('number', 'Initial lease term in years.'),
      termEnd:          confidenceProp('string', 'Lease expiration date (ISO YYYY-MM-DD).'),
      monthlyRent:      confidenceProp('number', 'Base monthly rent at lease commencement, in USD. Excludes CAM/taxes/insurance unless they are gross-included.'),
      annualRent:       confidenceProp('number', 'Annualized base rent at lease commencement, in USD.'),
      landlord:         confidenceProp('string', 'Legal name of the landlord entity (the party leasing TO the franchisee).'),
      renewalOptions:   confidenceProp('string', 'Brief summary of renewal options. Format like "2 × 5 years" or "one 5-year option with 6 months notice".'),
      securityDeposit:  confidenceProp('number', 'Security deposit amount in USD.'),
      notes:            { type: 'string', description: 'Free-form notes: anything that surprised you, rent escalations, TI allowance, personal guaranty, or fields you marked low-confidence.' },
    },
    required: ['executionDate','commencementDate','termYears','termEnd','monthlyRent','annualRent','landlord','renewalOptions','securityDeposit','notes'],
  },
};

function confidenceProp(valueType: 'string' | 'number', description: string) {
  return {
    type: 'object',
    description,
    properties: {
      value:      { type: [valueType, 'null'] },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    },
    required: ['value', 'confidence'],
  };
}

const MODEL = 'claude-sonnet-4-5-20250929';

export async function extractLease(pdfBase64: string): Promise<LeaseExtraction> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    tools: [
      { ...EXTRACTION_TOOL, cache_control: { type: 'ephemeral' } } as Anthropic.Tool,
    ],
    tool_choice: { type: 'tool', name: 'record_lease_extraction' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
          },
          {
            type: 'text',
            text: 'Extract the lease fields by calling the record_lease_extraction tool. Be conservative on confidence — flag medium/low where appropriate.',
          },
        ],
      },
    ],
  });

  const toolBlock = response.content.find(b => b.type === 'tool_use');
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    throw new Error('Claude did not call the extraction tool. Response: ' + JSON.stringify(response.content).slice(0, 500));
  }

  const data = toolBlock.input as Record<string, ExtractedField<unknown> | string>;
  const usage = response.usage;
  logger.info({
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
  }, 'lease extraction complete');

  return {
    executionDate:     data.executionDate    as ExtractedField<string>,
    commencementDate:  data.commencementDate as ExtractedField<string>,
    termYears:         data.termYears        as ExtractedField<number>,
    termEnd:           data.termEnd          as ExtractedField<string>,
    monthlyRent:       data.monthlyRent      as ExtractedField<number>,
    annualRent:        data.annualRent       as ExtractedField<number>,
    landlord:          data.landlord         as ExtractedField<string>,
    renewalOptions:    data.renewalOptions   as ExtractedField<string>,
    securityDeposit:   data.securityDeposit  as ExtractedField<number>,
    notes:             (data.notes as string) ?? '',
    model:             MODEL,
    inputTokens:       usage.input_tokens,
    outputTokens:      usage.output_tokens,
    cacheReadTokens:   usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens:  usage.cache_creation_input_tokens ?? 0,
  };
}
