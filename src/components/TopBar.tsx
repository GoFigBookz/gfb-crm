import { useState } from "react";
import { Link } from "react-router";
import { Bell, Search, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

interface TopBarProps {
  sidebarCollapsed: boolean;
}

export function TopBar({}: TopBarProps) {
  const { logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6">
      <div className="flex items-center gap-4 flex-1">
        <div className="relative max-w-md w-full">
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
