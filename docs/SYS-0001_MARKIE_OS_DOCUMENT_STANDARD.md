# SYS-0001 — Markie OS Document Management Standard

| | |
|---|---|
| **Document ID** | SYS-0001 |
| **Title** | Markie OS Document Management Standard |
| **Project** | Markie OS (cross-entity) |
| **Area** | System Standards |
| **Version** | 1.0 (Approved) |
| **Status** | Approved |
| **Owner** | Markie (Partner) — maintained by Liv |
| **Created** | 2026-06-25 |
| **Last Updated** | 2026-06-25 |
| **Keywords** | filing, taxonomy, document ID, index, metadata, Markie OS |
| **Summary** | The single filing, naming, numbering, and organization standard for every document across all of Markie's entities and personal projects. |
| **Source** | Adapted from ChatGPT "SYS-0001 v1.0 draft" → fitted to Markie's real entities. |

---

## Purpose

One organized source of truth. Every document — wherever it came from (ChatGPT,
Claude, Gemini, email, Google Docs, CRM, an AI agent, or made by hand) — gets a
permanent ID, lands in the right folder, and is findable through one master
index. This is the foundation of **Markie OS**.

> **The index is the source of truth, not the folders.** Folders are just where
> files rest. Find things through the index; the folder layout stays shallow on
> purpose (Markie hates folder sprawl — the ID prefix does the organizing).

---

## 1. Master Folder Structure

Six headers under one root. Each header has the subheaders relevant to it.

```
📁 Markie OS                                    [SYS- standards live at root]
│
├── 📁 GoFIG                                    [GF-]
│   ├── 📁 Clients – Financials   🔒 UNTOUCHED — Liv files client docs in here,
│   │                                            nobody moves/reorganizes these
│   └── 📁 Firm
│       ├── Incorporation & Legal
│       ├── Firm Finances
│       ├── Marketing & Brand
│       ├── SOPs & Processes
│       └── Subscriptions & Tools
│
├── 📁 Phoenix Rising                           [PR-]   (personal)
│   ├── Travel
│   ├── Health & Medical
│   ├── Family
│   ├── Home & Property
│   ├── Personal Finance
│   └── Personal Legal (will · estate · insurance)
│
├── 📁 Living Labs *                            [PLL-]  (* name TBD — Markie's call)
│   ├── Mission & Strategy
│   ├── Product / R&D
│   ├── Manufacturing & Outreach
│   ├── Finances
│   ├── Legal & IP
│   └── Marketing
│
├── 📁 Figgy                                    [FIG-]  (the AI system + the build)
│   ├── Agents            (each agent's brain · skills · memory)
│   ├── Build & Notes     (specs · designs · session work)
│   ├── Client Master     (the index · per-client SOPs · workflow notes — NOT financials)
│   └── Standards & Index (SYS docs + the master index)
│
├── 📁 Shared
│   ├── Templates         [TMP-]
│   ├── Legal             [LEG-]
│   ├── Finance           [FIN-]
│   ├── Research          [RES-]
│   └── Media             [MED-]
│
└── 📁 Archive            (mirrors the headers — retired docs; nothing is deleted)
```

**The line between GoFIG and Figgy:**
- **GoFIG** = the *business* — the books, the money, the firm itself.
- **Figgy** = the *system that runs the business* — the AI agents, the build, and
  the **operational** master client docs. A client's actual financials NEVER
  leave their 🔒 folder.

**Liv is the librarian, not a folder.** She reads what you send and files it:
client doc → that client's finance folder 🔒 · personal → Phoenix Rising · build
note → Figgy. The agents themselves live under **Figgy → Agents**.

---

## 2. Permanent Document IDs

Every document gets a permanent ID: `PREFIX-NNNN`.

| Prefix | Belongs to | Example |
|---|---|---|
| `SYS-` | Markie OS standards (root) | `SYS-0001 Document Standard` |
| `GF-`  | GoFIG / Firm | `GF-0021 Monthly Close SOP` |
| `PR-`  | Phoenix Rising (personal) | `PR-0010 2027 Travel Plan` |
| `PLL-` | Living Labs | `PLL-0004 Manufacturer Outreach` |
| `FIG-` | Figgy (AI + build) | `FIG-0007 Agent Roster` |
| `TMP-` | Shared / Templates | `TMP-0003 Engagement Letter` |
| `LEG-` | Shared / Legal | `LEG-0002 NDA` |
| `FIN-` | Shared / Finance | `FIN-0005 Personal Budget` |
| `RES-` | Shared / Research | `RES-0009 Market Scan` |
| `MED-` | Shared / Media | `MED-0001 Brand Assets` |

Rules: IDs are **never reused**, **never change**, and a deleted ID stays
**retired**. Entity-specific docs take the entity prefix; the area prefixes
(`FIN/LEG/RES/TMP/MED`) are only for firm-wide / cross-entity docs.

---

## 3. Required Metadata (every document)

Document ID · Title · Project · Area · Version · Status · Owner · Created Date ·
Last Updated · Keywords · Summary · Source.

> **Markie only ever provides Title + Project (+ optional one-line summary).**
> Liv auto-fills the other ~9 fields (ID, dates, version, status, owner, source).
> Zero-friction by design.

---

## 4. Status Values

`Draft` · `In Progress` · `Review` · `Approved` · `Archived` · `Superseded`

---

## 5. Version Control

- `0.x` = working draft
- `1.0` = approved
- `2.0` = major revision
- minor edits bump the decimal (`1.0 → 1.1`)
- previous versions are **never overwritten** — superseded versions move to Archive.

---

## 6. Filing Rules (what Liv does automatically)

1. Identify the project/entity.
2. Assign the next Document ID for that prefix.
3. Apply the metadata block.
4. Store the file in the right folder (client docs → the client's finance folder).
5. Update the master index.
6. Cross-reference related documents.
7. Never overwrite a previous version.

---

## 7. Master Index

A searchable index — **the source of truth** — lives in `Figgy → Standards &
Index`, mirrored to a Google Sheet for backup. Columns:

Document ID · Title · Folder Location · Status · Version · Owner · Keywords ·
Related Documents · Last Updated.

---

## 8. AI Standards (every agent)

- Read existing documents before creating new ones.
- Reference Document IDs whenever possible.
- Avoid duplicates — suggest updating an existing doc instead of cloning.
- Preserve version history.

---

## 9. Naming Convention

`Document ID - Title` → e.g. `GF-0021 Monthly Close SOP`, `PR-0010 2027 Travel Plan`.

---

## 10. Cleanup / Migration Rule

When adopting this standard for existing material:
- **Inventory first** — produce a plain list of what exists (Drive folders,
  sheets, Make scenarios, CRM data), flagged current vs stale, for Markie's
  yes/no **before** anything moves.
- **Archive, never delete** — stale items get status `Archived` and move to the
  `Archive` header. Always recoverable.
- **🔒 Client financial folders are off-limits** — never moved, never
  reorganized, by anyone.

---

## 11. Open Decisions

- **Living Labs name** — TBD (Markie's call; taste/brand). Once Markie says what
  it does, propose options.
- **Materialize folders** — creating the actual Google Drive folders needs Drive
  reachable + Markie's confirmed root location. Pending.

---

*This document is the foundation of Markie OS and will evolve as the system grows.*
