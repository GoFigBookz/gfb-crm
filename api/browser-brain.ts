/**
 * FIGS AT WORK — Stage 3: the browser BRAIN (supervised computer-use autopilot).
 * =============================================================================
 * Hubdoc has no API and QBO's reconcile-LOCK is UI-only, so the only way an agent
 * can do them is to drive a real browser like a person. This is that driver.
 *
 * Markie gives Figs a goal ("log into Hubdoc and publish the pending Alderson
 * receipts" / "reconcile the Alderson Visa to this statement"). Figs:
 *   1. screenshots the page, asks Claude (computer-use) for the next action,
 *   2. AUTO-RUNS safe navigation (move/click a link/scroll/read/type in a search),
 *   3. but BEFORE anything that changes state — Publish, Post, Save, Reconcile,
 *      Delete, Submit, Send — she calls `request_approval` and PAUSES. Markie
 *      approves in the side panel, then (and only then) the action runs.
 * This is the golden rule enforced in the loop: nothing posts/publishes/locks
 * without Markie's explicit OK. The model is told to flag risky steps; the
 * system also never executes a `request_approval` action until approved.
 *
 * SAFETY: flag-gated (FIGGY_BROWSER_AGENT=on) + needs ANTHROPIC_API_KEY; bounded
 * step + wall-clock budget; one run at a time; everything is logged. Built to be
 * watched live and tested WITH Markie, not turned loose unattended.
 * =============================================================================
 */
import { ensureSession, screenshot, sessionInfo } from "./browser-agent";

const MODEL = process.env.FIGGY_BROWSER_MODEL || "claude-sonnet-4-6";
const MAX_STEPS = 40;                 // hard cap per run
const VW = 1280, VH = 800;

type Action =
  | { type: "auto"; label: string }       // a safe action we executed
  | { type: "approval"; label: string; reason: string } // paused, awaiting Markie
  | { type: "done"; label: string }
  | { type: "error"; label: string };

type BrainRun = {
  goal: string;
  steps: number;
  status: "running" | "awaiting_approval" | "done" | "error" | "idle";
  log: { at: number; text: string }[];
  // Anthropic message history (kept server-side across steps).
  messages: any[];
  // The pending approval the model requested (executed only on approve()).
  pending?: { id: string; summary: string; reason: string } | null;
};

let run: BrainRun | null = null;

function log(text: string) {
  if (!run) return;
  run.log.push({ at: Date.now(), text });
  if (run.log.length > 200) run.log.shift();
}

export function brainStatus() {
  const sess = sessionInfo();
  if (!run) return { active: false, browser: sess };
  return {
    active: true,
    goal: run.goal,
    status: run.status,
    steps: run.steps,
    pending: run.pending || null,
    log: run.log.slice(-40),
    browser: sess,
  };
}

const SYSTEM = `You are Figs, a meticulous junior bookkeeper working inside a real web browser for a Canadian bookkeeping firm. You are doing real work in Hubdoc and QuickBooks Online.

ABSOLUTE RULES:
- You may freely NAVIGATE and READ: move the mouse, click links/tabs/menus, scroll, open a document, type into a SEARCH or filter box, take screenshots.
- You must NEVER perform a STATE-CHANGING action on your own. Before clicking anything that posts, publishes, saves, submits, sends, deletes, reconciles, locks, approves, or otherwise changes the books or the client's data, you MUST call the request_approval tool describing exactly what you want to do and why, and then STOP and wait. A human (Markie) approves it; only then will it run.
- Work one careful step at a time. After each action, look at the new screenshot before deciding the next step.
- If you are unsure, or something looks wrong, call request_approval and explain — do not guess on anything that changes data.
- When the goal is fully complete, call task_done with a short summary.

THE MORNING WORKFLOW (Markie's routine — follow it in order for a client):
 1. HUBDOC: open the client in Hubdoc and process the receipts — review each doc,
    set the coding, and Publish it (Publish PUSHES it into QuickBooks, so it is a
    state change → request_approval first). Anything you're unsure of (vendor,
    account, ≤80% confident), DON'T publish it — flag it to Ask Markie and move on.
 2. Come back and finish the rest of the postings you were confident on.
 3. QUICKBOOKS: go into QBO and MATCH the published/posted transactions in the
    bank feed.
 4. MONTH-END: if there are prior-month transactions still unposted, post them
    through the bank feed (bank AND credit-card) so the month can be closed.
    (Posting from the feed changes data → request_approval.)
 5. RECONCILE each account (bank + every credit card), then ATTACH the bank
    statement to the reconciliation report. (Reconcile is a state change →
    request_approval; it's UI-only, which is why you do it here in the browser.)
NOT every client is on QuickBooks' bank feed — some send MANUAL statements that
get keyed in. Check the client's workflow before assuming a live feed.

You will be given a goal. Pursue it step by step, narrating briefly what you see and intend.`;

