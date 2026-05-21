import { SignJWT, jwtVerify } from "jose";

const APP_SECRET = "0UnN29IhnZ2eqStWku0issGyvZAGq5wN";
const BASE_URL = "http://localhost:3000/api/trpc";

async function apiCall(path, method, body) {
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
  const clientId = 53; // The demo lead we just created

  // Get engagement letter data
  console.log("📄 Getting engagement letter...");
  const letterData = await apiCall("engagementLetter.get", "GET", { clientId });
  console.log("Letter data:", JSON.stringify(letterData, null, 2));

  if (letterData.error) {
    console.error("❌ Failed to get letter:", letterData.error);
    process.exit(1);
  }

  const letter = letterData.result?.data?.json;

  // Build email body
  const emailBody = `
Dear ${letter.clientName},

Thank you for considering Go Fig Books Inc. for your bookkeeping and accounting needs.

We are pleased to present this Letter of Engagement outlining the services we will provide:

SERVICES INCLUDED:
${letter.services.map(s => `- ${s}`).join('\n')}

FEE STRUCTURE:
- Type: ${letter.feeType === 'monthly_fixed' ? 'Monthly Fixed Fee' : letter.feeType}
- Amount: $${letter.feeAmount}/month
- Year End: ${letter.yearEnd}

NEXT STEPS:
1. Review this engagement letter
2. Sign electronically (link will be provided)
3. Complete onboarding questionnaire
4. Provide access to bookkeeping software and bank accounts

We look forward to working with you!

Best regards,
Markie
Go Fig Books Inc.
`;

  // Send email - need a connected account first, let's check if one exists
  console.log("\n📧 Checking connected accounts...");
  const accounts = await apiCall("email.connectedAccounts", "GET", {});
  console.log("Accounts:", JSON.stringify(accounts, null, 2));

  // For now, let's just log what we would send
  console.log("\n=== EMAIL TO SEND ===");
  console.log("To:", letter.email);
  console.log("Subject: Engagement Letter - Go Fig Books Inc.");
  console.log("Body:\n", emailBody);
  console.log("=======================");
}

main().catch(console.error);
