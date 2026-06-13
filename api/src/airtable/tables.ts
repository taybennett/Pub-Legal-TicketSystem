/**
 * Airtable table + field ID constants. SINGLE SOURCE OF TRUTH.
 *
 * Every Airtable operation in this codebase must reference IDs from here,
 * never hardcoded strings. A rename in the Airtable UI will NOT break us
 * because IDs are immutable — only deleting a field breaks us, which is
 * a much louder failure.
 *
 * When adding/changing a field in Airtable, update this file in the same
 * commit and regenerate the type exports.
 */

// ── Base IDs ────────────────────────────────────────────────────────
export const BASE = {
  LEGAL:       'appUInS3SOfPul1jr', // PUB Legal
  DEVELOPMENT: 'appw92pCC1jrY5CNv', // PUB Development (read-only for us)
} as const;

// ── Table IDs ───────────────────────────────────────────────────────
export const TABLE = {
  // PUB Legal
  USERS:              'tblKg2Ls7eNE1nCHs',
  TICKETS:            'tblgnmXTy33sKo5jT',
  MESSAGES:           'tbl2FBBd0ojDClvEo',
  DOCUMENTS:          'tblCvHWHKVWxPULf5',
  LOCATIONS:          'tbl23K8h2GHqaT2I5',
  LEASES:             'tblW7M0hdyCs655ty',
  FA_TRACKER:         'tblXDzGFIOywREmfA',
  FRANCHISEE_GROUPS:  'tblBh34FJtZ8J7Ih8',
  FRANCHISEE_ENTITIES:'tblK4Y3zOQfJvpgtj',
  // PUB Development
  PIPELINE:           'tbllofgQwUSIxkMl6',
} as const;

// ── USERS ───────────────────────────────────────────────────────────
export const USERS = {
  NAME:                 'fldKcII2pSsh2GcwX',
  EMAIL:                'fld73wbIJadsY3MqX',
  DEPARTMENT:           'fld7GbX8HqpGo6KwF',
  PHONE:                'fldGheZvanv8Wd1Eo',
  TICKETS:              'fldGl4blzDGiQ8MQx',
  CREATED_AT:           'fldnkq0mI4TTAc1GW',
  ROLE:                 'fldM7qMtthGE3pema',
  PIN:                  'fldE7vKxatMYBuDCK',
  // Portal additions (2026-04-20 migration)
  USER_TYPE:            'fldUDPFfmYmwuuxus',
  FRANCHISEE_GROUP:     'fldhYiFIiW15iYn83',
  ASSOCIATED_LOCATIONS: 'fldy13iqj6okl6vb0',
  PORTAL_STATUS:        'fldWjNrdAftaPknt0',
  LAST_LOGIN:           'fldIMaXY3XbK73ORE',
  INVITATION_SENT:      'fldTeWhXcxMJ6U5Ig',
} as const;

export type UserType    = 'Employee' | 'Franchisee' | 'Partner' | 'Admin';
export type PortalStatus = 'Active' | 'Invited' | 'Suspended';

// ── TICKETS ─────────────────────────────────────────────────────────
export const TICKETS = {
  TITLE:             'flda7tMHMjmp8jVM0',
  ID_NUMBER:         'fldyGIQmkLgXUAHVf',
  TICKET_ID:         'fldaopDljTX0LXHLx',
  SUBMITTER_NAME:    'fldVnuj4HWjipnjJg',
  DESCRIPTION:       'fldtqqNRoNHGRia2l',
  SUBMITTER:         'fldwtnJFhLVkefjct',
  DEPARTMENT:        'fldfWbe6TmnG0atFS',
  CATEGORY:          'fldwAEcejqJYKchyL',
  STATUS:            'fldb7Mvg2HJR980am',
  PRIORITY:          'fld5bnzbXBieW4UV0',
  COUNTERPARTY:      'fld3UAvu60In1dZj7',
  ASSIGNED_TO:       'fldjwnP0hStHd9NzV',
  DEADLINE:          'fldxKz3UcwFmRlB9f',
  CONFIDENTIALITY:   'fld6TjKUM7BozR6tQ',
  MESSAGES:          'fldvCKIJEaU95cJ8b',
  DOCUMENTS:         'flde9vTU4wymMRkVk',
  SUBMITTED_AT:      'fldxLPVZKNf9sMnpo',
  UPDATED_AT:        'fldyfkVLBtJvkuZii',
  SUBMITTER_EMAIL:   'fldncB9ioZpFFULch',
  ATTORNEY_EMAIL:    'fldshctFYtSfd24Eo',
  // Portal additions
  LOCATION:          'fldFfZCUbTM8KhG0p',
  WORKSTREAM:        'fldVRiszQbF7lOkeW',
  REQUEST_TYPE:      'fldDkAftauYL1AhPt',
  VISIBILITY:        'fldXfjAQwZMof54CR',
  ORIGIN:            'fldXX0esvmBycuTvg',
} as const;

