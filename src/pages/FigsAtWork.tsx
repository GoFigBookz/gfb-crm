import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Play, Square, Globe, MousePointerClick, Lock } from "lucide-react";

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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Bot className="h-6 w-6 text-lime-600" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Figs at Work</h1>
          <p className="text-sm text-slate-500">Watch Figs drive a real browser — Hubdoc and anything with no API. Click the screen to guide her; she learns as you go.</p>
        </div>
      </div>

      {disabled && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="p-3 text-sm text-amber-800 flex items-center gap-2">
            <Lock className="h-4 w-4" /> The browser agent is off. Set <code className="bg-amber-100 px-1 rounded">FIGGY_BROWSER_AGENT=on</code> in Railway to turn it on.
          </CardContent>
        </Card>
      )}

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
