import { Routes, Route, Navigate } from "react-router";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import LandingPage from "./pages/LandingPage";
import QuickAdd from "./pages/QuickAdd";
import { AppLayout } from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import Clients from "./pages/Clients";
import Tasks from "./pages/Tasks";
import TasksCleanup from "./pages/TasksCleanup";
import PlanMyDay from "./pages/PlanMyDay";
import Emails from "./pages/Emails";
import CalendarPage from "./pages/Calendar";
import Files from "./pages/Files";
import Invoices from "./pages/Invoices";
import AIAgents from "./pages/AIAgents";
import Integrations from "./pages/Integrations";
import SettingsPage from "./pages/SettingsPage";
import Triage from "./pages/Triage";
import FigsAtWork from "./pages/FigsAtWork";
import QBO from "./pages/QBO";

import Calculators from "./pages/Calculators";
import ChartOfAccounts from "./pages/ChartOfAccounts";
import DriveCleanup from "./pages/DriveCleanup";
import SendFax from "./pages/SendFax";
import Crypto from "./pages/Crypto";
import ClientVault from "./pages/ClientVault";
import Onboarding from "./pages/Onboarding";
import OnboardingForm from "./pages/OnboardingForm";
import UsersManagement from "./pages/UsersManagement";
import Employees from "./pages/Employees";
import Payroll from "./pages/Payroll";
import PayrollApproval from "./pages/PayrollApproval";
import RevRecShare from "./pages/RevRecShare";
import BankedHoursShare from "./pages/BankedHoursShare";
import BillbackShare from "./pages/BillbackShare";
import BillbackReport from "./pages/BillbackReport";
import FamilyTreeShare from "./pages/FamilyTreeShare";
import LoanShare from "./pages/LoanShare";
import GroupBookShare from "./pages/GroupBookShare";
import ClientRequest from "./pages/ClientRequest";
import Messages from "./pages/Messages";
import Interco from "./pages/Interco";
import Groups from "./pages/Groups";
import EngagementLetters from "./pages/EngagementLetters";
import BankConverter from "./pages/BankConverter";
import PdfSplitter from "./pages/PdfSplitter";
import Assistant from "./pages/Assistant";
import SystemHealth from "./pages/SystemHealth";
import CashWatch from "./pages/CashWatch";
import Personal from "./pages/Personal";
import Brain from "./pages/Brain";
import Registers from "./pages/Registers";
import Launchpad from "./pages/Launchpad";
import HstAudit from "./pages/HstAudit";
import HstReview from "./pages/HstReview";
import ReconMatch from "./pages/ReconMatch";
import Subscriptions from "./pages/Subscriptions";
import JadePricing from "./pages/JadePricing";
import Marketing from "./pages/Marketing";
import MyLife from "./pages/MyLife";
import TaxDeadlines from "./pages/TaxDeadlines";
import YearEndChecklist from "./pages/YearEndChecklist";
import Templates from "./pages/Templates";
import Receipts from "./pages/Receipts";
import Resources from "./pages/Resources";
import PracticeHealth from "./pages/PracticeHealth";
import Insights from "./pages/Insights";
import ClientDashboard from "./pages/ClientDashboard";
import ClientWorkspace from "./pages/ClientWorkspace";
import ClientPortal from "./pages/ClientPortal";
import PortalSettings from "./pages/PortalSettings";
import Signatures from "./pages/Signatures";
import ClientPlaybook from "./pages/ClientPlaybook";
import StaffWorkload from "./pages/StaffWorkload";
import MonthlyCloseChecklist from "./pages/MonthlyCloseChecklist";
import MonthEndClose from "./pages/MonthEndClose";
import PricingCalculator from "./pages/PricingCalculator";
import SatisfactionScores from "./pages/SatisfactionScores";
import EmergencySOP from "./pages/EmergencySOP";
import DiscoveryCall from "./pages/DiscoveryCall";
import OnboardingChecklist from "./pages/OnboardingChecklist";
import SheetsSetup from "./pages/SheetsSetup";
import Leads from "./pages/Leads";

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<Login />} />
      
      {/* Client onboarding form (public, token-based) */}
      <Route path="/onboarding/:token" element={<OnboardingForm />} />
      
      {/* Client portal (public, token-based passwordless login) */}
      <Route path="/portal/:token" element={<ClientPortal />} />

      {/* Payroll hours approval (public, token-based) */}
      <Route path="/approve/:token" element={<PayrollApproval />} />

      {/* Public read-only WIP / revenue recognition schedule for the client */}
      <Route path="/share/revrec/:token" element={<RevRecShare />} />

      {/* Public read+write banked-hours sheet for the client */}
      <Route path="/share/banked/:token" element={<BankedHoursShare />} />
      {/* Public read-only inter-company billback worksheet */}
      <Route path="/share/billback/:token" element={<BillbackShare />} />
      <Route path="/share/family/:token" element={<FamilyTreeShare />} />
      <Route path="/share/loans/:token" element={<LoanShare />} />
      <Route path="/share/group/:token" element={<GroupBookShare />} />

      {/* Client document/info request checklist (public, token-based) */}
      <Route path="/request/:token" element={<ClientRequest />} />
      
      {/* Protected routes (work in demo mode too) */}
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/triage" element={<Triage />} />
        <Route path="/figs-at-work" element={<FigsAtWork />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/plan" element={<PlanMyDay />} />
        <Route path="/tasks-cleanup" element={<TasksCleanup />} />
        <Route path="/emails" element={<Emails />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/files" element={<Files />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/ai-agents" element={<AIAgents />} />
        <Route path="/integrations" element={<Integrations />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/qbo" element={<QBO />} />
        <Route path="/calculators" element={<Calculators />} />
        <Route path="/chart-of-accounts" element={<ChartOfAccounts />} />
        <Route path="/drive-cleanup" element={<DriveCleanup />} />
        <Route path="/send-fax" element={<SendFax />} />
        <Route path="/crypto" element={<Crypto />} />
        <Route path="/vault" element={<ClientVault />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/payroll" element={<Payroll />} />
        <Route path="/interco" element={<Interco />} />
        <Route path="/groups" element={<Groups />} />
        <Route path="/engagement" element={<EngagementLetters />} />
        <Route path="/bank-converter" element={<BankConverter />} />
        <Route path="/pdf-splitter" element={<PdfSplitter />} />
        <Route path="/assistant" element={<Assistant />} />
        <Route path="/system-health" element={<SystemHealth />} />
        <Route path="/cash-watch" element={<CashWatch />} />
        <Route path="/personal" element={<Personal />} />
        <Route path="/brain" element={<Brain />} />
        <Route path="/registers" element={<Registers />} />
        <Route path="/launchpad" element={<Launchpad />} />
        <Route path="/hst-audit" element={<HstAudit />} />
        <Route path="/hst-review" element={<HstReview />} />
        <Route path="/recon-match" element={<ReconMatch />} />
        <Route path="/subscriptions" element={<Subscriptions />} />
        <Route path="/jade-pricing" element={<JadePricing />} />
        <Route path="/marketing" element={<Marketing />} />
        <Route path="/my-life" element={<MyLife />} />
        <Route path="/tax-deadlines" element={<TaxDeadlines />} />
        <Route path="/year-end" element={<YearEndChecklist />} />
        <Route path="/templates" element={<Templates />} />
        <Route path="/receipts" element={<Receipts />} />
        <Route path="/resources" element={<Resources />} />
        <Route path="/practice-health" element={<PracticeHealth />} />
        <Route path="/insights" element={<Insights />} />
        <Route path="/users" element={<UsersManagement />} />
        <Route path="/client/:clientId" element={<ClientWorkspace />} />
        <Route path="/client/:clientId/classic" element={<ClientDashboard />} />
        <Route path="/report/billback/:clientId" element={<BillbackReport />} />
        <Route path="/portal-settings" element={<PortalSettings />} />
        <Route path="/signatures" element={<Signatures />} />
        <Route path="/playbook" element={<ClientPlaybook />} />
        <Route path="/staff-workload" element={<StaffWorkload />} />
        <Route path="/monthly-close" element={<MonthlyCloseChecklist />} />
        <Route path="/month-end-close" element={<MonthEndClose />} />
        <Route path="/pricing-calculator" element={<PricingCalculator />} />
        <Route path="/satisfaction" element={<SatisfactionScores />} />
        <Route path="/emergency-sop" element={<EmergencySOP />} />
        <Route path="/discovery" element={<DiscoveryCall />} />
        <Route path="/onboarding-checklist" element={<OnboardingChecklist />} />
        <Route path="/sheets-setup" element={<SheetsSetup />} />
      </Route>

      {/* Quick Add Task (mobile-optimized, no sidebar) */}
      <Route path="/quick-add" element={<QuickAdd />} />
      <Route path="/landing" element={<LandingPage />} />
      <Route path="/get-started" element={<Navigate to="/login" replace />} />
      
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default AppRoutes;
