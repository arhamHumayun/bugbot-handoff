"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const api = require("../src/lib/shared.js");

test("detects Cursor Bugbot action links", () => {
  assert.equal(api.isCursorActionHref("https://cursor.com/open?data=abc"), true);
  assert.equal(api.isCursorActionHref("https://www.cursor.com/agents?x=1"), true);
  assert.equal(api.isCursorActionHref("cursor://anysphere.cursor-deeplink/createchat?data=1"), true);
  assert.equal(api.isCursorActionHref("https://github.com/cursor/open"), false);
  assert.equal(api.isCursorActionText("Fix in Cursor"), true);
  assert.equal(api.isCursorActionText("Open with Cursor"), true);
  assert.equal(api.isCursorActionText("Fix in Web"), true);
  assert.equal(api.isCursorActionText("Leave a comment"), false);
});

test("parses GitHub blob permalinks", () => {
  const loc = api.parseBlobLocation(
    "https://github.com/browser-use/browser-use/blob/1531907b40959a65de77c14cfe138fec3ef87451/browser_use/agent/service.py#L1250-L1251"
  );
  assert.equal(loc.filePath, "browser_use/agent/service.py");
  assert.equal(loc.startLine, 1250);
  assert.equal(loc.endLine, 1251);
});

test("builds a Codex desktop deep link with prompt and origin", () => {
  const url = new URL(
    api.buildDesktopUrl("Fix the wait timeout", "https://github.com/acme/repo.git")
  );
  assert.equal(url.protocol, "codex:");
  assert.equal(url.hostname, "new");
  assert.equal(url.searchParams.get("prompt"), "Fix the wait timeout");
  assert.equal(url.searchParams.get("originUrl"), "https://github.com/acme/repo.git");
});

test("prompt includes Bugbot finding, PR, and file location", () => {
  const prompt = api.buildPrompt({
    pr: {
      url: "https://github.com/acme/repo/pull/12",
      owner: "acme",
      repo: "repo",
      number: "12",
      kind: "pull",
      title: "Fix waits",
      branch: "feat/wait",
    },
    finding: "Bug: wait subtracts 3 seconds",
    location: {
      filePath: "src/wait.ts",
      startLine: 10,
      endLine: 18,
      permalink: "https://github.com/acme/repo/blob/sha/src/wait.ts#L10-L18",
    },
    commentUrl: "https://github.com/acme/repo/pull/12#discussion_r1",
  });
  assert.match(prompt, /Fix this Cursor Bugbot finding/);
  assert.match(prompt, /acme\/repo/);
  assert.match(prompt, /feat\/wait/);
  assert.match(prompt, /src\/wait\.ts:10-18/);
  assert.match(prompt, /wait subtracts 3 seconds/);
});

test("strips Cursor action labels from comment text", () => {
  assert.equal(
    api.cleanCommentText({
      cloneNode() {
        return {
          querySelectorAll() {
            return [];
          },
          innerText: "Bug: boom\n\nFix in Cursor • Fix in Web\nWas this report helpful? thumbs",
        };
      },
    }),
    "Bug: boom"
  );
});

test("does not treat opaque Cursor data tokens as prompt text", () => {
  assert.equal(api.decodeCursorLinkPayload("https://cursor.com/open?data=placeholder"), null);
  const decoded = api.decodeCursorLinkPayload(
    "https://cursor.com/open?data=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJwcm9tcHQiOiJGaXggdGhlIGJ1Zy4ifQ.sig"
  );
  assert.equal(decoded.prompt, "Fix the bug.");
});

test("buildClaudeCodeUrl encodes the prompt and repo", () => {
  const url = new URL(api.buildClaudeCodeUrl("Fix the wait timeout", "acme/repo"));
  assert.equal(url.protocol, "claude-cli:");
  assert.equal(url.searchParams.get("q"), "Fix the wait timeout");
  assert.equal(url.searchParams.get("repo"), "acme/repo");
});
