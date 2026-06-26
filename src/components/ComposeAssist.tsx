import { useRef, useState } from "react";
import { Sparkles, Mic, MicOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/providers/trpc";

/**
 * COMPOSE ASSIST — a ✨ Polish (AI grammar/spelling/tone cleanup) button + a 🎤
 * voice-to-text mic (browser Web Speech API), for any email/text composer. Polish
 * never changes meaning; the mic appends dictated text to the field.
 */
export function ComposeAssist({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const polish = trpc.email.polish.useMutation({ onSuccess: (r) => onChange(r.text) });
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);

  const SR = typeof window !== "undefined" ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;

  const toggleMic = () => {
    if (!SR) { alert("Voice input isn't supported in this browser. Chrome on Android works best."); return; }
    if (listening) { recRef.current?.stop(); setListening(false); return; }
    const rec = new SR();
    rec.lang = "en-CA"; rec.interimResults = false; rec.continuous = true;
    rec.onresult = (e: any) => {
      let chunk = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) chunk += e.results[i][0].transcript;
      if (chunk) onChange((value ? value.trimEnd() + " " : "") + chunk.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec; rec.start(); setListening(true);
  };

  return (
    <div className="flex items-center gap-1.5">
      <Button type="button" size="sm" variant="outline" disabled={!value.trim() || polish.isPending}
        onClick={() => polish.mutate({ text: value })} title="Fix spelling, grammar & tone (keeps your meaning)">
        {polish.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        <span className="ml-1 hidden sm:inline">Polish</span>
      </Button>
      <Button type="button" size="sm" variant={listening ? "default" : "outline"} onClick={toggleMic}
        title={listening ? "Stop dictating" : "Dictate (voice to text)"} className={listening ? "bg-rose-500 hover:bg-rose-600" : ""}>
        {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        <span className="ml-1 hidden sm:inline">{listening ? "Stop" : "Voice"}</span>
      </Button>
    </div>
  );
}
