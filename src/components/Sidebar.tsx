import { useState } from "react";
import { NavLink } from "react-router";
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  Mail,
  CalendarDays,
  FolderOpen,
  Receipt,
  Bot,
  Link,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Landmark,
  Shield,
  UserCog,
  FileText,
  Briefcase,
  ScrollText,
  Wrench,
  Calculator,
  ArrowRightLeft,
  CalendarClock,
  ClipboardCheck,
  FileSpreadsheet,
  ScanLine,
  BookOpen,
  ShieldCheck,
  BarChart3,
  FileSignature,
  Notebook,
  Globe,
  UsersRound,
  Upload,
  Heart,
  AlertTriangle,
  Phone,
  Database,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

interface NavItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  minRole: "client" | "staff" | "senior" | "admin";
}

interface ToolItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { user, can } = useAuth();
  const [toolsOpen, setToolsOpen] = useState(true);

  const mainNavItems: NavItem[] = [
    { to: "/", icon: LayoutDashboard, label: "Dashboard", minRole: "staff" },
    { to: "/clients", icon: Users, label: "Clients", minRole: "staff" },
    { to: "/tasks", icon: CheckSquare, label: "Tasks", minRole: "staff" },
    { to: "/emails", icon: Mail, label: "Emails", minRole: "staff" },
    { to: "/calendar", icon: CalendarDays, label: "Calendar", minRole: "staff" },
    { to: "/files", icon: FolderOpen, label: "Files", minRole: "staff" },
    { to: "/invoices", icon: Receipt, label: "Invoices", minRole: "staff" },
    { to: "/qbo", icon: Landmark, label: "QuickBooks", minRole: "senior" },
    { to: "/vault", icon: Shield, label: "Client Vault", minRole: "staff" },
    { to: "/portal-settings", icon: Globe, label: "Client Portals", minRole: "staff" },
    { to: "/staff-workload", icon: UsersRound, label: "Staff Workload", minRole: "senior" },
    { to: "/employees", icon: Briefcase, label: "Employees", minRole: "staff" },
    { to: "/engagement", icon: ScrollText, label: "Engagement Letters", minRole: "senior" },
    { to: "/discovery", icon: Phone, label: "Discovery Call", minRole: "staff" },
    { to: "/onboarding-checklist", icon: CheckSquare, label: "Onboarding Checklist", minRole: "staff" },
    { to: "/signatures", icon: FileSignature, label: "Signatures", minRole: "senior" },
    { to: "/playbook", icon: Notebook, label: "Client Playbook", minRole: "staff" },
    { to: "/ai-agents", icon: Bot, label: "AI Agents", minRole: "senior" },
    { to: "/triage", icon: ShieldCheck, label: "AI Triage", minRole: "senior" },
    { to: "/practice-health", icon: BarChart3, label: "Practice Health", minRole: "admin" },
    { to: "/satisfaction", icon: Heart, label: "Satisfaction Scores", minRole: "staff" },
    { to: "/clickup-import", icon: Upload, label: "ClickUp Import", minRole: "senior" },
    { to: "/emergency-sop", icon: AlertTriangle, label: "Emergency SOP", minRole: "staff" },
    { to: "/integrations", icon: Link, label: "Integrations", minRole: "senior" },
    { to: "/users", icon: UserCog, label: "Users", minRole: "admin" },
    { to: "/settings", icon: Settings, label: "Settings", minRole: "senior" },
    { to: "/sheets-setup", icon: Database, label: "Sheets DB Setup", minRole: "admin" },
  ];

  const toolItems: ToolItem[] = [
    { to: "/calculators", icon: Calculator, label: "Calculators" },
    { to: "/bank-converter", icon: ArrowRightLeft, label: "Bank \u2192 QBO" },
    { to: "/tax-deadlines", icon: CalendarClock, label: "Tax Deadlines" },
    { to: "/year-end", icon: ClipboardCheck, label: "Year-End Checklist" },
    { to: "/monthly-close", icon: CheckSquare, label: "Monthly Close" },
    { to: "/templates", icon: FileSpreadsheet, label: "Templates" },
    { to: "/receipts", icon: ScanLine, label: "Receipt Scanner" },
    { to: "/resources", icon: BookOpen, label: "Resources" },
    { to: "/pricing-calculator", icon: Calculator, label: "Pricing Calculator" },
  ];

  const visibleMainItems = mainNavItems.filter((item) => {
    if (item.minRole === "client") return true;
    if (item.minRole === "staff") return can.staff;
    if (item.minRole === "senior") return can.senior;
    if (item.minRole === "admin") return can.admin;
    return false;
  });

  const ToolLink = ({ item }: { item: ToolItem }) => (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm",
          isActive
            ? "bg-lime-600/80 text-white"
            : "text-slate-400 hover:bg-slate-800 hover:text-white"
        )
      }
    >
      <item.icon className="h-4 w-4 flex-shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  );

  return (
    <aside
      className={cn(
        "bg-slate-900 text-white flex flex-col transition-all duration-300 ease-in-out h-screen",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between h-20 px-4 border-b border-slate-800">
        {!collapsed && (
          <div className="flex items-center gap-2 overflow-hidden">
            <img
              src="/assets/logo.jpg"
              alt="Go Fig Bookz"
              className="h-10 w-auto object-contain rounded bg-white"
            />
          </div>
        )}
        {collapsed && (
          <img
            src="/assets/logo.jpg"
            alt="Go Fig Bookz"
            className="h-8 w-auto object-contain rounded bg-white mx-auto"
          />
        )}
        <button
          onClick={onToggle}
          className="p-1 rounded-lg hover:bg-slate-800 transition-colors flex-shrink-0"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {visibleMainItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group",
                isActive
                  ? "bg-lime-600 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              )
            }
          >
            <item.icon className="h-5 w-5 flex-shrink-0" />
            {!collapsed && (
              <span className="font-medium text-sm truncate">{item.label}</span>
            )}
          </NavLink>
        ))}

        {/* Tools Section */}
        {can.staff && (
          <div className="mt-4 pt-4 border-t border-slate-800">
            {!collapsed && (
              <button
                onClick={() => setToolsOpen(!toolsOpen)}
                className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider hover:text-slate-300 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Wrench className="h-3.5 w-3.5" />
                  Tools
                </span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    toolsOpen && "rotate-180"
                  )}
                />
              </button>
            )}
            {collapsed && (
              <div className="flex justify-center py-2">
                <Wrench className="h-4 w-4 text-slate-500" />
              </div>
            )}
            {(!collapsed ? toolsOpen : true) && (
              <div className="space-y-0.5 mt-1">
                {toolItems.map((item) => (
                  <ToolLink key={item.to} item={item} />
                ))}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* User section */}
      <div className="p-4 border-t border-slate-800">
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-lime-400 to-blue-500 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
            {user?.name?.charAt(0)?.toUpperCase() || "U"}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{user?.name || "User"}</p>
              <p className="text-xs text-slate-500 truncate">
                {(user?.role as string)?.replace(/_/g, " ") || "Staff"}
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
