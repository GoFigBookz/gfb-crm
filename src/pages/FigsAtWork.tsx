import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Play, Square, Globe, MousePointerClick, Lock, KeyRound, LogIn, Trash2, Plus } from "lucide-react";

const VW = 1280, VH = 800; // server viewport — clicks map back to this

async function api(path: string, body?: any): Promise<any> {
  const res = await fetch(`/api/figs-browser/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 403) return { error: "forbidden" };
  try { return await res.json(); } catch { return {}; }
}

/**
 * FIGS AT WORK (Stage 1) — watch Figs drive a real browser on the server, and
 * steer her. She works Hubdoc here (no API). Dormant unless FIGGY_BROWSER_AGENT=on.
 */
export default function FigsAtWork() {
  const [info, setInfo] = useState<any>(null);
  const [url, setUrl] = useState("https://www.hubdoc.com");
  const [typeText, setTypeText] = useState("");
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Poll status + refresh the live frame while a session is running.
  useEffect(() => {
    let alive = true;
    const loop = async () => {
      const s = await api("status");
      if (!alive) return;
      setInfo(s);
      if (s?.running) setTick((t) => t + 1);
    };
    loop();
    const id = setInterval(loop, 1200);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const enableAgent = async (on: boolean) => { setBusy(true); await api("enable", { on }); const s = await api("status"); setInfo(s); setBusy(false); };
  const start = async () => { setBusy(true); await api("start", {}); setBusy(false); };
  const stop = async () => { setBusy(true); await api("stop", {}); setBusy(false); };
  const go = async () => { setBusy(true); await api("goto", { url }); setBusy(false); };
  const onImgClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    const img = imgRef.current; if (!img) return;
    const r = img.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * VW;
    const y = ((e.clientY - r.top) / r.height) * VH;
    await api("act", { action: "click", x, y });
    setTick((t) => t + 1);
  };
  const sendType = async () => { if (!typeText) return; await api("act", { action: "type", text: typeText }); setTypeText(""); setTick((t) => t + 1); };
  const enter = async () => { await api("act", { action: "key", key: "Enter" }); setTick((t) => t + 1); };

  const disabled = info && info.enabled === false;
  const running = !!info?.running;

  return <FigsAtWorkInner {...{ info, url, setUrl, typeText, setTypeText, tick, setTick, busy, imgRef, start, stop, go, onImgClick, sendType, enter, disabled, running, enableAgent }} />;
}

/** The recommended path: Figs runs in Markie's REAL Chrome via the extension, so
 *  she never logs in (no CAPTCHA, no 2FA, no watching). This card hands him the
 *  token + how to load it. */
function ExtensionCard() {
  const [token, setToken] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const getToken = async () => {
    const r = await fetch("/api/figs-ext/token", { credentials: "include" });
    const j = await r.json().catch(() => ({}));
    if (j?.token) setToken(j.token);
  };
  const copy = async () => { if (token) { try { await navigator.clipboard.writeText(token); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } } };
  return (
    <Card className="border-lime-300">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <Globe className="h-4 w-4 text-lime-600" /> Figs in your own Chrome (recommended)
        </div>
        <p className="text-xs text-slate-500">
          Best way: you log into QuickBooks yourself (you pass the picture-check), and Figs works inside your tab — no CAPTCHA, no re-login, no watching. Load the <code className="bg-slate-100 px-1 rounded">extension/</code> folder once via <b>chrome://extensions → Developer mode → Load unpacked</b>, then paste this token into its Settings.
        </p>
        <div className="flex items-center gap-2">
          {!token ? (
            <Button size="sm" variant="outline" onClick={getToken}>Show my access token</Button>
          ) : (
            <>
              <code className="text-xs bg-slate-100 px-2 py-1 rounded flex-1 truncate">{token}</code>
              <Button size="sm" variant="outline" onClick={copy}>{copied ? "Copied ✓" : "Copy"}</Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Split out so the login vault can share the same state without a giant single
 *  component. (Kept in one file for simplicity.) */
function FigsAtWorkInner(p: any) {
  const { info, url, setUrl, typeText, setTypeText, tick, busy, imgRef, start, stop, go, onImgClick, sendType, enter, disabled, running, setTick, enableAgent } = p;
  const [creds, setCreds] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const PRESETS: Record<string, { label: string; loginUrl: string }> = {
    quickbooks: { label: "QuickBooks — Figs", loginUrl: "https://qbo.intuit.com/" },
    hubdoc: { label: "Hubdoc — Figs", loginUrl: "https://app.hubdoc.com/login" },
    other: { label: "", loginUrl: "" },
  };
  const [form, setForm] = useState({ provider: "quickbooks", label: "QuickBooks — Figs", loginUrl: "https://qbo.intuit.com/", username: "", password: "" });
  const pickProvider = (provider: string) => { const pr = PRESETS[provider] || PRESETS.other; setForm({ ...form, provider, label: pr.label, loginUrl: pr.loginUrl }); };
  const [credBusy, setCredBusy] = useState(false);

  const loadCreds = async () => { const r = await api("credentials"); setCreds(r?.credentials || []); };
  useEffect(() => { loadCreds(); }, []);

  // ── Stage 3 brain: give Figs a goal, watch her work, approve risky steps. ──
  const [goal, setGoal] = useState("");
  const [brain, setBrain] = useState<any>(null);
  const [brainBusy, setBrainBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    const loop = async () => { const s = await api("brain/status"); if (alive) setBrain(s); };
    loop();
    const id = setInterval(loop, 1500);
    return () => { alive = false; clearInterval(id); };
  }, []);
  const startGoal = async () => { if (!goal.trim()) return; setBrainBusy(true); await api("brain/start", { goal }); setBrainBusy(false); };
  const approve = async () => { setBrainBusy(true); await api("brain/approve", {}); setBrainBusy(false); };
  const deny = async () => { setBrainBusy(true); await api("brain/deny", {}); setBrainBusy(false); };
  const stopBrain = async () => { await api("brain/stop", {}); };
  const continueBrain = async () => { await api("brain/continue", {}); };

  const saveCred = async () => {
    if (!form.username || !form.password) return;
    setCredBusy(true);
    await api("credentials", form);
    setForm({ provider: "hubdoc", label: "", loginUrl: "", username: "", password: "" });
    setShowAdd(false);
    await loadCreds();
    setCredBusy(false);
  };
  const delCred = async (id: number) => { await api("credentials/delete", { id }); await loadCreds(); };
  const signIn = async (id: number) => { setCredBusy(true); await api("login", { id }); setTick((t: number) => t + 1); setCredBusy(false); };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Bot className="h-6 w-6 text-lime-600" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Figs at Work</h1>
          <p className="text-sm text-slate-500">Watch Figs drive a real browser — Hubdoc and anything with no API. Click the screen to guide her; she learns as you go.</p>
        </div>
      </div>

      <Card className={disabled ? "border-amber-300 bg-amber-50" : "border-lime-300 bg-lime-50"}>
        <CardContent className="p-3 text-sm flex items-center justify-between gap-2">
          <span className={`flex items-center gap-2 ${disabled ? "text-amber-800" : "text-lime-800"}`}>
            <Lock className="h-4 w-4" />
            {disabled ? "Figs' browser is OFF — turn it on to let her work." : "Figs' browser is ON."}
          </span>
          <Button size="sm" variant={disabled ? "default" : "outline"} disabled={busy} onClick={() => enableAgent(disabled)}>
            {disabled ? "Turn on" : "Turn off"}
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {!running ? (
          <Button onClick={start} disabled={busy || disabled}><Play className="h-4 w-4 mr-1" /> Start session</Button>
        ) : (
          <Button variant="outline" onClick={stop} disabled={busy} className="text-red-600 border-red-300"><Square className="h-4 w-4 mr-1" /> Stop</Button>
        )}
        <div className="flex items-center gap-1 flex-1 min-w-[260px]">
          <Globe className="h-4 w-4 text-slate-400" />
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="hubdoc.com" onKeyDown={(e) => { if (e.key === "Enter") go(); }} />
          <Button variant="outline" onClick={go} disabled={busy || disabled}>Go</Button>
        </div>
      </div>

      {info?.status && <p className="text-xs text-slate-500">Figs: <span className="font-medium text-slate-700">{info.status}</span>{info.url ? ` · ${info.url}` : ""}</p>}

      {/* Chrome extension — Figs works in YOUR logged-in browser (no CAPTCHA, no re-login). */}
      <ExtensionCard />

      {/* Her logins (Stage 2) — saved encrypted; one click signs her in. */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <KeyRound className="h-4 w-4 text-lime-600" /> Her logins
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowAdd((v) => !v)}><Plus className="h-3.5 w-3.5 mr-1" /> Add login</Button>
          </div>
          {creds.length === 0 && !showAdd && (
            <p className="text-xs text-slate-400">No logins saved. Add her Hubdoc login so she can sign in herself (stored encrypted — the password is never shown again).</p>
          )}
          <div className="space-y-1">
            {creds.map((cr) => (
              <div key={cr.id} className="flex items-center justify-between text-sm border rounded px-2 py-1.5">
                <div className="min-w-0">
                  <span className="font-medium text-slate-800">{cr.label || cr.provider}</span>
                  <span className="text-xs text-slate-400 ml-2">{cr.usernameMasked}</span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button size="sm" variant="outline" disabled={!running || credBusy || disabled} onClick={() => signIn(cr.id)}><LogIn className="h-3.5 w-3.5 mr-1" /> Sign in</Button>
                  <button className="p-1 rounded hover:bg-slate-100" onClick={() => delCred(cr.id)} title="Delete login"><Trash2 className="h-3.5 w-3.5 text-slate-400" /></button>
                </div>
              </div>
            ))}
          </div>
          {showAdd && (
            <div className="grid gap-2 sm:grid-cols-2 border-t pt-2">
              <select
                className="border rounded px-2 py-2 text-sm bg-white"
                value={form.provider}
                onChange={(e) => pickProvider(e.target.value)}
              >
                <option value="quickbooks">QuickBooks (for reconciling)</option>
                <option value="hubdoc">Hubdoc</option>
                <option value="other">Other</option>
              </select>
              <Input placeholder="Label (e.g. QuickBooks — Figs)" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
              <Input placeholder="Login URL (e.g. app.hubdoc.com/login)" value={form.loginUrl} onChange={(e) => setForm({ ...form, loginUrl: e.target.value })} />
              <Input placeholder="Username / email" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="off" />
              <Input placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
              <div className="sm:col-span-2 flex gap-2">
                <Button size="sm" onClick={saveCred} disabled={credBusy || !form.username || !form.password}>Save (encrypted)</Button>
                <Button size="sm" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Give Figs a task (Stage 3 brain) */}
      <Card className="border-lime-200">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <Bot className="h-4 w-4 text-lime-600" /> Give Figs a task
            {brain?.active && <span className="text-xs font-normal text-slate-400">· {brain.status}{brain.steps ? ` · step ${brain.steps}` : ""}</span>}
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. Log into Hubdoc and publish the pending Alderson receipts"
              onKeyDown={(e) => { if (e.key === "Enter") startGoal(); }}
              disabled={disabled}
            />
            <Button onClick={startGoal} disabled={brainBusy || disabled || !goal.trim()}>Start</Button>
            {brain?.active && <Button variant="outline" onClick={stopBrain} className="text-red-600 border-red-300">Stop</Button>}
          </div>

          {/* Approval gate — Figs pauses before anything that changes data */}
          {brain?.status === "awaiting_approval" && brain?.pending && (
            <div className="rounded border border-amber-300 bg-amber-50 p-3 space-y-2">
              <p className="text-sm font-medium text-amber-900">⏸ Figs wants to: {brain.pending.summary}</p>
              {brain.pending.reason && <p className="text-xs text-amber-800">Why: {brain.pending.reason}</p>}
              <div className="flex gap-2">
                <Button size="sm" className="bg-lime-600" onClick={approve} disabled={brainBusy}>Approve</Button>
                <Button size="sm" variant="outline" onClick={deny} disabled={brainBusy}>Deny</Button>
              </div>
            </div>
          )}
          {brain?.status === "done" && <p className="text-xs text-lime-700">Figs finished this task. Give her the next one, or <button className="underline" onClick={continueBrain}>keep going</button>.</p>}

          {/* Live activity log */}
          {brain?.log?.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded bg-slate-50 border p-2 text-xs text-slate-600 font-mono space-y-0.5">
              {brain.log.map((l: any, i: number) => <div key={i}>{l.text}</div>)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Live frame */}
      <Card>
        <CardContent className="p-2">
          {running ? (
            <img
              ref={imgRef}
              src={`/api/figs-browser/screenshot?t=${tick}`}
              onClick={onImgClick}
              className="w-full rounded border cursor-crosshair select-none"
              style={{ aspectRatio: `${VW} / ${VH}` }}
              alt="Figs' browser"
            />
          ) : (
            <div className="aspect-[16/10] grid place-items-center text-slate-400 text-sm">
              <div className="text-center"><MousePointerClick className="h-8 w-8 mx-auto mb-2 opacity-50" />Start a session to watch Figs work.</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Type into the page */}
      {running && (
        <div className="flex items-center gap-2">
          <Input value={typeText} onChange={(e) => setTypeText(e.target.value)} placeholder="Type into the focused field…" onKeyDown={(e) => { if (e.key === "Enter") sendType(); }} />
          <Button variant="outline" onClick={sendType}>Type</Button>
          <Button variant="outline" onClick={enter}>Enter ⏎</Button>
        </div>
      )}
      <p className="text-[11px] text-slate-400">Stage 1: you drive + watch. Next: her own Hubdoc login, then she navigates herself (proposing each move for your OK).</p>
    </div>
  );
}
