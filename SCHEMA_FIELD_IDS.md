# PUB Legal Schema — Field ID Reference

**Base:** `appUInS3SOfPul1jr`
**Migration executed:** 2026-04-20
**Purpose:** Single source of truth for backend `src/airtable/tables.ts`. All new fields from the franchisee portal migration are marked with ⭐.

---

## Users — `tblKg2Ls7eNE1nCHs`

| Field | Field ID | Type |
|---|---|---|
| Name | `fldKcII2pSsh2GcwX` | singleLineText (primary) |
| Email | `fld73wbIJadsY3MqX` | email |
| Department | `fld7GbX8HqpGo6KwF` | singleSelect |
| Phone | `fldGheZvanv8Wd1Eo` | phoneNumber |
| Tickets | `fldGl4blzDGiQ8MQx` | multipleRecordLinks → Tickets |
| Created At | `fldnkq0mI4TTAc1GW` | createdTime |
| Role | `fldM7qMtthGE3pema` | singleSelect |
| PIN | `fldE7vKxatMYBuDCK` | singleLineText |
| ⭐ User Type | `fldUDPFfmYmwuuxus` | singleSelect (Employee, Franchisee, Partner, Admin) |
| ⭐ Franchisee Group | `fldhYiFIiW15iYn83` | multipleRecordLinks → Franchisee Groups |
| ⭐ Associated Locations | `fldy13iqj6okl6vb0` | multipleRecordLinks → Locations |
| ⭐ Portal Status | `fldWjNrdAftaPknt0` | singleSelect (Active, Invited, Suspended) |
| ⭐ Last Login | `fldIMaXY3XbK73ORE` | dateTime |
| ⭐ Invitation Sent | `fldTeWhXcxMJ6U5Ig` | dateTime |

---

## Tickets — `tblgnmXTy33sKo5jT`

| Field | Field ID | Type |
|---|---|---|
| Title | `flda7tMHMjmp8jVM0` | multilineText (primary) |
| # ID | `fldyGIQmkLgXUAHVf` | autoNumber |
| Ticket ID | `fldaopDljTX0LXHLx` | formula |
| Submitter Name | `fldVnuj4HWjipnjJg` | singleLineText |
| Description | `fldtqqNRoNHGRia2l` | multilineText |
| Submitter | `fldwtnJFhLVkefjct` | multipleRecordLinks → Users |
| Department | `fldfWbe6TmnG0atFS` | singleSelect |
| Category | `fldwAEcejqJYKchyL` | singleSelect |
| Status | `fldb7Mvg2HJR980am` | singleSelect |
| Priority | `fld5bnzbXBieW4UV0` | singleSelect |
| Counterparty | `fld3UAvu60In1dZj7` | singleLineText |
| Assigned To | `fldjwnP0hStHd9NzV` | singleLineText |
| Deadline | `fldxKz3UcwFmRlB9f` | date |
| Confidentiality | `fld6TjKUM7BozR6tQ` | multilineText |
| Messages | `fldvCKIJEaU95cJ8b` | multipleRecordLinks → Messages |
| Documents | `flde9vTU4wymMRkVk` | multipleRecordLinks → Documents |
| Submitted At | `fldxLPVZKNf9sMnpo` | createdTime |
| Updated At | `fldyfkVLBtJvkuZii` | lastModifiedTime |
| Submitter Email | `fldncB9ioZpFFULch` | email |
| Attorney Email | `fldshctFYtSfd24Eo` | email |
| ⭐ Location | `fldFfZCUbTM8KhG0p` | multipleRecordLinks → Locations |
| ⭐ Workstream | `fldVRiszQbF7lOkeW` | singleSelect (Real Estate, Franchise Agreement, Construction, General) |
| ⭐ Request Type | `fldDkAftauYL1AhPt` | singleSelect (18 options; see below) |
| ⭐ Visibility | `fldXfjAQwZMof54CR` | singleSelect (Franchisee-Visible, Internal Only) |
| ⭐ Origin | `fldXX0esvmBycuTvg` | singleSelect (Employee, Franchisee) |

**Request Type options** (flat list, grouped by Workstream in UI):

_Real Estate:_ Site Selection / Test Fit CAD Review, LOI Draft Review, Lease Draft Review, Redlined Lease Review, Lease Rider Review, Lease Amendment Review, Renewal or Extension, Assignment or Transfer, Other Real Estate Question

_Franchise Agreement:_ New FA Review, FA Addendum or Amendment, FA Renewal, FA Transfer or Assignment, Signatory or Execution Question, Other FA Question

_General:_ General Legal Question, Compliance / State Registration, Other

---

## Messages — `tbl2FBBd0ojDClvEo`

| Field | Field ID | Type |
|---|---|---|
| Message ID | `flddjBtFSC6EMZMcN` | autoNumber (primary) |
| Sender Name | `fld5iJ5fCHs1t2uTE` | singleLineText |
| Ticket | `fldUB8zNu99DjaIoo` | multipleRecordLinks → Tickets |
| Sender Role | `fldJ9dFSRIXlbqPCt` | singleSelect |
| Body | `fldymyIQRfg7pvBmi` | multilineText |
| Sent At | `fld092xbYfr2UOv6v` | createdTime |
| Recipient Email | `fldh0kp0LBzzye4I9` | email |
| ⭐ Internal | `fldi4klf59MWT4YGE` | checkbox |

---

