export type UserType = 'Employee' | 'Franchisee' | 'Partner' | 'Admin';

export type LifecycleStage =
  | 'Prospect' | 'LOI' | 'At Lease' | 'Lease Executed' | 'FA Signed'
  | 'Permitting' | 'Under Construction' | 'Open' | 'Operating'
  | 'Remodel' | 'Renewal Due' | 'Transferred' | 'Closed';

export type Workstream = 'Real Estate' | 'Franchise Agreement' | 'Construction' | 'General';

export interface Me {
  id: string;
  email: string;
  name: string;
  userType: UserType;
  scope: {
    accessibleLocationCount: number;
    franchiseeGroupIds: string[];
    globalAccess: boolean;
  };
}

export interface LocationSummary {
  id: string;
  shopName: string;
  shopId: string;
  brand: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  franchiseeName: string;
  generalManager: string;
  districtManager: string;
  lifecycleStage: LifecycleStage | null;
  targetOpenDate:  string | null;
  actualOpenDate:  string | null;
  leaseSignedDate: string | null;
  faSignedDate:    string | null;
}

export interface LocationDetail extends Omit<LocationSummary, 'targetOpenDate'|'actualOpenDate'|'leaseSignedDate'|'faSignedDate'> {
  dates: {
    targetOpen: string | null;
    actualOpen: string | null;
    loiSigned: string | null;
    leaseSigned: string | null;
    faSigned: string | null;
    daysVs240: number | null;
  };
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: string | null;
  workstream: Workstream | null;
  requestType: string | null;
  submitterName: string;
  submittedAt: string | null;
  origin?: string | null;
  visibility?: string | null;
  locationIds?: string[];
}

export type LeaseDocumentType =
  | 'Original Lease' | 'Amendment' | 'Guaranty'
  | 'Landlord Work Letter' | 'Estoppel' | 'Side Letter' | 'Other';

export interface Lease {
  id: string;
  executionDate: string | null;
  termEnd:       string | null;
  termYears:     number | null;
  monthlyRent:   number | null;
  annualRent:    number | null;
  status:        string | null;
  file:          { url: string; filename: string }[];
  // Document hierarchy. Null documentType is treated as "Original Lease" by the UI.
  documentType:    LeaseDocumentType | null;
  parentLeaseIds:  string[];
  documentDate:    string | null;
  amendmentNumber: number | null;
}

// ── Compliance Check ────────────────────────────────────
export interface ChecklistItem {
  ok:    boolean;
  label: string;
}

export interface ShopComplianceReport {
  locationId:     string;
  shopName:       string;
  shopId:         string;
  isPubCorp:      boolean;
  fullyCompliant: boolean;
  gapCount:       number;
  lease: {
    present:     ChecklistItem;
    pdfAttached: ChecklistItem;
    execDate:    ChecklistItem;
  };
  fa: {
    present:     ChecklistItem;
    pdfAttached: ChecklistItem;
    execDate:    ChecklistItem;
  } | null;
}

export interface ComplianceResponse {
  summary: {
    totalOpen:      number;
    fullyCompliant: number;
    withGaps:       number;
  };
  reports: ShopComplianceReport[];
}

export type Confidence = 'high' | 'medium' | 'low';

export interface ExtractedField<T> {
  value: T | null;
  confidence: Confidence;
}

export interface LeaseExtraction {
  executionDate:    ExtractedField<string>;
  commencementDate: ExtractedField<string>;
  termYears:        ExtractedField<number>;
  termEnd:          ExtractedField<string>;
  monthlyRent:      ExtractedField<number>;
  annualRent:       ExtractedField<number>;
  landlord:         ExtractedField<string>;
  renewalOptions:   ExtractedField<string>;
  securityDeposit:  ExtractedField<number>;
  notes:            string;
  model:            string;
  inputTokens:      number;
  outputTokens:     number;
  cacheReadTokens:  number;
  cacheWriteTokens: number;
}

export interface FaTracker {
  id: string;
  executionDate: string | null;
  termEnd:       string | null;
  termYears:     number | null;
  entityName:    string | null;
  signatory:     string | null;
  draName:       string | null;
  attorney:      string | null;
  status:        string | null;
  file:          { url: string; filename: string }[];
}

export interface DraSummary {
  id: string;
  name: string;
  totalObligation: number;
  fasExecuted:     number;
  currentlyOpen:   number;
  outstanding:     number;
}

export interface DraFa {
  id: string;
  shopName:      string;
  shopNumber:    string;
  executionDate: string | null;
  termEnd:       string | null;
  termYears:     number | null;
  entityName:    string | null;
  signatory:     string | null;
  attorney:      string | null;
  status:        string | null;
  file:          { url: string; filename: string }[];
  isOpen:        boolean;
}

export interface DraDetail {
  id: string;
  name: string;
  totalObligation: number;
  termEndDate:     string | null;
  draFile:         { url: string; filename: string }[];
  schedule:        Record<string, number>;
  fasExecuted:     number;
  currentlyOpen:   number;
  outstanding:     number;
  fas:             DraFa[];
}

export interface Message {
  id: string;
  sender: string;
  senderRole: string | null;
  body: string;
  sentAt: string | null;
  internal: boolean;
}
