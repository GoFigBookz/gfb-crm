/**
 * FIGS AT WORK — server-side browser session (Stage 1: the plumbing).
 * =============================================================================
 * A single, capped Chromium session that Figs drives and Markie watches live.
 * Hubdoc has no usable API, so Figs works it in a real browser; this is that
 * browser. Stage 1 = navigate + screenshot + click/type so a human can watch and
 * teach. Stage 3 adds the computer-use loop.
 *
 * SAFETY:
 *  - DORMANT unless FIGGY_BROWSER_AGENT=on — puppeteer is only imported when a
 *    session is actually started, so the rest of the app is never affected.
 *  - ONE session per process; idle + max-lifetime timeouts so a runaway can't eat
 *    the box; explicit stop() kill switch.
 *  - Drives the SYSTEM Chromium (Alpine) with --no-sandbox (required in a container).
 * =============================================================================
 */
export const BROWSER_ENABLED = process.env.FIGGY_BROWSER_AGENT === "on";

const IDLE_MS = 10 * 60 * 1000;       // auto-close after 10 min idle
const MAX_LIFETIME_MS = 60 * 60 * 1000; // hard cap: 1h per session
const VIEWPORT = { width: 1280, height: 800 };

type Session = {
  browser: any;
  page: any;
  startedAt: number;
  lastActivity: number;
  status: string;     // human-readable "what Figs is doing"
  idleTimer?: any;
  lifeTimer?: any;
};

let session: Session | null = null;
let launching: Promise<Session> | null = null;

function touch(s: Session, status?: string) {
  s.lastActivity = Date.now();
  if (status) s.status = status;
  if (s.idleTimer) clearTimeout(s.idleTimer);
  s.idleTimer = setTimeout(() => { void stopSession("idle timeout"); }, IDLE_MS);
}

async function launch(): Promise<Session> {
  const puppeteer = (await import("puppeteer-core")).default;
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium-browser";
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
    ],
  });
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  const s: Session = { browser, page, startedAt: Date.now(), lastActivity: Date.now(), status: "Ready." };
  s.lifeTimer = setTimeout(() => { void stopSession("max lifetime reached"); }, MAX_LIFETIME_MS);
  touch(s, "Ready.");
  return s;
}

/** Get the running session, launching one if needed. Throws if the feature is off. */
export async function ensureSession(): Promise<Session> {
  if (!BROWSER_ENABLED) throw new Error("Browser agent is disabled (set FIGGY_BROWSER_AGENT=on).");
  if (session) return session;
  if (!launching) {
    launching = launch().then((s) => { session = s; launching = null; return s; })
      .catch((e) => { launching = null; throw e; });
  }
  return launching;
}

export function sessionInfo() {
  if (!session) return { running: false, enabled: BROWSER_ENABLED };
  return {
    running: true,
    enabled: BROWSER_ENABLED,
    status: session.status,
    url: session.page.url(),
    startedAt: session.startedAt,
    ageMs: Date.now() - session.startedAt,
  };
}

export async function goto(url: string): Promise<{ url: string }> {
  const s = await ensureSession();
  const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  touch(s, `Opening ${target}`);
  await s.page.goto(target, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
  touch(s, `At ${s.page.url()}`);
  return { url: s.page.url() };
}

export async function screenshot(): Promise<Buffer> {
  const s = await ensureSession();
  touch(s);
  return s.page.screenshot({ type: "png" }) as Promise<Buffer>;
}

export async function click(x: number, y: number): Promise<void> {
  const s = await ensureSession();
  touch(s, `Click (${Math.round(x)}, ${Math.round(y)})`);
  await s.page.mouse.click(x, y);
}

export async function type(text: string): Promise<void> {
  const s = await ensureSession();
  touch(s, `Type ${text.length} chars`);
  await s.page.keyboard.type(text, { delay: 15 });
}

export async function pressKey(key: string): Promise<void> {
  const s = await ensureSession();
  touch(s, `Key ${key}`);
  await s.page.keyboard.press(key as any);
}

export async function stopSession(reason = "stopped"): Promise<void> {
  const s = session;
  session = null;
  if (!s) return;
  if (s.idleTimer) clearTimeout(s.idleTimer);
  if (s.lifeTimer) clearTimeout(s.lifeTimer);
  try { await s.browser.close(); } catch { /* already gone */ }
  console.log(`[figs-browser] session closed (${reason})`);
}
