/**
 * FIGS — BROWSER-EXTENSION BRAIN (runs in Markie's REAL Chrome).
 * =============================================================================
 * Why this exists: the server-side headless browser gets CAPTCHA'd at QBO login
 * and forces Markie to re-login + 2FA + watch. The fix is to never let Figs log
 * in: MARKIE logs into QBO/Hubdoc himself in his own Chrome (he passes the human
 * picture-check), and Figs works INSIDE that already-authenticated tab via a
 * Chrome extension.
 *
 * Split of responsibility:
 *   - The EXTENSION is Figs' eyes + hands: it screenshots the active tab and
 *     executes the click/type/scroll she asks for, in Markie's logged-in session.
 *   - THIS MODULE is Figs' brain: same computer-use loop + the SAME knowledge as
 *     the server brain (reconcile SOP, never-touch-Figgy-Clearing, review gate),
 *     but execution is DELEGATED to the extension instead of puppeteer.
 *
 * Protocol (one session per active task, kept server-side):
 *   POST /api/figs-ext/start  {goal}                     -> {sessionId}
 *   POST /api/figs-ext/step   {sessionId, shot, vw, vh}  -> {actions|pending|done}
 *   POST /api/figs-ext/approve{sessionId}                -> {actions|pending|done}
 *   POST /api/figs-ext/deny   {sessionId, note?}         -> {actions|done}
 *   POST /api/figs-ext/stop   {sessionId}                -> {ok}
 * The extension executes `actions`, captures a fresh screenshot, and calls /step
 * again — looping until `done` or `pending` (a review gate Markie approves in the
 * extension popup). Reuses the firm's golden review rule: nothing that changes the
 * books runs without Markie's OK.
 * =============================================================================
 */

const MODEL = process.env.FIGGY_BROWSER_MODEL || "claude-sonnet-4-6";
const MAX_STEPS = 80;

