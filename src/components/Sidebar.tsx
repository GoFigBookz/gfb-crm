import { useState } from "react";
import { NavLink } from "react-router";
import {
  LayoutDashboard, Users, CheckSquare, Mail, CalendarDays,
  FolderOpen, Receipt, Settings, ChevronLeft, ChevronRight,
  ChevronDown, Briefcase, Wrench, Calculator, ArrowRightLeft,
  CalendarClock, ClipboardCheck, FileSpreadsheet, BookOpen,
  DollarSign, Building2, Globe, Inbox, Bot, BarChart3, UserCheck,
  Plus, TrendingUp, Lock, Import, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

interface SidebarProps { collapsed: boolean; onToggle: () => void; }

type SectionKey = "daily" | "clients" | "intelligence" | "tools" | "admin";

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { user, can } = useAuth();
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    daily: true,
    clients: true,
    intelligence: false,
    tools: false,
    admin: false,
  });

  const toggleSection = (key: SectionKey) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const dailyItems = [
    { to: "/", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/triage", icon: ShieldCheck, label: "Figgy Triage" },
    { to: "/intake", icon: Inbox, label: "Intake" },
    { to: "/tasks", icon: CheckSquare, label: "Tasks" },
    { to: "/calendar", icon: CalendarDays, label: "Calendar" },
    { to: "/emails", icon: Mail, label: "Emails" },
    { to: "/quick-add", icon: Plus, label: "Quick Add" },
  ];

  const clientItems = [
    { to: "/clients", icon: Users, label: "Clients" },
    { to: "/invoices", icon: Receipt, label: "Invoices" },
    { to: "/files", icon: FolderOpen, label: "Files" },
    { to: "/employees", icon: Briefcase, label: "Employees" },
    { to: "/engagement", icon: FileSpreadsheet, label: "Engagement Letters" },
    { to: "/client-import", icon: Import, label: "Client Import" },
  ];

  const intelItems = [
    { to: "/ai-agents", icon: Bot, label: "AI Agents" },
    { to: "/practice-health", icon: TrendingUp, label: "Practice Health" },
    { to: "/staff-workload", icon: UserCheck, label: "Staff Workload" },
    { to: "/satisfaction", icon: BarChart3, label: "Satisfaction" },
  ];

  const toolItems = [
    { to: "/calculators", icon: Calculator, label: "Calculators" },
    { to: "/bank-converter", icon: ArrowRightLeft, label: "Bank → QBO" },
    { to: "/qbo-triage", icon: Receipt, label: "QBO Review" },
    { to: "/tax-deadlines", icon: CalendarClock, label: "Tax Deadlines" },
    { to: "/year-end", icon: ClipboardCheck, label: "Year-End" },
    { to: "/monthly-close", icon: CheckSquare, label: "Monthly Close" },
    { to: "/templates", icon: FileSpreadsheet, label: "Templates" },
    { to: "/resources", icon: BookOpen, label: "Resources" },
    { to: "/pricing-calculator", icon: DollarSign, label: "Pricing Calc" },
  ];

  const adminItems = [
    { to: "/settings", icon: Settings, label: "Settings" },
    { to: "/integrations", icon: Globe, label: "Integrations" },
    { to: "/users", icon: Building2, label: "Users & Firms" },
  ];

  const NavItem = ({ to, icon: Icon, label, end = false }: { to: string; icon: any; label: string; end?: boolean }) => (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200",
          isActive
            ? "bg-lime-600 text-white"
            : "text-slate-400 hover:bg-slate-800 hover:text-white"
        )
      }
    >
      <Icon className="h-5 w-5 flex-shrink-0" />
      {!collapsed && <span className="font-medium text-sm truncate">{label}</span>}
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
    <aside className={cn(
      "bg-slate-900 text-white flex flex-col transition-all duration-300 ease-in-out h-screen",
      collapsed ? "w-16" : "w-56"
    )}>
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-3 border-b border-slate-800 flex-shrink-0">
        {!collapsed && (
          <img src="/assets/logo.jpg" alt="Go Fig Bookz" className="h-9 w-auto object-contain rounded bg-white px-1" />
        )}
        {collapsed && (
          <img src="/assets/logo.jpg" alt="Go Fig Bookz" className="h-7 w-auto object-contain rounded bg-white mx-auto px-0.5" />
        )}
        <button onClick={onToggle} className="p-1 rounded-lg hover:bg-slate-800 transition-colors flex-shrink-0">
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 overflow-y-auto">
        <Section label="Daily Ops" icon={LayoutDashboard} sectionKey="daily" items={dailyItems} />
        <Section label="Clients & Revenue" icon={Users} sectionKey="clients" items={clientItems} />
        <Section label="Intelligence" icon={Bot} sectionKey="intelligence" items={intelItems} />
        <Section label="Tools" icon={Wrench} sectionKey="tools" items={toolItems} />
        {can.senior && (
          <Section label="Admin" icon={Lock} sectionKey="admin" items={adminItems} />
        )}
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
  );
}
