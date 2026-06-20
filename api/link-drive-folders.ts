/**
 * FIGGY JR — DRIVE FOLDER LINKER
 * =============================================================================
 * Links every CRM client to its existing Google Drive folder under
 * "GFB → GFB Clients" (folders are named "Finance - <Client>"), so the client
 * page's "Google Drive" button jumps straight to their files. Keyed on the
 * client's CANONICAL normalized name (exact match) — never a fuzzy contains —
 * so we can't mislink lookalikes (Universal Construction vs Drywall, Align by
 * Design vs Align Plumbing, Ovita Construction vs Holdings, the two Clark
 * entities). Idempotent: only fills a blank driveFolderUrl.
 *
 * Snapshot of folders captured live 2026-06-20. New clients get a freshly
 * created subfolder under GFB_CLIENTS_PARENT_FOLDER_ID (see client-lifecycle).
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { clients } from "../db/schema";
import { eq } from "drizzle-orm";

/** Parent that holds all per-client folders ("GFB → GFB Clients"). */
export const GFB_CLIENTS_PARENT_FOLDER_ID = "1OdxTvo0DiWnDL0e9g2ii6eG5ysBke_0G";
/** Where folders move when a client goes inactive ("zInactive Clients"). */
export const GFB_INACTIVE_FOLDER_ID = "1GW6V_LAwGiqpM6KRtelZOS5k5jTJmvdg";

const folderUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`;

/** Same normalization as client-match: lowercase, alnum + spaces, collapsed. */
const norm = (s: any) => String(s ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** canonical normalized client name → Drive folder id (live snapshot). */
const NAME_TO_FOLDER: Record<string, string> = {
  "originality ai inc": "1aaqB12rJ5Ou4kX_tWF24JFq7OjEXHL2o",
  "clark pools and spas collingwood inc": "10qXdEt4KVgW2w3s5VOIph1chSFPUErtH",
  "clark pools and spas owen sound inc": "1eYu1sXe3jRIR4z-WzSzTGNXWS_12UbDt",
  "west york paving ltd": "1LlGVkPyMnZ46IPs9UPY66ws3IR_2bAxo",
  "1000235299 ontario ltd the auld spot pub": "1RYy_SiBp-Qlkl8AxurIWXnbHDHtx8J1F",
  "1001196626 ontario ltd sher e punjab": "1pbNsufSywSXkETjYRTg8zFeqBxBpnuWy",
  "king industries inc": "18LARx2KKXk2WIedta-6EBgAztgF5PAKj",
  "ovita construction ltd": "1AqBz0TK1QcDtDVi1vrXhc4vc2v7Pumru",
  "ovita holdings inc": "1ZLkgFq68jqkXQNZYWNulW_YMLNzb_9hT",
  "universal construction group inc": "1vINZgScLvvQtvFAc6xJK-IJXcDCmrM2h",
  "align by design hd inc": "1RDYytzByINcfnPMkLXnek9Hv6mcLssfM",
  "gotomarket agility inc": "1-jLpF0TIZ4AUzxETxovgILnvUSzZZRxZ",
  "adbank inc": "17hK0koClzPBJ5uyWDUEDMm9RR9xRalJI",
  "motion invest inc": "126E4nVOp9xpyJeFvftMfjWdUAVQb_3xn",
  "fractal saas inc": "1XiwLjwuQjAC23w3Tci-MHBEd_SRG6L2d",
  "listingeagle com inc": "14yjTLms7pqbdzIZdyOfPs8orC1juRjiT",
  "marketing strategy ventures inc": "1tI9o-OSThIskTvG0SqQnIXbJu-rWgBCm",
  "seahorse health inc": "15GWhR8EchsoQlW_POfZyJJLrk5hLhTZv",
  "m m kapala medicine professional corporation": "1d8kUnetOrHb2h1b7weOTFD3yJYMyRAbX",
  "alderson developments ltd": "1-bxKE4CGXC_RDU10XdFAS8FpWmBEklOU",
  "2303851 ontario inc": "1FQw4yxOHXU9yDilc9Jy5yP1cKbBQaNCQ",
  "studio lella inc": "1TK6OzAZ4pD4Gms-5rhNL3YDShIbd10VD",
  "dark horse intelligence inc": "12_ebmsvtGlQYbGmU9mE7Bwva0LNdc4mv",
  "12738988 canada inc": "1XqpieuAB3eKiPpVYqgKgepkMblDl7L7B",
  "1001411380 ontario inc columbus cafe": "1bxUtm6PF18DLKwarERlDDKvoEsi6Aoni",
  "align plumbing inc": "1FwrtszqS4vqFgXXjPYg62QzxSUVJL0Lc",
  "aim construction inc": "1VOnQyqFHB5o4TAcErQYCgOWIXrF_j5Ef",
  "selective painting": "1F9C8GeZHWhT__YMaiWChiyvqV8XD9ft8",
  "laing scientific": "1dGeUTCbltTi0G0mEm9fH6VEuT1DE0Iwc",
  "fleming advisory inc fka kaavio": "1ynQJzY3sffTICdqU8cWoenW5ZhRxz_o3",
  "unimax usa": "1-iKPbFSUZ5YJSijbiCwFzpvbH4UCHaim",
  "dock kings inc": "1kntRZ07OMtnAj1LH_wELZwevW43sexj4",
};

/** Backfill driveFolderUrl for every client whose canonical name is mapped and
 *  whose driveFolderUrl is currently blank. Returns counts for the boot log. */
export async function linkDriveFolders(): Promise<{ linked: number; alreadySet: number; unmatched: string[] }> {
  const db = getDb();
  const all: any[] = await db.select().from(clients);
  let linked = 0, alreadySet = 0;
  const unmatched: string[] = [];
  for (const c of all) {
    const folderId = NAME_TO_FOLDER[norm(c.name)] ?? NAME_TO_FOLDER[norm(c.company)];
    if (!folderId) { unmatched.push(c.name); continue; }
    if (c.driveFolderUrl) { alreadySet++; continue; }
    try {
      await db.update(clients).set({ driveFolderUrl: folderUrl(folderId) }).where(eq(clients.id, c.id));
      linked++;
    } catch (e) {
      console.error("[drive-link] failed for", c.name, ":", e instanceof Error ? e.message : e);
    }
  }
  if (linked) console.log(`[drive-link] linked ${linked} clients to Drive folders (${alreadySet} already set)`);
  if (unmatched.length) console.log(`[drive-link] no folder mapping for: ${unmatched.join(", ")}`);
  return { linked, alreadySet, unmatched };
}
