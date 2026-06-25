/**
 * FIGS — BROWSER-EXTENSION BRAIN (runs in Markie's REAL Chrome).
 * =============================================================================
 * Figs works INSIDE Markie's already-logged-in QBO/Hubdoc tab via a Chrome
 * extension, so she never logs in (no CAPTCHA, no 2FA, no watching). The
 * extension is her eyes+hands; this module is her brain.
 *
 * HOW SHE SEES + ACTS (DOM-based, model-agnostic — NOT computer-use):
 *   - The extension sends a screenshot (standard vision) PLUS a compact list of
 *     the page's interactive elements, each tagged with a numeric `ref`.
 *   - Figs picks an element by `ref` and an action (click/type/scroll/key). No
 *     pixel coordinates, no computer-use beta — just plain tool use on
 *     claude-opus-4-8, which is far more reliable on a complex app like QBO.
 *   - The extension executes by `ref` and returns a fresh snapshot; repeat.
 *
 * Same knowledge + review gate as the server brain (reconcile SOP, never-touch-
 * Figgy-Clearing). Protocol: /start -> /step (loops) -> /approve|/deny -> /stop.
 * =============================================================================
 */

const MODEL = process.env.FIGGY_BROWSER_MODEL || "claude-opus-4-8";
const MAX_STEPS = 80;

const SYSTEM = `You are Figs, a meticulous junior bookkeeper working inside Markie's OWN web browser for a Canadian bookkeeping firm. He is already logged into QuickBooks Online and Hubdoc — you act inside his authenticated session. You NEVER log in, never touch a login or password page, never solve a CAPTCHA; if you land on a login/verification screen, STOP and call request_approval to ask Markie to sign in.

HOW YOU SEE AND ACT:
- Each turn you get a screenshot of the page AND a numbered list of the interactive elements on it (each line: "[ref] <kind> name=... value=..."). To act, call the "act" tool with the element's ref number and an action.
- Work ONE careful step at a time. After each action you get a fresh screenshot + element list — look before the next step.

ABSOLUTE RULES:
- Freely NAVIGATE and READ: click links/tabs/menus, scroll, open a document, type into a SEARCH/filter box.
- NEVER perform a STATE-CHANGING action on your own. Before anything that posts, publishes, saves, submits, sends, deletes, reconciles, locks, approves, or otherwise changes the books, call request_approval with exactly what you want to do and why, then STOP. Markie approves in the extension; only then do it.
- If unsure or something looks wrong, call request_approval and explain — never guess on anything that changes data.
- When the goal is fully complete, call task_done with a short summary.

RECONCILE PROCEDURE (Markie's exact steps — UI-only, which is why you do it here):
  a. Prep the feed first: Transactions > Bank transactions; in "For Review" add/match/categorize EVERY transaction for the statement period.
  b. Settings (gear, top-right) > Tools > Reconcile.
  c. Pick the EXACT account. Verify the BEGINNING balance matches the statement — if it doesn't, STOP and request_approval (unresolved prior issue). Enter the Ending Balance + Ending Date from the statement, then Start reconciling.
  d. Check off matching transactions (bank-feed matches are usually pre-checked); compare the statement line by line.
  e. Get the "Difference" to $0.00, then request_approval to click "Finish now". NEVER force-finish a non-zero difference — STOP and ask Markie.

NEVER USE "FIGGY CLEARING" (non-negotiable): never reconcile it, never post to it, never select it for any transaction. Same for any control/clearing account (A/P, A/R, Undeposited Funds, equity). If something wants Figgy Clearing, STOP and ask Markie.

Anything you're unsure of (vendor, account, ≤80% confident) — DON'T do it; flag it for Markie's review and move on.`;

type Session = {
  goal: string;
  messages: any[];
  status: "running" | "awaiting_approval" | "done" | "error";
  pending: { id: string; summary: string; reason: string } | null;
  steps: number;
  actIds: string[]; // tool_use ids awaiting a snapshot tool_result
  log: { at: number; text: string }[];
};

const sessions = new Map<string, Session>();
let seq = 0;
function newId(): string { seq += 1; return `fx_${seq}_${sessions.size}`; }
function idOf(s: Session): string { for (const [k, v] of sessions) if (v === s) return k; return ""; }

function tools() {
  return [
    {
      name: "act",
      description: "Do ONE thing on the page. Reference an element by its [ref] number from the element list.",
      input_schema: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["click", "type", "scroll", "key"], description: "What to do." },
          ref: { type: "integer", description: "The element's ref number (from the list). Required for click/type." },
          text: { type: "string", description: "Text to type (for action=type)." },
          direction: { type: "string", enum: ["up", "down"], description: "Scroll direction (for action=scroll)." },
          key: { type: "string", description: "Key to press, e.g. Enter, Tab, Escape (for action=key)." },
        },
        required: ["action"],
      },
    },
    {
      name: "request_approval",
      description: "Call BEFORE any state-changing action (publish/post/save/submit/send/delete/reconcile/lock/approve). Pauses for Markie's OK in the extension.",
      input_schema: {
        type: "object",
        properties: {
          summary: { type: "string", description: "The exact action, e.g. 'Click Finish now to lock the TD CAD Chequing reconciliation at $0.00 difference'." },
          reason: { type: "string", description: "Why this is correct (account, balance, date, difference)." },
        },
        required: ["summary", "reason"],
      },
    },
    { name: "task_done", description: "Call when the goal is fully complete.", input_schema: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] } },
  ];
}

function log(s: Session, text: string) { s.log.push({ at: Date.now(), text }); if (s.log.length > 200) s.log.shift(); }

