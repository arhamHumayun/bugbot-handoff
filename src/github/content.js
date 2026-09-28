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

const ICONS = {
  claude:
    '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><g stroke="#d97757" stroke-width="2.4" stroke-linecap="round"><path d="M12 2.5v19M2.5 12h19M5.3 5.3l13.4 13.4M18.7 5.3L5.3 18.7"/></g></svg>',
  codex:
    '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M7.5 19a4.5 4.5 0 0 1-.6-8.96A5.5 5.5 0 0 1 17.6 8.9 5 5 0 0 1 17 19z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M9 11.5l2.5 2-2.5 2M13 15.5h2.5"/></svg>',
  copy:
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="currentColor"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/></svg>'
};

function setLabel(button, text) {
  button.querySelector(".codex-bugbot-label").textContent = text;
}

function buildHref(cursorLink, target) {
  const payload = api.collectHandoff(cursorLink, document, location);
  return target === "claude"
    ? api.buildClaudeCodeUrl(payload.prompt)
    : api.buildDesktopUrl(payload.prompt, payload.originUrl);
}

function createOpenButton(cursorLink, target) {
  const label = target === "claude" ? "Claude Code" : target === "copy" ? "prompt" : "Codex";
  const button = document.createElement("a");
  button.className = api.BUTTON_CLASS;
  button.href = "#";
  button.role = "button";
  button.innerHTML = `${ICONS[target]}<span class="codex-bugbot-label"></span>`;
  setLabel(button, target === "copy" ? "Copy prompt" : `Fix in ${target === "claude" ? "Claude" : label}`);
  button.title =
    target === "copy"
      ? "Copy a prompt for this Bugbot finding to the clipboard"
      : `Open this Bugbot finding in ${label} with the comment context`;
  button.setAttribute(api.MARKER, "button");

  if (target !== "copy") {
    // A plain deep link: the browser hands it to the app without opening a tab.
    // Rebuild the href just before navigation so it reflects the live comment.
    const refresh = () => {
      try {
        button.href = buildHref(cursorLink, target);
      } catch {
        /* Keep the previous href. */
      }
    };
    refresh();
    button.addEventListener("pointerenter", refresh);
    button.addEventListener("focus", refresh);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      refresh();
    });
    return button;
  }

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const payload = api.collectHandoff(cursorLink, document, location);
    try {
      await navigator.clipboard.writeText(payload.prompt);
      setLabel(button, "Copied!");
      window.setTimeout(() => setLabel(button, "Copy prompt"), 1600);
    } catch {
      toast("Could not copy the prompt to the clipboard.");
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

  const source = group[0] || link;
  let anchor = last;
  for (const target of ["codex", "claude", "copy"]) {
    const button = createOpenButton(source, target);
    last.parentNode.insertBefore(button, anchor.nextSibling);
    anchor = button;
  }
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