// Shared brain text — kept in lockstep with the server brain so Figs behaves the
// same whichever body she's driving.
const SYSTEM = `You are Figs, a meticulous junior bookkeeper working inside Markie's OWN web browser for a Canadian bookkeeping firm. Markie is already logged into QuickBooks Online and Hubdoc — you act inside his authenticated session. You NEVER log in, never touch a login or password page, never solve a CAPTCHA; if you land on a login/verification screen, STOP and ask Markie to sign in.

ABSOLUTE RULES:
- You may freely NAVIGATE and READ: move, click links/tabs/menus, scroll, open a document, type into a SEARCH/filter box, screenshot.
- You must NEVER perform a STATE-CHANGING action on your own. Before clicking anything that posts, publishes, saves, submits, sends, deletes, reconciles, locks, approves, or otherwise changes the books, call request_approval with exactly what you want to do and why, then STOP. Markie approves in the extension; only then does it run.
- Work one careful step at a time. After each action, look at the new screenshot before the next step.
- If unsure or something looks wrong, call request_approval and explain — never guess on anything that changes data.
- When the goal is fully complete, call task_done with a short summary.

RECONCILE PROCEDURE (Markie's exact steps — UI-only, which is why you do it here):
  a. Prep the feed first: Transactions > Bank transactions; in "For Review" add/match/categorize EVERY transaction for the statement period.
  b. Settings (gear, top-right) > Tools > Reconcile.
  c. Pick the EXACT account. Verify the BEGINNING balance matches the statement — if it doesn't, STOP and request_approval (unresolved prior issue). Enter the Ending Balance + Ending Date from the statement, then Start reconciling (or drag-drop the PDF to auto-fill).
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
  vw: number;
  vh: number;
  computerIds: string[]; // tool_use ids awaiting a screenshot tool_result
  log: { at: number; text: string }[];
  lastSummary?: string;
};

const sessions = new Map<string, Session>();
let seq = 0;

function newId(): string { seq += 1; return `fx_${seq}_${sessions.size}`; }

function tools(vw: number, vh: number) {
  return [
    { type: "computer_20250124", name: "computer", display_width_px: vw, display_height_px: vh, display_number: 1 },
    {
      name: "request_approval",
      description: "Call BEFORE any state-changing action (publish/post/save/submit/send/delete/reconcile/lock/approve). Pauses for Markie's approval in the extension.",
      input_schema: {
        type: "object",
        properties: {
          summary: { type: "string", description: "The exact action you want to take, e.g. 'Click Finish now to lock the TD CAD Chequing reconciliation at $0.00 difference'." },
          reason: { type: "string", description: "Why this is correct (account, balance, date, difference)." },
        },
        required: ["summary", "reason"],
      },
    },
    { name: "task_done", description: "Call when the goal is fully complete.", input_schema: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] } },
  ];
}

/** Translate a computer-use action into the simple schema the extension executes. */
function toExtAction(input: any): any | null {
  const a = input?.action;
  const [x, y] = Array.isArray(input?.coordinate) ? input.coordinate : [undefined, undefined];
  switch (a) {
    case "screenshot": return { kind: "screenshot" };
    case "mouse_move": return { kind: "move", x, y };
    case "left_click": return { kind: "click", x, y };
    case "double_click": return { kind: "double_click", x, y };
    case "right_click": return { kind: "right_click", x, y };
    case "left_click_drag": return { kind: "drag", x, y };
    case "type": return { kind: "type", text: String(input.text || "") };
    case "key": return { kind: "key", key: String(input.text || input.key || "Enter") };
    case "scroll": return { kind: "scroll", direction: input.scroll_direction || "down", amount: Number(input.scroll_amount || 3) };
    case "wait": return { kind: "wait", ms: Math.min(3000, Number(input.duration || 1) * 1000) };
    case "cursor_position": return { kind: "screenshot" };
    default: return { kind: "screenshot" };
  }
}

async function callClaude(s: Session): Promise<any> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set — Figs' brain needs it.");
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new (Anthropic as any)({ apiKey: key });
  return client.beta.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    tools: tools(s.vw, s.vh),
    messages: s.messages,
    betas: ["computer-use-2025-01-24"],
  });
}

function log(s: Session, text: string) {
  s.log.push({ at: Date.now(), text });
  if (s.log.length > 200) s.log.shift();
}

/** Run one Claude turn and shape the reply for the extension. */
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

  if (toolUses.length === 0) { s.status = "done"; log(s, "Figs stopped (no further action)."); return { sessionId: idOf(s), done: true, summary: texts || "done", log: s.log.slice(-30) }; }

  const done = toolUses.find((t: any) => t.name === "task_done");
  if (done) { s.status = "done"; s.lastSummary = String(done.input?.summary || ""); log(s, `✅ Done: ${s.lastSummary}`); return { sessionId: idOf(s), done: true, summary: s.lastSummary, log: s.log.slice(-30) }; }

  const approval = toolUses.find((t: any) => t.name === "request_approval");
  if (approval) {
    s.status = "awaiting_approval";
    s.pending = { id: approval.id, summary: String(approval.input?.summary || "do something"), reason: String(approval.input?.reason || "") };
    log(s, `⏸ Needs your OK: ${s.pending.summary}`);
    return { sessionId: idOf(s), pending: s.pending, log: s.log.slice(-30) };
  }

  // Computer actions — hand them to the extension to execute in Markie's tab.
  const computer = toolUses.filter((t: any) => t.name === "computer");
  s.computerIds = computer.map((t: any) => t.id);
  const actions = computer.map((t: any) => toExtAction(t.input)).filter(Boolean);
  for (const a of actions) log(s, `• ${a.kind}${a.x != null ? ` (${a.x},${a.y})` : ""}${a.text ? ` "${String(a.text).slice(0, 30)}"` : ""}`);
  return { sessionId: idOf(s), actions, log: s.log.slice(-30) };
}

function idOf(s: Session): string {
  for (const [k, v] of sessions) if (v === s) return k;
  return "";
}

export function extStart(goal: string): { sessionId: string } {
  const id = newId();
  sessions.set(id, { goal, messages: [], status: "running", pending: null, steps: 0, vw: 1280, vh: 800, computerIds: [], log: [{ at: Date.now(), text: `Goal: ${goal}` }] });
  return { sessionId: id };
}

/** The extension posts a fresh screenshot of Markie's active tab; we either seed
 *  the goal (first call) or attach the screenshot as the tool_result for the
 *  actions we last handed out, then take the next turn. */
export async function extStep(sessionId: string, shotB64: string, vw: number, vh: number): Promise<any> {
  const s = sessions.get(sessionId);
  if (!s) throw new Error("Unknown session — start a task first.");
  s.vw = Math.max(320, Math.round(vw || s.vw));
  s.vh = Math.max(240, Math.round(vh || s.vh));
  const image = { type: "image", source: { type: "base64", media_type: "image/png", data: shotB64 } };

  if (s.messages.length === 0) {
    s.messages.push({ role: "user", content: [
      { type: "text", text: `GOAL: ${s.goal}\n\nThis is Markie's current browser tab (he is already logged in). Begin, one careful step at a time. Call request_approval before anything that changes the books.` },
      image,
    ] });
  } else if (s.computerIds.length > 0) {
    // One tool_result per outstanding computer tool_use; same fresh screenshot.
    s.messages.push({ role: "user", content: s.computerIds.map((id) => ({ type: "tool_result", tool_use_id: id, content: [image] })) });
    s.computerIds = [];
  } else {
    // No outstanding actions (shouldn't normally happen) — nudge with the screenshot.
    s.messages.push({ role: "user", content: [{ type: "text", text: "Current screen:" }, image] });
  }
  return turn(s);
}

export async function extApprove(sessionId: string): Promise<any> {
  const s = sessions.get(sessionId);
  if (!s) throw new Error("Unknown session.");
  if (s.status !== "awaiting_approval" || !s.pending) throw new Error("Nothing to approve.");
  s.messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: s.pending.id, content: "APPROVED by Markie. Proceed with exactly that action now, then continue." }] });
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

export function extStop(sessionId: string): { ok: true } {
  sessions.delete(sessionId);
  return { ok: true };
}

export function extStatus(sessionId: string): any {
  const s = sessions.get(sessionId);
  if (!s) return { active: false };
  return { active: true, goal: s.goal, status: s.status, steps: s.steps, pending: s.pending, log: s.log.slice(-30) };
}
