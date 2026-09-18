(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.CodexBugbot = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MARKER = "data-codex-bugbot";
  const BUTTON_CLASS = "codex-bugbot-open";
  const SEPARATOR_CLASS = "codex-bugbot-sep";
  const MAX_DEEPLINK_PROMPT_CHARS = 3500;
  const MAX_PROMPT_CHARS = 50000;
  const STORAGE_KEY = "pendingCodexHandoff";
  const DEFAULTS = {
    destination: "desktop",
    webBaseUrl: "https://chatgpt.com/codex",
  };

  const CURSOR_TEXT = new Set([
    "fix in cursor",
    "open with cursor",
    "open in cursor",
    "fix in web",
    "open in web",
    "open with web",
  ]);

  function normalizeText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function safeUrl(href, base) {
    try {
      return new URL(href, base || "https://github.com");
    } catch {
      return null;
    }
  }

  function isCursorActionHref(href) {
    if (!href) return false;
    if (String(href).startsWith("cursor://")) return true;
    const url = safeUrl(href);
    if (!url) return false;
    const host = url.hostname.replace(/^www\./, "");
    if (host !== "cursor.com" && !host.endsWith(".cursor.com") && host !== "cursor.sh") {
      return false;
    }
    const path = url.pathname.toLowerCase();
    return (
      path.startsWith("/open") ||
      path.startsWith("/agents") ||
      path.startsWith("/link") ||
      path.includes("deeplink")
    );
  }

  function isCursorActionText(text) {
    return CURSOR_TEXT.has(normalizeText(text));
  }

  function isCodexButton(el) {
    return Boolean(el && el.classList && el.classList.contains(BUTTON_CLASS));
  }

  function isCursorActionLink(anchor) {
    if (!anchor || String(anchor.tagName).toLowerCase() !== "a" || isCodexButton(anchor)) {
      return false;
    }
    const href = anchor.getAttribute("href") || "";
    const text = anchor.textContent || "";
    const alts = Array.from(anchor.querySelectorAll ? anchor.querySelectorAll("img") : [])
      .map((img) => img.getAttribute("alt") || "")
      .join(" ");
    return isCursorActionHref(href) || isCursorActionText(text) || isCursorActionText(alts);
  }

  function decodeJwtPayload(token) {
    if (!token || token.split(".").length < 2) return null;
    try {
      const payload = token.split(".")[1];
      const padded = payload.replace(/-/g, "+").replace(/_/g, "/");
      const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
      const json = decodeURIComponent(
        Array.from(atob(padded + pad), (c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`).join("")
      );
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  function decodeCursorLinkPayload(href) {
    const url = safeUrl(href);
    if (!url) return null;
    const data = url.searchParams.get("data");
    const promptParam = url.searchParams.get("prompt") || url.searchParams.get("text");
    if (data && data.split(".").length === 3) {
      return decodeJwtPayload(data);
    }
    if (data) {
      try {
        const parsed = JSON.parse(decodeURIComponent(data));
        if (parsed && typeof parsed === "object") return parsed;
      } catch {
        /* Opaque signed payloads are not usable as prompt text. */
      }
    }
    if (promptParam) return { text: promptParam };
    return null;
  }

  function pickCursorPayloadText(payload) {
    if (!payload || typeof payload !== "object") return "";
    const keys = ["prompt", "text", "message", "issue", "description", "body"];
    for (const key of keys) {
      if (typeof payload[key] === "string" && payload[key].trim()) {
        return payload[key].trim();
      }
    }
    if (payload.data && typeof payload.data === "object") {
      return pickCursorPayloadText(payload.data);
    }
    return "";
  }

  function closestCommentBody(el) {
    if (!el || !el.closest) return null;
    return el.closest(
      [
        ".js-comment-body",
        ".comment-body",
        ".markdown-body",
        "[data-testid='markdown-body']",
        "[data-testid='comment-body']",
        ".review-comment-contents",
      ].join(", ")
    );
  }

  function closestCommentContainer(el) {
    if (!el || !el.closest) return null;
    return el.closest(
      [
        ".js-comment",
        ".review-comment",
        ".timeline-comment",
        "[id^='discussion_r']",
        "[id^='issuecomment-']",
        "[data-testid='review-thread']",
        "[data-testid='comment']",
      ].join(", ")
    );
  }

  function getActionGroup(link) {
    const parent = link.parentElement;
    if (!parent) return [link];
    const links = Array.from(parent.querySelectorAll("a")).filter(isCursorActionLink);
    return links.includes(link) && links.length ? links : [link];
  }

  function detectSeparator(parent, links) {
    if (!parent) return " • ";
    if (links.length >= 2 && typeof document !== "undefined" && document.createRange) {
      try {
        const range = document.createRange();
        range.setStartAfter(links[0]);
        range.setEndBefore(links[1]);
        const raw = range.toString();
        if (raw.includes("•")) return " • ";
        if (raw.includes("·")) return " · ";
        if (raw.includes("|")) return " | ";
        if (raw.trim()) return raw;
      } catch {
        /* GitHub's live DOM can reject ranges; fall through. */
      }
    }
    const html = parent.innerHTML || "";
    if (html.includes("•")) return " • ";
    if (html.includes("·")) return " · ";
    return " • ";
  }

  function getLiveSectionNodes(body, link) {
    const children = Array.from(body.children || []);
    if (!children.length) return [body];
    const groups = [];
    let current = [];
    for (const child of children) {
      if (String(child.tagName).toLowerCase() === "hr") {
        groups.push(current);
        current = [];
      } else {
        current.push(child);
      }
    }
    groups.push(current);
    return groups.find((group) => group.some((node) => node.contains(link))) || [link.parentElement].filter(Boolean);
  }

  function sliceByRules(body, link) {
    const match = getLiveSectionNodes(body, link);
    if (!match || !match.length) return body;
    const wrap = body.ownerDocument.createElement("div");
    for (const node of match) {
      wrap.appendChild(node.cloneNode(true));
    }
    return wrap;
  }

  function cleanCommentText(root) {
    if (!root) return "";
    const clone = root.cloneNode(true);
    clone.querySelectorAll?.("." + BUTTON_CLASS + ", ." + SEPARATOR_CLASS).forEach((node) => node.remove());
    let text = (clone.innerText || clone.textContent || "").replace(/\r\n/g, "\n");
    text = text.replace(/\b(Fix in Cursor|Fix in Web|Open with Cursor|Open in Cursor|Open with Codex|Open in Web)\b/gi, "");
    text = text.replace(/Was this report helpful\?[\s\S]*$/i, "");
    text = text.replace(/BugBot free trial[\s\S]*$/i, "");
    text = text.replace(/Learn more in the Cursor dashboard\.?/gi, "");
    text = text.replace(/[ \t]*[•·|][ \t]*[•·|]/g, " ");
    text = text.replace(/[ \t]*[•·|][ \t]*/g, " ");
    text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    return text;
  }

  function parseBlobLocation(href) {
    const url = safeUrl(href);
    if (!url) return null;
    const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/(?:blob|tree)\/[^/]+\/(.+)$/);
    if (!match) return null;
    const hash = url.hash || "";
    const lines = hash.match(/L(\d+)(?:-L(\d+))?/i);
    return {
      owner: match[1],
      repo: match[2],
      filePath: decodeURIComponent(match[3]),
      startLine: lines ? Number(lines[1]) : null,
      endLine: lines && lines[2] ? Number(lines[2]) : lines ? Number(lines[1]) : null,
      permalink: url.toString(),
    };
  }

  function extractFileLocation(section, commentBody, container) {
    const scopes = [section, commentBody, container].filter(Boolean);
    for (const scope of scopes) {
      const links = Array.from(scope.querySelectorAll?.("a[href]") || []);
      for (const link of links) {
        const loc = parseBlobLocation(link.href);
        if (loc) return loc;
      }
      const path =
        scope.getAttribute?.("data-path") ||
        scope.getAttribute?.("data-tagsearch-path") ||
        scope.closest?.("[data-path], [data-tagsearch-path], .file")?.getAttribute("data-path") ||
        scope.closest?.("[data-path], [data-tagsearch-path]")?.getAttribute("data-tagsearch-path");
      if (path) {
        return { filePath: path, startLine: null, endLine: null, permalink: "" };
      }
    }
    return null;
  }

  function extractDiffHunk(container) {
    if (!container) return "";
    const hunk = container.querySelector?.(
      ".diff-table, .blob-wrapper, .js-file-content, [data-testid='diff-hunk']"
    );
    if (!hunk) return "";
    const text = (hunk.innerText || "").trim();
    if (text.length > 8000) {
      return text.slice(0, 8000) + "\n… (diff truncated)";
    }
    return text;
  }

  function getPrContext(doc, loc) {
    const documentRef = doc || (typeof document !== "undefined" ? document : null);
    const locationRef = loc || (typeof location !== "undefined" ? location : { href: "", pathname: "" });
    const canonical = documentRef?.querySelector?.('link[rel="canonical"]')?.getAttribute("href");
    const href = canonical || String(locationRef.href || "");
    let pathname = String(locationRef.pathname || "");
    try {
      if (canonical) pathname = new URL(canonical).pathname;
    } catch {
      pathname = String(locationRef.pathname || "");
    }
    const pathMatch = pathname.match(/^\/([^/]+)\/([^/]+)\/(pull|issues)\/(\d+)/);
    const title = documentRef
      ?.querySelector?.(
        ".js-issue-title, [data-testid='issue-title'], bdi.js-issue-title, h1.gh-header-title .js-issue-title"
      )
      ?.textContent?.trim();
    const branch =
      documentRef
        ?.querySelector?.(
          ".gh-header .head-ref, .commit-ref.head-ref, [data-testid='head-ref'], span.head-ref, clipboard-copy.head-ref"
        )
        ?.textContent?.trim() ||
      documentRef?.querySelector?.(".commit-ref")?.textContent?.trim() ||
      "";
    const nwo =
      documentRef?.querySelector?.('meta[name="octolytics-dimension-repository_nwo"]')?.getAttribute("content") || "";
    const owner = pathMatch?.[1] || nwo.split("/")[0] || "";
    const repo = pathMatch?.[2] || nwo.split("/")[1] || "";
    const number = pathMatch?.[4] || "";
    const kind = pathMatch?.[3] === "issues" ? "issue" : "pull";
    const url = String(href || locationRef.href || "").split("#")[0];
    return {
      owner,
      repo,
      number,
      kind,
      title: title || "",
      branch,
      url,
      repoUrl: owner && repo ? `https://github.com/${owner}/${repo}` : "",
      originUrl: owner && repo ? `https://github.com/${owner}/${repo}.git` : "",
    };
  }

  function truncate(text, max) {
    if (!text || text.length <= max) return text;
    return text.slice(0, max).trimEnd() + "\n\n… (truncated)";
  }

  function buildPrompt(input) {
    const pr = input.pr || {};
    const locationInfo = input.location;
    const parts = [];
    parts.push("Fix this Cursor Bugbot finding from GitHub.");
    parts.push("");
    parts.push("Work on the repository and branch from this pull request. Inspect the cited files, reproduce the issue if possible, and implement a focused fix. Keep the change as small as possible.");
    parts.push("");
    parts.push("## Pull request");
    if (pr.url) parts.push(`- URL: ${pr.url}`);
    if (pr.owner && pr.repo) parts.push(`- Repository: ${pr.owner}/${pr.repo}`);
    if (pr.number) parts.push(`- ${pr.kind === "issue" ? "Issue" : "PR"}: #${pr.number}`);
    if (pr.title) parts.push(`- Title: ${pr.title}`);
    if (pr.branch) parts.push(`- Branch: ${pr.branch}`);
    if (input.commentUrl) parts.push(`- Comment: ${input.commentUrl}`);
    if (locationInfo?.filePath) {
      const lines =
        locationInfo.startLine && locationInfo.endLine && locationInfo.startLine !== locationInfo.endLine
          ? `${locationInfo.startLine}-${locationInfo.endLine}`
          : locationInfo.startLine
            ? String(locationInfo.startLine)
            : "";
      parts.push(`- File: ${locationInfo.filePath}${lines ? `:${lines}` : ""}`);
      if (locationInfo.permalink) parts.push(`- Permalink: ${locationInfo.permalink}`);
    }
    parts.push("");
    parts.push("## Bugbot finding");
    parts.push(input.finding || "(no comment text found)");
    if (input.cursorPrompt) {
      parts.push("");
      parts.push("## Prompt encoded in the Cursor button");
      parts.push(input.cursorPrompt);
    }
    if (input.diffHunk) {
      parts.push("");
      parts.push("## Nearby diff context");
      parts.push("```");
      parts.push(input.diffHunk);
      parts.push("```");
    }
    parts.push("");
    parts.push("After the fix, summarize what changed and why.");
    return truncate(parts.join("\n"), MAX_PROMPT_CHARS);
  }

  function buildDesktopUrl(prompt, originUrl) {
    const url = new URL("codex://new");
    const usable = truncate(prompt, MAX_DEEPLINK_PROMPT_CHARS);
    url.searchParams.set("prompt", usable);
    if (originUrl) url.searchParams.set("originUrl", originUrl);
    return url.toString();
  }

  function buildWebUrl(prompt, webBaseUrl, originUrl) {
    const url = new URL(webBaseUrl || DEFAULTS.webBaseUrl);
    const usable = truncate(prompt, MAX_DEEPLINK_PROMPT_CHARS);
    url.searchParams.set("prompt", usable);
    if (originUrl) url.searchParams.set("originUrl", originUrl);
    return url.toString();
  }

  function collectHandoff(link, doc, loc) {
    const body = closestCommentBody(link);
    const container = closestCommentContainer(link) || body;
    const section = body ? sliceByRules(body, link) : link.parentElement || link;
    const finding = cleanCommentText(section);
    const pr = getPrContext(doc, loc);
    const locationInfo = extractFileLocation(section, body, container);
    const group = getActionGroup(link);
    const cursorHref = (group.find((a) => isCursorActionHref(a.getAttribute("href") || "")) || link).getAttribute("href") || "";
    const decoded = decodeCursorLinkPayload(cursorHref);
    const commentUrl =
      container?.querySelector?.("a[href*='#discussion_r'], a.js-timestamp, a[href*='#issuecomment-']")?.href ||
      container?.querySelector?.("a[id^='r'], a.Link--secondary")?.href ||
      (typeof loc !== "undefined" ? String(loc.href || "") : "");
    const prompt = buildPrompt({
      pr,
      finding,
      location: locationInfo,
      cursorPrompt: pickCursorPayloadText(decoded),
      diffHunk: extractDiffHunk(container),
      commentUrl,
    });
    return {
      prompt,
      originUrl: pr.originUrl,
      repoUrl: pr.repoUrl,
      prUrl: pr.url,
      branch: pr.branch,
      title: pr.title,
      findingTitle: (finding.split("\n").find((line) => line.trim()) || "Bugbot finding").slice(0, 120),
    };
  }

  return {
    MARKER,
    BUTTON_CLASS,
    SEPARATOR_CLASS,
    STORAGE_KEY,
    DEFAULTS,
    MAX_DEEPLINK_PROMPT_CHARS,
    isCursorActionHref,
    isCursorActionText,
    isCursorActionLink,
    getActionGroup,
    getLiveSectionNodes,
    detectSeparator,
    closestCommentBody,
    closestCommentContainer,
    collectHandoff,
    buildPrompt,
    buildDesktopUrl,
    buildWebUrl,
    decodeCursorLinkPayload,
    parseBlobLocation,
    getPrContext,
    cleanCommentText,
  };
});