## Documents — `tblCvHWHKVWxPULf5`

| Field | Field ID | Type |
|---|---|---|
| Document ID | `fld6tMGk1NTLLk3so` | autoNumber (primary) |
| Ticket | `fldohMNBnzrDMLfGD` | multipleRecordLinks → Tickets |
| Filename | `fld62fVlEgqVjbpw1` | singleLineText |
| File Type | `fldv35f7QZtmvHrRn` | singleLineText |
| File Size | `fldbAnNX2gedLY5by` | singleLineText |
| Uploaded By | `fldFdB4upCStlXcoR` | singleLineText |
| File | `fldw5S3VPLkxD71Ej` | multipleAttachments |
| Uploaded At | `fldl49d93xJJAnNZl` | createdTime |
| AI Summary | `fldb3skoTq5M4SN4V` | multilineText |
| ⭐ Location | `fldJ2pPyZ2upNlb6L` | multipleRecordLinks → Locations |
| ⭐ Document Type | `fld9Teuua0e5xLh7d` | singleSelect (13 options; see below) |
| ⭐ Version | `fldS5lgTsfeGiiFaW` | number (precision 0) |
| ⭐ Uploaded By Role | `fldvu1utHBMpz0qYv` | singleSelect (Franchisee, Franchisor, System) |
| ⭐ Parent Document | `fldSdSfWAbB2rXtGz` | multipleRecordLinks → Documents (self) |

**Document Type options:** Test Fit CAD, LOI, Lease Draft, Redlined Lease, Lease Rider, Lease Amendment, Signed Lease, Franchise Agreement, Addendum, Signed FA, Site Photo, Correspondence, Other

---

## Locations — `tbl23K8h2GHqaT2I5`

| Field | Field ID | Type |
|---|---|---|
| Shop Name | `fldX3oMVLEpjihmpz` | singleLineText (primary) |
| Shop ID | `fldw7ICXcOuNOa4PT` | singleLineText |
| Brand | `fldoWhToWFMPzOUda` | singleLineText |
| Address | `flde7hVH65Ig38p8e` | singleLineText |
| City | `fldECaGwjkXvRRoUy` | singleLineText |
| State | `fldyApvVV2KRYRIn9` | singleLineText |
| General Manager | `fldYaAZFALnqhO6KI` | singleLineText |
| District Manager | `fld1zKucHhhTU3UwO` | singleLineText |
| Status | `fld5S49TI2iidd2jq` | singleSelect |
| Leases | `fldbdwDrbsBaxZ09a` | multipleRecordLinks → Leases |
| ZIP | `fld3gfFzu1ytcLV23` | singleLineText |
| Franchisee Entity (legacy) | `fldMKjAsdXu17ixSN` | singleSelect |
| Franchisee Entity | `fld6f1sracfaTFg3H` | multipleRecordLinks → Franchisee Entities |
| ⭐ Lifecycle Stage | `fldqOM2eDDTcfrW7t` | singleSelect (11 options; see below) |
| ⭐ Primary Franchisee Contact | `fldVVCZAJcIBmke0T` | multipleRecordLinks → Users |
| ⭐ Assigned Attorney | `fldzwWMAEiyfYiML6` | multipleRecordLinks → Users |
| ⭐ Target Open Date | `fldV5dMrHBvnpr8kH` | date |
| ⭐ LOI Signed Date | `fldlABwJXVjeedVfS` | date |
| ⭐ Lease Signed Date | `fldkYAxcPnzfjHkxi` | date |
| ⭐ FA Signed Date | `fld0HRLL3BAfj1fD8` | date |
| ⭐ Actual Open Date | `fldCCiqlERTumKDKM` | date |

**Lifecycle Stage options:** Prospect, LOI, At Lease, Lease Executed, FA Signed, Under Construction, Open, Operating, Renewal Due, Transferred, Closed

---

## Existing tables (no changes, for reference)

- **Franchisee Groups** — `tblBh34FJtZ8J7Ih8`
- **Franchisee Entities** — `tblK4Y3zOQfJvpgtj`
- **FA Tracker** — `tblXDzGFIOywREmfA`
- **Leases** — `tblW7M0hdyCs655ty`

---

## Backfills executed

- **User Type** set on all 14 existing Users: Taylor Bennett = Admin, 13 others = Employee.

## Backfills deferred (manual in Airtable when convenient)

- **Lifecycle Stage** on the 113 existing Locations — leave empty or bulk-set to "Operating" via Airtable grid edit. Safe to do after portal launch; records with empty stage will just show no pill.
- **Assigned Attorney** on each Location — you'll populate as you go. For MVP pilot, it's fine for this to be blank (defaults to unassigned).
- **Primary Franchisee Contact** on each Location — populated when franchisee users are provisioned.

## Auto-generated reverse links (created by Airtable)

These are harmless — Airtable auto-created the inverse half of each linked-records pair. They live on the opposite tables:

- Franchisee Groups now has a reverse link to Users (from `Franchisee Group` field)
- Locations now has reverse links to Users (from `Associated Locations`, `Primary Franchisee Contact`, `Assigned Attorney`) and to Tickets (from `Location`) and to Documents (from `Location`)
- Documents has a reverse self-link (from `Parent Document`)

You'll see these with auto-generated names in Airtable ("Users", "Users 2", "Users 3", etc.). I'll rename them for clarity as a separate housekeeping pass before the backend goes live, to avoid confusion when the team edits records.
