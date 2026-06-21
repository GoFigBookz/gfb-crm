/**
 * FIGGY JR — GOVERNMENT REGISTRY BACKFILL (boot seed, idempotent)
 * =============================================================================
 * Markie (2026-06-21): "everything on the client master sheet needs to sync to
 * the client card — bio, CRA number, registration number, incorporation date,
 * corp type, industry, all of it."
 *
 * This embeds the curated government-registry research (Canada's Business
 * Registries / Ontario Business Registry, captured May–Jun 2026) keyed by CRA
 * business number, and writes it onto the matching CRM client card so EVERY
 * existing client shows its registry data right now — not just newly-added ones
 * (those get a live lookup via gov-registry-lookup.ts).
 *
 * SAFE: registry facts (registry#, incorp date, corp type, govt status, bio) are
 * set authoritatively (the registry is the source of truth). Industry is only
 * filled when the card has none / "other" so a manual override is never clobbered.
 * Matches by CRA BN first, then by a distinctive name key. Re-running is a no-op.
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { clients } from "../db/schema";
import { eq, sql } from "drizzle-orm";

type Gov = {
  bn?: string; nameKey?: string; industry?: string; registry?: string; incorp?: string;
  corpType?: string; status?: string; bio: string;
};

// Curated registry snapshot (keyed by CRA BN where known; nameKey for no-BN rows).
const GOV: Gov[] = [
  { bn: "786440610", industry: "Technology/AI", registry: "1000380932", incorp: "2022-12-05", corpType: "Ontario Business Corp", status: "Active", bio: "AI-powered platform that detects AI-generated content and plagiarism. Founded 2022 in Collingwood, ON. Helps creators, marketers and publishers ensure content authenticity — AI detection, plagiarism checking, fact-checking, readability analysis." },
  { bn: "770298602", industry: "Pool & Spa Services", registry: "1000001017", incorp: "2021-10-19", corpType: "Ontario Business Corp", status: "Active", bio: "Complete pool and spa service company serving South Georgian Bay for 20+ years. Pool cleaning, repair, new builds, hot tub sales and maintenance programs." },
  { bn: "715666566", industry: "Pool & Spa Services", registry: "1001447196", incorp: "2025-12-17", corpType: "Ontario Business Corp", status: "Active", bio: "Pool and spa experts serving Owen Sound and Grey Bruce County for 40+ years. Dependable pool construction, maintenance and hot tub services." },
  { bn: "877933515", industry: "Construction/Paving", registry: "1491517", incorp: "2001-09-04", corpType: "Ontario Business Corp", status: "Active", bio: "Large, reputable paving company serving Toronto and the GTA for decades. Residential and commercial paving, 24/7 availability. Operated by the Barone family." },
  { bn: "718843600", industry: "Restaurant/Bar", registry: "1000235299", incorp: "2022-06-16", corpType: "Ontario Business Corp", status: "Active", bio: "Popular Scottish-style pub on Toronto's Danforth since 1975. Draft microbrews, hearty pub fare, imported brews and single malts." },
  { bn: "706313020", industry: "Restaurant", registry: "1001196626", incorp: "2025-04-03", corpType: "Ontario Business Corp", status: "Active", bio: "Celebrated Indian fine-dining restaurant on Toronto's Danforth. Rich flavours, generous portions, authentic Indian cuisine with fresh local ingredients and imported spices." },
  { bn: "858977705", industry: "Manufacturing/Chemicals", registry: "6206522", incorp: "2004-03-12", corpType: "Federal Business Corp", status: "Active", bio: "Designs, manufactures and distributes specialty chemical additives for coatings, lubricants, rubber and industrial applications worldwide. Also operates Dock Kings, a dock-building division." },
  { bn: "752504498", industry: "Construction", registry: "2536157", incorp: "2016-09-12", corpType: "Ontario Business Corp", status: "Active", bio: "Building restoration and general contracting company with extensive high-rise construction experience. Focus on quality and safety." },
  { bn: "722717121", industry: "Holding Company", registry: "2567485", incorp: "2017-03-20", corpType: "Ontario Business Corp", status: "Active", bio: "Holding company associated with Ovita Construction, managing corporate assets and investments in construction and real estate." },
  { bn: "741962930", industry: "Construction", registry: "2747411", incorp: "2020-03-10", corpType: "Ontario Business Corp", status: "Active", bio: "Construction company delivering residential and commercial projects across Ontario with a focus on craftsmanship and customer satisfaction." },
  { bn: "707477733", industry: "Professional Services", registry: "12404648", incorp: "2020-10-08", corpType: "Federal Business Corp", status: "Active", bio: "Professional organizing and interior styling service that transforms spaces. Personalized home organization and design solutions." },
  { bn: "817061252", industry: "Consulting", registry: "2240452", incorp: "2010-04-14", corpType: "Ontario Business Corp", status: "Active", bio: "Strategic consulting firm specializing in go-to-market planning, sales strategy and business development for consumer-product companies. Fractional CCO leadership." },
  { bn: "793523481", industry: "Technology/Advertising", registry: "2597757", incorp: "2017-09-20", corpType: "Ontario Business Corp", status: "Active", bio: "Technology company in the digital advertising space, co-founded by Jon Gillham. Collingwood, ON — blockchain and advertising technology solutions." },
  { bn: "728898321", industry: "Technology/Marketplace", registry: "2560628", incorp: "2017-02-09", corpType: "Ontario Business Corp", status: "Active", bio: "Marketplace for buying and selling profitable websites and YouTube channels. Founded 2019 by Spencer Haws and Jon Gillham. Connects verified sellers with buyers." },
  { bn: "739247070", industry: "Technology/SaaS", registry: "2750934", incorp: "2020-04-03", corpType: "Ontario Business Corp", status: "Active", bio: "SaaS technology company developing software solutions, including fire-permit management systems and other specialized applications. Based in Collingwood." },
  { bn: "767302490", industry: "Technology", registry: "2520953", incorp: "2016-05-31", corpType: "Ontario Business Corp", status: "Active", bio: "Technology company providing digital solutions; software and online services, based in Ontario." },
  { bn: "763289337", industry: "Marketing/Consulting", registry: "2724538", incorp: "2019-10-31", corpType: "Ontario Business Corp", status: "Active", bio: "Marketing and business-strategy venture providing consulting services. Uses Stripe and PayPal for payment processing." },
  { bn: "728509522", industry: "Healthcare", registry: "2561240", incorp: "2017-02-13", corpType: "Ontario Business Corp", status: "Active", bio: "Healthcare-related business providing health services or products. Based in Collingwood, ON." },
  { bn: "827463951", industry: "Medical Professional Corp", registry: "1758046", incorp: "2007-12-19", corpType: "Ontario Business Corp", status: "Active", bio: "Medical professional corporation operating in Ontario, providing medical/healthcare services under a professional-corporation structure." },
  { bn: "774355168", industry: "Real Estate/Construction", registry: "1001174780", incorp: "2025-03-14", corpType: "Ontario Business Corp", status: "Active", bio: "Development company based in Concord, ON. Active in construction and real-estate development projects." },
  { bn: "847759909", industry: "Corporation", registry: "2303851", incorp: "2011-10-28", corpType: "Ontario Business Corp", status: "Active", bio: "Ontario-based corporation engaged in business operations. Uses Stripe and PayPal for payment processing." },
  { bn: "792026429", industry: "Hair Salon", registry: "1000816710", incorp: "2024-02-29", corpType: "Ontario Business Corp", status: "Active", bio: "Hair-styling studio driven by creativity — expert hair care to give every individual access to confidence and true beauty." },
  { bn: "750383671", industry: "Analytics/Visualization", registry: "2739028", incorp: "2020-01-24", corpType: "Ontario Business Corp", status: "Active", bio: "Specializes in data visualization, predictive analytics and helping organizations make better decisions through data. Home to Darkhorse Visualization and Darkhorse Emergency." },
  { bn: "781088661", industry: "Corporation", registry: "12738988", incorp: "2021-02-14", corpType: "Federal Business Corp", status: "Active", bio: "Canadian federal corporation operating as a private entity with 50 or fewer shareholders." },
  { bn: "828277640", industry: "Manufacturing/Docks", registry: "8413533", incorp: "2013-01-23", corpType: "Federal Business Corp", status: "Active", bio: "Division of King Industries Inc. specializing in the design and installation of floating docks and lift systems. 20+ years and 4,000+ installations across Ontario's cottage country." },
  { bn: "105448658", industry: "Import/Export", registry: "14799691", incorp: "2023-03-01", corpType: "Federal Business Corp", status: "Active", bio: "International import/export company in global trade, focused on tire distribution and mechanical services through divisions including Unimax Tire and Point S Canada." },
  { bn: "758960231", industry: "Restaurant/Cafe", registry: "1001411380", incorp: "2025-11-11", corpType: "Ontario Business Corp", status: "Active", bio: "Modern European cafe offering freshly brewed coffee, handcrafted pastries and a vibrant atmosphere. Multiple Ontario locations." },
  { bn: "789978301", industry: "Plumbing Services", registry: "13154424", corpType: "Ontario Business Corp", status: "Active", bio: "Professional plumbing service for residential and commercial clients, including emergency plumbing." },
  { bn: "736845488", industry: "Technology", registry: "10980170", incorp: "2018-09-06", corpType: "Federal Business Corp", status: "Active", bio: "Technology and advisory company focused on software and digital solutions. Formerly 'Kaavio'; legally renamed to Fleming Advisory Inc. (same CRA number)." },
  { bn: "807649798", industry: "Construction", bio: "Construction company providing residential and commercial building services with a commitment to quality workmanship and client satisfaction." },
  { bn: "784617565", industry: "Painting Services", bio: "Greater Toronto Area painters offering residential and commercial painting — affordable, high-quality painting solutions." },
  { bn: "127437374", industry: "Scientific Equipment", bio: "Supplier of scientific equipment specializing in microscopes and balances. Serves research, laboratory and industrial communities." },
  { bn: "809545346", industry: "Healthcare/Wellness", bio: "Healthcare business in the osteopathic / wellness field, providing therapeutic services and alternative health treatments." },
  { nameKey: "universal drywall", industry: "Construction/Drywall", bio: "Drywall and construction services company providing interior framing, drywall installation and exterior finishes. USA (Florida) entity." },
];

const norm = (s: any) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export async function seedGovRegistry(): Promise<{ matched: number; patched: number }> {
  const db = getDb();
  const report = { matched: 0, patched: 0 };
  let all: any[] = [];
  try {
    all = [...((await db.run(sql`SELECT id, name, company, taxId, industry FROM clients`)) as any).rows ?? []]
      .map((r: any) => ({ id: Number(r.id ?? r[0]), name: String(r.name ?? r[1] ?? ""), company: String(r.company ?? r[2] ?? ""), taxId: String(r.taxId ?? r[3] ?? ""), industry: String(r.industry ?? r[4] ?? "") }));
  } catch (e) { console.error("[gov-registry] load clients failed:", e instanceof Error ? e.message : e); return report; }

  for (const g of GOV) {
    let c = g.bn ? all.find((x) => norm(x.taxId) === norm(g.bn)) : undefined;
    if (!c && g.nameKey) c = all.find((x) => norm(x.name).includes(norm(g.nameKey)) || norm(x.company).includes(norm(g.nameKey)));
    if (!c) continue;
    report.matched++;
    const patch: Record<string, any> = { updatedAt: new Date() };
    if (g.bio) patch.bio = g.bio;
    if (g.registry) patch.registryNumber = g.registry;
    if (g.incorp) patch.incorporationDate = g.incorp;
    if (g.corpType) patch.corpType = g.corpType;
    if (g.status) patch.governmentStatus = g.status;
    // industry only when the card has none / generic, so manual overrides stick.
    if (g.industry && (!c.industry || c.industry === "other")) patch.industry = g.industry;
    try { await db.update(clients).set(patch).where(eq(clients.id, c.id)); report.patched++; }
    catch (e) { console.error("[gov-registry] patch failed for", c.name, ":", e instanceof Error ? e.message : e); }
  }
  return report;
}