/** Build the user-content for a turn: screenshot image + the element list text. */
function snapshotContent(shotB64: string, elements: any[], pageText: string, header: string) {
  const list = (elements || []).slice(0, 200).map((e: any) =>
    `[${e.ref}] ${e.kind}${e.name ? ` name="${String(e.name).slice(0, 80)}"` : ""}${e.value ? ` value="${String(e.value).slice(0, 40)}"` : ""}`,
  ).join("\n");
  const content: any[] = [];
  if (shotB64) content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: shotB64 } });
  content.push({ type: "text", text: `${header}\n\nINTERACTIVE ELEMENTS:\n${list || "(none found)"}\n\nVISIBLE TEXT (truncated):\n${(pageText || "").slice(0, 2500)}` });
  return content;
}

async function callClaude(s: Session): Promise<any> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set — Figs' brain needs it.");
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new (Anthropic as any)({ apiKey: key });
  return client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    tools: tools(),
    tool_choice: { type: "any" },
    messages: s.messages,
  });
}

async function turn(s: Session): Promise<any> {
  if (s.steps >= MAX_STEPS) { s.status = "done"; log(s, "Reached the step limit — pausing."); return { sessionId: idOf(s), done: true, summary: "step limit", log: s.log.slice(-30) }; }
  s.status = "running";
  const resp = await callClaude(s);
  s.messages.push({ role: "assistant", content: resp.content });
  s.steps += 1;

  const blocks = resp.content || [];
  const texts = blocks.filter((b: any) => b.type === "text").map((b: any) => b.text).join(" ").trim();
  if (texts) log(s, `Figs: ${texts.slice(0, 200)}`);
  const toolUses = blocks.filter((b: any) => b.type === "tool_use");

  if (toolUses.length === 0) { s.status = "done"; log(s, "Figs stopped."); return { sessionId: idOf(s), done: true, summary: texts || "done", log: s.log.slice(-30) }; }

  const done = toolUses.find((t: any) => t.name === "task_done");
  if (done) { s.status = "done"; log(s, `✅ Done: ${done.input?.summary || ""}`); return { sessionId: idOf(s), done: true, summary: String(done.input?.summary || ""), log: s.log.slice(-30) }; }

  const approval = toolUses.find((t: any) => t.name === "request_approval");
  if (approval) {
    s.status = "awaiting_approval";
    s.pending = { id: approval.id, summary: String(approval.input?.summary || "do something"), reason: String(approval.input?.reason || "") };
    // Any non-approval tool_uses in the same turn still need a result; answer them minimally next step is avoided by tool_choice=any returning one. Record none.
    s.actIds = [];
    log(s, `⏸ Needs your OK: ${s.pending.summary}`);
    return { sessionId: idOf(s), pending: s.pending, log: s.log.slice(-30) };
  }

  // act tool(s) — hand to the extension to execute by ref.
  const acts = toolUses.filter((t: any) => t.name === "act");
  s.actIds = acts.map((t: any) => t.id);
  const actions = acts.map((t: any) => ({ ...t.input }));
  for (const a of actions) log(s, `• ${a.action}${a.ref != null ? ` [${a.ref}]` : ""}${a.text ? ` "${String(a.text).slice(0, 30)}"` : ""}`);
  return { sessionId: idOf(s), actions, log: s.log.slice(-30) };
}

export function extStart(goal: string): { sessionId: string } {
  const id = newId();
  sessions.set(id, { goal, messages: [], status: "running", pending: null, steps: 0, actIds: [], log: [{ at: Date.now(), text: `Goal: ${goal}` }] });
  return { sessionId: id };
}

export async function extStep(sessionId: string, shot: string, elements: any[], pageText: string): Promise<any> {
  const s = sessions.get(sessionId);
  if (!s) throw new Error("Unknown session — start a task first.");
  if (s.messages.length === 0) {
    s.messages.push({ role: "user", content: snapshotContent(shot, elements, pageText, `GOAL: ${s.goal}\n\nThis is Markie's current tab (already logged in). Begin one careful step at a time. Call request_approval before anything that changes the books.`) });
  } else if (s.actIds.length > 0) {
    const content = snapshotContent(shot, elements, pageText, "Here is the page after your last action.");
    s.messages.push({ role: "user", content: s.actIds.map((id, i) => ({ type: "tool_result", tool_use_id: id, content: i === 0 ? content : "ok" })) });
    s.actIds = [];
  } else {
    s.messages.push({ role: "user", content: snapshotContent(shot, elements, pageText, "Current page:") });
  }
  return turn(s);
}

export async function extApprove(sessionId: string): Promise<any> {
  const s = sessions.get(sessionId);
  if (!s) throw new Error("Unknown session.");
  if (s.status !== "awaiting_approval" || !s.pending) throw new Error("Nothing to approve.");
  s.messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: s.pending.id, content: "APPROVED by Markie. Proceed with exactly that action now (call act), then continue." }] });
  log(s, "✔ Approved — proceeding.");
  s.pending = null;
  return turn(s);
}

export async function extDeny(sessionId: string, note?: string): Promise<any> {
  const s = sessions.get(sessionId);
  if (!s) throw new Error("Unknown session.");
  if (s.status !== "awaiting_approval" || !s.pending) throw new Error("Nothing to deny.");
  s.messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: s.pending.id, content: `DENIED by Markie${note ? `: ${note}` : ""}. Do NOT do that. Try a safe alternative or call task_done.`, is_error: true }] });
  log(s, `✗ Denied${note ? `: ${note}` : ""}`);
  s.pending = null;
  return turn(s);
}

export function extStop(sessionId: string): { ok: true } { sessions.delete(sessionId); return { ok: true }; }
export function extStatus(sessionId: string): any {
  const s = sessions.get(sessionId);
  if (!s) return { active: false };
  return { active: true, goal: s.goal, status: s.status, steps: s.steps, pending: s.pending, log: s.log.slice(-30) };
}
