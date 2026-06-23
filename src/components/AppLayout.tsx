import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { Eye } from "lucide-react";

export function AppLayout() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isDemoMode = localStorage.getItem('demo-mode') === 'true';

  useEffect(() => {
    if (!isLoading && !user && !isDemoMode) {
      navigate("/landing", { replace: true });
    }
  }, [isLoading, user, isDemoMode, navigate]);

  if (isLoading && !isDemoMode) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 border-4 border-lime-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-500 font-medium">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user && !isDemoMode) {
    return null; // Will redirect via useEffect
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TopBar sidebarCollapsed={sidebarCollapsed} onMenu={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-auto p-3 md:p-6">
          {isDemoMode && (
            <div className="mb-4 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-700 text-sm">
                <Eye className="h-4 w-4" />
                <span><strong>Demo Mode:</strong> You are viewing a preview with sample data. OAuth login is bypassed.</span>
              </div>
              <button 
                onClick={() => { localStorage.removeItem('demo-mode'); window.location.reload(); }}
                className="text-amber-700 hover:text-amber-900 text-sm underline"
              >
                Exit Demo
              </button>
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
