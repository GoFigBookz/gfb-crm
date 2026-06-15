/**
 * West York Paving — one-command monthly reconciliation (BMO MasterCard, acct 137).
 *
 * Pulls the LIVE QBO General Ledger for the account over the statement period via
 * the West York QBO tool (Make scenario-run route), matches it against the BMO
 * statement CSV(s), and prints the review packet. READ-ONLY — posts nothing.
 *
 * Standalone: imports only the pure core + the Make transport (no DB), so it runs
 * with Node's type-stripping. Needs FIGGY_MAKE_API_TOKEN in the env.
 *
 *   FIGGY_MAKE_API_TOKEN=<make token> node --experimental-strip-types \
 *     scripts/reconcile-west-york.ts \
 *       --start 2025-11-29 --end 2025-12-28 \
 *       --opening 31728.51 --ending <statement closing balance> \
 *       --csv /path/bmo_dec_4686.csv:4686 --csv /path/bmo_dec_6311.csv:6311
 *
 * `--opening`/`--ending` are dollars OWED (the statement is authoritative; QBO is
 * what gets corrected to match). `--csv path[:card]` may repeat (one per card).
 */
import { readFileSync } from "node:fs";
import { qboRequestViaMake } from "../api/qbo-make-bridge.ts";
import {
  parseBmoCsv,
  parseGeneralLedger,
  generalLedgerPath,
  reconcileMonth,
  formatPacket,
  type StatementLine,
} from "../api/reconcile-core.ts";

// West York Paving Ltd. — realm 123145963468664, BMO MasterCard = account 137,
// QBO tool scenario 5389401 (write-capable scenario-run route).
const REALM = "123145963468664";
const ACCOUNT_ID = "137";
const BRIDGE_URL = "https://us2.make.com/api/v2/scenarios/5389401/run";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function argAll(name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < process.argv.length; i++) if (process.argv[i] === `--${name}`) out.push(process.argv[i + 1]);
  return out;
}

async function main() {
  const token = process.env.FIGGY_MAKE_API_TOKEN;
  if (!token) { console.error("Set FIGGY_MAKE_API_TOKEN to run live."); process.exit(2); }

  const start = arg("start"), end = arg("end");
  const opening = Number(arg("opening")), ending = Number(arg("ending"));
  const csvArgs = argAll("csv");
  if (!start || !end || !Number.isFinite(opening) || !Number.isFinite(ending) || csvArgs.length === 0) {
    console.error("Required: --start ISO --end ISO --opening $ --ending $ --csv path[:card] (repeatable)");
    process.exit(2);
  }

  // Statement (authoritative).
  const statementLines: StatementLine[] = csvArgs.flatMap((spec) => {
    const [path, card] = spec.split(":");
    return parseBmoCsv(readFileSync(path, "utf8"), card);
  });
  console.log(`Statement: ${statementLines.length} lines across ${csvArgs.length} card(s).`);

  // Live QBO register (read-only).
  const report = await qboRequestViaMake(
    { bridgeUrl: BRIDGE_URL, apiToken: token, realmId: REALM },
    generalLedgerPath(ACCOUNT_ID, start, end),
    "GET",
  );
  const registerLines = parseGeneralLedger(report);
  console.log(`QBO register (acct ${ACCOUNT_ID}): ${registerLines.length} lines.\n`);

  const result = reconcileMonth({
    periodStart: start, periodEnd: end,
    openingBalanceCents: Math.round(opening * 100),
    statementEndingBalanceCents: Math.round(ending * 100),
    statementLines, registerLines,
  });

  console.log(formatPacket(
    { accountId: ACCOUNT_ID, periodStart: start, periodEnd: end,
      openingBalanceCents: Math.round(opening * 100),
      statementEndingBalanceCents: Math.round(ending * 100) },
    result,
  ));
}

main().catch((e) => { console.error("reconcile failed:", e instanceof Error ? e.message : e); process.exit(1); });