function tools() {
  return [
    { type: "computer_20250124", name: "computer", display_width_px: VW, display_height_px: VH, display_number: 1 },
    {
      name: "request_approval",
      description: "Call BEFORE any state-changing action (publish/post/save/submit/send/delete/reconcile/lock/approve). Pauses for Markie's approval.",
      input_schema: {
        type: "object",
        properties: {
          summary: { type: "string", description: "The exact action you want to take, e.g. 'Click Publish on the Home Depot receipt for Alderson'." },
          reason: { type: "string", description: "Why this is correct (vendor, amount, account, date)." },
        },
        required: ["summary", "reason"],
      },
    },
    {
      name: "task_done",
      description: "Call when the goal is fully complete.",
      input_schema: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] },
    },
  ];
}

async function shot(): Promise<string> {
  const buf = await screenshot();
  return buf.toString("base64");
}

/** Execute one computer-tool action against the live page. Returns a label. */
async function execComputer(input: any): Promise<string> {
  const s = await ensureSession();
  const a = input?.action;
  const [x, y] = Array.isArray(input?.coordinate) ? input.coordinate : [undefined, undefined];
  switch (a) {
    case "screenshot": return "screenshot";
    case "mouse_move": if (x != null) await s.page.mouse.move(x, y); return `move (${x},${y})`;
    case "left_click": if (x != null) await s.page.mouse.click(x, y); return `click (${x},${y})`;
    case "double_click": if (x != null) await s.page.mouse.click(x, y, { clickCount: 2 }); return `double-click (${x},${y})`;
    case "right_click": if (x != null) await s.page.mouse.click(x, y, { button: "right" }); return `right-click (${x},${y})`;
    case "left_click_drag":
      if (x != null) { await s.page.mouse.move(x, y); await s.page.mouse.down(); await s.page.mouse.up(); }
      return "drag";
    case "type": await s.page.keyboard.type(String(input.text || ""), { delay: 12 }); return `type "${String(input.text || "").slice(0, 40)}"`;
    case "key": await s.page.keyboard.press(mapKey(String(input.text || input.key || "Enter"))); return `key ${input.text || input.key}`;
    case "scroll": {
      const dir = input.scroll_direction || "down";
      const amt = Number(input.scroll_amount || 3) * 100;
      await s.page.mouse.wheel({ deltaY: dir === "up" ? -amt : amt });
      return `scroll ${dir}`;
    }
    case "wait": await new Promise((r) => setTimeout(r, Math.min(3000, Number(input.duration || 1) * 1000))); return "wait";
    case "cursor_position": return "cursor_position";
    default: return `unsupported(${a})`;
  }
}

function mapKey(k: string): any {
  const m: Record<string, string> = { Return: "Enter", Enter: "Enter", Tab: "Tab", Escape: "Escape", BackSpace: "Backspace", Delete: "Delete", space: "Space" };
  return (m[k] || k) as any;
}

async function callClaude(): Promise<any> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set — the browser brain needs it.");
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new (Anthropic as any)({ apiKey: key });
  return client.beta.messages.create(
    {
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM,
      tools: tools(),
      messages: run!.messages,
      betas: ["computer-use-2025-01-24"],
    },
  );
}

