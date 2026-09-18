"use strict";

const api = globalThis.CodexBugbot;

function toast(message) {
  const existing = document.querySelector(".codex-bugbot-toast");
  existing?.remove();
  const el = document.createElement("div");
  el.className = "codex-bugbot-toast";
  el.textContent = message;
  document.documentElement.appendChild(el);
  window.setTimeout(() => el.remove(), 4200);
}

function createCodexButton(cursorLink) {
  const button = document.createElement("a");
  button.className = api.BUTTON_CLASS;
  button.href = "#";
  button.role = "button";
  button.textContent = "Open with Codex";
  button.title = "Open this Bugbot finding in Codex with the comment context";
  button.setAttribute(api.MARKER, "button");
  for (const cls of cursorLink.classList) {
    if (/btn|button/i.test(cls) && cls !== api.BUTTON_CLASS) {
      button.classList.add(cls);
    }
  }

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const payload = api.collectHandoff(cursorLink, document, location);
    try {
      await navigator.clipboard.writeText(payload.prompt);
    } catch {
      /* Clipboard can fail without permission; the launch page still has the prompt. */
    }
    if (!globalThis.chrome?.runtime?.id) {
      document.dispatchEvent(new CustomEvent("codex-bugbot:handoff", { detail: payload }));
      toast("Built Codex prompt from this Bugbot comment.");
      return;
    }
    try {
      const response = await chrome.runtime.sendMessage({ type: "OPEN_CODEX", payload });
      if (response?.ok) {
        toast("Opening Codex with this Bugbot comment.");
      } else {
        toast(response?.error || "Could not open Codex.");
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not open Codex.");
    }
  });

  return button;
}

function injectGroup(link) {
  const body = api.closestCommentBody(link);
  const sectionNodes = body ? api.getLiveSectionNodes(body, link) : [link.parentElement].filter(Boolean);
  const sectionHasButton = sectionNodes.some(
    (node) => node?.classList?.contains(api.BUTTON_CLASS) || node?.querySelector?.("." + api.BUTTON_CLASS)
  );
  if (sectionHasButton) return;

  const grouped = [];
  for (const node of sectionNodes) {
    const links = node?.querySelectorAll ? Array.from(node.querySelectorAll("a")).filter(api.isCursorActionLink) : [];
    grouped.push(...links);
  }
  const group = grouped.length ? grouped : api.getActionGroup(link);
  const last = group[group.length - 1];
  if (!last?.parentNode) return;

  for (const anchor of group) {
    anchor.setAttribute(api.MARKER, "source");
  }

  const sep = document.createElement("span");
  sep.className = api.SEPARATOR_CLASS;
  sep.setAttribute(api.MARKER, "sep");
  sep.textContent = api.detectSeparator(last.parentElement, group);

  last.parentNode.insertBefore(sep, last.nextSibling);
  last.parentNode.insertBefore(createCodexButton(group[0] || link), sep.nextSibling);
}

function scan() {
  const anchors = document.querySelectorAll("a[href], a");
  for (const anchor of anchors) {
    if (api.isCursorActionLink(anchor)) {
      injectGroup(anchor);
    }
  }
}

let scheduled = false;
function scheduleScan() {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(() => {
    scheduled = false;
    scan();
  });
}

function start() {
  scan();
  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  for (const eventName of ["turbo:load", "turbo:render", "pjax:end", "soft-nav:end", "page:load"]) {
    document.addEventListener(eventName, scheduleScan);
  }
  window.addEventListener("popstate", scheduleScan);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
