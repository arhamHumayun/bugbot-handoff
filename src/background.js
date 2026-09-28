"use strict";

importScripts("lib/shared.js");

const api = globalThis.CodexBugbot;

async function getSettings() {
  const stored = await chrome.storage.sync.get(api.DEFAULTS);
  return { ...api.DEFAULTS, ...stored };
}

function randomId() {
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "OPEN_CODEX") return undefined;
  openHandoff(message.payload)
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  return true;
});

async function openHandoff(payload) {
  if (!payload?.prompt) throw new Error("No Bugbot prompt to send.");
  const settings = await getSettings();
  const id = randomId();
  await chrome.storage.session.set({
    [api.STORAGE_KEY]: {
      id,
      prompt: payload.prompt,
      originUrl: payload.originUrl || "",
      repo: payload.repo || "",
      target: payload.target === "claude" ? "claude" : "codex",
      destination: settings.destination,
      webBaseUrl: settings.webBaseUrl,
      createdAt: Date.now(),
    },
  });
  const launchUrl = chrome.runtime.getURL(`src/launch/launch.html?id=${encodeURIComponent(id)}`);
  await chrome.tabs.create({ url: launchUrl });
}
