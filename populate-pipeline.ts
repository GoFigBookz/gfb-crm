import { createClient } from '@libsql/client';

const client = createClient({ url: 'file:data/crm.db' });

async function populatePipeline() {
  console.log('=== POPULATING SALES PIPELINE ===\n');
  
  // Update all active clients to workflowStatus = 'active' (they're already clients!)
  const activeResult = await client.execute(`
    UPDATE clients 
    SET workflowStatus = 'active', 
        leadScore = COALESCE(leadScore, 5),
        estimatedMonthlyValue = COALESCE(estimatedMonthlyValue, monthlyFee, 300)
    WHERE status = 'active' 
      AND workflowStatus = 'new_lead'
      AND id <= 50
  `);
  console.log(`✅ Updated ${activeResult.rowsAffected} active clients to 'active' workflow status`);
  
  // Update inactive clients to 'inactive' workflow status
  const inactiveResult = await client.execute(`
    UPDATE clients 
    SET workflowStatus = 'inactive',
        leadScore = COALESCE(leadScore, 0)
    WHERE status = 'inactive'
      AND id <= 50
  `);
  console.log(`✅ Updated ${inactiveResult.rowsAffected} inactive clients to 'inactive' workflow status`);
  
  // Set demo lead (id 53) to engagement_sent
  const demoResult = await client.execute(`
    UPDATE clients
    SET workflowStatus = 'engagement_sent',
        engagementSentAt = ${Date.now()}
    WHERE id = 53
  `);
  console.log(`✅ Updated demo lead (id 53) to 'engagement_sent'`);
  
  // Clean up duplicate test clients (51, 52)
  const cleanupResult = await client.execute(`
    DELETE FROM clients WHERE id IN (51, 52)
  `);
  console.log(`✅ Cleaned up ${cleanupResult.rowsAffected} duplicate test clients`);
  
  // Show final stats
  console.log('\n=== FINAL PIPELINE STATS ===');
  
  const stats = await client.execute(`
    SELECT 
      workflowStatus,
      COUNT(*) as count,
      SUM(COALESCE(estimatedMonthlyValue, 0)) as pipelineValue
    FROM clients 
    WHERE userId = 1
    GROUP BY workflowStatus
    ORDER BY count DESC
  `);
  
  console.log(JSON.stringify(stats.rows, null, 2));
  
  const total = await client.execute(`
    SELECT 
      COUNT(*) as totalClients,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as activeClients,
      SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactiveClients,
      SUM(CASE WHEN status = 'lead' THEN 1 ELSE 0 END) as leads,
      SUM(COALESCE(estimatedMonthlyValue, 0)) as totalMonthlyValue
    FROM clients
    WHERE userId = 1
  `);
  
  console.log('\n=== OVERALL STATS ===');
  console.log(JSON.stringify(total.rows[0], null, 2));
}

populatePipeline().catch(console.error);
