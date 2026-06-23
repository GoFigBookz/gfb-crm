import { useEffect, useState } from "react";
import { Download, Smartphone, Share, Check } from "lucide-react";

/**
 * Inline "Install on your phone" card for the Integrations page.
 * Android/Chrome: captures beforeinstallprompt and fires the real install
 * dialog on tap. iOS/Safari: shows the Share → Add to Home Screen steps.
 * Shows an "already installed" state when running standalone.
 */
export default function InstallAppCard() {
  const [deferred, setDeferred] = useState<any>(null);
  const [iosHelp, setIosHelp] = useState(false);

  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true);
  const isIos = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    const onBIP = (e: any) => { e.preventDefault(); setDeferred(e); };
    window.addEventListener("beforeinstallprompt", onBIP);
    return () => window.removeEventListener("beforeinstallprompt", onBIP);
  }, []);

  const install = async () => {
    if (deferred) {
      deferred.prompt();
      try { await deferred.userChoice; } catch { /* ignore */ }
      setDeferred(null);
    } else if (isIos) {
      setIosHelp(true);
    } else {
      setIosHelp(true); // fallback: show manual steps
    }
  };

  return (
    <div className="rounded-xl border bg-white p-4 mb-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-lime-600 text-white font-bold flex items-center justify-center shrink-0">Fig</div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-900 flex items-center gap-1.5">
            <Smartphone className="h-4 w-4" /> Install the app on your phone
          </div>
          <div className="text-sm text-slate-500">Adds a home-screen icon that opens full-screen to your assistant.</div>
        </div>
        {isStandalone ? (
          <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium shrink-0">
            <Check className="h-4 w-4" /> Installed
          </span>
        ) : (
          <button onClick={install} className="flex items-center gap-1.5 rounded-lg bg-lime-600 text-white text-sm font-medium px-4 py-2 shrink-0">
            <Download className="h-4 w-4" /> Install
          </button>
        )}
      </div>
      {iosHelp && !isStandalone && (
        <div className="mt-3 text-sm text-slate-700 bg-slate-50 rounded-lg p-3 leading-snug">
          <b>On iPhone (Safari):</b> tap <Share className="inline h-4 w-4 -mt-0.5" /> <b>Share</b>, then{" "}
          <b>Add to Home Screen</b>. <br />
          <b>On Android (Chrome):</b> tap the <b>⋮</b> menu → <b>Install app</b>.
        </div>
      )}
    </div>
  );
}
