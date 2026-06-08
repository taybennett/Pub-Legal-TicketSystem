#!/usr/bin/env python3
"""
PUB Legal — Airtable Additive Migration Script
-----------------------------------------------
Brings PUB's Airtable base up to the schema required by the ported
SunTicketSystem framework. STRICTLY ADDITIVE: creates missing tables
and fields only. Never renames, reorders, or deletes anything.

Usage:
  1. Get an Airtable PAT with scopes:
       schema.bases:read, schema.bases:write
     (data scopes NOT required for migration; rotate a narrower
      token in afterward for runtime.)
  2. Export it:
       export AIRTABLE_TOKEN=patXXXXXXXXXXXXXX.XXXXXXXXXX
  3. Dry-run first (prints every POST/PATCH it would issue):
       python3 setup-airtable-pub.py --plan
  4. Apply:
       python3 setup-airtable-pub.py --apply
  5. (optional) Patch index.html in place with the new table IDs:
       python3 setup-airtable-pub.py --apply --patch-html path/to/index.html
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

BASE_ID = "appUInS3SOfPul1jr"
FA_TRACKER_ID = "tblXDzGFIOywREmfA"  # existing PUB FA Tracker

META_URL = f"https://api.airtable.com/v0/meta/bases/{BASE_ID}/tables"


# --- Desired schema ----------------------------------------------------------

LOCATIONS_FIELDS = [
    {"name": "Shop Name", "type": "singleLineText"},
    {"name": "Shop ID", "type": "singleLineText"},
    {"name": "Brand", "type": "singleLineText"},
    {"name": "Franchisee Entity", "type": "singleLineText"},
    {"name": "Address", "type": "singleLineText"},
    {"name": "City", "type": "singleLineText"},
    {"name": "State", "type": "singleLineText"},
    {"name": "General Manager", "type": "singleLineText"},
    {"name": "District Manager", "type": "singleLineText"},
    {
        "name": "Status",
        "type": "singleSelect",
        "options": {"choices": [
            {"name": "Active"},
            {"name": "Under Construction"},
            {"name": "Closed"},
        ]},
    },
]

# Leases includes a link to Locations; the locationsTableId must be
# injected at runtime because Locations may not exist yet on first run.
def leases_fields(locations_table_id: str):
    return [
        {"name": "Lease ID", "type": "singleLineText"},
        {
            "name": "Location",
            "type": "multipleRecordLinks",
            "options": {"linkedTableId": locations_table_id},
        },
        {"name": "Landlord", "type": "singleLineText"},
        {"name": "Landlord Contact", "type": "singleLineText"},
        {"name": "Execution Date", "type": "date", "options": {"dateFormat": {"name": "iso"}}},
        {"name": "Commencement Date", "type": "date", "options": {"dateFormat": {"name": "iso"}}},
        {"name": "Expiration Date", "type": "date", "options": {"dateFormat": {"name": "iso"}}},
        {"name": "Term Years", "type": "number", "options": {"precision": 0}},
        {
            "name": "Status",
            "type": "singleSelect",
            "options": {"choices": [
                {"name": "Active"},
                {"name": "Expiring Soon"},
                {"name": "Expired"},
                {"name": "On Holdover"},
            ]},
        },
        {"name": "Monthly Rent", "type": "currency", "options": {"precision": 2, "symbol": "$"}},
        {"name": "Annual Rent", "type": "currency", "options": {"precision": 2, "symbol": "$"}},
        {"name": "Rent Escalator", "type": "percent", "options": {"precision": 2}},
        {"name": "Security Deposit", "type": "currency", "options": {"precision": 2, "symbol": "$"}},
        {"name": "Renewal Options", "type": "singleLineText"},
        {"name": "Notes", "type": "multilineText"},
    ]

FA_TRACKER_EXTRA_FIELDS = [
    {"name": "Royalty Rate", "type": "percent", "options": {"precision": 2}},
    {"name": "Ad Fund Rate", "type": "percent", "options": {"precision": 2}},
    {"name": "Notes", "type": "multilineText"},
]


# --- HTTP helpers ------------------------------------------------------------

class Http:
    def __init__(self, token: str, plan: bool):
        self.token = token
        self.plan = plan

    def _headers(self):
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }

    def get(self, url: str):
        req = urllib.request.Request(url, headers=self._headers(), method="GET")
        with urllib.request.urlopen(req) as res:
            return json.loads(res.read())

    def post(self, url: str, body: dict):
        payload = json.dumps(body, indent=2)
        if self.plan:
            print(f"[DRY-RUN] POST {url}\n{payload}\n")
            return {"__dry_run__": True}
        req = urllib.request.Request(url, data=payload.encode(), headers=self._headers(), method="POST")
        try:
            with urllib.request.urlopen(req) as res:
                return json.loads(res.read())
        except urllib.error.HTTPError as e:
            sys.stderr.write(f"POST {url} failed: {e.code}\n{e.read().decode()}\n")
            raise

    def patch(self, url: str, body: dict):
        payload = json.dumps(body, indent=2)
        if self.plan:
            print(f"[DRY-RUN] PATCH {url}\n{payload}\n")
            return {"__dry_run__": True}
        req = urllib.request.Request(url, data=payload.encode(), headers=self._headers(), method="PATCH")
        with urllib.request.urlopen(req) as res:
            return json.loads(res.read())


# --- Schema ops --------------------------------------------------------------

def fetch_base_tables(http: Http):
    data = http.get(META_URL)
    return data.get("tables", [])

def find_table(tables, name: str):
    for t in tables:
        if t["name"].lower() == name.lower():
            return t
    return None

def ensure_table(http: Http, tables, name: str, description: str, fields: list):
    existing = find_table(tables, name)
    if existing:
        print(f"  = table '{name}' already exists (id={existing['id']})")
        return existing
    print(f"  + creating table '{name}' with {len(fields)} fields")
    res = http.post(META_URL, {
        "name": name, "description": description, "fields": fields
    })
    if res.get("__dry_run__"):
        return {"id": f"tblPLAN_{name.upper().replace(' ', '_')}", "name": name, "fields": fields}
    print(f"    -> id={res['id']}")
    return res

def ensure_field(http: Http, table_id: str, existing_fields: list, field_spec: dict):
    for f in existing_fields:
        if f["name"].lower() == field_spec["name"].lower():
            print(f"    = field '{field_spec['name']}' already exists on {table_id}")
            return f
    print(f"    + adding field '{field_spec['name']}' ({field_spec['type']}) to {table_id}")
    url = f"{META_URL}/{table_id}/fields"
    res = http.post(url, field_spec)
    return res


# --- index.html patcher ------------------------------------------------------

def patch_index_html(path: str, locations_id: str, leases_id: str):
    with open(path, "r", encoding="utf-8") as f:
        html = f.read()

    # Insert locations/leases into TABLES const. Strategy: find faTracker line,
    # append the two keys after it, preserving indentation and comma style.
    marker = "faTracker:"
    if marker not in html:
        raise SystemExit("patch-html: could not find 'faTracker:' in index.html")

    # Normalize so the TABLES block ends with comma after faTracker before adding.
    html = html.replace(
        "faTracker:  'tblXDzGFIOywREmfA'\n};",
        (
            "faTracker:  'tblXDzGFIOywREmfA',\n"
            f"  locations:  '{locations_id}',\n"
            f"  leases:     '{leases_id}'\n"
            "};"
        ),
        1,
    )

    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"patched {path}: TABLES now includes locations + leases")


# --- main --------------------------------------------------------------------

def main():
    p = argparse.ArgumentParser()
    mode = p.add_mutually_exclusive_group(required=True)
    mode.add_argument("--plan", action="store_true", help="dry-run: print intended requests only")
    mode.add_argument("--apply", action="store_true", help="execute real API calls")
    p.add_argument("--patch-html", metavar="PATH", help="after apply, rewrite this index.html to embed new table IDs")
    args = p.parse_args()

    token = os.environ.get("AIRTABLE_TOKEN")
    if not token:
        sys.exit("AIRTABLE_TOKEN not set.")

    http = Http(token=token, plan=args.plan)

    print(f"Fetching existing schema for {BASE_ID}...")
    tables = fetch_base_tables(http)
    print(f"  base currently has {len(tables)} tables: " + ", ".join(t["name"] for t in tables))
    print()

    # 1. Locations
    locations = ensure_table(
        http, tables, "Locations",
        "Shop registry. Feeds the LOCATIONS attorney dashboard.",
        LOCATIONS_FIELDS,
    )

    # 2. Leases (depends on Locations id)
    locations_id = locations["id"]
    leases = ensure_table(
        http, tables, "Leases",
        "Lease agreements. Linked to Locations. Feeds the LOCATIONS dashboard lease drill-down.",
        leases_fields(locations_id),
    )
    leases_id = leases["id"]

    # 3. FA Tracker extra fields
    fa = next((t for t in tables if t["id"] == FA_TRACKER_ID), None)
    if fa is None:
        print(f"  ! FA Tracker {FA_TRACKER_ID} not found in base; skipping field adds")
    else:
        print(f"  = FA Tracker present (id={FA_TRACKER_ID}); diffing fields")
        for spec in FA_TRACKER_EXTRA_FIELDS:
            ensure_field(http, FA_TRACKER_ID, fa["fields"], spec)

    print()
    print("Summary:")
    print(f"  TABLES.locations = '{locations_id}'")
    print(f"  TABLES.leases    = '{leases_id}'")

    if args.patch_html and not args.plan:
        patch_index_html(args.patch_html, locations_id, leases_id)
    elif args.patch_html and args.plan:
        print("  (--patch-html ignored in --plan mode)")


if __name__ == "__main__":
    main()
