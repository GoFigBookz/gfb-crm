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
  console.log("📊 Getting updated pipeline stats...");
  const stats = await apiCall("crmClient.pipelineStats", "GET", {});
  console.log("Stats:", JSON.stringify(stats, null, 2));
}

main().catch(console.error);
