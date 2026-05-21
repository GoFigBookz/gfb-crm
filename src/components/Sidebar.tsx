import { useState } from "react";
import { NavLink } from "react-router";
import {
  LayoutDashboard, Users, CheckSquare, Mail, CalendarDays,
  FolderOpen, Receipt, Settings, ChevronLeft, ChevronRight,
  ChevronDown, Briefcase, Wrench, Calculator, ArrowRightLeft,
  CalendarClock, ClipboardCheck, FileSpreadsheet, BookOpen,
  DollarSign, Building2, Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

interface SidebarProps { collapsed: boolean; onToggle: () => void; }

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { user, can } = useAuth();
  const [toolsOpen, setToolsOpen] = useState(false);

  const mainItems = [
    { to: "/", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/clients", icon: Users, label: "Clients" },
    { to: "/tasks", icon: CheckSquare, label: "Tasks" },
    { to: "/emails", icon: Mail, label: "Emails" },
    { to: "/calendar", icon: CalendarDays, label: "Calendar" },
    { to: "/files", icon: FolderOpen, label: "Files" },
    { to: "/invoices", icon: Receipt, label: "Invoices" },
    { to: "/employees", icon: Briefcase, label: "Employees" },
  ];

  const toolItems = [
    { to: "/calculators", icon: Calculator, label: "Calculators" },
    { to: "/bank-converter", icon: ArrowRightLeft, label: "Bank → QBO" },
    { to: "/tax-deadlines", icon: CalendarClock, label: "Tax Deadlines" },
    { to: "/year-end", icon: ClipboardCheck, label: "Year-End Checklist" },
    { to: "/monthly-close", icon: CheckSquare, label: "Monthly Close" },
    { to: "/templates", icon: FileSpreadsheet, label: "Templates" },
    { to: "/resources", icon: BookOpen, label: "Resources" },
    { to: "/pricing-calculator", icon: DollarSign, label: "Pricing Calculator" },
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
          "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
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

  const SectionLabel = ({ label }: { label: string }) => (
    !collapsed ? (
      <p className="px-3 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-600">
        {label}
      </p>
    ) : <div className="border-t border-slate-800 my-2" />
  );

  return (
    <aside className={cn(
      "bg-slate-900 text-white flex flex-col transition-all duration-300 ease-in-out h-screen",
      collapsed ? "w-16" : "w-56"
    )}>
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-3 border-b border-slate-800">
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
      <nav className="flex-1 py-3 px-2 overflow-y-auto space-y-0.5">
        <SectionLabel label="Main" />
        {mainItems.map((item) => (
          <NavItem key={item.to} {...item} end={item.to === "/"} />
        ))}

        <div className="pt-2">
          <SectionLabel label="Tools" />
          {!collapsed && (
            <button
              onClick={() => setToolsOpen(!toolsOpen)}
              className="flex items-center justify-between w-full px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <span className="flex items-center gap-3">
                <Wrench className="h-5 w-5" />
                <span className="font-medium">Tools</span>
              </span>
              <ChevronDown className={cn("h-4 w-4 transition-transform", toolsOpen && "rotate-180")} />
            </button>
          )}
          {(toolsOpen || collapsed) && (
            <div className="space-y-0.5 mt-0.5">
              {toolItems.map((item) => (
                <NavItem key={item.to} {...item} />
              ))}
            </div>
          )}
        </div>

        {can.senior && (
          <div className="pt-2">
            <SectionLabel label="Admin" />
            {adminItems.map((item) => (
              <NavItem key={item.to} {...item} />
            ))}
          </div>
        )}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-slate-800">
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
