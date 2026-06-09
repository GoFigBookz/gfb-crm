import { Routes, Route, Navigate } from "react-router";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import LandingPage from "./pages/LandingPage";
import QuickAdd from "./pages/QuickAdd";
import { AppLayout } from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import Clients from "./pages/Clients";
import Tasks from "./pages/Tasks";
import Emails from "./pages/Emails";
import CalendarPage from "./pages/Calendar";
import Files from "./pages/Files";
import Invoices from "./pages/Invoices";
import AIAgents from "./pages/AIAgents";
import Integrations from "./pages/Integrations";
import SettingsPage from "./pages/SettingsPage";
import Triage from "./pages/Triage";
import QBO from "./pages/QBO";

import Calculators from "./pages/Calculators";
import ClientVault from "./pages/ClientVault";
import Onboarding from "./pages/Onboarding";
import OnboardingForm from "./pages/OnboardingForm";
import UsersManagement from "./pages/UsersManagement";
import Employees from "./pages/Employees";
import EngagementLetters from "./pages/EngagementLetters";
import BankConverter from "./pages/BankConverter";
import TaxDeadlines from "./pages/TaxDeadlines";
import YearEndChecklist from "./pages/YearEndChecklist";
import Templates from "./pages/Templates";
import Receipts from "./pages/Receipts";
import Resources from "./pages/Resources";
import IntakeDashboard from "./pages/IntakeDashboard";
import PracticeHealth from "./pages/PracticeHealth";
import ClientDashboard from "./pages/ClientDashboard";
import ClientPortal from "./pages/ClientPortal";
import PortalSettings from "./pages/PortalSettings";
import Signatures from "./pages/Signatures";
import ClientPlaybook from "./pages/ClientPlaybook";
import StaffWorkload from "./pages/StaffWorkload";
import MonthlyCloseChecklist from "./pages/MonthlyCloseChecklist";
import PricingCalculator from "./pages/PricingCalculator";
import SatisfactionScores from "./pages/SatisfactionScores";
import ClientImport from "./pages/ClientImport";
import EmergencySOP from "./pages/EmergencySOP";
import DiscoveryCall from "./pages/DiscoveryCall";
import OnboardingChecklist from "./pages/OnboardingChecklist";
import SheetsSetup from "./pages/SheetsSetup";

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<Login />} />
      
      {/* Client onboarding form (public, token-based) */}
      <Route path="/onboarding/:token" element={<OnboardingForm />} />
      
      {/* Client portal (public, token-based passwordless login) */}
      <Route path="/portal/:token" element={<ClientPortal />} />
      
      {/* Protected routes (work in demo mode too) */}
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/triage" element={<Triage />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/emails" element={<Emails />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/files" element={<Files />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/ai-agents" element={<AIAgents />} />
        <Route path="/integrations" element={<Integrations />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/qbo" element={<QBO />} />
        <Route path="/calculators" element={<Calculators />} />
        <Route path="/vault" element={<ClientVault />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/engagement" element={<EngagementLetters />} />
        <Route path="/bank-converter" element={<BankConverter />} />
        <Route path="/tax-deadlines" element={<TaxDeadlines />} />
        <Route path="/year-end" element={<YearEndChecklist />} />
        <Route path="/templates" element={<Templates />} />
        <Route path="/receipts" element={<Receipts />} />
        <Route path="/resources" element={<Resources />} />
        <Route path="/intake" element={<IntakeDashboard />} />
        <Route path="/practice-health" element={<PracticeHealth />} />
        <Route path="/users" element={<UsersManagement />} />
        <Route path="/client/:clientId" element={<ClientDashboard />} />
        <Route path="/portal-settings" element={<PortalSettings />} />
        <Route path="/signatures" element={<Signatures />} />
        <Route path="/playbook" element={<ClientPlaybook />} />
        <Route path="/staff-workload" element={<StaffWorkload />} />
        <Route path="/monthly-close" element={<MonthlyCloseChecklist />} />
        <Route path="/pricing-calculator" element={<PricingCalculator />} />
        <Route path="/satisfaction" element={<SatisfactionScores />} />
        <Route path="/client-import" element={<ClientImport />} />
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