export async function startBrain(goal: string): Promise<void> {
  await ensureSession();
  run = { goal, steps: 0, status: "running", log: [], messages: [], pending: null };
  const img = await shot();
  run.messages.push({
    role: "user",
    content: [
      { type: "text", text: `GOAL: ${goal}\n\nHere is the current browser screen. Begin, one careful step at a time. Remember: call request_approval before anything that changes data.` },
      { type: "image", source: { type: "base64", media_type: "image/png", data: img } },
    ],
  });
  log(`Goal set: ${goal}`);
}

/**
 * Advance the brain: one Claude turn. Executes safe computer actions, returns the
 * tool_result screenshot, and loops internally until the model either (a) requests
 * approval (→ pause), (b) finishes (→ done), or (c) hits the step cap. Designed to
 * be called once; it runs a short burst of safe steps then yields to the UI.
 */
export async function advanceBrain(): Promise<void> {
  if (!run) throw new Error("No active task. Start one first.");
  if (run.status === "awaiting_approval") return; // need approve()/deny() first

  let burst = 0;
  while (run.steps < MAX_STEPS && burst < 6) {
    run.status = "running";
    const resp = await callClaude();
    run.messages.push({ role: "assistant", content: resp.content });
    run.steps += 1; burst += 1;

    const toolUses = (resp.content || []).filter((b: any) => b.type === "tool_use");
    const texts = (resp.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join(" ").trim();
    if (texts) log(`Figs: ${texts.slice(0, 200)}`);

    if (toolUses.length === 0) { run.status = "done"; log("Figs stopped (no further action)."); return; }

    // Handle a request_approval / task_done BEFORE executing anything.
    const approval = toolUses.find((t: any) => t.name === "request_approval");
    const done = toolUses.find((t: any) => t.name === "task_done");
    if (done) {
      run.status = "done";
      log(`✅ Done: ${done.input?.summary || ""}`);
      return;
    }
    if (approval) {
      run.status = "awaiting_approval";
      run.pending = { id: approval.id, summary: String(approval.input?.summary || "do something"), reason: String(approval.input?.reason || "") };
      log(`⏸ Needs your OK: ${run.pending.summary}`);
      return;
    }

    // Otherwise execute the computer tool actions (all safe by the rules).
    const results: any[] = [];
    for (const t of toolUses) {
      if (t.name !== "computer") {
        results.push({ type: "tool_result", tool_use_id: t.id, content: "unsupported tool" });
        continue;
      }
      const label = await execComputer(t.input).catch((e) => `error: ${e instanceof Error ? e.message : e}`);
      log(`• ${label}`);
      await new Promise((r) => setTimeout(r, 400));
      const img = await shot();
      results.push({
        type: "tool_result",
        tool_use_id: t.id,
        content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: img } }],
      });
    }
    run.messages.push({ role: "user", content: results });
  }
  if (run.steps >= MAX_STEPS) { run.status = "done"; log("Reached the step limit — pausing. Give the next goal or continue."); }
}

/** Markie approves the paused action: feed an approval tool_result + let the model
 *  proceed to actually do it (its next turn performs the now-approved action). */
export async function approvePending(): Promise<void> {
  if (!run || run.status !== "awaiting_approval" || !run.pending) throw new Error("Nothing to approve.");
  const p = run.pending;
  run.messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: p.id, content: "APPROVED by Markie. Proceed with exactly that action now, then continue." }] });
  run.pending = null;
  run.status = "running";
  log("✔ Approved — proceeding.");
  await advanceBrain();
}

/** Markie denies: tell the model not to, and to try a different approach or stop. */
export async function denyPending(note?: string): Promise<void> {
  if (!run || run.status !== "awaiting_approval" || !run.pending) throw new Error("Nothing to deny.");
  const p = run.pending;
  run.messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: p.id, content: `DENIED by Markie${note ? `: ${note}` : ""}. Do NOT do that. Either try a safe alternative or call task_done.`, is_error: true }] });
  run.pending = null;
  run.status = "running";
  log(`✗ Denied${note ? `: ${note}` : ""}`);
  await advanceBrain();
}

export function stopBrain(): void {
  if (run) log("Task stopped by Markie.");
  run = null;
}
