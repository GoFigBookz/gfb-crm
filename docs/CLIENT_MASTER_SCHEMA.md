# Client Master Schema — one intake, one source of truth

**Status:** design locked 2026-06-15 (Markie). Supersedes ad-hoc per-system client
fields. This is the contract every agent maps to.

## Decisions (locked)
- **Flow:** `Master Intake Sheet → CRM` (one-way for reference data). The CRM
  `clients` record is the **system of record**. Agents read the CRM; agents
  **never** write reference fields back to the sheet.
- **Key:** the **CRA Business Number (BN9, 9 digits)** is the unique upsert key.
  Clients with no BN (US / holding cos) get a stable **slug** (`unimax-usa`,
  `dock-kings`, …). The sync UPSERTs on this key, so re-runs can **never**
  create a duplicate (this is what caused the 99→32 cleanup).
- **One read path:** every agent reads a client via the CRM, not its own copy.

```
  Master Intake Sheet  (humans enter/edit a client + all info, once)
        │   scheduled UPSERT keyed on BN9 / slug  (one-way)
        ▼
  CRM `clients` (+ `clientVault`)   ← single source of truth
        │   GET client profile by key
   ┌────┼─────────┬───────────────┐
   ▼    ▼         ▼               ▼
 Figgy Deadline  Intake/       other
 coding agent    routing       agents
```

## Ownership rule
- **Sheet-owned (one-way in):** identity, CRA accounts, filing cadences,
  year-end, processors, folders, team lead, triage email. Edit these in the
  sheet only.
- **Agent/CRM-owned (never touch the sheet):** codings, findings, tasks,
  statuses, learned vendor rules, onboarding progress. These live in the CRM.

This split is why we don't need two-way sync: reference data flows one way in,
operational data is born and stays in the CRM.

## Canonical key
- `clients.clientKey` (new) = normalized **BN9** (digits only) when present,
  else an assigned **slug**. Unique. This is the identity used by the sync and
  by every agent lookup.
- `clients.taxId` continues to hold the displayed BN9; `clientKey` is the
  match/upsert key derived from it.

## Field map — Sheet column → CRM field
| Master sheet column | CRM field (`clients` unless noted) | Owner | Consumers |
|---|---|---|---|
| Legal name (+ trade name) | `name` / `company` | sheet | all |
| CRA Business # | `taxId`, `clientKey` (BN9) | sheet | Figgy, deadline |
| HST filing freq | `hasHST`, `hstPeriod`, `hstNumber` (`BN+RT0001`) | sheet | deadline |
| Payroll freq | `hasPayroll`, `payrollFrequency`, `payrollRpNumber` (`BN+RP0001`) | sheet | deadline, payroll |
| WSIB account | `hasWSIB`, `wsibAccountNumber`, `wsibQuarter` | sheet | deadline |
| T2 year-end date | `yearEndMonth` | sheet | deadline, T2 |
| Team lead | `assignedTo` | sheet | routing |
| Triage email | `figgyEmail` | sheet | Figgy intake |
| Drive folder | `driveFolderUrl` | sheet | Figgy, intake |
| Client info doc | `clientInfoDocUrl` | sheet | all (context) |
| Stripe/PayPal/Wise/Jobber/TouchBistro | `clientVault.otherSoftwareLogins` (JSON) | sheet | recon |
| QBO realm/connection | `qboConnectionId` (set by bridge bootstrap, not sheet) | CRM | Figgy |

## Consolidate the three schemas
Today a client's data is split across `clients`, `client_onboarding`
(`businessNumber`/`craBusinessNumber`/`hstGstNumber`/…), and the sheet. Target:
- `clients` is canonical.
- `client_onboarding` stays as the **client-facing intake form**, but on submit
  it writes through to `clients` keyed on `clientKey` (same upsert path as the
  sheet) — it is just another intake surface, not a second source of truth.
- The master sheet is the **internal** intake surface for the same record.

## Build sequence
1. **(this doc)** lock schema + key + flow.
2. Add `clients.clientKey` (BN9 / slug), unique; backfill from `taxId`.
3. Convert `import-client-master.ts` matching from **name** → **BN9/slug**
   upsert (prevents re-duplication; name becomes fallback only).
4. Promote the embedded snapshot to a **scheduled sheet→CRM sync** (Make
   `figgy_add_client_to_master` / Sheets API) that upserts on `clientKey`.
5. One **client-profile read** the brain + every agent calls; point
   `getConnectionForClient` / Figgy context at it.
6. New client = one new sheet row (or onboarding submit) → auto-creates the
   CRM client, vault, QBO-connect link, Drive folder.
