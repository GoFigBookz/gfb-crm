/**
 * Figs at Work — content script (her HANDS in the page).
 * Executes the click/type/scroll actions her brain decides, in Markie's own
 * logged-in tab. Reports the CSS viewport size so the brain's coordinates line up.
 */
function viewport() {
  return { vw: window.innerWidth, vh: window.innerHeight, dpr: window.devicePixelRatio || 1 };
}

function fire(el, type, x, y) {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 });
  el.dispatchEvent(ev);
}
function firePointer(el, type, x, y) {
  try { el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, pointerId: 1, isPrimary: true })); } catch (_) {}
}

function clickAt(x, y, dbl) {
  const el = document.elementFromPoint(x, y);
  if (!el) return `nothing at (${x},${y})`;
  firePointer(el, "pointerover", x, y); firePointer(el, "pointerenter", x, y);
  fire(el, "mousemove", x, y);
  firePointer(el, "pointerdown", x, y); fire(el, "mousedown", x, y);
  try { el.focus && el.focus(); } catch (_) {}
  firePointer(el, "pointerup", x, y); fire(el, "mouseup", x, y);
  fire(el, "click", x, y);
  if (dbl) fire(el, "dblclick", x, y);
  return `${dbl ? "double-" : ""}click ${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}`;
}
function rightClickAt(x, y) {
  const el = document.elementFromPoint(x, y);
  if (el) el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2 }));
  return "right-click";
}

function setNativeValue(el, value) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value");
  if (setter && setter.set) setter.set.call(el, value); else el.value = value;
}
function typeText(text) {
  const el = document.activeElement;
  if (!el) return "no focused field";
  if (el.isContentEditable) {
    document.execCommand("insertText", false, text);
    el.dispatchEvent(new InputEvent("input", { bubbles: true }));
    return `typed (contenteditable)`;
  }
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
    setNativeValue(el, (el.value || "") + text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return `typed "${text.slice(0, 30)}"`;
  }
  return "focused element is not typable";
}
function pressKey(name) {
  const map = { Return: "Enter", enter: "Enter", Enter: "Enter", Tab: "Tab", Escape: "Escape", Esc: "Escape", Backspace: "Backspace", BackSpace: "Backspace", Delete: "Delete", space: " ", Space: " " };
  const key = map[name] || name;
  const el = document.activeElement || document.body;
  const opts = { bubbles: true, cancelable: true, key, code: key.length === 1 ? "Key" + key.toUpperCase() : key };
  el.dispatchEvent(new KeyboardEvent("keydown", opts));
  el.dispatchEvent(new KeyboardEvent("keyup", opts));
  // Enter on a form input often needs a submit nudge handled by the app's own keydown.
  return `key ${key}`;
}

async function exec(action) {
  const x = Math.round(action.x), y = Math.round(action.y);
  switch (action.kind) {
    case "click": return clickAt(x, y, false);
    case "double_click": return clickAt(x, y, true);
    case "right_click": return rightClickAt(x, y);
    case "move": { const el = document.elementFromPoint(x, y); if (el) fire(el, "mousemove", x, y); return "move"; }
    case "type": return typeText(String(action.text || ""));
    case "key": return pressKey(String(action.key || "Enter"));
    case "scroll": { const amt = (Number(action.amount) || 3) * 100 * (action.direction === "up" ? -1 : 1); window.scrollBy(0, amt); return `scroll ${action.direction || "down"}`; }
    case "drag": return "drag (skipped)";
    case "wait": await new Promise((r) => setTimeout(r, Math.min(3000, Number(action.ms) || 800))); return "wait";
    case "screenshot": return "screenshot";
    default: return `unsupported ${action.kind}`;
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "figs-viewport") { sendResponse(viewport()); return true; }
  if (msg && msg.type === "figs-exec") {
    (async () => {
      const labels = [];
      for (const a of msg.actions || []) { labels.push(await exec(a)); await new Promise((r) => setTimeout(r, 250)); }
      sendResponse({ ok: true, labels, viewport: viewport() });
    })();
    return true; // async
  }
});
