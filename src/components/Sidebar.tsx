import { useState } from "react";
import { NavLink } from "react-router";
import { FiggyLogo } from "./FiggyLogo";
import {
  LayoutDashboard, Users, CheckSquare, Mail, CalendarDays,
  FolderOpen, Receipt, Settings, ChevronLeft, ChevronRight,
  ChevronDown, Briefcase, Wrench, Calculator, ArrowRightLeft, FileStack,
  CalendarClock, ClipboardCheck, FileSpreadsheet, BookOpen,
  DollarSign, Building2, Globe, Bot, BarChart3, UserCheck,
  Plus, TrendingUp, Lock, ShieldCheck, Gauge, UserPlus, Inbox, Wallet, MessageSquare, Target, Star, Heart, Flame, Sparkles, Rocket, Megaphone, BookMarked, Brain, Sun, ListTree, HardDrive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

interface SidebarProps { collapsed: boolean; onToggle: () => void; mobileOpen?: boolean; onMobileClose?: () => void; }

type SectionKey = "work" | "clients" | "payroll" | "comms" | "tools" | "insights" | "admin";

export function Sidebar({ collapsed, onToggle, mobileOpen = false, onMobileClose }: SidebarProps) {
  const { user, can } = useAuth();
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    work: false,
    clients: false,
    payroll: false,
    comms: false,
    tools: false,
    insights: false,
    admin: false,
  });

  const toggleSection = (key: SectionKey) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // FAVORITES — Markie pins the pages he uses most to the top. Right-click any nav
  // item (or click its hover star) to add/remove. Persisted per-device.
  const FAV_KEY = "figgy.sidebar.favorites";
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { const s = localStorage.getItem(FAV_KEY); if (s) return JSON.parse(s); } catch { /* ignore */ }
    return ["/", "/payroll", "/clients", "/calendar"]; // sensible defaults
  });
  const isFav = (to: string) => favorites.includes(to);
  const toggleFav = (to: string) => {
    setFavorites((prev) => {
      const next = prev.includes(to) ? prev.filter((x) => x !== to) : [...prev, to];
      try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  // Work — the daily close cockpit: where things stand + what to do next.
  const workItems = [
    { to: "/", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/plan", icon: Sun, label: "Plan My Day" },
    { to: "/month-end-close", icon: Gauge, label: "Month-End Close" },
    { to: "/cash-watch", icon: Wallet, label: "Cash Watch" },
    { to: "/triage", icon: ShieldCheck, label: "Ask Markie" },
    { to: "/tasks", icon: CheckSquare, label: "Tasks" },
    { to: "/calendar", icon: CalendarDays, label: "Calendar" },
  ];

  // Clients — the books, documents, and engagement lifecycle.
  const clientItems = [
    { to: "/leads", icon: Target, label: "Leads" },
    { to: "/clients", icon: Users, label: "Clients" },
    { to: "/onboarding", icon: UserPlus, label: "New Client Intake" },
    { to: "/invoices", icon: Receipt, label: "Invoices" },
    { to: "/files", icon: FolderOpen, label: "Files" },
    { to: "/engagement", icon: FileSpreadsheet, label: "Engagement Letters" },
    { to: "/playbook", icon: BookMarked, label: "Client Playbooks" },
    { to: "/vault", icon: Lock, label: "Client Vault" },
    { to: "/portal-settings", icon: Globe, label: "Portal Settings" },
  ];

  // People & Payroll.
  const payrollItems = [
    { to: "/payroll", icon: Wallet, label: "Payroll" },
    { to: "/employees", icon: Briefcase, label: "Employees" },
    { to: "/interco", icon: ArrowRightLeft, label: "Inter-Company" },
    { to: "/groups", icon: Building2, label: "Company Groups" },
  ];

  // Comms — inbound/outbound to clients.
  const commsItems = [
    { to: "/assistant", icon: Bot, label: "Ask Figs" },
    { to: "/brain", icon: Brain, label: "Ask Brain", iconClass: "text-fuchsia-400" },
    { to: "/registers", icon: BookMarked, label: "Registers" },
    { to: "/emails", icon: Mail, label: "Emails" },
    { to: "/messages", icon: MessageSquare, label: "Messages" },
    { to: "/quick-add", icon: Plus, label: "Quick Add" },
    { to: "/personal", icon: Lock, label: "Personal" },
  ];
  // Phoenix Rising — Markie's PRIVATE life hub. Owner-only: no other user sees it.
  // Sits at the very bottom of the nav (still favoritable).
  const personalNav = [
    { to: "/my-life", icon: Flame, label: "Phoenix Rising", iconClass: "text-orange-400" },
    { to: "/launchpad", icon: Rocket, label: "Launchpad", iconClass: "text-sky-400" },
  ];

  // Tools & Compliance.
  const toolItems = [
    { to: "/qbo", icon: Receipt, label: "QBO Review" },
    { to: "/bank-converter", icon: ArrowRightLeft, label: "Bank → QBO" },
    { to: "/recon-match", icon: ArrowRightLeft, label: "Recon Matcher" },
    { to: "/pdf-splitter", icon: FileStack, label: "PDF Splitter" },
    { to: "/tax-deadlines", icon: CalendarClock, label: "Tax Deadlines" },
    { to: "/year-end", icon: ClipboardCheck, label: "Year-End" },
    { to: "/hst-audit", icon: ShieldCheck, label: "HST Audit" },
    { to: "/hst-review", icon: ClipboardCheck, label: "Pre-HST Review" },
    { to: "/monthly-close", icon: CheckSquare, label: "Monthly Close" },
    { to: "/calculators", icon: Calculator, label: "Calculators" },
    { to: "/templates", icon: FileSpreadsheet, label: "Templates" },
    { to: "/resources", icon: BookOpen, label: "Resources" },
    { to: "/pricing-calculator", icon: DollarSign, label: "Pricing Calc" },
    { to: "/chart-of-accounts", icon: ListTree, label: "Chart Cleanup" },
    { to: "/drive-cleanup", icon: HardDrive, label: "Drive Cleanup" },
  ];

  // Insights — practice analytics + automation.
  const insightItems = [
    ...(can.senior ? [{ to: "/insights", icon: DollarSign, label: "Pricing Insights" }] : []),
    { to: "/subscriptions", icon: DollarSign, label: "Subscriptions" },
    { to: "/jade-pricing", icon: TrendingUp, label: "Jade — Pricing" },
    { to: "/marketing", icon: Megaphone, label: "Marketing — Skye" },
    { to: "/practice-health", icon: TrendingUp, label: "Practice Health" },
    { to: "/staff-workload", icon: UserCheck, label: "Staff Workload" },
    { to: "/satisfaction", icon: BarChart3, label: "Satisfaction" },
    { to: "/ai-agents", icon: Bot, label: "AI Agents" },
  ];

  const adminItems = [
    { to: "/figs-at-work", icon: Bot, label: "Figs at Work" },
    { to: "/settings", icon: Settings, label: "Settings" },
    { to: "/integrations", icon: Globe, label: "Integrations" },
    { to: "/users", icon: Building2, label: "Users & Firms" },
    { to: "/system-health", icon: Gauge, label: "System Health" },
  ];

  // Flat registry so a favorited path resolves back to its icon + label.
  const allItems = [...workItems, ...payrollItems, ...clientItems, ...commsItems, ...toolItems, ...insightItems, ...adminItems, ...personalNav];
  const itemByPath = new Map(allItems.map((i) => [i.to, i]));
  const favItems = favorites.map((to) => itemByPath.get(to)).filter(Boolean) as { to: string; icon: any; label: string }[];

  const NavItem = ({ to, icon: Icon, label, end = false, iconClass }: { to: string; icon: any; label: string; end?: boolean; iconClass?: string }) => (
    <NavLink
      to={to}
      end={end}
      onClick={() => onMobileClose?.()}
      onContextMenu={(e) => { e.preventDefault(); toggleFav(to); }}
      title={collapsed ? label : "Right-click to add/remove from Favorites"}
      className={({ isActive }) =>
        cn(
          "group/nav flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200",
          isActive
            ? "bg-lime-600 text-white"
            : "text-slate-400 hover:bg-slate-800 hover:text-white"
        )
      }
    >
      <Icon className={cn("h-5 w-5 flex-shrink-0", iconClass)} />
      {!collapsed && <span className="font-medium text-sm truncate">{label}</span>}
      {!collapsed && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFav(to); }}
          title={isFav(to) ? "Remove from Favorites" : "Add to Favorites"}
          className={cn(
            "ml-auto flex-shrink-0 p-0.5 rounded transition-opacity",
            isFav(to) ? "opacity-100" : "opacity-0 group-hover/nav:opacity-100"
          )}
        >
          <Star className={cn("h-3.5 w-3.5", isFav(to) ? "fill-lime-500 text-lime-500" : "text-slate-400")} />
        </button>
      )}
    </NavLink>
  );

  const Section = ({ label, icon: Icon, sectionKey, items }: {
    label: string; icon: any; sectionKey: SectionKey;
    items: { to: string; icon: any; label: string; end?: boolean }[];
  }) => {
    const isOpen = openSections[sectionKey];
    return (
      <div className="mb-1">
        {!collapsed ? (
          <button
            onClick={() => toggleSection(sectionKey)}
            className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors rounded-lg"
          >
            <span className="flex items-center gap-2">
              <Icon className="h-4 w-4" />
              {label}
            </span>
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} />
          </button>
        ) : (
          <div className="border-t border-slate-800 my-2 mx-2" />
        )}
        {(isOpen || collapsed) && (
          <div className="space-y-0.5 mt-0.5">
            {items.map((item) => (
              <NavItem key={item.to} {...item} end={item.to === "/"} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
    {/* Mobile backdrop — tap to close the drawer. */}
    {mobileOpen && (
      <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => onMobileClose?.()} />
    )}
    <aside className={cn(
      "bg-slate-900 text-white flex flex-col transition-transform duration-300 ease-in-out h-screen z-50",
      // Desktop: in-flow column. Mobile: fixed drawer that slides in/out.
      "fixed inset-y-0 left-0 md:static md:translate-x-0",
      mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
      collapsed ? "w-16" : "w-56"
    )}>
      {/* Logo — white band so Markie's black-ink wordmark reads on the dark sidebar */}
      <div className="flex items-center justify-between min-h-[5rem] py-2 px-3 bg-white border-b border-slate-200 flex-shrink-0">
        {!collapsed && (
          <FiggyLogo className="h-10 w-auto" />
        )}
        {collapsed && (
          <img src="/figgy-mark.png" alt="Figgy" className="h-9 w-auto object-contain mx-auto" />
        )}
        <button onClick={onToggle} className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors flex-shrink-0">
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 overflow-y-auto">
        {/* FAVORITES — your pinned pages. Right-click any item (or its star) to
            add/remove. Hidden when you have none. */}
        {favItems.length > 0 && (
          <div className="mb-2">
            {!collapsed && (
              <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-lime-500/80">
                <Star className="h-3.5 w-3.5 fill-lime-500 text-lime-500" /> Favorites
              </div>
            )}
            <div className="space-y-0.5 mt-0.5">
              {favItems.map((item) => (
                <NavItem key={`fav-${item.to}`} to={item.to} icon={item.icon} label={item.label} end={item.to === "/"} iconClass={(item as any).iconClass} />
              ))}
            </div>
          </div>
        )}
        {!collapsed && <div className="border-t border-slate-800 my-2 mx-1" />}
        <Section label="Work" icon={Gauge} sectionKey="work" items={workItems} />
        <Section label="People & Payroll" icon={Wallet} sectionKey="payroll" items={payrollItems} />
        <Section label="Clients" icon={Users} sectionKey="clients" items={clientItems} />
        <Section label="Comms" icon={Mail} sectionKey="comms" items={commsItems} />
        <Section label="Tools & Compliance" icon={Wrench} sectionKey="tools" items={toolItems} />
        {/* Insights + Admin are senior/owner-only — juniors don't see them. */}
        {can.senior && (
          <Section label="Insights" icon={TrendingUp} sectionKey="insights" items={insightItems} />
        )}
        {can.senior && (
          <Section label="Admin" icon={Lock} sectionKey="admin" items={adminItems} />
        )}
        {/* Phoenix Rising — Markie's private life hub, pinned to the bottom as a
            direct, ALWAYS-VISIBLE link. The data itself is per-user scoped, so a
            different login only ever sees their own (empty) hub — privacy holds
            without gating the link (which was hiding it from Markie). */}
        <div className="border-t border-slate-800 my-2 mx-1" />
        {!collapsed && (
          <div className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Personal</div>
        )}
        {personalNav.map((item) => (
          <NavItem key={item.to} to={item.to} icon={item.icon} label={item.label} iconClass={(item as any).iconClass} />
        ))}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-slate-800 flex-shrink-0">
        <div className={cn("flex items-center gap-2", collapsed && "justify-center")}>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-lime-400 to-blue-500 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
            {user?.name?.charAt(0)?.toUpperCase() || "M"}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{user?.name || "Markie"}</p>
              <p className="text-xs text-slate-500 truncate">Go Fig Bookz</p>
            </div>
          )}
        </div>
      </div>
    </aside>
    </>
  );
}
