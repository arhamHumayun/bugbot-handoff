# Bugbot Handoff

Chrome extension that hands Cursor Bugbot findings on GitHub pull requests off to the coding agent of your choice. It adds **Fix in Codex**, **Fix in Claude**, and **Copy prompt** buttons next to Bugbot's **Fix in Cursor** / **Open with Cursor** controls. Each one packages the finding, file location, nearby diff, and PR metadata into a prompt.

![Fix in Cursor, Fix in Web, Fix in Codex, Fix in Claude, and Copy prompt buttons](docs/buttons.png)

## Install

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder

## Use

Open a GitHub PR with a Bugbot review. Beside **Fix in Cursor** you'll see the handoff buttons.

- **Fix in Codex** and **Fix in Claude** are plain deep links (`codex://new?prompt=...` and `claude://code/new?q=...`). Clicking one hands the finding straight to the desktop app; no extra tab is opened. Codex and Claude Code must be installed.
- **Copy prompt** copies the same prompt to the clipboard, for any other tool.

## How it finds comments

It looks for GitHub comment links whose URL is a Cursor Bugbot action (`cursor.com/open`, `cursor.com/agents`, `cursor://…`) or whose label is **Fix in Cursor**, **Open with Cursor**, **Fix in Web**, and similar. One set of buttons is inserted after each finding's action links, including reviews that list several bugs separated by a divider.
