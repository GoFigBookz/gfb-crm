import { useEffect, useState } from "react";
import { Download, Smartphone, Share, Check, MoreVertical } from "lucide-react";

/**
 * Inline "Install on your phone" card for the Integrations page.
 * Android/Chrome: fires the real install dialog via the captured prompt.
 * iOS/Safari: shows the Share → Add to Home Screen steps (Apple gives no
 * programmatic install). Always shows a clear status so it's never a silent
 * dead button.
 */
export default function InstallAppCard() {
  const [deferred, setDeferred] = useState<any>(null);
  const [note, setNote] = useState<string | null>(null);

  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true);
  const isIos = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isAndroid = typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);

  useEffect(() => {
    if ((window as any).__deferredInstall) setDeferred((window as any).__deferredInstall);
    const onAvail = () => setDeferred((window as any).__deferredInstall);
    const onInstalled = () => { setDeferred(null); setNote("Installed — check your home screen."); };
    window.addEventListener("pwa-install-available", onAvail);
    window.addEventListener("pwa-installed", onInstalled);
    return () => {
      window.removeEventListener("pwa-install-available", onAvail);
      window.removeEventListener("pwa-installed", onInstalled);
    };
  }, []);

  const install = async () => {
    if (deferred) {
      deferred.prompt();
      try { await deferred.userChoice; } catch { /* ignore */ }
      setDeferred(null);
      (window as any).__deferredInstall = undefined;
      return;
    }
    if (isIos) {
      setNote("On iPhone: tap the Share button (□↑) at the bottom of Safari, then 'Add to Home Screen'.");
    } else if (isAndroid) {
      setNote("If no dialog popped up: open Chrome's ⋮ menu (top-right) → 'Install app' / 'Add to Home screen'. If it's not there, the app may already be installed — check your home screen. Make sure you're in Chrome (not an in-app browser).");
    } else {
      setNote("On desktop Chrome/Edge: click the install icon in the address bar (right side). On your phone, open figgy.gofig.ca in Chrome or Safari.");
    }
  };

  const status = isStandalone
    ? "Installed"
    : isIos
      ? "iPhone: Share → Add to Home Screen"
      : deferred
        ? "Ready to install"
        : "Tap Install — or use the browser menu";

  return (
    <div className="rounded-xl border bg-white p-4 mb-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-lime-600 text-white font-bold flex items-center justify-center shrink-0">Fig</div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-900 flex items-center gap-1.5">
            <Smartphone className="h-4 w-4" /> Install the app on your phone
          </div>
          <div className="text-sm text-muted-foreground">{status}</div>
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

      {note && !isStandalone && (
        <div className="mt-3 text-sm text-slate-700 bg-slate-50 rounded-lg p-3 leading-snug">{note}</div>
      )}

      {!isStandalone && !note && (
        <div className="mt-3 text-xs text-muted-foreground flex items-start gap-1.5">
          {isIos
            ? <><Share className="h-3.5 w-3.5 mt-0.5 shrink-0" /> iPhone has no one-tap install — use Share → Add to Home Screen.</>
            : <><MoreVertical className="h-3.5 w-3.5 mt-0.5 shrink-0" /> Must be opened in Chrome. If Install does nothing, use Chrome's ⋮ menu → Install app.</>}
        </div>
      )}
    </div>
  );
}
