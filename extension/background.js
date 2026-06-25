/**
 * Figs at Work — background service worker (the LOOP).
 * Drives one task at a time: screenshot the active tab -> ask Figs' brain on the
 * Figgy server for the next action -> have the content script do it -> repeat.
 * Pauses on an approval gate (badge + notification) until Markie approves in the
 * popup. Never logs in; works only in the tab Markie already authenticated.
 */
const DEFAULT_BASE = "https://figgy.gofig.ca";

let state = { running: false, sessionId: null, tabId: null, goal: "", status: "idle", pending: null, log: [] };

function setBadge(text, color) {
  try { chrome.action.setBadgeText({ text: text || "" }); if (color) chrome.action.setBadgeBackgroundColor({ color }); } catch (_) {}
}
function pushLog(t) { state.log.push(t); if (state.log.length > 60) state.log.shift(); chrome.runtime.sendMessage({ type: "figs-state", state }).catch(() => {}); }
function emit() { chrome.runtime.sendMessage({ type: "figs-state", state }).catch(() => {}); }

async function cfg() {
  const s = await chrome.storage.local.get(["apiBase", "token"]);
  return { base: (s.apiBase || DEFAULT_BASE).replace(/\/$/, ""), token: s.token || "" };
}
async function api(path, body) {
  const { base, token } = await cfg();
  const res = await fetch(`${base}/api/figs-ext/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-figs-token": token },
    body: JSON.stringify(body || {}),
  });
  return res.json();
}

async function getSnapshot(tabId) {
  try { return await chrome.tabs.sendMessage(tabId, { type: "figs-snapshot" }); }
  catch (_) {
    await injectContent(tabId);
    return chrome.tabs.sendMessage(tabId, { type: "figs-snapshot" });
  }
}
async function injectContent(tabId) {
  try { await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] }); } catch (_) {}
}

/** Capture the visible tab and downscale to the CSS viewport so the brain's
 *  coordinates equal CSS pixels (what the content script clicks with). */
async function snap(tabId, vw, vh) {
  const dataUrl = await chrome.tabs.captureVisibleTab(undefined, { format: "png" });
  const resp = await fetch(dataUrl);
  const blob = await resp.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(vw, vh);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, vw, vh);
  const outBlob = await canvas.convertToBlob({ type: "image/png" });
  const buf = await outBlob.arrayBuffer();
  // base64 encode
  let binary = ""; const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function doExec(tabId, actions) {
  try { return await chrome.tabs.sendMessage(tabId, { type: "figs-exec", actions }); }
  catch (_) { await injectContent(tabId); return chrome.tabs.sendMessage(tabId, { type: "figs-exec", actions }); }
}

async function loop(firstReply) {
  let reply = firstReply;
  while (state.running) {
    if (reply.error) { pushLog("⚠ " + reply.error); state.status = "error"; state.running = false; setBadge("!", "#dc2626"); emit(); return; }
    if (reply.done) { state.status = "done"; state.running = false; pushLog("✅ " + (reply.summary || "done")); setBadge("✓", "#16a34a"); emit(); return; }
    if (reply.pending) { state.status = "awaiting_approval"; state.pending = reply.pending; pushLog("⏸ " + reply.pending.summary); setBadge("?", "#f59e0b"); emit();
      try { chrome.notifications.create({ type: "basic", iconUrl: "icons/icon-128.png", title: "Figs needs your OK", message: reply.pending.summary }); } catch (_) {}
      return; // wait for popup approve/deny
    }
    const actions = reply.actions || [];
    if (actions.length) { const r = await doExec(state.tabId, actions); if (r && r.labels) r.labels.forEach((l) => pushLog("• " + l)); }
    await new Promise((r) => setTimeout(r, 700));
    const snapData = await getSnapshot(state.tabId);
    const shot = await snap(state.tabId, snapData.vw, snapData.vh);
    reply = await api("step", { sessionId: state.sessionId, shot, elements: snapData.elements, pageText: snapData.pageText });
  }
}

async function start(goal) {
  const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!tab) { pushLog("No active tab."); return; }
  state = { running: true, sessionId: null, tabId: tab.id, goal, status: "running", pending: null, log: [] };
  setBadge("…", "#65a30d"); emit();
  await injectContent(tab.id);
  const started = await api("start", { goal });
  if (started.error || !started.sessionId) { pushLog("⚠ " + (started.error || "could not start — check token")); state.running = false; state.status = "error"; setBadge("!", "#dc2626"); emit(); return; }
  state.sessionId = started.sessionId;
  pushLog("Goal: " + goal);
  const snapData = await getSnapshot(tab.id);
  const shot = await snap(tab.id, snapData.vw, snapData.vh);
  const reply = await api("step", { sessionId: state.sessionId, shot, elements: snapData.elements, pageText: snapData.pageText });
  await loop(reply);
}

async function approve() {
  if (!state.sessionId) return;
  state.pending = null; state.status = "running"; state.running = true; setBadge("…", "#65a30d"); emit();
  const reply = await api("approve", { sessionId: state.sessionId });
  await loop(reply);
}
async function deny(note) {
  if (!state.sessionId) return;
  state.pending = null; state.status = "running"; state.running = true; setBadge("…", "#65a30d"); emit();
  const reply = await api("deny", { sessionId: state.sessionId, note });
  await loop(reply);
}
async function stop() {
  state.running = false; state.status = "idle"; setBadge("", "#000");
  if (state.sessionId) { try { await api("stop", { sessionId: state.sessionId }); } catch (_) {} }
  state.sessionId = null; emit();
}

chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  if (!msg) return;
  if (msg.type === "figs-start") { start(String(msg.goal || "")); sendResponse({ ok: true }); return; }
  if (msg.type === "figs-approve") { approve(); sendResponse({ ok: true }); return; }
  if (msg.type === "figs-deny") { deny(msg.note); sendResponse({ ok: true }); return; }
  if (msg.type === "figs-stop") { stop(); sendResponse({ ok: true }); return; }
  if (msg.type === "figs-get") { sendResponse({ state }); return; }
});
