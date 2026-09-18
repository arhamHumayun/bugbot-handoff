"use strict";

const api = globalThis.CodexBugbot;
const destinationEl = document.getElementById("destination");
const statusEl = document.getElementById("status");

function showStatus(text) {
  statusEl.hidden = false;
  statusEl.textContent = text;
}

async function load() {
  const stored = await chrome.storage.sync.get(api.DEFAULTS);
  destinationEl.value = stored.destination || api.DEFAULTS.destination;
}

destinationEl.addEventListener("change", async () => {
  await chrome.storage.sync.set({ destination: destinationEl.value });
  showStatus("Saved.");
});

load();
