import { useState } from "react";
import { NavLink } from "react-router";
import {
  LayoutDashboard, Users, CheckSquare, Mail, CalendarDays,
  FolderOpen, Receipt, Settings, ChevronLeft, ChevronRight,
  ChevronDown, Briefcase, Wrench, Calculator, ArrowRightLeft,
  CalendarClock, ClipboardCheck, FileSpreadsheet, BookOpen,
  DollarSign, Building2, Globe, Bot, BarChart3, UserCheck,
  Plus, TrendingUp, Lock, ShieldCheck, Gauge, UserPlus, Inbox, Wallet, MessageSquare, Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

interface SidebarProps { collapsed: boolean; onToggle: () => void; }

type SectionKey = "work" | "clients" | "payroll" | "comms" | "tools" | "insights" | "admin";

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
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

  // Work — the daily close cockpit: where things stand + what to do next.
  const workItems = [
    { to: "/", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/month-end-close", icon: Gauge, label: "Month-End Close" },
    { to: "/triage", icon: ShieldCheck, label: "Figgy Jr" },
    { to: "/tasks", icon: CheckSquare, label: "Tasks" },
    { to: "/calendar", icon: CalendarDays, label: "Calendar" },
  ];

  // Clients — the books, documents, and engagement lifecycle.
  const clientItems = [
    { to: "/leads", icon: Target, label: "Leads" },
    { to: "/clients", icon: Users, label: "Clients" },
    { to: "/onboarding", icon: UserPlus, label: "New Client Intake" },
    { to: "/intake", icon: Inbox, label: "Document Intake" },
    { to: "/invoices", icon: Receipt, label: "Invoices" },
    { to: "/files", icon: FolderOpen, label: "Files" },
    { to: "/engagement", icon: FileSpreadsheet, label: "Engagement Letters" },
  ];

  // People & Payroll.
  const payrollItems = [
    { to: "/payroll", icon: Wallet, label: "Payroll" },
    { to: "/employees", icon: Briefcase, label: "Employees" },
    { to: "/interco", icon: ArrowRightLeft, label: "Inter-Company" },
  ];

  // Comms — inbound/outbound to clients.
  const commsItems = [
    { to: "/emails", icon: Mail, label: "Emails" },
    { to: "/messages", icon: MessageSquare, label: "Messages" },
    { to: "/quick-add", icon: Plus, label: "Quick Add" },
  ];

  // Tools & Compliance.
  const toolItems = [
    { to: "/qbo", icon: Receipt, label: "QBO Review" },
    { to: "/bank-converter", icon: ArrowRightLeft, label: "Bank → QBO" },
    { to: "/tax-deadlines", icon: CalendarClock, label: "Tax Deadlines" },
    { to: "/year-end", icon: ClipboardCheck, label: "Year-End" },
    { to: "/monthly-close", icon: CheckSquare, label: "Monthly Close" },
    { to: "/calculators", icon: Calculator, label: "Calculators" },
    { to: "/templates", icon: FileSpreadsheet, label: "Templates" },
    { to: "/resources", icon: BookOpen, label: "Resources" },
    { to: "/pricing-calculator", icon: DollarSign, label: "Pricing Calc" },
  ];

  // Insights — practice analytics + automation.
  const insightItems = [
    ...(can.senior ? [{ to: "/insights", icon: DollarSign, label: "Pricing Insights" }] : []),
    { to: "/practice-health", icon: TrendingUp, label: "Practice Health" },
    { to: "/staff-workload", icon: UserCheck, label: "Staff Workload" },
    { to: "/satisfaction", icon: BarChart3, label: "Satisfaction" },
    { to: "/ai-agents", icon: Bot, label: "AI Agents" },
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
        {/* Pinned quick-access — the everyday drivers, always visible so you never
            hunt for them (Payroll is weekly core work). */}
        <div className="space-y-0.5 mb-2">
          <NavItem to="/" icon={LayoutDashboard} label="Dashboard" end />
          <NavItem to="/payroll" icon={Wallet} label="Payroll" />
          <NavItem to="/clients" icon={Users} label="Clients" />
          <NavItem to="/tasks" icon={CheckSquare} label="Tasks" />
          <NavItem to="/month-end-close" icon={Gauge} label="Month-End Close" />
        </div>
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
