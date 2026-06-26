# SYS-0002 — Client File-Folder & Naming Standard (DRAFT for Markie's approval)

> **Status:** DRAFT — proposed structure. **Nothing gets migrated until Markie approves the taxonomy.**
> **Companion to:** SYS-0001 (Markie OS personal filing). This one covers CLIENT files in Google Drive (+ the Ovita/Rocco Dropbox).
> **Why:** Liv's 2026-06-26 Drive audit found the same client folders duplicated across multiple parents, client-coded names (author pseudonyms), and critical files owned by clients rather than Markie. This standard makes every client folder consistent, owned, and predictable so any agent (or a future bookkeeper) can find anything.

## 1. One folder per client, one place
- Each client gets **exactly one** top-level folder under a single `Clients/` root — no duplicates scattered around. (Audit found e.g. multiple "Adbank", "Ovita", "John Steinbeck" folders.)
- Folder name = the client's **real legal/display name** (keep the codename as an alias note inside, if used). Decide with Markie whether to keep the author-name pseudonyms or switch to real names.

## 2. Standard sub-folder taxonomy (every client, same shape)
```
<Client Name>/
  00 - Permanent (incorporation, BN/RT#s, engagement letter, IDs, void cheques)
  01 - Source Docs/
        Bank Statements/   (by YYYY)
        Credit Card/       (by YYYY)
        Receipts & Bills/  (by YYYY)
  02 - Payroll/            (registers, T4/T4A, ROEs, by year)
  03 - HST-GST/            (returns + workpapers, by period)
  04 - Year-End/           (financials, T2, adjusting entries, by FY)
  05 - Tax (T1/personal)/  (only if applicable)
  06 - Correspondence/     (signed docs, client comms, CRA letters)
  99 - Archive/            (superseded / old)
```
Clients that don't need a section (e.g. no payroll) simply omit it.

## 3. File-naming convention
`YYYY-MM-DD <Client short code> <Type> <detail>.<ext>` — date-first so everything sorts chronologically.
- Examples: `2026-05-31 OVH HST Return Q2.pdf`, `2026-06-15 ADB Bank Statement RBC.pdf`, `2025-12-31 ALD Year-End Financials.pdf`.
- Short codes: a 3-letter client code (ADB=Adbank, OVH=Ovita Holdings, OVC=Ovita Construction, ALD=Alderson, …) — Markie confirms the code list.

## 4. Ownership rule (from the audit — important)
- **Markie must OWN** every file he depends on for a client. The audit found critical files (payroll, P&L, burn rate, cap tables) owned by client accounts (finance@adbank.network, jonhaver11@gmail.com, gillham08@gmail.com, jon@clarkpoolscollingwood.com). If a client revokes access, those vanish.
- For each at-risk file: **make Markie's own copy** into the client's `01 - Source Docs` (or relevant) folder, or request ownership transfer. Track in task #71.

## 5. Dropbox (Ovita / Rocco group)
- Assess separately (task #72). Either migrate it into the same Drive taxonomy, or mirror the same sub-folder shape inside Dropbox so the structure is identical wherever the files live. Decide with Markie.

## 6. Migration plan (only after approval) — done while Markie sleeps, in waves
1. Build the `Clients/` root + one canonical folder per active client with the taxonomy above (empty).
2. Move existing files into the right sub-folders; collapse duplicate client folders into the canonical one; send superseded copies to `99 - Archive`.
3. Rename files to the convention as they're moved (don't bulk-rename blindly — log every move).
4. Make Markie-owned copies of the at-risk client-owned files.
5. Produce a move-log so nothing is lost and every change is reversible (per the Engineering Standard: no silent caps, preserve auditability).

## Open questions for Markie (before migration)
- Keep the author-pseudonym client names, or switch to real names?
- Confirm the 3-letter client code list.
- Drive-only, or keep the Ovita/Rocco Dropbox as a mirror?
- OK to make owned copies of the client-owned critical files (#71)?
