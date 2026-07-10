# PUB Legal Portal — DocuSign Integration

**Integration documentation for DocuSign Go-Live submission.**

Server-to-server integration used by PUB Franchisor LLC to send franchise agreements and related legal documents to franchisees, guarantors, and internal countersigners for e-signature, and to archive the executed documents against the franchisee record.

---

## At a glance

| | |
|---|---|
| **Company** | PUB Franchisor LLC (PopUp Bagels) |
| **Integration Name** | PUB Legal Portal |
| **Integration Type** | Server-to-server (JWT Grant, service account) |
| **Auth Method** | OAuth JWT Grant — `signature` + `impersonation` scopes |
| **Envelope Model** | API-composed envelopes, anchor-based tab placement |
| **Status Model** | DocuSign Connect webhook (HMAC-verified) + on-demand polling |
| **Est. Volume** | ~40–100 envelopes / month at maturity |
| **Users** | Internal legal ops team (1–5 users); recipients are external franchisees |

---

## What the integration does

PopUp Bagels' legal team generates franchise agreements and standing addendums inside an internal web application ("PUB Legal Portal") from templates stored server-side. The DocuSign integration takes over at the send-for-signature step: it packages the generated Word document, routes it to the franchisee, their guarantors, and PUB's internal countersigner, and — once every party has signed — pulls the executed PDF back to the source record for permanent archival.

All signing is done by real people in DocuSign's standard signing experience. No embedded signing, no bulk send, no template-based automation. The integration is strictly for the franchisor's own legal execution workflow.

---

## Data and document flow

1. **Document generated internally.** A legal ops user completes a form in the portal (franchisee entity, shop location, guarantors, execution date). The portal composes a `.docx` from a curated template, embedding anchor strings for signature and date placement.

2. **Envelope created via API.** The portal's backend base64-encodes the document and calls `Envelopes: create` with a routing order that puts the franchisee and guarantors on order 1 (parallel signing) and the franchisor on order 2 (countersigner).

3. **Anchor-based tabs.** Signature and date tabs are placed via `anchorString` (`\sig_franchisee\`, `\sig_guarantor_N\`, `\date_*\`). The anchors are rendered in 1pt white text so they are invisible in the executed PDF but findable by the DocuSign tab matcher.

4. **Recipients sign in DocuSign.** Standard email-delivered signing sessions. No custom hosting, no embedded views.

5. **Status updates via DocuSign Connect.** A registered Connect subscription posts to the portal API on every envelope status change. Webhook payloads are verified via HMAC-SHA256 against a shared secret before any state mutation.

6. **Executed PDF archived.** When the envelope reaches `completed`, the API calls `Envelopes: getDocument` (`documentId=combined`) and attaches the resulting PDF to the internal legal record (Airtable-backed). The DocuSign envelope ID is also stamped on that record for audit.

---

## DocuSign features used

| Feature | Purpose |
|---|---|
| **OAuth JWT Grant** | Service-account authentication. No user OAuth flow at runtime. Consent granted once at setup by the operating admin. |
| **Envelopes: create** | Composite envelope creation with routing order, subject/message, and per-recipient anchor tabs. |
| **Envelopes: get** | On-demand status polling for the operator-visible Envelopes dashboard. |
| **Envelopes: getDocument (combined)** | Post-completion download of the merged executed PDF plus certificate of completion. |
| **DocuSign Connect** | Real-time envelope status webhooks. HMAC-verified. Configured for envelope-sent, envelope-delivered, envelope-completed, envelope-declined, envelope-voided. |
| **Anchor tabs** | `SignHere` and `DateSigned` tab types, positioned via `anchorString` with `anchorIgnoreIfNotPresent = true`. |

---

## Scopes requested

- `signature` — required to create and manage envelopes.
- `impersonation` — required for the JWT Grant to act on behalf of the configured API user.

No additional scopes are requested. The integration does not read organization-wide envelopes, manage users, or access any account other than the connected one.

---

## Volume and pattern

Envelope volume is driven by franchise development pace and legal amendment cycles. Expected steady state is **40–100 envelopes per month**, with occasional quarterly bursts (portfolio-wide amendments) that may double that for a few days. All sending is initiated by a human legal ops user; there is no scheduled or automated batch sending.

Each envelope carries one primary document (the Franchise Agreement) and zero to three ancillary documents (standing addendums specific to the franchisee's Development Rights Agreement). Recipients per envelope typically range from 2 to 6.

---

## Security and compliance

- **Credential storage.** Integration Key, User ID, Account ID, and the RSA private key live only in the deployment platform's encrypted environment variables. No credentials in source control.
- **Webhook verification.** Every DocuSign Connect POST is verified via HMAC-SHA256 against a shared secret registered with the Connect subscription. Unverified payloads are rejected with 401 and never mutate state.
- **Transport.** All traffic to and from DocuSign is over TLS 1.2+. No credentials or document content are ever logged.
- **Access control.** The portal is behind cookie-based session auth with per-user PIN authentication and rate limiting. Only the legal ops group can initiate envelope sends.
- **Data retention.** Executed PDFs are archived to the franchisor's internal legal system indefinitely for regulatory retention (franchise disclosure documents require multi-year retention under FTC Franchise Rule 16 CFR 436).

> **Note:** This integration is used solely by PUB Franchisor LLC for the execution of its own franchise agreements and related legal documents with its franchisees. It is not resold, embedded in a customer-facing product, or made available to third parties.

---

## Testing performed

The full pipeline has been exercised end-to-end in the DocuSign developer sandbox across multiple envelope shapes (single-signer, multi-guarantor, franchisor countersign) and status paths (completed, voided, declined). Anchor tab placement, HMAC webhook verification, and executed-PDF archival have all been verified against real envelopes. Move to production is contingent on this Go-Live approval.

---

## Contact

**Primary technical contact:** Taylor Bennett, General Counsel — [taylor@taylorbennettlaw.com](mailto:taylor@taylorbennettlaw.com)
**Operating entity:** PUB Franchisor LLC (PopUp Bagels)
**Application hostname:** `pub-legal-api-production.up.railway.app`
