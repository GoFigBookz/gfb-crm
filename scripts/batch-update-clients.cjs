/**
 * BATCH CLIENT BUSINESS INFO UPDATE
 * Reads client data from a CSV/JSON file and updates CRM records.
 * Also triggers auto-generation of recurring task rules.
 * 
 * Usage:
 *   node scripts/batch-update-clients.cjs path/to/client-data.json
 * 
 * Input format (JSON):
 * [
 *   {
 *     "name": "Unimax Construction Group",
 *     "businessNumber": "123456789RC0001",
 *     "hstGstNumber": "123456789RT0001",
 *     "hstGstFrequency": "quarterly",
 *     "payrollAccountNumber": "123456789RP0001",
 *     "payrollFrequency": "biweekly",
 *     "fiscalYearEnd": "December 31",
 *     "wsibAccountNumber": "1234567",
 *     "hasSubcontractors": true,
 *     "hasInvestments": false
 *   }
 * ]
 */

const fs = require("fs");
const path = require("path");

async function main() {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error("Usage: node batch-update-clients.cjs <path/to/data.json>");
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(inputFile, "utf8"));

  // Import the API functions
  const { getDb } = await import("../api/queries/connection.js");
  const { clients, clientTaskRules } = await import("../db/schema.js");
  const { eq, like } = await import("drizzle-orm");
  const { autoGenerateClientTaskRules } = await import("../api/client-task-auto-trigger.js");

  const db = getDb();
  const results = { updated: 0, triggered: 0, errors: [] };

  for (const clientData of data) {
    try {
      // Find client by name
      const rows = await db
        .select()
        .from(clients)
        .where(like(clients.name, `%${clientData.name}%`))
        .limit(1);

      const client = rows[0];
      if (!client) {
        console.log(`⚠️ Client not found: ${clientData.name}`);
        continue;
      }

      // Update business fields
      const updates = {};
      if (clientData.businessNumber) updates.businessNumber = clientData.businessNumber;
      if (clientData.hstGstNumber) updates.hstGstNumber = clientData.hstGstNumber;
      if (clientData.hstGstFrequency) updates.hstGstFrequency = clientData.hstGstFrequency;
      if (clientData.payrollAccountNumber) updates.payrollAccountNumber = clientData.payrollAccountNumber;
      if (clientData.payrollFrequency) updates.payrollFrequency = clientData.payrollFrequency;
      if (clientData.fiscalYearEnd) updates.fiscalYearEnd = clientData.fiscalYearEnd;
      if (clientData.wsibAccountNumber) updates.wsibAccountNumber = clientData.wsibAccountNumber;
      if (clientData.wsibRequired !== undefined) updates.wsibRequired = clientData.wsibRequired;
      if (clientData.hasSubcontractors !== undefined) updates.hasSubcontractors = clientData.hasSubcontractors;
      if (clientData.hasInvestments !== undefined) updates.hasInvestments = clientData.hasInvestments;
      if (clientData.bankAccountCount) updates.bankAccountCount = clientData.bankAccountCount;
      if (clientData.creditCardCount) updates.creditCardCount = clientData.creditCardCount;

      if (Object.keys(updates).length > 0) {
        await db
          .update(clients)
          .set(updates)
          .where(eq(clients.id, client.id));

        console.log(`✅ Updated: ${clientData.name}`);
        results.updated++;
      }

      // Check if client already has task rules
      const rules = await db
        .select()
        .from(clientTaskRules)
        .where(eq(clientTaskRules.clientId, client.id))
        .limit(1);

      if (rules.length === 0) {
        // Auto-generate task rules
        const triggerResult = await autoGenerateClientTaskRules(client.id, client.userId);
        if (triggerResult.created) {
          console.log(`🔄 Auto-triggered ${triggerResult.rulesCount} rules for ${clientData.name}`);
          results.triggered++;
        }
      }
    } catch (err) {
      console.error(`❌ Error for ${clientData.name}:`, err.message);
      results.errors.push({ client: clientData.name, error: err.message });
    }
  }

  console.log("\n=== BATCH UPDATE COMPLETE ===");
  console.log(`Updated: ${results.updated} clients`);
  console.log(`Triggered rules: ${results.triggered} clients`);
  console.log(`Errors: ${results.errors.length}`);

  if (results.errors.length > 0) {
    console.log("\nErrors:");
    results.errors.forEach((e) => console.log(`  - ${e.client}: ${e.error}`));
  }
}

main().catch(console.error);
