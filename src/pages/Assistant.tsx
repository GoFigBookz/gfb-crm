import { useState, useRef, useEffect } from "react";
import { Bot, Send, Mic, Sparkles, MapPin, MapPinOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/providers/trpc";

type Msg = { role: "user" | "assistant"; content: string };
type AgentKey = "fig" | "sage" | "wren" | "liv" | "jinx" | "tess" | "jade" | "skye";

const ROSTER: { key: AgentKey; name: string; role: string }[] = [
  { key: "liv", name: "Liv", role: "executive assistant (front desk)" },
  { key: "fig", name: "Fig", role: "junior bookkeeper" },
  { key: "sage", name: "Sage", role: "senior bookkeeper" },
  { key: "wren", name: "Wren", role: "controller / auditor" },
  { key: "tess", name: "Tess", role: "tax specialist" },
  { key: "jade", name: "Jade", role: "fractional CFO" },
  { key: "skye", name: "Skye", role: "social / marketing" },
  { key: "jinx", name: "Jinx", role: "QA / IT watchdog" },
];

const SUGGESTIONS = [
  "What's on my plate today?",
  "Add a task for Clark Owen Sound to file HST by Friday",
  "Hey Sage, where are we on HST prep?",
  "What's the weather in Owen Sound today?",
  "Where can I buy a linen tablecloth near me?",
];

export default function Assistant() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [agent, setAgent] = useState<AgentKey>("liv");
  const [locStatus, setLocStatus] = useState<"unknown" | "on" | "off">("unknown");
  const endRef = useRef<HTMLDivElement>(null);
  const ask = trpc.assistant.ask.useMutation();
  const utils = trpc.useUtils();
  const active = ROSTER.find((r) => r.key === agent)!;

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, ask.isPending]);

  // Reflect the device's location-permission state in a little indicator.
  useEffect(() => {
    const perms = (navigator as any).permissions;
    if (!perms?.query) return;
    perms.query({ name: "geolocation" as PermissionName }).then((s: any) => {
      const map = () => setLocStatus(s.state === "granted" ? "on" : s.state === "denied" ? "off" : "unknown");
      map();
      s.onchange = map;
    }).catch(() => {});
  }, []);

  const enableLocation = () => {
    if (!("geolocation" in navigator)) { setLocStatus("off"); return; }
    navigator.geolocation.getCurrentPosition(
      () => setLocStatus("on"),
      () => setLocStatus("off"),
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 600000 },
    );
  };

  // Markie travels, so use the device's live location for "near me" questions.
  // The browser caches the permission + last fix (maximumAge), so after the first
  // grant this returns instantly and stays roughly current as he moves.
  const getLocation = (): Promise<{ lat: number; lon: number } | undefined> =>
    new Promise((resolve) => {
      if (!("geolocation" in navigator)) return resolve(undefined);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4) }),
        () => resolve(undefined),
        { enableHighAccuracy: false, timeout: 6000, maximumAge: 600000 },
      );
    });

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || ask.isPending) return;
    const history = messages.slice(-12);
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setInput("");
    try {
      const location = await getLocation();
      if (location) setLocStatus("on");
      const r = await ask.mutateAsync({ message: msg, history, agent, location });
      if (r.agent) setAgent(r.agent as AgentKey);
      setMessages((m) => [...m, { role: "assistant", content: r.reply }]);
      if (r.actions?.length) { utils.task.list.invalidate(); }
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${e?.message || "Something went wrong."}` }]);
    }
  };

  const micDictate = () => {
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) { alert("Voice input isn't supported in this browser."); return; }
    const rec = new SR();
    rec.lang = "en-US";
    rec.onresult = (e: any) => setInput(e.results[0][0].transcript);
    rec.start();
  };

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] max-w-2xl mx-auto">
      <div className="pb-3 border-b space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-lime-500 flex items-center justify-center text-white"><Bot className="h-5 w-5" /></div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-slate-900 leading-tight">Talking to {active.name}</h1>
            <p className="text-xs text-slate-500">{active.role} — just ask; I route to the right teammate. Or say "Hey Tess / Sage / Wren…" to pick one.</p>
          </div>
          {locStatus === "on" ? (
            <span className="flex items-center gap-1 text-xs text-emerald-600 shrink-0" title="Using your device location for 'near me' questions">
              <MapPin className="h-3.5 w-3.5" /> Location on
            </span>
          ) : (
            <button
              onClick={enableLocation}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-lime-600 shrink-0"
              title="Turn on location so 'near me' works while you travel"
            >
              <MapPinOff className="h-3.5 w-3.5" /> Enable location
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ROSTER.map((r) => (
            <button
              key={r.key}
              onClick={() => setAgent(r.key)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${agent === r.key ? "bg-lime-600 text-white border-lime-600" : "bg-white text-slate-600 hover:bg-lime-50 hover:border-lime-300"}`}
              title={r.role}
            >
              {r.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-slate-400 mt-8 space-y-4">
            <Sparkles className="h-8 w-8 mx-auto text-lime-400" />
            <p className="text-sm">Ask me anything, or try:</p>
            <div className="flex flex-col gap-2 max-w-sm mx-auto">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="text-sm text-left px-3 py-2 rounded-lg border bg-white hover:bg-lime-50 hover:border-lime-300 text-slate-700">{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-lime-600 text-white" : "bg-slate-100 text-slate-800"}`}>
              {m.content}
            </div>
          </div>
        ))}
        {ask.isPending && (
          <div className="flex justify-start">
            <div className="bg-slate-100 text-slate-500 rounded-2xl px-3.5 py-2 text-sm">{active.name} is thinking…</div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-center gap-2 pt-2 border-t">
        <Button type="button" variant="outline" size="icon" onClick={micDictate} title="Speak"><Mic className="h-4 w-4" /></Button>
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder={`Message ${active.name}…`} className="flex-1" autoFocus />
        <Button type="submit" disabled={!input.trim() || ask.isPending} className="bg-lime-600"><Send className="h-4 w-4" /></Button>
      </form>
    </div>
  );
}
