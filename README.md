# chrome-extensions# DevPeek — API & Page Inspector

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


# Lens — UI/UX Audit

A Chrome (Manifest V3) toolbar extension that audits the page you're on for **accessibility, readability, mobile/touch, design consistency, and structure**, gives it a score out of 100, and lets you **click any finding to highlight the offending element** right on the page.

## Install (Load unpacked)

1. Unzip the folder.
2. Open `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked** → select the `uxaudit` folder. Pin it to the toolbar.

It only requests `activeTab` + `scripting` — no broad host permissions. The audit runs only when you click the icon, only on the current tab.

## What it checks

**Accessibility** — images without alt, controls with no accessible name, unlabeled form fields, missing `lang`/`<title>`, H1 problems, skipped heading levels, positive `tabindex`, no `main` landmark, "click here" links, duplicate IDs, and **WCAG AA colour contrast** (computed against the real effective background).

**Readability** — text rendering below 12px.

**Mobile & Touch** — missing viewport meta, pinch-zoom disabled, tap targets under 40×40px, horizontal overflow.

**Design Consistency** — too many font families / font sizes / text colours, heavy inline styles.

**Structure** — oversized DOM, images missing width/height (layout-shift risk), excessive nesting depth.

Each category gets its own score ring; the overall score is the average, mapped to an A–F grade. Use **Copy report** (JSON) or **Download .md** to save results.

## Is it "simple"?

Yes. The whole audit is a single self-contained function (`auditor` in `popup.js`) injected with `chrome.scripting.executeScript`. It walks the DOM once, reads computed styles, and returns a structured report — no libraries, no servers. The only non-trivial maths is the WCAG contrast ratio (sRGB relative luminance) and a small "accessible name" resolver, both included.

## Honest limits

- Contrast can't read text over background **images** or gradients, so those are skipped (not failed).
- "Accessible name" logic is a practical subset of the full ARIA spec — great for catching the common 90%, not a substitute for a formal tool like axe on critical products.
- Contrast/size scans are capped at ~2,500 text elements on huge pages for speed.
- Can't run on `chrome://`, the Web Store, or other extension pages.
- It adds a temporary `data-lens-id` attribute to flagged elements so "click to highlight" works; this is cleared and re-applied on each scan.

## Tune it

Thresholds live at the top of each section in `auditor()` — e.g. change `< 40` for tap-target size, `> 4` for font-family count, or the `12` px readability floor.

---

_Created by **Kayan Tahir**._
