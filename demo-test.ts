import { SignJWT, jwtVerify } from "jose";

const APP_SECRET = "0UnN29IhnZ2eqStWku0issGyvZAGq5wN";
const BASE_URL = "http://localhost:3000/api/trpc";

async function createToken() {
  const secret = new TextEncoder().encode(APP_SECRET);
  const token = await new SignJWT({
    unionId: "1", // user id 1
    clientId: "local",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1 year")
    .sign(secret);
  return token;
}

async function apiCall(path, method, body, token) {
  const url = method === "GET" 
    ? `${BASE_URL}/${path}?input=${encodeURIComponent(JSON.stringify({ json: body }))}`
    : `${BASE_URL}/${path}`;
  
  const headers = {
    "x-demo-mode": "true",
    "Content-Type": "application/json",
  };
  
  const options = method === "GET" 
    ? { method, headers }
    : { method, headers, body: JSON.stringify({ json: body }) };
  
  const res = await fetch(url, options);
  return res.json();
}

async function main() {
  console.log("🔑 Using demo mode...");
  
  // 1. Create demo lead
  console.log("\n👤 Creating demo lead...");
  const demoLead = {
    name: "Markie Test Client",
    email: "markie@gofig.ca",
    phone: "555-123-4567",
    company: "Test Company Inc.",
    address: "123 Test Street, Toronto, ON M5V 3A8",
    status: "lead",
    leadSource: "Website",
    leadSourceDetail: "Demo test for sales pipeline",
    assignedTo: "Markie",
    notes: "This is a demo lead for testing the sales pipeline workflow.",
    qboAccountType: "ca_clients",
    billingType: "monthly_fixed",
    monthlyFee: 450,
    hasHST: true,
    hstPeriod: "quarterly",
    hasWSIB: false,
    hasPayroll: true,
    payrollFrequency: "bi-weekly",
    yearEndMonth: "Dec",
    estimatedMonthlyValue: 450,
    leadScore: 8,
    transactionsPerMonth: 150,
  };
  
  const createResult = await apiCall("crmClient.create", "POST", demoLead);
  console.log("Create result:", JSON.stringify(createResult, null, 2));
  
  if (createResult.error) {
    console.error("❌ Failed to create lead:", createResult.error);
    process.exit(1);
  }
  
  const clientId = createResult.result?.data?.id || createResult.result?.data?.json?.id;
  console.log(`✅ Lead created with ID: ${clientId}`);
  
  // 2. Generate engagement letter
  console.log("\n📄 Generating engagement letter...");
  const letterResult = await apiCall("engagementLetter.generate", "POST", { clientId });
  console.log("Letter result:", JSON.stringify(letterResult, null, 2));
  
  // 3. List clients to verify
  console.log("\n📋 Listing leads...");
  const listResult = await apiCall("crmClient.list", "GET", { status: "lead", limit: 10 });
  console.log("List result:", JSON.stringify(listResult, null, 2));
  
  // 4. Check pipeline stats
  console.log("\n📊 Pipeline stats...");
  const statsResult = await apiCall("crmClient.pipelineStats", "GET", {});
  console.log("Stats result:", JSON.stringify(statsResult, null, 2));
}

main().catch(console.error);
