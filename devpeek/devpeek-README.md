# DevPeek — API & Page Inspector

A Chrome (Manifest V3) toolbar extension for developers. Two jobs:

1. **Network** — captures every `fetch` and `XMLHttpRequest` the current page makes, **including request and response bodies** (which Chrome's `webRequest` API can't expose). Copy any call as **cURL** or a **fetch()** snippet, or export everything as JSON.
2. **Page Data** — one-click extraction of page info, links, images, tables (→ CSV), headings, JSON-LD, the current text selection, or all visible text. Copy or download each.

## Install (Load unpacked)

1. Unzip this folder somewhere permanent.
2. Open `chrome://extensions` in Chrome (or any Chromium browser — Edge, Brave, Arc).
3. Turn on **Developer mode** (top-right).
4. Click **Load unpacked** and select the unzipped `devpeek` folder.
5. Pin **DevPeek** from the puzzle-piece menu so the icon stays on the toolbar.

> Requires Chrome 111+ (uses `world: "MAIN"` content scripts).

## Use

- Open a site, click the **DevPeek** icon. The badge number on the icon shows how many calls were captured on that tab.
- **Network tab:** the list updates live while the popup is open. Filter by URL or method, click a row to expand headers + bodies, and use **Copy cURL / Copy fetch / Copy response**.
- **Page Data tab:** click any tool; the result appears below with **Copy** and **Download** buttons.

## How it works

- `interceptor.js` runs in the page's **MAIN world** at `document_start` and wraps `fetch` / `XMLHttpRequest`.
- It posts each completed call to `content.js` (isolated world), which relays it to `background.js`.
- The service worker buffers up to **500 calls per tab** (mirrored to `storage.session`), and the popup reads them.
- Page extraction uses `chrome.scripting.executeScript` on demand — no data leaves your machine, and there are no external servers.

## Limitations (by design)

- **Request headers** show only what JS set. Browser-added headers (Cookie, User-Agent, sec-* …) aren't visible to page scripts, so they won't appear — same constraint DevTools' "request headers (from JS)" has.
- Bodies are capped at ~100 KB each and binary responses are summarised, not stored.
- Buffer clears on a full page reload/navigation (SPA route changes are kept).
- Cannot run on restricted URLs: `chrome://`, the Chrome Web Store, other extensions' pages.
- The badge counts calls per tab; closing the tab clears its buffer.

## Files

```
devpeek/
├── manifest.json      MV3 config + permissions
├── interceptor.js     MAIN-world fetch/XHR patch
├── content.js         relay + per-load reset
├── background.js      per-tab capture buffer
├── popup.html/css/js  the UI
└── icons/             16 / 48 / 128 px
```

## Tweaks

- Capture limit: `CAP` in `background.js`.
- Body size cap: `MAXBODY` in `interceptor.js`.
- Restrict to specific sites: change `"matches"` and `host_permissions` in `manifest.json` (e.g. `"http://localhost/*"`).
