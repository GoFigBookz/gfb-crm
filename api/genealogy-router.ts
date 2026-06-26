/**
 * GENEALOGY ROUTER — the confidence-rated, auto-growing, shareable family tree.
 * =============================================================================
 *  - tree           : the owner's tree grouped by generation + overall "verified %"
 *                     + pending-discovery count + last-scan status.
 *  - memberUpsert   : add/edit a person with proof level, confidence, parents,
 *                     photo, sources (explicit — never guessed).
 *  - findings*      : the monthly-scan review inbox (accept merges into the tree;
 *                     dismiss archives). NOTHING merges without Markie's click.
 *  - scanNow/scanStatus : trigger + observe the web scan.
 *  - share*         : tokens for the beautiful read-only public family page.
 *  - publicView     : token-gated, read-only — what relatives see at /share/family.
 * Owner-scoped throughout (ctx.user.id); personal, walled off from client/firm.
 * =============================================================================
 */
import { z } from "zod";
import { createRouter, authedQuery, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";
import { groupByGeneration, treeAccuracy, makeShareToken, PROOF_META } from "./genealogy-core";
import { runGenealogyScan } from "./genealogy-scan";

const PROOF = z.enum(["proven", "likely", "clue", "wall"]);

async function loadMembers(userId: number) {
  return (await getDb().all(sql`SELECT * FROM family_members WHERE userId=${userId}`)) as any[];
}

/** Shape the tree for display (app + public page). */
function shapeTree(members: any[], opts?: { includePhotos?: boolean }) {
  const groups = groupByGeneration(members).map((g) => ({
    gen: g.gen,
    label: g.label,
    members: g.members.map((m: any) => ({
      id: m.id, name: m.name, relation: m.relation, side: m.side,
      birthDate: m.birthDate, deathDate: m.deathDate, living: !!m.living,
      birthplace: m.birthplace, deathPlace: m.deathPlace, occupation: m.occupation,
      maidenName: m.maidenName, gender: m.gender, notes: m.notes,
      proofLevel: m.proofLevel || null, confidence: m.confidence ?? null,
      fatherId: m.fatherId ?? null, motherId: m.motherId ?? null,
      photoUrl: opts?.includePhotos === false ? null : (m.photoUrl || null),
      sources: m.sources || null, externalLinks: m.externalLinks || null,
    })),
  }));
  return { groups, accuracy: treeAccuracy(members), count: members.filter((m) => m.birthDate || m.deathDate).length };
}

export const genealogyRouter = createRouter({
  legend: authedQuery.query(() => PROOF_META),

  tree: authedQuery.query(async ({ ctx }) => {
    const members = await loadMembers(ctx.user.id);
    const pending = (await getDb().all(sql`SELECT COUNT(*) AS n FROM genealogy_findings WHERE userId=${ctx.user.id} AND status='new'`)) as any[];
    const lastRun = ((await getDb().all(sql`SELECT * FROM genealogy_scan_runs WHERE userId=${ctx.user.id} ORDER BY id DESC LIMIT 1`)) as any[])[0] || null;
    return { ...shapeTree(members), pendingFindings: Number(pending[0]?.n || 0), lastRun, scanEnabled: !!process.env.ANTHROPIC_API_KEY && process.env.FIGGY_GENEALOGY_SCAN !== "off" };
  }),

  memberUpsert: authedQuery
    .input(z.object({
      id: z.number().optional(),
      name: z.string().min(1).max(200),
      relation: z.string().max(60).optional(),
      side: z.enum(["maternal", "paternal", "self", "spouse"]).optional(),
      birthDate: z.string().max(60).optional(),
      deathDate: z.string().max(60).optional(),
      living: z.boolean().default(true),
      birthplace: z.string().max(200).optional(),
      deathPlace: z.string().max(200).optional(),
      occupation: z.string().max(200).optional(),
      maidenName: z.string().max(120).optional(),
      gender: z.enum(["m", "f", "other"]).optional(),
      notes: z.string().max(4000).optional(),
      medicalNotes: z.string().max(2000).optional(),
      proofLevel: PROOF.optional(),
      confidence: z.number().int().min(0).max(100).optional(),
      generation: z.number().int().min(0).max(20).optional(),
      fatherId: z.number().nullable().optional(),
      motherId: z.number().nullable().optional(),
      photoUrl: z.string().max(1000).optional(),
      sources: z.string().max(4000).optional(),
      externalLinks: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb(); const uid = ctx.user.id; const now = Date.now();
      const f = input;
      if (f.id) {
        await db.run(sql`UPDATE family_members SET
          name=${f.name}, relation=${f.relation ?? null}, side=${f.side ?? null},
          birthDate=${f.birthDate ?? null}, deathDate=${f.deathDate ?? null}, living=${f.living ? 1 : 0},
          birthplace=${f.birthplace ?? null}, deathPlace=${f.deathPlace ?? null}, occupation=${f.occupation ?? null},
          maidenName=${f.maidenName ?? null}, gender=${f.gender ?? null}, notes=${f.notes ?? null}, medicalNotes=${f.medicalNotes ?? null},
          proofLevel=${f.proofLevel ?? null}, confidence=${f.confidence ?? null}, generation=${f.generation ?? null},
          fatherId=${f.fatherId ?? null}, motherId=${f.motherId ?? null}, photoUrl=${f.photoUrl ?? null},
          sources=${f.sources ?? null}, externalLinks=${f.externalLinks ?? null}, updatedAt=${now}
          WHERE id=${f.id} AND userId=${uid}`);
        return { ok: true, id: f.id };
      }
      await db.run(sql`INSERT INTO family_members
        (userId, name, relation, side, birthDate, deathDate, living, birthplace, deathPlace, occupation, maidenName, gender, notes, medicalNotes, proofLevel, confidence, generation, fatherId, motherId, photoUrl, sources, externalLinks, createdAt, updatedAt)
        VALUES (${uid}, ${f.name}, ${f.relation ?? null}, ${f.side ?? null}, ${f.birthDate ?? null}, ${f.deathDate ?? null}, ${f.living ? 1 : 0},
        ${f.birthplace ?? null}, ${f.deathPlace ?? null}, ${f.occupation ?? null}, ${f.maidenName ?? null}, ${f.gender ?? null}, ${f.notes ?? null}, ${f.medicalNotes ?? null},
        ${f.proofLevel ?? null}, ${f.confidence ?? null}, ${f.generation ?? null}, ${f.fatherId ?? null}, ${f.motherId ?? null}, ${f.photoUrl ?? null}, ${f.sources ?? null}, ${f.externalLinks ?? null}, ${now}, ${now})`);
      return { ok: true };
    }),

  memberRemove: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await getDb().run(sql`DELETE FROM family_members WHERE id=${input.id} AND userId=${ctx.user.id}`);
    return { ok: true };
  }),

  // ───────── Discovery review inbox (from the monthly scan) ─────────
  findingsList: authedQuery
    .input(z.object({ status: z.enum(["new", "accepted", "dismissed"]).default("new") }))
    .query(async ({ ctx, input }) => {
      const rows = (await getDb().all(sql`SELECT * FROM genealogy_findings WHERE userId=${ctx.user.id} AND status=${input.status} ORDER BY confidence DESC, id DESC`)) as any[];
      return { rows };
    }),

  findingDismiss: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await getDb().run(sql`UPDATE genealogy_findings SET status='dismissed', reviewedAt=${Date.now()} WHERE id=${input.id} AND userId=${ctx.user.id}`);
    return { ok: true };
  }),

  /** Accept a discovery: a new_person becomes a tree member; a fact appends to an
   *  existing member. The source is always recorded so the proof trail survives. */
  findingAccept: authedQuery
    .input(z.object({ id: z.number(), attachToMemberId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb(); const uid = ctx.user.id; const now = Date.now();
      const f = ((await db.all(sql`SELECT * FROM genealogy_findings WHERE id=${input.id} AND userId=${uid} LIMIT 1`)) as any[])[0];
      if (!f) throw new Error("Finding not found.");
      const sourceLine = [f.sourceType, f.sourceUrl].filter(Boolean).join(" — ");
      const sourcesJson = JSON.stringify([{ label: f.sourceType || "Monthly scan", url: f.sourceUrl || null, type: f.kind }]);

      const targetId = input.attachToMemberId ?? f.suggestedMemberId;
      if (f.kind === "new_person" && !targetId) {
        await db.run(sql`INSERT INTO family_members
          (userId, name, relation, birthDate, deathDate, living, birthplace, notes, proofLevel, confidence, sources, createdAt, updatedAt)
          VALUES (${uid}, ${f.subjectName}, ${f.relatedTo ? `related to ${f.relatedTo}` : null}, ${f.birthDate ?? null}, ${f.deathDate ?? null}, 0,
          ${f.birthplace ?? null}, ${`${f.claim}${sourceLine ? ` [${sourceLine}]` : ""}`}, ${f.proofLevel ?? "clue"}, ${f.confidence ?? null}, ${sourcesJson}, ${now}, ${now})`);
      } else if (targetId) {
        const m = ((await db.all(sql`SELECT notes FROM family_members WHERE id=${targetId} AND userId=${uid} LIMIT 1`)) as any[])[0];
        const appended = `${m?.notes ? m.notes + "\n" : ""}• ${f.claim}${sourceLine ? ` [${sourceLine}]` : ""} (${f.confidence ?? "?"}%)`;
        await db.run(sql`UPDATE family_members SET notes=${appended}, updatedAt=${now} WHERE id=${targetId} AND userId=${uid}`);
      } else {
        // a fact with no person to attach to → keep it as a standalone note person
        await db.run(sql`INSERT INTO family_members (userId, name, notes, proofLevel, confidence, sources, living, createdAt, updatedAt)
          VALUES (${uid}, ${f.subjectName}, ${`${f.claim}${sourceLine ? ` [${sourceLine}]` : ""}`}, ${f.proofLevel ?? "clue"}, ${f.confidence ?? null}, ${sourcesJson}, 0, ${now}, ${now})`);
      }
      await db.run(sql`UPDATE genealogy_findings SET status='accepted', reviewedAt=${now} WHERE id=${input.id} AND userId=${uid}`);
      return { ok: true };
    }),

  // ───────── Scan controls ─────────
  scanNow: authedQuery.mutation(async ({ ctx }) => {
    return runGenealogyScan(ctx.user.id, "manual");
  }),

  scanStatus: authedQuery.query(async ({ ctx }) => {
    const runs = (await getDb().all(sql`SELECT * FROM genealogy_scan_runs WHERE userId=${ctx.user.id} ORDER BY id DESC LIMIT 12`)) as any[];
    return { runs, enabled: !!process.env.ANTHROPIC_API_KEY && process.env.FIGGY_GENEALOGY_SCAN !== "off", nextRun: "28th of each month" };
  }),

  // ───────── Share links (read-only public family page) ─────────
  shareList: authedQuery.query(async ({ ctx }) => {
    const rows = (await getDb().all(sql`SELECT * FROM family_share_links WHERE userId=${ctx.user.id} ORDER BY createdAt DESC`)) as any[];
    return { rows };
  }),
  shareCreate: authedQuery
    .input(z.object({ label: z.string().max(120).optional(), includePhotos: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) => {
      const token = makeShareToken(() => crypto.randomUUID().replace(/-/g, ""));
      await getDb().run(sql`INSERT INTO family_share_links (userId, token, label, includePhotos, active, viewCount, createdAt)
        VALUES (${ctx.user.id}, ${token}, ${input.label ?? null}, ${input.includePhotos ? 1 : 0}, 1, 0, ${Date.now()})`);
      return { ok: true, token };
    }),
  shareRevoke: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await getDb().run(sql`UPDATE family_share_links SET active=0, revokedAt=${Date.now()} WHERE id=${input.id} AND userId=${ctx.user.id}`);
    return { ok: true };
  }),

  // ───────── Public (token-gated, read-only) ─────────
  publicView: publicQuery.input(z.object({ token: z.string().min(6) })).query(async ({ input }) => {
    const db = getDb();
    const link = ((await db.all(sql`SELECT * FROM family_share_links WHERE token=${input.token} LIMIT 1`)) as any[])[0];
    if (!link || !link.active) return null;
    await db.run(sql`UPDATE family_share_links SET viewCount = viewCount + 1 WHERE id=${link.id}`);
    const members = (await db.all(sql`SELECT * FROM family_members WHERE userId=${link.userId}`)) as any[];
    return {
      title: "From Fleur de Lys to Coachman's Cove",
      subtitle: link.label || "Our family history",
      legend: PROOF_META,
      generatedAt: new Date().toISOString(),
      ...shapeTree(members, { includePhotos: !!link.includePhotos }),
    };
  }),
});
