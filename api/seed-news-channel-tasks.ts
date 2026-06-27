/**
 * WORLD-NEWS / TRAGEDY-CURATION CHANNEL — Skye's launch checklist (Markie 2026-06-27:
 * "create a Facebook group/page tracking tragedies/crime stories around the world…
 * credit the author… start with Canada, maybe Canada/US/Europe… research what groups
 * are trending… give it to Skye, set her up with this goal").
 * =============================================================================
 * Personal interest project — SEPARATE from the firm brand. clientId stays NULL,
 * scoped to Markie. Idempotent: only seeds when no 'news-channel' task exists yet.
 * Honest constraint: Skye drafts the plan, the attribution SOP, the calendar, and
 * the trending-pages research; Markie creates the actual page/account and approves
 * before anything goes live — those tasks say so.
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export async function seedNewsChannelTasks(): Promise<void> {
  const db = getDb();
  const markie = (await db.all(sql`SELECT id FROM users WHERE email IN ('markie.antle@gmail.com','markie@gofig.ca') OR role = 'admin' ORDER BY (role = 'admin') DESC, id ASC LIMIT 1`)) as any[];
  const userId = markie[0]?.id ? Number(markie[0].id) : null;
  if (userId == null) { console.log("[news] no Markie user — skipped news-channel seed"); return; }

  const have = (await db.all(sql`SELECT COUNT(*) AS n FROM tasks WHERE category = 'news-channel'`)) as any[];
  if (Number(have[0]?.n || 0) > 0) return;

  const day = 86_400_000;
  const due = (n: number) => new Date(Date.now() + n * day);
  // [title, dueInDays, priority, needsMarkie, description]
  const steps: [string, number, "high" | "medium" | "low", boolean, string][] = [
    ["News channel: research trending tragedy/true-crime pages (Canada first)", 2, "high", false,
      "Skye researches the tragedy / true-crime / world-news pages + groups that are TRENDING and growing right now, Canada first: their format, posting cadence, hooks, community size, what drives shares, and the gaps a new page could own. Deliver a research brief + the best sources to curate from (wire services, local outlets, court/police blotters)."],
    ["News channel: recommend Page vs Group + name/handle/bio (Canada edition)", 3, "high", false,
      "Skye recommends the strongest primary format — Facebook PAGE (curator-controlled, cleaner growth) vs GROUP (community, more moderation) — with the why, plus optional adjacent platforms (subreddit / IG-TikTok reels / newsletter). Deliver name + handle ideas, bio, and the Canada-edition launch plan. Design region-agnostic so US/Europe are clones later."],
    ["News channel: write the attribution / repost SOP (credit + link template)", 3, "high", false,
      "Skye writes the exact repost SOP that keeps this legitimate: short original summary in our own words + clear CREDIT (author + outlet) + LINK back to source. NO republishing full/paywalled text; quote a line or two max under fair dealing, attributed; never strip a byline. This template governs every post."],
    ["News channel: starter content calendar + daily posting rhythm", 4, "medium", false,
      "Skye builds a starter calendar + a repeatable daily posting rhythm (how many stories/day, mix of breaking vs follow-up vs anniversary cases), with the hook style that earns shares — all running through the attribution SOP."],
    ["News channel: create the Facebook Page/account — NEEDS MARKIE", 5, "high", true,
      "Needs Markie: create the actual Facebook Page (or Group) for the Canada edition under a SEPARATE identity from Go Fig Bookz, and approve the name/handle/bio Skye proposed. Skye supplies everything ready-to-paste; Markie owns the account + the go-live."],
    ["News channel: decide US + Europe rollout AFTER Canada shows traction", 14, "low", true,
      "Hold: once the Canadian page shows real growth, Markie greenlights the US and Europe editions. Skye clones the Canada plan per region (region-agnostic by design). Don't spin these up until the Canadian one proves the model."],
  ];

  for (const [title, d, priority, needsMarkie, description] of steps) {
    void needsMarkie;
    await db.run(sql`INSERT INTO tasks (userId, clientId, title, description, dueDate, priority, status, completed, assignedTo, category, createdAt, updatedAt)
      VALUES (${userId}, ${null}, ${title}, ${description}, ${due(d).getTime()}, ${priority}, 'pending', 0, 'Skye', 'news-channel', ${Date.now()}, ${Date.now()})`);
  }
  console.log(`[news] seeded ${steps.length} world-news channel tasks (Skye)`);
}
