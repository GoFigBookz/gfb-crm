import { useEffect, useState } from "react";
import { Download, X, Share } from "lucide-react";

/**
 * Floating "Install app" banner. On Android/Chrome it captures the native
 * beforeinstallprompt event and fires the real install dialog on tap. On iOS
 * (no such event) it shows the Share → Add to Home Screen steps. Hides itself
 * once the app is installed (running standalone) or dismissed.
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<any>(null);
  const [show, setShow] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);

  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true);
  const isIos = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    if (isStandalone) return; // already installed → nothing to do
    if (sessionStorage.getItem("hideInstall") === "1") return;

    const onBIP = (e: any) => { e.preventDefault(); setDeferred(e); setShow(true); };
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", () => setShow(false));

    // iOS never fires beforeinstallprompt — show the banner so we can give steps.
    if (isIos) setShow(true);

    return () => window.removeEventListener("beforeinstallprompt", onBIP);
  }, [isStandalone, isIos]);

  if (!show || isStandalone) return null;

  const install = async () => {
    if (deferred) {
      deferred.prompt();
      try { await deferred.userChoice; } catch { /* ignore */ }
      setDeferred(null);
      setShow(false);
    } else if (isIos) {
      setIosHelp(true);
    }
  };

  const dismiss = () => { setShow(false); sessionStorage.setItem("hideInstall", "1"); };

  return (
    <div className="fixed bottom-3 inset-x-3 z-[1000] mx-auto max-w-md">
      <div className="flex items-center gap-3 rounded-xl border bg-white shadow-lg px-3 py-2.5">
        <div className="w-9 h-9 rounded-lg bg-lime-600 text-white font-bold flex items-center justify-center shrink-0">Fig</div>
        {iosHelp ? (
          <div className="flex-1 text-xs text-slate-700 leading-snug">
            Tap <Share className="inline h-3.5 w-3.5 -mt-0.5" /> <b>Share</b> below, then <b>Add to Home Screen</b>.
          </div>
        ) : (
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-slate-900">Install Figgy on your phone</div>
            <div className="text-xs text-slate-500">Opens full-screen to your assistant.</div>
          </div>
        )}
        {!iosHelp && (
          <button onClick={install} className="flex items-center gap-1.5 rounded-lg bg-lime-600 text-white text-sm font-medium px-3 py-2 shrink-0">
            <Download className="h-4 w-4" /> Install
          </button>
        )}
        <button onClick={dismiss} className="text-slate-400 hover:text-slate-600 shrink-0" aria-label="Dismiss">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
