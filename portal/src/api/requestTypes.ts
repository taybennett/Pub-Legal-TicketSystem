import type { Workstream } from './types';

export const REQUEST_TYPES_BY_WORKSTREAM: Record<Exclude<Workstream, 'Construction'>, string[]> = {
  'Real Estate': [
    'Site Selection / Test Fit CAD Review',
    'LOI Draft Review',
    'Lease Draft Review',
    'Redlined Lease Review',
    'Lease Rider Review',
    'Lease Amendment Review',
    'Renewal or Extension',
    'Assignment or Transfer',
    'Other Real Estate Question',
  ],
  'Franchise Agreement': [
    'New FA Review',
    'FA Addendum or Amendment',
    'FA Renewal',
    'FA Transfer or Assignment',
    'Signatory or Execution Question',
    'Other FA Question',
  ],
  'General': [
    'General Legal Question',
    'Compliance / State Registration',
    'Other',
  ],
};

export const DOCUMENT_TYPES = [
  'Test Fit CAD', 'LOI', 'Lease Draft', 'Redlined Lease', 'Lease Rider',
  'Lease Amendment', 'Signed Lease', 'Franchise Agreement', 'Addendum',
  'Signed FA', 'Site Photo', 'Correspondence', 'Other',
] as const;
