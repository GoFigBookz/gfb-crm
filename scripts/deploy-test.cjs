/**
 * DEPLOY TEST SCRIPT
 * Run this after deployment to verify everything works
 */

const ENDPOINTS = [
  { name: "Health Check", method: "GET", url: "https://figgy.gofig.ca/api/trpc/health" },
  { name: "Ping", method: "GET", url: "https://figgy.gofig.ca/api/trpc/ping" },
  { name: "Morning Briefing", method: "POST", url: "https://figgy.gofig.ca/api/trpc/agent.morningBriefing", body: {} },
  { name: "Voice Create Task", method: "POST", url: "https://figgy.gofig.ca/api/trpc/voice.createTask", headers: { "X-Voice-Token": "gfb-voice-2026" }, body: { text: "Test task", userEmail: "markie@gofig.ca" } },
  { name: "List Integrations", method: "GET", url: "https://figgy.gofig.ca/api/trpc/integration.list" },
  { name: "Client Stats", method: "GET", url: "https://figgy.gofig.ca/api/trpc/crmClient.stats" },
];

async function testEndpoint(endpoint) {
  try {
    const options = {
      method: endpoint.method,
      headers: {
        "Content-Type": "application/json",
        ...(endpoint.headers || {}),
      },
    };

    if (endpoint.body) {
      options.body = JSON.stringify(endpoint.body);
    }

    const response = await fetch(endpoint.url, options);
    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    const status = response.ok ? "✅ PASS" : "❌ FAIL";
    console.log(`${status} ${endpoint.name} (${response.status})`);

    if (!response.ok) {
      console.log(`   Error: ${JSON.stringify(data).substring(0, 200)}`);
    }

    return response.ok;
  } catch (err) {
    console.log(`❌ FAIL ${endpoint.name} — ${err.message}`);
    return false;
  }
}

async function main() {
  console.log("=== GFB CRM Deploy Test ===\n");

  let passed = 0;
  let failed = 0;

  for (const endpoint of ENDPOINTS) {
    const ok = await testEndpoint(endpoint);
    if (ok) passed++;
    else failed++;
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

  if (failed > 0) {
    console.log("\n⚠️ Some endpoints failed. Check the logs above.");
    process.exit(1);
  } else {
    console.log("\n✅ All endpoints working!");
  }
}

main();