export type Workstream = 'Real Estate' | 'Franchise Agreement' | 'Construction' | 'General';
export type Visibility = 'Franchisee-Visible' | 'Internal Only';
export type Origin     = 'Employee' | 'Franchisee';

export const REQUEST_TYPES = {
  realEstate: [
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
  franchiseAgreement: [
    'New FA Review',
    'FA Addendum or Amendment',
    'FA Renewal',
    'FA Transfer or Assignment',
    'Signatory or Execution Question',
    'Other FA Question',
  ],
  general: [
    'General Legal Question',
    'Compliance / State Registration',
    'Other',
  ],
} as const;

// ── MESSAGES ────────────────────────────────────────────────────────
export const MESSAGES = {
  MESSAGE_ID:      'flddjBtFSC6EMZMcN',
  SENDER_NAME:     'fld5iJ5fCHs1t2uTE',
  TICKET:          'fldUB8zNu99DjaIoo',
  SENDER_ROLE:     'fldJ9dFSRIXlbqPCt',
  BODY:            'fldymyIQRfg7pvBmi',
  SENT_AT:         'fld092xbYfr2UOv6v',
  RECIPIENT_EMAIL: 'fldh0kp0LBzzye4I9',
  // Portal additions
  INTERNAL:        'fldi4klf59MWT4YGE',
} as const;

// ── DOCUMENTS ───────────────────────────────────────────────────────
export const DOCUMENTS = {
  DOCUMENT_ID:       'fld6tMGk1NTLLk3so',
  TICKET:            'fldohMNBnzrDMLfGD',
  FILENAME:          'fld62fVlEgqVjbpw1',
  FILE_TYPE:         'fldv35f7QZtmvHrRn',
  FILE_SIZE:         'fldbAnNX2gedLY5by',
  UPLOADED_BY:       'fldFdB4upCStlXcoR',
  FILE:              'fldw5S3VPLkxD71Ej',
  UPLOADED_AT:       'fldl49d93xJJAnNZl',
  AI_SUMMARY:        'fldb3skoTq5M4SN4V',
  // Portal additions
  LOCATION:          'fldJ2pPyZ2upNlb6L',
  DOCUMENT_TYPE:     'fld9Teuua0e5xLh7d',
  VERSION:           'fldS5lgTsfeGiiFaW',
  UPLOADED_BY_ROLE:  'fldvu1utHBMpz0qYv',
  PARENT_DOCUMENT:   'fldSdSfWAbB2rXtGz',
} as const;

export type DocumentType =
  | 'Test Fit CAD' | 'LOI' | 'Lease Draft' | 'Redlined Lease' | 'Lease Rider'
  | 'Lease Amendment' | 'Signed Lease' | 'Franchise Agreement' | 'Addendum'
  | 'Signed FA' | 'Site Photo' | 'Correspondence' | 'Other';

export type UploadedByRole = 'Franchisee' | 'Franchisor' | 'System';

// ── LOCATIONS ───────────────────────────────────────────────────────
export const LOCATIONS = {
  SHOP_NAME:                   'fldX3oMVLEpjihmpz',
  SHOP_ID:                     'fldw7ICXcOuNOa4PT',
  BRAND:                       'fldoWhToWFMPzOUda',
  ADDRESS:                     'flde7hVH65Ig38p8e',
  CITY:                        'fldECaGwjkXvRRoUy',
  STATE:                       'fldyApvVV2KRYRIn9',
  GENERAL_MANAGER:             'fldYaAZFALnqhO6KI',
  DISTRICT_MANAGER:            'fld1zKucHhhTU3UwO',
  STATUS:                      'fld5S49TI2iidd2jq',
  LEASES:                      'fldbdwDrbsBaxZ09a',
  ZIP:                         'fld3gfFzu1ytcLV23',
  FRANCHISEE_ENTITY_LEGACY:    'fldMKjAsdXu17ixSN',
  FRANCHISEE_ENTITY:           'fld6f1sracfaTFg3H',
  // Portal additions
  LIFECYCLE_STAGE:             'fldqOM2eDDTcfrW7t',
  PRIMARY_FRANCHISEE_CONTACT:  'fldVVCZAJcIBmke0T',
  ASSIGNED_ATTORNEY:           'fldzwWMAEiyfYiML6',
  TARGET_OPEN_DATE:            'fldV5dMrHBvnpr8kH',
  LOI_SIGNED_DATE:             'fldlABwJXVjeedVfS',
  LEASE_SIGNED_DATE:           'fldkYAxcPnzfjHkxi',
  FA_SIGNED_DATE:              'fld0HRLL3BAfj1fD8',
  ACTUAL_OPEN_DATE:            'fldCCiqlERTumKDKM',
} as const;

export type LifecycleStage =
  | 'Prospect' | 'LOI' | 'At Lease' | 'Lease Executed' | 'FA Signed'
  | 'Permitting' | 'Under Construction' | 'Open' | 'Operating'
  | 'Remodel' | 'Renewal Due' | 'Transferred' | 'Closed';

// ── LEASES ──────────────────────────────────────────────────────────
// Fields the portal reads (Overview-tab joins + Real Estate tab panel).
export const LEASES = {
  LOCATION:       'fldVl0EZ4tsKqK3xO', // multipleRecordLinks → Locations
  EXECUTION_DATE: 'fldhyvDBiQzyiM2Ta', // date — Lease Signed Date source
  TERM_END:       'fldBjs6JaZk32zSLi', // date
  STATUS:         'fldzNXuMM9X0K9HSK', // singleSelect (Active, Expiring Soon, Expired, On Holdover)
  TERM_YEARS:     'fldctJqJIgkyshOgm', // number
  MONTHLY_RENT:   'flduVt4EpOeXBQBgD', // number (currency)
  ANNUAL_RENT:    'fldzC6vDKxG2tpihb', // number (currency)
  FILE:           'fldggx2f5yASIEPY5', // multipleAttachments
  // AI extraction targets (Phase 1 — Claude reads PDF, admin reviews, then saves)
  LANDLORD:               'fldNVFM3cKXqqil7P', // singleLineText
  RENT_COMMENCEMENT_DATE: 'fldkbdyUauIObgxB8', // date (ISO)
  RENEWAL_OPTIONS:        'fldYvAyLnDEDipSGY', // singleLineText
  SECURITY_DEPOSIT:       'fldxvOreGk3UJxS98', // currency
  AI_EXTRACTION_LOG:      'fldulFGcVzfog74JQ', // multilineText — audit trail of raw Claude response
} as const;

// ── FA TRACKER ──────────────────────────────────────────────────────
export const FA_TRACKER = {
  SHOP_NUMBER:    'fld2BtDdpVKLZjFHi', // singleLineText — joins to Locations.SHOP_ID
  EXECUTION_DATE: 'fldOhQR58yZ1u7wGI', // date — FA Signed Date source
  TERM_END:       'fldmgSgz5ZSQSpmoo', // date
  STATUS:         'fldJ5EUiJ1d3JR03H', // singleSelect (Active, Expiring Within 1 Year, Expiring Within 6 Months, Expired)
  TERM_YEARS:     'fldlWYzNoTuia1Ivv', // number
  ENTITY_NAME:    'fldKlZNFf32HgygfD', // singleLineText — franchisee LLC
  SIGNATORY:      'fldbrVoQ7vv2tSU9k', // singleLineText
  DRA_NAME:       'fldfeBr9Z6W8wPn91', // singleLineText
  ATTORNEY:       'fldw6RH9XpWFEdZVj', // singleLineText
  FILE:           'fld7KovhoSqAcMtIK', // multipleAttachments
  SHOP_NAME:      'fldw0mVNvR0otKOuX', // singleLineText
  TITLE:          'fldGyEBZB08oqRt5n', // computed primary — e.g. "Bagel Bros, LLC — Lincoln Park (Chicago) (#2295)"
  DRA_LINK:       'fldAXWntc1wHmmMpn', // multipleRecordLinks → Franchisee Groups (DRAs). Source of truth.
} as const;

// ── FRANCHISEE GROUPS (each row is a Development Rights Agreement / DRA) ─────
export const FRANCHISEE_GROUPS = {
  GROUP_NAME:          'fld7v69YCoixETJrz', // primary — DRA Name (e.g. "Bagel Boyz — San Diego DRA")
  GROUP_ID:            'fldFctwSPVYNF3bv1',
  DESCRIPTION:         'fldGTK9YitOt98hvl',
  ADDENDUM_TITLE:      'fldH8XKaAJdGA0ce5',
  TOKEN_MAP:           'fldlOSgABv4zs6QYG',
  ADDENDUM_B64:        'fldM5M80oME4dDpPR',
  FRANCHISEE_ENTITIES: 'fldPtI6jGFtDh2a3Y',
  // DRA tracking additions (2026-05 — sourced from FA Tracker xlsx)
  TOTAL_OBLIGATION:    'fldMNFbAZFWW2Qxmo', // number
  TERM_END_DATE:       'fldHCqWgN1erPNlum', // date (ISO)
  DRA_FILE:            'fldMpQLFrYFqdvzeZ', // multipleAttachments
  YEAR_2025:           'fldOoeQdmLQ1Mj2QQ',
  YEAR_2026:           'flddhuu1RRDQikY9d',
  YEAR_2027:           'fldTV31CQyzC13J3f',
  YEAR_2028:           'fldc1Oj7ilo4JQ5b9',
  YEAR_2029:           'fldUmWCQszAMeVBOh',
  YEAR_2030:           'fldp06XbLWsZmzpQZ',
  YEAR_2031:           'fld8hnMI3X486lost',
  YEAR_2032:           'fldQA5NjzpA5ASv4D',
  YEAR_2033:           'fldKAecmcF6SOrI0D',
  YEAR_2034:           'fld7pwxxccrCi83g9',
  YEAR_2035:           'fld1NLA253jENXdpT',
} as const;

// ── FRANCHISEE ENTITIES ─────────────────────────────────────────────
export const FRANCHISEE_ENTITIES = {
  ENTITY_NAME:          'fldIRyM1EAHqtfYXf',
  PARENT_GROUP:         'fldaR4dA7vjqazzxb',
  JURISDICTION:         'fldCW0nMqoB5SkjIS',
  FORMATION_DATE:       'fldPKXDctQD7UYbRy',
  SIGNATORY_NAME:       'fldVNjK0ZQaexeEUI',
  SIGNATORY_TITLE:      'fldSHTsXooTZAqpZr',
  NOTES:                'fld0YnjN3o6WQPNrV',
  LOCATIONS:            'fldAL756ZvSncgTBH',
  FA_TRACKER:           'fld3Xvc7MydcI7Hjl',
} as const;

// ── PIPELINE (PUB Development, read-only for portal) ────────────────
// Only includes fields the portal Construction tab actually reads.
export const PIPELINE = {
  STORE_NAME:            'fldZ4XN1HLjTnMxbX',
  STORE_NUMBER:          'fldK9386FdwUqAyAe',
  FZ_CORP:               'fld54gMXyp2yDvoSJ',
  DEVELOPMENT_STATUS:    'fldTPcZ5EQqDxVzWY',
  PROJECTED_OPENING:     'fldfxNnLIWV0KUxcs',
  LEASE_SIGNED:          'fldWZNz1c63pC1cs0',
  LEASE_STATUS:          'fldGjvBhwXHI3VElJ',
  TERM:                  'fldyEGD0w8yV7qxqS',
  RENT:                  'fld2jeRJgr0sO5Ric',
  LEASE_OPTIONS:         'fld9NxuEZeB69kpl2',
  TEST_FIT_APPROVED:     'fldYYClXhY8f29EPc',
  PERMIT_SUBMITTED:      'fldEYvfYkpLxkJB1f',
  PERMIT_APPROVED:       'fldRdtAyTQDntE9Rg',
  CONSTRUCTION_START:    'fldyM5OTUtBfmXAKY',
  WEEKS_OUT_FROM_OPEN:   'fldM96pIm1HYn9nAX',
  PUB_CONSTRUCTION_MGR:  'fldqgCGfbQBSo6vkt',
  FULL_ADDRESS:          'fldHeS8q71pMJlKmd',
} as const;
