import { useState, useEffect } from "react";
import { Link } from "react-router";
import { Bell, Search, LogOut, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

interface TopBarProps {
  sidebarCollapsed: boolean;
  onMenu?: () => void;
}

/** Live build badge — shows the deployed build tag from /api/version so it's
 *  always obvious which version is actually running. Refreshes on mount. */
function BuildBadge() {
  const [build, setBuild] = useState<string>("…");
  const [startedAt, setStartedAt] = useState<string>("");
  useEffect(() => {
    let alive = true;
    fetch("/api/version", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (!alive) return; setBuild(d?.build || "?"); setStartedAt(d?.startedAt || ""); })
      .catch(() => { if (alive) setBuild("?"); });
    return () => { alive = false; };
  }, []);
  // Live server start time (= when this build deployed), shown in Eastern.
  const deployed = startedAt
    ? new Date(startedAt).toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "";
  return (
    <span
      title={`Deployed build now running${startedAt ? ` — server started ${deployed} ET` : ""}`}
      className="hidden sm:inline-flex flex-col items-end leading-tight px-2 py-1 rounded-md bg-slate-100 text-slate-500 text-[10px] font-mono tabular-nums"
    >
      <span>build {build}</span>
      {deployed && <span className="text-slate-400">{deployed}</span>}
    </span>
  );
}

export function TopBar({ onMenu }: TopBarProps) {
  const { logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-3 md:px-6">
      <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0">
        {/* Hamburger — opens the nav drawer on phones. */}
        <button onClick={() => onMenu?.()} className="md:hidden p-2 rounded-lg hover:bg-slate-100 shrink-0" aria-label="Menu">
          <Menu className="h-5 w-5 text-slate-700" />
        </button>
        {/* Firm logo — top of every page. This is where a reseller's ("branded
            Figgy") client logo would sit, so give it room. */}
        <Link to="/" className="shrink-0" title="Go Fig Bookz">
          <img src="/assets/logo.jpg" alt="Go Fig Bookz" className="h-12 md:h-14 w-auto object-contain" />
        </Link>
        <div className="relative max-w-md w-full md:ml-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search clients, tasks, emails..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-lime-500"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <BuildBadge />
        {/* Bell → Tasks & deadlines (the closest thing to alerts today). The
            old red dot was hardcoded with nothing behind it, so it's removed
            until a real notifications count exists. */}
        <Link to="/tasks" title="Tasks & alerts">
          <Button variant="ghost" size="icon">
            <Bell className="h-5 w-5 text-slate-600" />
          </Button>
        </Link>
        <Button variant="ghost" size="sm" onClick={() => logout()} className="text-slate-600">
          <LogOut className="h-4 w-4 mr-1.5" /> Log out
        </Button>
      </div>
    </header>
  );
}
