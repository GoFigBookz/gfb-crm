# Vendor & customer card cleanup — cleaner QBO books (BACKLOG)

Markie (2026-06-27): the QuickBooks company files are messy. Wants Fig to enrich vendor
(and selected customer) cards across the companies so the books are cleaner / more
detailed — pulling data and pushing it back to QBO, ideally as a by-product of posting.

## 1. Vendors — ALL companies
Goal: every vendor card complete + correctly coded.
- **As Fig posts bills/expenses** (or on a sweep), enrich the QBO **Vendor card**:
  - Contact details that ARE writable on the QBO vendor: **address, email, phone**,
    website, terms — pulled from the bill/document (or web lookup as a fallback).
  - **The "proper account" (default coding):** QBO's Vendor entity has **no native
    default-account/tax field** (confirmed in CLAUDE.md), so the coding lives in Figgy's
    **`vendorMemory`** brain, keyed by `(connectionId, vendorId)`. "Update the vendor with
    the right account" = make sure vendorMemory holds the correct default account + tax
    code per vendor, and the brain applies it on every post. So this is two parts:
    1. **QBO write-back:** address/contact fields → the vendor card.
    2. **Figgy memory:** confirmed default account/tax → `vendorMemory` (drives coding).
- Source of truth for the address/contact: the actual bill/invoice document Fig is
  posting (best), else a web lookup (the cold-start classifier already does web lookups).
- Respect golden rules: human-review gate, never invent an account, per-client isolation
  (one connection per realm — never cross-pollinate vendors between companies).

## 2. Customers — REGULAR companies only (NOT the digital ones)
Same idea for customer cards, BUT scoped:
- **EXCLUDE any company that has a Stripe OR PayPal connector** — those have huge
  auto-generated customer lists (too many to clean, not worth it).
- **INCLUDE the rest** ("regular" companies) — clean up + complete their customer cards
  in QBO (address, contact, terms).
- Gate at the company level: `if client has stripe OR paypal connection → skip customer
  cleanup`. Vendors are still cleaned for everyone.

## Build sketch (when un-backlogged)
1. A **vendor-enrichment pass**: on post (and/or a manual "clean this company's vendors"
   sweep), diff the QBO vendor card vs the document → propose address/contact updates
   (review-gated) → write back; confirm/seed `vendorMemory` default coding.
2. A **customer-enrichment pass**: same, gated to companies WITHOUT stripe/paypal.
3. Surface as a **Tool on the client Workspace** ("Clean vendor cards" / "Clean customer
   cards") + run opportunistically during posting so it self-heals over time.
4. Audit every write (what/when/why) — these touch client books.

Effort: medium. Reuses the vendor brain + the QBO write path (contact write-back already
exists per CLAUDE.md). The customer side is new but small.
