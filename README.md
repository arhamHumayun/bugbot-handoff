# Open Bugbot in Codex

Chrome extension that adds an **Open with Codex** button next to Cursor Bugbot’s **Fix in Cursor** / **Open with Cursor** controls on GitHub pull requests. Clicking it sends the finding, file location, nearby diff, and PR metadata into Codex.

## Install

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder

## Use

Open a GitHub PR with a Bugbot review. Beside **Fix in Cursor** you should see **Open with Codex**.

- **Codex Desktop** (default): launches `codex://new?prompt=...&originUrl=...` so the ChatGPT/Codex app opens with the comment as the composer prompt and tries to match the GitHub repo workspace.
- **Codex Web**: opens `chatgpt.com/codex` and pastes the same prompt into the composer.

Choose the destination from the extension popup. The full prompt is also copied to the clipboard.

## How it finds comments

It looks for GitHub comment links whose URL is a Cursor Bugbot action (`cursor.com/open`, `cursor.com/agents`, `cursor://…`) or whose label is **Fix in Cursor**, **Open with Cursor**, **Fix in Web**, and similar. One Codex button is inserted after each finding’s action links, including reviews that list several bugs separated by a divider.
