"use strict";

const api = globalThis.CodexBugbot;
const FILL_TIMEOUT_MS = 20000;

function isComposer(el) {
  if (!el || el.disabled || el.getAttribute("aria-hidden") === "true") return false;
  const placeholder = `${el.getAttribute("placeholder") || ""} ${el.getAttribute("aria-label") || ""} ${el.getAttribute("data-placeholder") || ""}`;
  const looksLikeComposer = /codex|ask|message|prompt|task|what can/i.test(placeholder);
  if (el.tagName === "TEXTAREA") return looksLikeComposer || el.offsetHeight >= 40;
  if (el.getAttribute("contenteditable") === "true") return looksLikeComposer || el.closest("form, [role='textbox']");
  return false;
}

function findComposer(root) {
  const nodes = root.querySelectorAll("textarea, [contenteditable='true'], [role='textbox']");
  for (const node of nodes) {
    if (isComposer(node)) return node;
  }
  return root.querySelector("textarea") || root.querySelector("[contenteditable='true']");
}

function setComposerValue(el, value) {
  el.focus();
  if ("value" in el) {
    const proto = Object.getPrototypeOf(el);
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    if (descriptor?.set) descriptor.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  if (el.getAttribute("contenteditable") === "true") {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    selection.removeAllRanges();
    selection.addRange(range);
    const ok = document.execCommand("insertText", false, value);
    if (!ok) {
      el.textContent = value;
      el.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
    }
    return true;
  }
  return false;
}

async function readHandoff() {
  try {
    const stored = await chrome.storage.session.get(api.STORAGE_KEY);
    return stored?.[api.STORAGE_KEY] || null;
  } catch {
    return null;
  }
}

async function clearHandoff(id) {
  try {
    const stored = await chrome.storage.session.get(api.STORAGE_KEY);
    if (stored?.[api.STORAGE_KEY]?.id === id) {
      await chrome.storage.session.remove(api.STORAGE_KEY);
    }
  } catch {
    /* Ignore storage errors on teardown. */
  }
}

async function fillWhenReady(handoff) {
  const started = Date.now();
  return new Promise((resolve) => {
    const tryFill = () => {
      const composer = findComposer(document);
      if (composer && setComposerValue(composer, handoff.prompt)) {
        composer.focus();
        resolve(true);
        return true;
      }
      if (Date.now() - started > FILL_TIMEOUT_MS) {
        resolve(false);
        return true;
      }
      return false;
    };

    if (tryFill()) return;
    const observer = new MutationObserver(() => {
      if (tryFill()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(() => {
      observer.disconnect();
      resolve(false);
    }, FILL_TIMEOUT_MS);
  });
}

async function start() {
  const handoff = await readHandoff();
  if (!handoff?.prompt) return;
  const filled = await fillWhenReady(handoff);
  if (filled) await clearHandoff(handoff.id);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
