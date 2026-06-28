# Figgy — Master Testing Grid

The single checklist we work through **in order, one item at a time**. No squirreling.

## Process rules (Claude must follow these — every item, every time)
1. **One item at a time.** Test it → if broken, fix it → re-test → mark it ✅ → only then move on.
2. **Regression rule.** If a fix touches an area already marked ✅, re-test **both** before moving to the next item.
3. **Run before ship.** Any change touching the DB or an endpoint gets run against a real (in-memory) DB in a test BEFORE it's pushed — not just typechecked.
4. **Verify live state, don't guess.** Check the actual code / data / Gmail / build number before claiming anything.
5. **Test client = Alderson only.** Don't reconnect other clients.
6. **Deploy:** every fix → PR + merge to `main` → confirm Railway flips the build number before testing.

**Status legend:** ⬜ not tested · 🟡 in progress · ✅ pass (live-verified) · 🔧 fixed, awaiting Markie's live re-test · ❌ broken · ⏭️ deferred

---

## AREA 1 — CLIENT FOUNDATION (everything hangs off this)
| Item | How to test | Touches | Status |
|---|---|---|---|
| 1.1 Client list is real (no test/demo rows) | Open Clients → confirm count = real clients; no "E2E Test Co", "Dock Kings", etc. | duplicate detector, email match | ❌ test data mixed in |
| 1.2 Client emails are real (not `@example.com`) | Open a client → Edit → Email field is the real address | Gmail match, send | ❌ seeded fake/shared |
| 1.3 Client contacts (multiple real people) populated | Client card → contacts list shows real addresses (e.g. Alderson → rocco@ovitaconstruction.com) | Gmail match | ❌ empty / fake |
| 1.4 Triage email = real `+code` per client | Card shows the real triage addr (e.g. `markie+cpos@gofig.ca`), not auto-generated `+clarkpoolsownsound` | Fig posting lane | ❌ auto-generated wrong |
| 1.5 Intake = the card (edit in place) | Edit any field on the card and it saves | all client data | ⬜ |
| 1.6 Card layout: Overview/Tasks/Financials/Billing at top | Order under client info; collapsible sections | UI only | ⬜ not done |
| 1.7 Duplicate detector accurate | Clients → duplicates: no false "Same email" from shared placeholders | 1.2 | ❌ false positives from fake emails |

## AREA 2 — GOOGLE / EMAIL / COMMS
| Item | How to test | Touches | Status |
|---|---|---|---|
| 2.1 Google connection stays connected | Integrations shows Google connected; no weekly drop | calendar, gmail, tasks | ✅ (Production status set) |
| 2.2 Calendar sync (events pull in) | Add a Google event → open Calendar → Sync → it appears | 2.1 | ✅ Markie confirmed |
| 2.3 Google Tasks sync | Add a Google task → appears in Tasks | 2.1 | ⬜ |
| 2.4 Gmail auto-sync + visible status | Open Emails → auto-syncs; "pulled N · skipped M" shows | 2.1, 1.2/1.3 | 🔧 .246/.247, re-test |
| 2.5 Send an email | Compose → Send → goes out (verified in Gmail) | 2.1 | 🔧 fixed .248 (lastContactedAt) |
| 2.6 Received client email shows on inbox + client card | Real client emails appear (both sent + received) | 1.2, 1.3 | ❌ blocked on real emails |
| 2.7 Contact harvester (pull real emails from Gmail) | Client card → Contacts → "Find from Gmail" → suggests real addrs → save | 1.3, 2.6 | 🔧 built .251 (core+DB tested, live-Gmail validated) — Markie live re-test on Alderson |
| 2.8 Triage `+code` mail routes to Fig posting (NOT inbox) | Mail to `markie+cpos@` → shows in Fig's posting area, not inbox | 1.4, receipts | ⬜ to build (separate pipeline) |
| 2.9 Reply to a client email (threaded) | Reply on a client email → sends, threads correctly | 2.5 | ⬜ |
| 2.10 AI agents can read email (Liv) | Ask Liv about an email → it can read it | 2.1 | ⬜ |

## AREA 3 — QBO / DATA PIPE (per client)
| Item | How to test | Touches | Status |
|---|---|---|---|
| 3.1 Alderson QBO connection returns data | Cash position "Check now" returns balances | bridge | ❌ Make "FIGGY QBO API Alderson" scenario erroring |
| 3.2 Make bridge (read) not erroring | No "🛑 error in FIGGY QBO ... Alderson" emails | 3.1 | ❌ erroring 14×/5min |
| 3.3 Vendor brain coding suggestions | Triage → "Get Figgy's suggestions" returns coded results | 3.1 | ⬜ |
| 3.4 Cash position card | Overview → Check now → balances, payroll check, transfer flag | 3.1 | ⬜ (blocked on 3.1) |

