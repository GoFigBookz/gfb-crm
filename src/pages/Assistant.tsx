import { useState, useRef, useEffect } from "react";
import { Bot, Send, Mic, Sparkles, MapPin, MapPinOff, Volume2, VolumeX, Radio, Plus, FolderInput, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/providers/trpc";
import { cleanTranscript } from "@/lib/dedupe-speech";
import { TEAM } from "@/lib/team";
import { MeetTheTeam } from "@/components/MeetTheTeam";
import { Users } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };
type AgentKey = "fig" | "sage" | "wren" | "liv" | "jinx" | "tess" | "jade" | "skye";

// One source of truth: the team roster (Liv first — she's the front desk).
const ROSTER: { key: AgentKey; name: string; role: string }[] = ["liv", "fig", "sage", "wren", "tess", "jade", "skye", "jinx"]
  .map((k) => { const m = TEAM.find((t) => t.key === k)!; return { key: m.key as AgentKey, name: m.name, role: m.role }; });

const SUGGESTIONS = [
  "What's on my plate today?",
  "Add a task for Clark Owen Sound to file HST by Friday",
  "Hey Sage, where are we on HST prep?",
  "What's the weather in Owen Sound today?",
  "Where can I buy a linen tablecloth near me?",
];

function newConvId() {
  try { return crypto.randomUUID(); } catch { return `c_${Date.now()}_${Math.random().toString(36).slice(2)}`; }
}

