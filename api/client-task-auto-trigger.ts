/**
 * CLIENT TASK AUTO-TRIGGER
 * Automatically creates recurring task rules when client data is updated
 * with business numbers, HST frequency, payroll info, etc.
 */

import { getDb } from "./queries/connection";
import { clients, clientTaskRules } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { createClientTaskRules } from "./task-generator";
import type { OnboardingData } from "./task-generator";

/**
 * Check if client has task rules already
 */
async function clientHasTaskRules(clientId: number): Promise<boolean> {
  const db = getDb();
  const rules = await db
    .select()
    .from(clientTaskRules)
    .where(eq(clientTaskRules.clientId, clientId))
    .limit(1);
  return rules.length > 0;
}

/**
 * Extract business info from client record and build onboarding data
 */
export async function buildOnboardingDataFromClient(clientId: number, userId: number): Promise<OnboardingData | null> {
  const db = getDb();
  const rows = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  const client = rows[0];

  if (!client) return null;

  // Parse HST/GST frequency from client record
  let hstGstFrequency: string | null = null;
  if (client.hstGstNumber) {
    // If they have an HST number, check frequency field or default to quarterly
    hstGstFrequency = client.hstGstFrequency || "quarterly";
  }

  // Parse payroll frequency
  let payrollFrequency: string | null = null;
  let hasEmployees = false;
  if (client.payrollAccountNumber || client.currentPayrollProvider) {
    hasEmployees = true;
    payrollFrequency = client.payrollFrequency || "biweekly";
  }

  // Determine fiscal year end
  const fiscalYearEnd = client.fiscalYearEnd || "December 31";

  // Check for other indicators
  const hasSubcontractors = client.hasSubcontractors || false;
  const hasInvestments = client.hasInvestments || false;
  const wsibRequired = client.wsibRequired || false;
  const needsYearEnd = true; // All clients need year-end

  // Banking
  const bankAccountCount = client.bankAccountCount || 1;
  const creditCardCount = client.creditCardCount || 0;

  // Sales platforms (check notes or other fields)
  const usesStripe = client.notes?.toLowerCase().includes("stripe") || false;
  const usesSquare = client.notes?.toLowerCase().includes("square") || false;
  const usesJobber = client.notes?.toLowerCase().includes("jobber") || false;

  return {
    clientId,
    userId,
    fiscalYearEnd,
    hstGstFrequency,
    payrollFrequency,
    hasEmployees,
    hasSubcontractors,
    hasInvestments,
    wsibRequired,
    bankAccountCount,
    creditCardCount,
    needsYearEnd,
    usesStripe,
    usesSquare,
    usesJobber,
  };
}

/**
 * Auto-generate task rules for a client if they don't exist yet
 * Called when client is created or updated with business info
 */
export async function autoGenerateClientTaskRules(clientId: number, userId: number): Promise<{ created: boolean; message: string; rulesCount: number; tasksCount: number }> {
  try {
    // Check if rules already exist
    const hasRules = await clientHasTaskRules(clientId);
    if (hasRules) {
      return { created: false, message: "Client already has task rules", rulesCount: 0, tasksCount: 0 };
    }

    // Build onboarding data from client record
    const onboardingData = await buildOnboardingDataFromClient(clientId, userId);
    if (!onboardingData) {
      return { created: false, message: "Client not found", rulesCount: 0, tasksCount: 0 };
    }

    // Only create rules if client has at least one triggering field
    const hasTriggerData = onboardingData.hstGstFrequency ||
      onboardingData.payrollFrequency ||
      onboardingData.hasSubcontractors ||
      onboardingData.wsibRequired;

    if (!hasTriggerData) {
      return { created: false, message: "No business data to trigger rules", rulesCount: 0, tasksCount: 0 };
    }

    // Create the rules
    const result = await createClientTaskRules(onboardingData);

    return {
      created: true,
      message: `Created ${result.rules.length} recurring task rules and ${result.tasks.length} initial tasks`,
      rulesCount: result.rules.length,
      tasksCount: result.tasks.length,
    };
  } catch (err) {
    console.error("[AutoTrigger] Failed to generate rules:", err);
    return { created: false, message: `Error: ${err}`, rulesCount: 0, tasksCount: 0 };
  }
}

/**
 * Delete all task rules for a client (used when re-triggering)
 */
export async function deleteClientTaskRules(clientId: number): Promise<void> {
  const db = getDb();
  await db
    .delete(clientTaskRules)
    .where(eq(clientTaskRules.clientId, clientId));
}

/**
 * Re-generate task rules for a client (delete old, create new)
 */
export async function regenerateClientTaskRules(clientId: number, userId: number): Promise<{ created: boolean; message: string; rulesCount: number; tasksCount: number }> {
  await deleteClientTaskRules(clientId);
  return autoGenerateClientTaskRules(clientId, userId);
}
