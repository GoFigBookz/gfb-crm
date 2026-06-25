const $ = (id) => document.getElementById(id);

function render(state) {
  if (!state) return;
  $("status").textContent = state.status === "running" ? "working…" : state.status === "awaiting_approval" ? "needs your OK" : state.status === "done" ? "done ✓" : state.status === "error" ? "error" : "";
  $("log").textContent = (state.log || []).join("\n");
  $("log").scrollTop = $("log").scrollHeight;
  if (state.pending) {
    $("pendingBox").style.display = "block";
    $("pendingSummary").textContent = state.pending.summary || "";
    $("pendingReason").textContent = state.pending.reason || "";
  } else {
    $("pendingBox").style.display = "none";
  }
}

async function load() {
  const s = await chrome.storage.local.get(["apiBase", "token"]);
  $("apiBase").value = s.apiBase || "https://figgy.gofig.ca";
  $("token").value = s.token || "";
  chrome.runtime.sendMessage({ type: "figs-get" }, (r) => render(r && r.state));
}

$("save").onclick = async () => {
  await chrome.storage.local.set({ apiBase: $("apiBase").value.trim(), token: $("token").value.trim() });
  $("status").textContent = "saved";
};
$("start").onclick = () => { const goal = $("goal").value.trim(); if (goal) chrome.runtime.sendMessage({ type: "figs-start", goal }); };
$("stop").onclick = () => chrome.runtime.sendMessage({ type: "figs-stop" });
$("approve").onclick = () => chrome.runtime.sendMessage({ type: "figs-approve" });
$("deny").onclick = () => { const note = prompt("Why deny / what should she do instead? (optional)") || ""; chrome.runtime.sendMessage({ type: "figs-deny", note }); };

chrome.runtime.onMessage.addListener((msg) => { if (msg && msg.type === "figs-state") render(msg.state); });
load();
