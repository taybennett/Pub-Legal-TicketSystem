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

export interface Lease {
  id: string;
  executionDate: string | null;
  termEnd:       string | null;
  termYears:     number | null;
  monthlyRent:   number | null;
  annualRent:    number | null;
  status:        string | null;
  file:          { url: string; filename: string }[];
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
