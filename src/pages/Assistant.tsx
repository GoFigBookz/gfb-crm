import { useState, useRef, useEffect } from "react";
import { Bot, Send, Mic, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/providers/trpc";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "What's on my plate today?",
  "Am I behind on anything?",
  "Add a task for Clark Owen Sound to file HST by Friday",
];

export default function Assistant() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const ask = trpc.assistant.ask.useMutation();
  const utils = trpc.useUtils();

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, ask.isPending]);

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || ask.isPending) return;
    const history = messages.slice(-12);
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setInput("");
    try {
      const r = await ask.mutateAsync({ message: msg, history });
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
      <div className="flex items-center gap-2 pb-3 border-b">
        <div className="w-9 h-9 rounded-full bg-lime-500 flex items-center justify-center text-white"><Bot className="h-5 w-5" /></div>
        <div>
          <h1 className="text-lg font-bold text-slate-900 leading-tight">Figgy</h1>
          <p className="text-xs text-slate-500">Add tasks or ask what's on your plate — hands-free friendly.</p>
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
            <div className="bg-slate-100 text-slate-500 rounded-2xl px-3.5 py-2 text-sm">Figgy is thinking…</div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-center gap-2 pt-2 border-t">
        <Button type="button" variant="outline" size="icon" onClick={micDictate} title="Speak"><Mic className="h-4 w-4" /></Button>
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Message Figgy…" className="flex-1" autoFocus />
        <Button type="submit" disabled={!input.trim() || ask.isPending} className="bg-lime-600"><Send className="h-4 w-4" /></Button>
      </form>
    </div>
  );
}
