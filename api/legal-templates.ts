/**
 * LEGAL / ESTATE DOCUMENT TEMPLATES — pure, deterministic (Markie 2026-06-27: "I
 * need the actual documents… pulled from templates, I populate, make changes, Q&A").
 * =============================================================================
 * Personal (Markie's) estate planning. Guided Q&A → fill a fixed template → a DRAFT
 * he edits + takes to a lawyer + executes properly. DETERMINISTIC fill only — no AI
 * inventing legal clauses (accuracy + no hallucination on legal language).
 *
 * ⚠ NOT LEGAL ADVICE. These are working drafts, not executed instruments. Ontario
 * execution requirements (testator signs + TWO witnesses present together, witnesses
 * not beneficiaries/spouses-of; POAs likewise) are stated in each document's signing
 * block. Always have a lawyer review before signing.
 * Scope: Ontario, Canada (Markie's jurisdiction).
 * =============================================================================
 */
export type FieldType = "text" | "textarea" | "lines";
export interface LegalField { key: string; label: string; type: FieldType; placeholder?: string; help?: string }
export interface LegalDocSpec {
  type: string; title: string; blurb: string; fields: LegalField[];
  generate: (a: Record<string, string>) => string;
}

const v = (a: Record<string, string>, k: string, fallback = "____________________") => (a[k] && a[k].trim()) ? a[k].trim() : fallback;
const lines = (a: Record<string, string>, k: string) => (a[k] || "").split("\n").map((s) => s.trim()).filter(Boolean);
const today = () => new Date().toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
const DISCLAIMER = "⚠ DRAFT — NOT LEGAL ADVICE. This is a working document generated from your answers. It is NOT a valid legal instrument until reviewed by a lawyer and properly signed and witnessed per Ontario law. Do not rely on it as-is.";

const witnessBlock = (who: string) =>
`\n\n— — — SIGNING (Ontario) — — —
Signed by ${who} on ______________________, in the presence of both witnesses below, who were present at the same time.

${who}: _______________________________   Date: ____________

Witness 1 (not a beneficiary or their spouse): __________________________  Print: ______________  Address: ______________
Witness 2 (not a beneficiary or their spouse): __________________________  Print: ______________  Address: ______________`;

