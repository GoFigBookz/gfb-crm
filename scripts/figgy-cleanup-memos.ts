/**
 * FIGGY CLEANUP — strip the "Figgy Jr auto-post" memo from QBO entries the broken
 * poster created, across the affected client books.
 *
 * WHAT IT DOES (per client): pages through every `Purchase`, finds the ones whose
 * `PrivateNote` contains "Figgy Jr auto-post", and (with --apply) sparse-updates
 * each to blank the memo, then reads it back to confirm. DRY-RUN by default.
 *
 * WHAT IT DOES NOT DO: attach receipts. That needs a multipart file upload
 * (`Attachable`) which the JSON scenario-run bridge can't send — that's a separate
 * step (dedicated Make upload scenario or native OAuth).
 *
 * Writes go through the per-realm QBO tool scenario (scenario-run API), so it needs
 * FIGGY_MAKE_API_TOKEN. SAFE: dry-run unless --apply; idempotent (skips already-clean
 * rows); one client at a time unless --all.
 *
 *   FIGGY_MAKE_API_TOKEN=<make token> node --experimental-strip-types \
 *     scripts/figgy-cleanup-memos.ts --client clarkOS            # dry-run (lists)
 *   FIGGY_MAKE_API_TOKEN=<make token> node --experimental-strip-types \
 *     scripts/figgy-cleanup-memos.ts --client clarkOS --apply    # actually clears
 */
import { qboRequestViaMake } from "../api/qbo-make-bridge.ts";

const MARKER = "Figgy Jr auto-post"; // the branding the poster stamped in PrivateNote

// Per-realm QBO tool scenarios (write-capable scenario-run route). Realms + scenario
// IDs from api/bridge-bootstrap.ts + CLAUDE.md "Key IDs". Order = blast radius (worst first).
const CLIENTS: Record<string, { company: string; realmId: string; scenarioId: number }> = {
  clarkOS:   { company: "Clark Pools and Spas Owen Sound Inc.", realmId: "9341456017349963", scenarioId: 5347484 },
  universal: { company: "Universal Construction Group Inc.",    realmId: "9130348545738576", scenarioId: 5342806 },
  clarkCW:   { company: "Clark Pools and Spas Collingwood Inc",  realmId: "13633946244024404", scenarioId: 5347489 },
  alderson:  { company: "Alderson Development Ltd",              realmId: "9341454721167426", scenarioId: 5342778 },
  ovitaCon:  { company: "Ovita Construction Ltd.",              realmId: "193514344934582",  scenarioId: 5343005 },
  on2303851: { company: "2303851 Ontario Inc.",                 realmId: "193514521441614",  scenarioId: 5343229 },
};

const has = (flag: string) => process.argv.includes(flag);
const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };

function cfgFor(scenarioId: number, realmId: string, token: string) {
  return { bridgeUrl: `https://us2.make.com/api/v2/scenarios/${scenarioId}/run`, apiToken: token, realmId };
}

/** Page through every Purchase for one realm. */
async function fetchAllPurchases(cfg: { bridgeUrl: string; apiToken: string; realmId: string }) {
  const out: any[] = [];
  const page = 1000;
  for (let start = 1; ; start += page) {
    const sql = `SELECT * FROM Purchase STARTPOSITION ${start} MAXRESULTS ${page}`;
    const data = await qboRequestViaMake(cfg, `/query?query=${encodeURIComponent(sql)}`, "GET");
    const rows = data?.QueryResponse?.Purchase ?? [];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

async function run() {
  const token = process.env.FIGGY_MAKE_API_TOKEN;
  if (!token) { console.error("Set FIGGY_MAKE_API_TOKEN."); process.exit(2); }

  const apply = has("--apply");
  const keys = has("--all") ? Object.keys(CLIENTS) : (arg("client") ? [arg("client")!] : []);
  if (keys.length === 0) { console.error(`Pass --client <${Object.keys(CLIENTS).join("|")}> or --all`); process.exit(2); }

  for (const key of keys) {
    const c = CLIENTS[key];
    if (!c) { console.error(`Unknown client "${key}"`); continue; }
    const cfg = cfgFor(c.scenarioId, c.realmId, token);
    console.log(`\n=== ${c.company} (${apply ? "APPLY" : "DRY-RUN"}) ===`);

    let purchases: any[];
    try { purchases = await fetchAllPurchases(cfg); }
    catch (e) { console.error(`  read failed: ${e instanceof Error ? e.message : e}`); continue; }

    const branded = purchases.filter((p) => typeof p.PrivateNote === "string" && p.PrivateNote.includes(MARKER));
    console.log(`  ${purchases.length} purchases scanned • ${branded.length} stamped "${MARKER}"`);

    let cleared = 0, failed = 0;
    for (const p of branded) {
      if (!apply) { console.log(`  would clear  Purchase ${p.Id}  ${p.TxnDate}  $${p.TotalAmt}  "${String(p.PrivateNote).slice(0, 60)}…"`); continue; }
      try {
        const body = { sparse: true, Id: String(p.Id), SyncToken: String(p.SyncToken), PrivateNote: "" };
        const res = await qboRequestViaMake(cfg, "/purchase?minorversion=75", "POST", body);
        const after = res?.Purchase?.PrivateNote ?? "";
        if (String(after).includes(MARKER)) { failed++; console.error(`  STILL BRANDED Purchase ${p.Id}`); }
        else { cleared++; console.log(`  cleared      Purchase ${p.Id}`); }
      } catch (e) { failed++; console.error(`  FAILED       Purchase ${p.Id}: ${e instanceof Error ? e.message : e}`); }
    }
    if (apply) console.log(`  done: ${cleared} cleared, ${failed} failed, of ${branded.length}`);
  }
}

run().catch((e) => { console.error("cleanup failed:", e instanceof Error ? e.message : e); process.exit(1); });