export default function Assistant() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [agent, setAgent] = useState<AgentKey>("liv");
  const [showTeam, setShowTeam] = useState(false);
  const [convId, setConvId] = useState<string>(() => localStorage.getItem("figgyConvId") || newConvId());
  const [showSave, setShowSave] = useState(false);
  const [locStatus, setLocStatus] = useState<"unknown" | "on" | "off">("unknown");
  const [speakOn, setSpeakOn] = useState(false);   // read replies aloud
  const [handsFree, setHandsFree] = useState(false); // continuous talk-back-and-forth
  const [listening, setListening] = useState(false);
  const [attachment, setAttachment] = useState<{ data: string; mediaType: string; name: string; preview: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const handsFreeRef = useRef(false);
  const manualStopRef = useRef(false);   // user intentionally turned the mic off
  const finalTranscriptRef = useRef("");  // finalized text from PRIOR (auto-restarted) sessions
  const sessionFinalRef = useRef("");     // finalized text in the CURRENT session
  const silenceRef = useRef<any>(null);   // hands-free auto-send timer
  const wakeLockRef = useRef<any>(null);
  const ask = trpc.assistant.ask.useMutation();
  const utils = trpc.useUtils();
  const active = ROSTER.find((r) => r.key === agent)!;
  useEffect(() => { handsFreeRef.current = handsFree; }, [handsFree]);

  // Persist the conversation id + restore the thread on load so chats survive
  // refresh/close instead of vanishing.
  useEffect(() => { localStorage.setItem("figgyConvId", convId); }, [convId]);
  const historyQ = trpc.chat.messages.useQuery({ conversationId: convId }, { refetchOnWindowFocus: false });
  useEffect(() => {
    if (historyQ.data && messages.length === 0) {
      setMessages(historyQ.data.map((m: any) => ({ role: m.role, content: m.content })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyQ.data]);
  const clientsQ = trpc.crmClient.list.useQuery({ limit: 100 }, { enabled: showSave });
  const fileToClient = trpc.chat.fileToClient.useMutation({ onSuccess: () => setShowSave(false) });

  const newChat = () => {
    const id = newConvId();
    setConvId(id);
    setMessages([]);
    setInput("");
  };

  // Voice replies DEFAULT OFF every time (Markie's call — he turns it on only when
  // he wants it). We deliberately do NOT restore it from a saved preference, so
  // the assistant is silent on open and never starts talking on its own.

  // Keep the screen awake while in a hands-free conversation (so it doesn't sleep
  // mid-chat during all-day use). Released when hands-free ends.
  const acquireWakeLock = async () => {
    try { wakeLockRef.current = await (navigator as any).wakeLock?.request("screen"); } catch { /* unsupported — fine */ }
  };
  const releaseWakeLock = async () => {
    try { await wakeLockRef.current?.release(); } catch { /* ignore */ }
    wakeLockRef.current = null;
  };
  // Re-acquire the wake lock if the tab was backgrounded then refocused.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible" && handsFreeRef.current) acquireWakeLock(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

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

  // Speak a reply aloud (Siri-style). In hands-free mode, re-open the mic once
  // the agent finishes talking so it's a continuous back-and-forth.
  const speak = (text: string) => {
    const synth = (window as any).speechSynthesis;
    // If we can't/shouldn't speak, still re-open the mic in hands-free so the
    // back-and-forth never stalls (e.g. browsers without text-to-speech).
    if (!synth || (!speakOn && !handsFreeRef.current)) { if (handsFreeRef.current) startListening(); return; }
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/[*_#`]/g, ""));
      u.lang = "en-US";
      u.rate = 1.02;
      u.onend = () => { if (handsFreeRef.current) startListening(); };
      u.onerror = () => { if (handsFreeRef.current) startListening(); };
      synth.speak(u);
    } catch { if (handsFreeRef.current) startListening(); }
  };

  const startListening = () => {
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) { alert("Voice input isn't supported in this browser."); return; }
    if (recognitionRef.current) return; // already listening
    const rec = new SR();
    rec.lang = "en-US";
    rec.continuous = true;        // stay on through pauses — don't quit after one phrase
    rec.interimResults = true;    // live transcript
    manualStopRef.current = false;
    finalTranscriptRef.current = "";
    sessionFinalRef.current = "";
    rec.onresult = (e: any) => {
      // Collect ALL of this session's result segments (mobile Chrome emits growing
      // prefixes like "hey", "hey Sky", "hey Sky do…" and re-emits on restart);
      // cleanTranscript merges them by overlap so we don't get the runaway garble.
      const segs: string[] = [];
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i]?.[0]?.transcript;
        if (t) segs.push(t);
      }
      const sessionText = cleanTranscript(segs);
      sessionFinalRef.current = sessionText;
      const full = cleanTranscript([finalTranscriptRef.current, sessionText]).slice(0, 7900);
      setInput(full);
      // Hands-free: auto-send after a ~1.8s pause, then the agent replies & re-listens.
      if (handsFreeRef.current) {
        clearTimeout(silenceRef.current);
        silenceRef.current = setTimeout(() => {
          const text = cleanTranscript([finalTranscriptRef.current, sessionFinalRef.current]);
          if (text) { manualStopRef.current = true; try { rec.stop(); } catch { /* noop */ } send(text); }
        }, 1800);
      }
    };
    rec.onend = () => {
      // Browsers auto-stop after ~60s or on silence — keep it alive unless the
      // user turned it off. Commit this session's text (merged) before restarting.
      if (!manualStopRef.current) {
        finalTranscriptRef.current = cleanTranscript([finalTranscriptRef.current, sessionFinalRef.current]);
        sessionFinalRef.current = "";
        try { rec.start(); return; } catch { /* fall through */ }
      }
      recognitionRef.current = null; setListening(false);
    };
    rec.onerror = (ev: any) => {
      if (ev?.error === "no-speech" || ev?.error === "aborted") return; // ignore, onend will restart
      recognitionRef.current = null; setListening(false);
    };
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  };

  const stopVoice = () => {
    manualStopRef.current = true;
    clearTimeout(silenceRef.current);
    try { (window as any).speechSynthesis?.cancel(); } catch { /* noop */ }
    try { recognitionRef.current?.stop(); } catch { /* noop */ }
    recognitionRef.current = null;
    setListening(false);
  };

  const toggleHandsFree = () => {
    if (handsFree) { setHandsFree(false); stopVoice(); releaseWakeLock(); }
    else { setHandsFree(true); setSpeakOn(true); acquireWakeLock(); startListening(); }
  };

  useEffect(() => () => { stopVoice(); releaseWakeLock(); }, []); // cleanup on unmount

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 6 * 1024 * 1024) { alert("That file is too big — keep it under 6 MB."); return; }
    const ok = f.type.startsWith("image/") || f.type === "application/pdf";
    if (!ok) { alert("Attach an image or a PDF."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || "");
      const data = url.split(",")[1] || "";
      setAttachment({ data, mediaType: f.type, name: f.name, preview: url });
    };
    reader.readAsDataURL(f);
  };

  const send = async (text: string) => {
    const msg = text.trim() || (attachment ? "Here's a file — take a look." : "");
    if (!msg || ask.isPending) return;
    const att = attachment;
    const history = messages.slice(-12);
    setMessages((m) => [...m, { role: "user", content: msg + (att ? ` 📎 ${att.name}` : "") }]);
    setInput("");
    finalTranscriptRef.current = ""; sessionFinalRef.current = ""; // start the next dictation clean
    setAttachment(null);
    try {
      const location = await getLocation();
      if (location) setLocStatus("on");
      const r = await ask.mutateAsync({ message: msg, history, agent, location, conversationId: convId, attachment: att ? { data: att.data, mediaType: att.mediaType, name: att.name } : undefined });
      if (r.agent) setAgent(r.agent as AgentKey);
      setMessages((m) => [...m, { role: "assistant", content: r.reply }]);
      if (r.actions?.length) { utils.task.list.invalidate(); utils.calendar?.list?.invalidate?.(); }
      speak(r.reply);
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${e?.message || "Something went wrong."}` }]);
    }
  };

  const micDictate = () => {
    if (listening) {
      // User taps the mic OFF → stop and send whatever was captured.
      const text = (finalTranscriptRef.current || input).trim();
      stopVoice();
      if (text) send(text);
      return;
    }
    startListening(); // tap ON → stays on until tapped off
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
        <div className="flex items-center gap-2">
          <button onClick={newChat} className="flex items-center gap-1 text-xs text-slate-600 hover:text-lime-700 border rounded-full px-2.5 py-1" title="Start a fresh conversation">
            <Plus className="h-3.5 w-3.5" /> New chat
          </button>
          <div className="relative">
            <button onClick={() => setShowSave((s) => !s)} disabled={messages.length === 0} className="flex items-center gap-1 text-xs text-slate-600 hover:text-lime-700 border rounded-full px-2.5 py-1 disabled:opacity-40" title="File this conversation to a client's record">
              <FolderInput className="h-3.5 w-3.5" /> Save to client
            </button>
            {showSave && (
              <div className="absolute z-20 mt-1 w-60 max-h-72 overflow-auto rounded-lg border bg-white shadow-lg p-1">
                {clientsQ.isLoading && <div className="text-xs text-slate-500 p-2">Loading clients…</div>}
                {(clientsQ.data ?? []).map((c: any) => (
                  <button
                    key={c.id}
                    onClick={() => fileToClient.mutate({ conversationId: convId, clientId: c.id })}
                    className="block w-full text-left text-sm px-2 py-1.5 rounded hover:bg-lime-50"
                  >
                    {c.name}{c.company ? ` — ${c.company}` : ""}
                  </button>
                ))}
              </div>
            )}
          </div>
          {fileToClient.isSuccess && <span className="text-xs text-emerald-600">Saved ✓</span>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
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
          <button
            onClick={() => setShowTeam((s) => !s)}
            className={`text-xs px-2.5 py-1 rounded-full border flex items-center gap-1 transition-colors ${showTeam ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-500 hover:bg-slate-50"}`}
          >
            <Users className="h-3 w-3" /> Meet the team
          </button>
        </div>
        {showTeam && (
          <div className="pt-1">
            <MeetTheTeam activeKey={agent} onPick={(k) => { setAgent(k as AgentKey); setShowTeam(false); }} />
          </div>
        )}
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

      {handsFree && (
        <div className="flex items-center justify-center gap-2 text-xs text-lime-700 pb-1">
          <Radio className="h-3.5 w-3.5 animate-pulse" />
          {listening ? "Listening… just talk" : ask.isPending ? `${active.name} is thinking…` : `${active.name} is speaking…`}
          <button onClick={toggleHandsFree} className="underline">stop</button>
        </div>
      )}
      {attachment && (
        <div className="flex items-center gap-2 pb-2">
          {attachment.mediaType.startsWith("image/") ? (
            <img src={attachment.preview} alt={attachment.name} className="h-12 w-12 object-cover rounded border" />
          ) : (
            <div className="h-12 w-12 rounded border bg-slate-100 flex items-center justify-center text-xs text-slate-500">PDF</div>
          )}
          <span className="text-xs text-slate-600 truncate flex-1">{attachment.name}</span>
          <button onClick={() => setAttachment(null)} className="text-slate-400 hover:text-red-500" title="Remove"><X className="h-4 w-4" /></button>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }} />
      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-center gap-2 pt-2 border-t">
        <Button type="button" variant={listening ? "default" : "outline"} size="icon" onClick={micDictate} title="Tap to speak" className={listening ? "bg-red-500 hover:bg-red-600" : ""}>
          <Mic className="h-4 w-4" />
        </Button>
        <Button type="button" variant={speakOn ? "default" : "outline"} size="icon" onClick={() => { if (speakOn) stopVoice(); setSpeakOn(!speakOn); }} title={speakOn ? "Voice replies on" : "Voice replies off"} className={speakOn ? "bg-lime-600" : ""}>
          {speakOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </Button>
        <Button type="button" variant={handsFree ? "default" : "outline"} size="icon" onClick={toggleHandsFree} title="Hands-free conversation" className={handsFree ? "bg-lime-600" : ""}>
          <Radio className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" onClick={() => fileRef.current?.click()} title="Attach an image or PDF">
          <Paperclip className="h-4 w-4" />
        </Button>
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder={`Message ${active.name}…`} className="flex-1" autoFocus />
        <Button type="submit" disabled={(!input.trim() && !attachment) || ask.isPending} className="bg-lime-600"><Send className="h-4 w-4" /></Button>
      </form>
    </div>
  );
}