## AREA 4 — HST / COMPLIANCE (Markie priority #2)
| Item | How to test | Touches | Status |
|---|---|---|---|
| 4.1 Pre-HST review pulls exception-report numbers | Paste/pull QBO tax report → collected/ITC/net | 3.1 | ❌ to redo (exception-report method) |
| 4.2 HST account balance cross-check | net tax == HST account balance at period end | 4.1 | 🔧 core built (reconcileHstException), not wired |
| 4.3 Wrong-code / missing-code exceptions surface | Review flags mis-coded taxable lines | 3.1 | 🔧 logic built, needs live data |
| 4.4 Inter-company recharge (Alderson → Ovita) correct | Compliance tab → recharge → invoice+bill tie, right total | 3.1, 4.1 | ❌ wrong total ($89k/$10k) |
| 4.5 Recharge panel visible on Alderson | Compliance tab shows the recharge panel | — | ✅ fixed (gate on hasRecharge) |

## AREA 5 — PAYROLL
| Item | How to test | Touches | Status |
|---|---|---|---|
| 5.1 Employee card edit/save | Edit employee → Save persists | schema | ⬜ |
| 5.2 Pay run | Create/run a pay run | 5.1 | ⬜ |
| 5.3 Banked hours ledger | Add/redeem banked hours | — | ⬜ |
| 5.4 Payroll reminders land on correct day | Reminder dates anchored right | calendar | ⬜ |

## AREA 6 — BOOKKEEPING TOOLS
| Item | How to test | Touches | Status |
|---|---|---|---|
| 6.1 Bank → QBO converter | Upload statement → mapped output | — | ⬜ |
| 6.2 Recon matcher | Run a match | — | ⬜ |
| 6.3 Chart of Accounts cleanup (export/marry/template/tie-out) | Run each mode on a connected client | 3.1 | ⬜ (blocked on 3.1) |
| 6.4 Drive cleanup (dedup) | Scan → dup groups → trash (reversible) | Google Drive scope | ⬜ |
| 6.5 Cash Book (micro-clients) | Add entries → HST worksheet | — | ⬜ |
| 6.6 PDF splitter | Split a multi-receipt PDF | — | ⬜ |

## AREA 7 — REV REC / WIP (client-specific)
| Item | How to test | Touches | Status |
|---|---|---|---|
| 7.1 Add project + progress + schedule | Rev Rec tab → add job → enter %/billings → schedule | — | ⬜ |
| 7.2 Holdback split | holdback % → holdback receivable shown | — | 🔧 built, verify |
| 7.3 Job costing / cost-to-cost % + over-budget | enter cost → cost-to-cost %, over-budget flag | — | 🔧 built, verify |
| 7.4 Draft JE generation | Generate JE → balanced accrual + reversal | account map | ⬜ |

## AREA 8 — AGENTS / ASSISTANT
| Item | How to test | Touches | Status |
|---|---|---|---|
| 8.1 Assistant responds (Ask Figs) | Ask a question → real answer | 2.10 | ⬜ |
| 8.2 Agent routing (Hey Sage/Wren/etc.) | Name an agent → it answers in voice | — | ⬜ |
| 8.3 Chatbot tools (add_task, agenda, firm_status…) | Ask it to add a task → it does | tasks | ⬜ |
| 8.4 System Health (Jinx) | /system-health loads, grades ok/warn/fail | many | ⬜ |

## AREA 9 — CRM CORE
| Item | How to test | Touches | Status |
|---|---|---|---|
| 9.1 Dashboard loads | / shows real numbers | many | ⬜ |
| 9.2 Tasks (list/create/complete) | Add a task → completes | calendar | ⬜ |
| 9.3 Calendar (events + tasks render, drag) | Calendar shows both | 2.2/2.3 | ⬜ |
| 9.4 Leads | Leads page works | — | ⬜ |
| 9.5 Invoices | Invoices page works | — | ⬜ |
| 9.6 Triage (agent findings) | Triage tabs populate | agentWebhook | ⬜ |

## AREA 10 — CLIENT-FACING / SHARE
| Item | How to test | Touches | Status |
|---|---|---|---|
| 10.1 Onboarding / intake form | /onboarding/:token works | client create | ⬜ |
| 10.2 Engagement letters | Generate a letter | — | ⬜ |
| 10.3 Share pages (revrec/banked/billback/loan/group) | Open a share link → branded read-only | letterhead | ⬜ |
| 10.4 Client portal | /portal/:token works | — | ⬜ |

## AREA 11 — PERSONAL (Phoenix Rising / My Life) — private
| Item | How to test | Touches | Status |
|---|---|---|---|
| 11.1 My Life sections load | /my-life → health/family/estate/side-sales | — | ⬜ |
| 11.2 Photo cleanup link | → Drive cleanup with personal account | 6.4 | ⬜ |

---

## Working order (current)
Per Markie: **Area 2 (Google/Email)** is being finished first, but it's blocked by **Area 1 (real client emails/contacts)** — so the true first build is **2.7 contact harvester → 1.2/1.3 real emails on cards → 2.6 received mail shows**. Then **Area 4 (HST)**. Then **Area 1.5–1.7 (card cleanup)**. Then down the grid.

**Next action:** build 2.7 (contact harvester) + populate Alderson's real contacts, prove 2.6 on Alderson with a real-DB test, mark ✅, then re-check 2.4/2.5 (touched) before moving on.
