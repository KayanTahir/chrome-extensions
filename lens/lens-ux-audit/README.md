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
