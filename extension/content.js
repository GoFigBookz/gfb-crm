/**
 * Figs at Work — content script (her EYES + HANDS in the page).
 * Builds a numbered list of the interactive elements her brain can act on, and
 * executes click/type/scroll/key by element ref, inside Markie's logged-in tab.
 */
let REFS = new Map(); // ref -> element, rebuilt each snapshot

function isVisible(el) {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  if (r.bottom < 0 || r.top > (window.innerHeight || 0) || r.right < 0 || r.left > (window.innerWidth || 0)) return false;
  const st = window.getComputedStyle(el);
  if (st.visibility === "hidden" || st.display === "none" || st.opacity === "0") return false;
  return true;
}

function kindOf(el) {
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute("role");
  if (tag === "a") return "link";
  if (tag === "button" || role === "button") return "button";
  if (tag === "input") return `input(${el.type || "text"})`;
  if (tag === "textarea") return "textarea";
  if (tag === "select") return "select";
  if (role) return role;
  if (el.isContentEditable) return "editable";
  return tag;
}

function nameOf(el) {
  const aria = el.getAttribute("aria-label");
  if (aria) return aria.trim();
  const ph = el.getAttribute("placeholder");
  const txt = (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ");
  if (txt) return txt.slice(0, 100);
  if (ph) return ph.trim();
  const title = el.getAttribute("title");
  if (title) return title.trim();
  const name = el.getAttribute("name");
  return name || "";
}

function snapshot() {
  REFS = new Map();
  const sel = 'a,button,input,textarea,select,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="checkbox"],[role="combobox"],[contenteditable="true"],[onclick]';
  const all = Array.from(document.querySelectorAll(sel));
  const elements = [];
  let ref = 0;
  for (const el of all) {
    if (!isVisible(el)) continue;
    if (el.disabled) continue;
    REFS.set(ref, el);
    elements.push({ ref, kind: kindOf(el), name: nameOf(el), value: (el.value || "").toString().slice(0, 60) });
    ref += 1;
    if (ref > 220) break;
  }
  const pageText = (document.body ? document.body.innerText : "").replace(/\n{2,}/g, "\n").slice(0, 4000);
  return { elements, pageText, vw: window.innerWidth, vh: window.innerHeight };
}

function fire(el, type, opts) { el.dispatchEvent(new MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, view: window, button: 0 }, opts || {}))); }

function clickEl(el) {
  el.scrollIntoView({ block: "center", inline: "center" });
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  try { el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y })); } catch (_) {}
  fire(el, "mousedown", { clientX: x, clientY: y });
  try { el.focus(); } catch (_) {}
  try { el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: x, clientY: y })); } catch (_) {}
  fire(el, "mouseup", { clientX: x, clientY: y });
  fire(el, "click", { clientX: x, clientY: y });
  return `clicked [${el.tagName.toLowerCase()}] ${nameOf(el).slice(0, 40)}`;
}

function setNativeValue(el, value) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value");
  if (setter && setter.set) setter.set.call(el, value); else el.value = value;
}
function typeInto(el, text) {
  try { el.focus(); } catch (_) {}
  if (el.isContentEditable) {
    el.textContent = text;
    el.dispatchEvent(new InputEvent("input", { bubbles: true }));
    return `typed into editable`;
  }
  setNativeValue(el, text);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return `typed "${text.slice(0, 30)}"`;
}
function pressKey(name) {
  const map = { enter: "Enter", Enter: "Enter", Tab: "Tab", Escape: "Escape", Esc: "Escape" };
  const key = map[name] || name || "Enter";
  const el = document.activeElement || document.body;
  const opts = { bubbles: true, cancelable: true, key, code: key };
  el.dispatchEvent(new KeyboardEvent("keydown", opts));
  el.dispatchEvent(new KeyboardEvent("keyup", opts));
  return `key ${key}`;
}

function execAct(a) {
  if (a.action === "scroll") { window.scrollBy(0, (a.direction === "up" ? -1 : 1) * Math.round(window.innerHeight * 0.8)); return `scroll ${a.direction || "down"}`; }
  if (a.action === "key") return pressKey(a.key);
  const el = REFS.get(Number(a.ref));
  if (!el) return `no element with ref ${a.ref}`;
  if (a.action === "click") return clickEl(el);
  if (a.action === "type") { clickEl(el); return typeInto(el, String(a.text || "")); }
  return `unsupported ${a.action}`;
}

chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  if (msg && msg.type === "figs-snapshot") { sendResponse(snapshot()); return true; }
  if (msg && msg.type === "figs-exec") {
    (async () => {
      const labels = [];
      for (const a of msg.actions || []) { labels.push(execAct(a)); await new Promise((r) => setTimeout(r, 300)); }
      sendResponse({ ok: true, labels });
    })();
    return true;
  }
});
