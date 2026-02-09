# Dead Bookmarks Remover

Chrome extension that finds and removes dead bookmarks (404, 500, unreachable, etc.).

## Features

- Scans all HTTP/HTTPS bookmarks in parallel (10 concurrent requests)
- Detects dead links: HTTP 4xx/5xx errors and unreachable hosts
- Falls back from HEAD to GET for servers that block HEAD requests
- Skips rate-limited responses (HTTP 429) to avoid false positives
- Checkbox selection with select all for review before removal
- Two-click confirm to prevent accidental deletions

## Install

1. Clone or download this repository
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the project folder

## Usage

1. Click the extension icon in the toolbar
2. Click **Scan Bookmarks** and wait for the scan to complete
3. Review the list of dead bookmarks
4. Select the ones to remove using checkboxes (or **Select all**)
5. Click **Remove Selected**, then click again to confirm

## Tests

```
npm install
npm test
```

## Permissions

- **bookmarks** — read and remove bookmarks
- **host_permissions: all URLs** — required to check bookmark URLs for liveness