export const LEGAL_DOCS: LegalDocSpec[] = [
  {
    type: "will",
    title: "Last Will & Testament",
    blurb: "Who gets what, who's in charge (executor), and who cares for minor children.",
    fields: [
      { key: "fullName", label: "Your full legal name", type: "text" },
      { key: "address", label: "Your address", type: "text" },
      { key: "executor", label: "Executor (full name + relationship)", type: "text", help: "The person who carries out your will." },
      { key: "altExecutor", label: "Alternate executor (if the first can't act)", type: "text" },
      { key: "spouse", label: "Spouse / partner (if any)", type: "text" },
      { key: "children", label: "Children (one per line)", type: "lines" },
      { key: "guardian", label: "Guardian for minor children (name + relationship)", type: "text" },
      { key: "bequests", label: "Specific gifts (one per line, e.g. 'My truck → my son John')", type: "lines" },
      { key: "residue", label: "Everything else (the residue) goes to…", type: "textarea", help: "e.g. 'split equally among my children' or a named person." },
      { key: "funeral", label: "Funeral / burial wishes (optional)", type: "textarea" },
    ],
    generate: (a) => {
      const kids = lines(a, "children");
      const beq = lines(a, "bequests");
      return [
        `LAST WILL AND TESTAMENT OF ${v(a, "fullName").toUpperCase()}`,
        `(${v(a, "address")}) — Ontario, Canada — ${today()}`,
        ``,
        DISCLAIMER, ``,
        `1. REVOCATION. I revoke all prior wills and codicils.`,
        `2. EXECUTOR. I appoint ${v(a, "executor")} as the Executor and Estate Trustee of this Will. If they are unable or unwilling to act, I appoint ${v(a, "altExecutor")} in their place.`,
        a.spouse?.trim() ? `3. SPOUSE. My spouse/partner is ${v(a, "spouse")}.` : ``,
        kids.length ? `4. CHILDREN. My children are: ${kids.join("; ")}.` : ``,
        a.guardian?.trim() ? `5. GUARDIAN. If any of my children are minors at my death, I appoint ${v(a, "guardian")} as their guardian.` : ``,
        beq.length ? `6. SPECIFIC GIFTS. I make the following gifts:\n${beq.map((b, i) => `   (${i + 1}) ${b}`).join("\n")}` : ``,
        `7. RESIDUE. I give all the rest and residue of my estate to: ${v(a, "residue")}.`,
        `8. EXECUTOR POWERS. My Executor may sell, invest, and distribute my estate, pay my debts, taxes, and funeral expenses, and do all things necessary to administer my estate.`,
        a.funeral?.trim() ? `9. FUNERAL WISHES. ${v(a, "funeral")}` : ``,
        `10. GOVERNING LAW. This Will is governed by the laws of Ontario.`,
        witnessBlock(v(a, "fullName")),
        ``,
        `NOTE: In Ontario a will must be signed by you and TWO witnesses, all present together; a witness (or their spouse) must NOT be a beneficiary. Have a lawyer review before signing.`,
      ].filter(Boolean).join("\n");
    },
  },
  {
    type: "poa_property",
    title: "Power of Attorney for Property",
    blurb: "Who manages your money/finances if you can't.",
    fields: [
      { key: "fullName", label: "Your full legal name", type: "text" },
      { key: "address", label: "Your address", type: "text" },
      { key: "attorney", label: "Attorney (who manages your property)", type: "text" },
      { key: "altAttorney", label: "Alternate attorney", type: "text" },
      { key: "effective", label: "When it takes effect", type: "text", placeholder: "immediately / only if I become incapable" },
      { key: "restrictions", label: "Any restrictions or instructions (optional)", type: "textarea" },
    ],
    generate: (a) => [
      `CONTINUING POWER OF ATTORNEY FOR PROPERTY`,
      `${v(a, "fullName").toUpperCase()} (${v(a, "address")}) — Ontario — ${today()}`, ``,
      DISCLAIMER, ``,
      `1. I, ${v(a, "fullName")}, appoint ${v(a, "attorney")} to be my attorney for property.`,
      `2. ALTERNATE. If they cannot act, I appoint ${v(a, "altAttorney")}.`,
      `3. AUTHORITY. My attorney may do anything on my behalf regarding my property that I could do if capable, except make a will.`,
      `4. EFFECTIVE. This power of attorney takes effect: ${v(a, "effective", "only if I become mentally incapable of managing property")}.`,
      `5. CONTINUING. This is a CONTINUING power of attorney under the Substitute Decisions Act (Ontario) and may be used if I become mentally incapable.`,
      a.restrictions?.trim() ? `6. INSTRUCTIONS. ${v(a, "restrictions")}` : ``,
      witnessBlock(v(a, "fullName")),
      ``, `NOTE: Requires two witnesses (your attorney, their spouse/partner, and your own spouse/children cannot witness). Have a lawyer review.`,
    ].filter(Boolean).join("\n"),
  },
  {
    type: "poa_care",
    title: "Power of Attorney for Personal Care (Living Will)",
    blurb: "Who makes health/care decisions and your wishes for end-of-life care.",
    fields: [
      { key: "fullName", label: "Your full legal name", type: "text" },
      { key: "attorney", label: "Attorney for personal care", type: "text" },
      { key: "altAttorney", label: "Alternate", type: "text" },
      { key: "lifeSupport", label: "Life support wishes", type: "textarea", placeholder: "e.g. no life support if no reasonable chance of recovery" },
      { key: "resuscitation", label: "Resuscitation (CPR) wishes", type: "text" },
      { key: "organDonation", label: "Organ donation wishes", type: "text" },
      { key: "comfort", label: "Comfort care / pain management wishes", type: "textarea" },
      { key: "other", label: "Other care instructions (optional)", type: "textarea" },
    ],
    generate: (a) => [
      `POWER OF ATTORNEY FOR PERSONAL CARE (with care wishes / "Living Will")`,
      `${v(a, "fullName").toUpperCase()} — Ontario — ${today()}`, ``,
      DISCLAIMER, ``,
      `1. I, ${v(a, "fullName")}, appoint ${v(a, "attorney")} to make personal care decisions (health, nutrition, shelter, safety) for me if I become incapable of making them myself.`,
      `2. ALTERNATE. If they cannot act, I appoint ${v(a, "altAttorney")}.`,
      `3. MY CARE WISHES (to guide my attorney and care team):`,
      `   • Life support: ${v(a, "lifeSupport")}`,
      `   • Resuscitation (CPR): ${v(a, "resuscitation")}`,
      `   • Organ donation: ${v(a, "organDonation")}`,
      `   • Comfort / pain management: ${v(a, "comfort")}`,
      a.other?.trim() ? `   • Other: ${v(a, "other")}` : ``,
      `4. These wishes express my values and are to guide decisions made on my behalf.`,
      witnessBlock(v(a, "fullName")),
      ``, `NOTE: Requires two witnesses (same exclusions as a property POA). Discuss your wishes with your attorney and doctor. Have a lawyer review.`,
    ].filter(Boolean).join("\n"),
  },
  {
    type: "business_succession",
    title: "Business Succession Directive (what happens to my company)",
    blurb: "What happens to your company/companies if you pass away.",
    fields: [
      { key: "fullName", label: "Your full legal name", type: "text" },
      { key: "companies", label: "Company / companies you own (one per line, with your % ownership)", type: "lines" },
      { key: "successor", label: "Who takes over / inherits the business", type: "textarea" },
      { key: "buyout", label: "Buy-sell / shareholder agreement (exists? where is it?)", type: "textarea" },
      { key: "advisors", label: "Key advisors (accountant, lawyer, banker — name + contact)", type: "lines" },
      { key: "clients", label: "What to do with clients / staff / Go Fig Bookz files", type: "textarea" },
      { key: "access", label: "Where the books, accounts, passwords, and key records are", type: "textarea" },
    ],
    generate: (a) => {
      const co = lines(a, "companies"); const adv = lines(a, "advisors");
      return [
        `BUSINESS SUCCESSION DIRECTIVE`,
        `${v(a, "fullName").toUpperCase()} — ${today()}`, ``,
        DISCLAIMER + " (A succession directive supports — but does not replace — your Will and any shareholder agreement.)", ``,
        co.length ? `1. BUSINESSES. I own:\n${co.map((c, i) => `   (${i + 1}) ${c}`).join("\n")}` : `1. BUSINESSES. ____________________`,
        `2. SUCCESSION. On my death or incapacity, my businesses should be handled as follows: ${v(a, "successor")}.`,
        `3. SHAREHOLDER / BUY-SELL AGREEMENT. ${v(a, "buyout")}`,
        adv.length ? `4. KEY ADVISORS to contact:\n${adv.map((c) => `   • ${c}`).join("\n")}` : ``,
        `5. CLIENTS & STAFF. ${v(a, "clients")}`,
        `6. RECORDS & ACCESS. The books, bank/credit accounts, logins, and key records are located: ${v(a, "access")}.`,
        `7. This directive is to guide my Executor and family; it must be read together with my Will, any shareholder agreement, and corporate documents.`,
        ``, `NOTE: Have your lawyer + accountant confirm this aligns with your Will, corporate structure, and any shareholder agreement (tax on death can be significant — get advice).`,
      ].filter(Boolean).join("\n");
    },
  },
  {
    type: "account_directive",
    title: "Personal Accounts Directive (bank accounts & finances)",
    blurb: "What happens to your personal bank accounts and where everything is.",
    fields: [
      { key: "fullName", label: "Your full legal name", type: "text" },
      { key: "accounts", label: "Accounts (one per line: institution — type — what should happen)", type: "lines", help: "e.g. 'TD — chequing — joint with spouse, passes to her'" },
      { key: "joint", label: "Joint account holders / beneficiaries", type: "textarea" },
      { key: "recurring", label: "Recurring payments / subscriptions to cancel or continue", type: "textarea" },
      { key: "notify", label: "Who to notify (CRA, pension, insurance, employer…)", type: "lines" },
      { key: "access", label: "Where statements, cards, and password manager are", type: "textarea" },
    ],
    generate: (a) => {
      const acc = lines(a, "accounts"); const notify = lines(a, "notify");
      return [
        `PERSONAL ACCOUNTS DIRECTIVE`,
        `${v(a, "fullName").toUpperCase()} — ${today()}`, ``,
        DISCLAIMER + " (This is an information/instruction memo for your Executor — your Will controls who inherits.)", ``,
        acc.length ? `1. ACCOUNTS:\n${acc.map((c, i) => `   (${i + 1}) ${c}`).join("\n")}` : `1. ACCOUNTS. ____________________`,
        `2. JOINT HOLDERS / BENEFICIARIES. ${v(a, "joint")}`,
        `3. RECURRING PAYMENTS. ${v(a, "recurring")}`,
        notify.length ? `4. NOTIFY:\n${notify.map((c) => `   • ${c}`).join("\n")}` : ``,
        `5. ACCESS. Statements, cards, and the password manager are: ${v(a, "access")}.`,
        ``, `NOTE: This memo helps your Executor act quickly; it does not override your Will or account beneficiary designations.`,
      ].filter(Boolean).join("\n");
    },
  },
];

export function getLegalSpec(type: string): LegalDocSpec | undefined {
  return LEGAL_DOCS.find((d) => d.type === type);
}
export function generateLegalDoc(type: string, answers: Record<string, string>): string {
  const spec = getLegalSpec(type);
  return spec ? spec.generate(answers) : "";
}
