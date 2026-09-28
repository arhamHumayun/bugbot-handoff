"use strict";

const api = globalThis.CodexBugbot;
const statusEl = document.getElementById("status");
const previewEl = document.getElementById("preview");
const desktopBtn = document.getElementById("desktop");
const webBtn = document.getElementById("web");
const copyBtn = document.getElementById("copy");
const claudeBtn = document.getElementById("claude");
const titleEl = document.querySelector("h1");

let handoff = null;

function setStatus(text) {
  statusEl.textContent = text;
}

async function loadHandoff() {
  const stored = await chrome.storage.session.get(api.STORAGE_KEY);
  const payload = stored?.[api.STORAGE_KEY];
  if (!payload?.prompt) {
    setStatus("No Bugbot prompt was found. Go back to GitHub and click Open with Codex again.");
    return null;
  }
  previewEl.hidden = false;
  previewEl.textContent = payload.prompt;
  return payload;
}

function openClaudeCode() {
  if (!handoff) return;
  const url = api.buildClaudeCodeUrl(handoff.prompt, handoff.repo);
  setStatus("Launching Claude Code. If nothing happens, make sure Claude Code is installed and has run once — then copy the prompt below.");
  window.location.href = url;
}

function openDesktop() {
  if (!handoff) return;
  const url = api.buildDesktopUrl(handoff.prompt, handoff.originUrl);
  setStatus("Launching Codex Desktop. If nothing happens, Codex may not be installed — use Codex Web below.");
  window.location.href = url;
}

function openWeb(inPlace = true) {
  if (!handoff) return;
  const url = api.buildWebUrl(handoff.prompt, handoff.webBaseUrl, handoff.originUrl);
  setStatus("Opening Codex Web with this Bugbot finding.");
  if (inPlace) {
    window.location.replace(url);
    return;
  }
  window.open(url, "_blank", "noopener");
}

async function copyPrompt() {
  if (!handoff) return;
  await navigator.clipboard.writeText(handoff.prompt);
  setStatus("Prompt copied. Paste it into Codex if the composer is empty.");
}

async function autoOpen() {
  handoff = await loadHandoff();
  if (!handoff) return;
  if (handoff.target === "claude") {
    titleEl.textContent = "Opening Claude Code";
    desktopBtn.hidden = true;
    webBtn.hidden = true;
    claudeBtn.hidden = false;
    openClaudeCode();
    return;
  }
  const destination = handoff.destination || "desktop";
  if (destination === "web") {
    openWeb();
    return;
  }
  if (destination === "both") {
    openWeb(false);
    window.setTimeout(openDesktop, 250);
    return;
  }
  openDesktop();
}

desktopBtn.addEventListener("click", openDesktop);
claudeBtn.addEventListener("click", openClaudeCode);
webBtn.addEventListener("click", openWeb);
copyBtn.addEventListener("click", () => {
  copyPrompt().catch(() => setStatus("Could not copy the prompt."));
});

autoOpen().catch((error) => {
  setStatus(error instanceof Error ? error.message : "Could not open Codex.");
});
