'use strict';

var tabId = null, report = null;
var SEV_W = { critical: 15, serious: 8, moderate: 4, minor: 2 };
var SEV_ABBR = { critical: 'crit', serious: 'ser', moderate: 'mod', minor: 'min' };

document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('rerun').addEventListener('click', run);
  document.getElementById('copy').addEventListener('click', function () {
    if (report) copy(JSON.stringify(report, null, 2), this);
  });
  document.getElementById('download').addEventListener('click', function () {
    if (report) download(toMarkdown(report), 'ux-audit.md', 'text/markdown');
  });
  run();
});

async function run() {
  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tabs[0].id;
  try { document.getElementById('host').textContent = new URL(tabs[0].url).host; }
  catch (e) { document.getElementById('host').textContent = tabs[0].url || ''; }

  setSub('Running audit…');
  var res;
  try {
    var r = await chrome.scripting.executeScript({ target: { tabId: tabId }, func: auditor });
    res = r && r[0] ? r[0].result : null;
  } catch (e) { res = { __error: e.message }; }

  if (!res || res.__error) {
    report = null;
    document.getElementById('report').innerHTML =
      '<div class="empty"><b>Can\'t audit this page</b>' +
      (res && res.__error ? res.__error : 'No result') +
      '<br><br>Lens can\'t run on <code>chrome://</code> pages, the Web Store, or other extensions.</div>';
    setScore(null); document.getElementById('copy').disabled = true; document.getElementById('download').disabled = true;
    return;
  }
  report = res;
  render();
  document.getElementById('copy').disabled = false;
  document.getElementById('download').disabled = false;
}

function render() {
  setScore(report.score, report.grade);
  var totalFindings = report.categories.reduce(function (n, c) { return n + c.findings.length; }, 0);
  setSub(totalFindings ? totalFindings + ' issues across ' + report.categories.length + ' areas' : 'No issues found — clean page');
  var s = report.stats;
  document.getElementById('stats').textContent =
    s.nodes + ' nodes · ' + s.interactive + ' controls · ' + s.fonts + ' fonts · ' + s.sizes + ' sizes · ' + s.textColors + ' text colors';

  var box = document.getElementById('report');
  box.textContent = '';
  report.categories.forEach(function (cat) {
    var wrap = el('div', 'cat' + (cat.findings.length && cat.score < 100 ? ' open' : ''));
    var head = el('div', 'cat-head');
    head.appendChild(miniRing(cat.score));
    var name = el('div', 'cat-name');
    name.appendChild(document.createTextNode(cat.name));
    name.appendChild(elText('small', '', cat.findings.length ? cat.findings.length + ' finding' + (cat.findings.length > 1 ? 's' : '') : 'all clear'));
    head.appendChild(name);
    head.appendChild(elText('span', 'cat-score', cat.score));
    head.appendChild(elText('span', 'chev', '›'));
    head.addEventListener('click', function () { wrap.classList.toggle('open'); });
    wrap.appendChild(head);

    var f = el('div', 'findings');
    if (!cat.findings.length) {
      f.appendChild(elText('div', 'pass', '✓ No issues detected in this area.'));
    } else {
      cat.findings.forEach(function (fi) {
        var d = el('div', 'find ' + SEV_ABBR[fi.sev]);
        d.appendChild(elText('div', 'find-title', fi.title));
        d.appendChild(elText('div', 'find-detail', fi.detail));
        if (fi.elems && fi.elems.length) {
          var ee = el('div', 'elems');
          fi.elems.slice(0, 25).forEach(function (m) {
            var row = elText('div', 'elem', '⟶ ' + m.label);
            row.title = 'Click to highlight on page';
            row.addEventListener('click', function () { locate(m.id); });
            ee.appendChild(row);
          });
          if (fi.elems.length > 25) ee.appendChild(elText('div', 'find-detail', '…and ' + (fi.elems.length - 25) + ' more'));
          d.appendChild(ee);
        }
        f.appendChild(d);
      });
    }
    wrap.appendChild(f);
    box.appendChild(wrap);
  });
}

async function locate(id) {
  try { await chrome.scripting.executeScript({ target: { tabId: tabId }, func: locator, args: [id] }); } catch (e) {}
}

/* ---------- UI helpers ---------- */
function setSub(t) { document.getElementById('score-sub').textContent = t; }
function setScore(v, grade) {
  var ring = document.getElementById('ring-fg');
  var C = 326.7;
  if (v == null) { document.getElementById('score-val').textContent = '–'; document.getElementById('score-grade').textContent = '';
    ring.style.strokeDashoffset = C; return; }
  document.getElementById('score-val').textContent = v;
  document.getElementById('score-grade').textContent = grade;
  ring.style.strokeDashoffset = C - C * (v / 100);
  ring.style.stroke = v >= 80 ? 'var(--good)' : v >= 60 ? 'var(--mod)' : 'var(--accent)';
}
function miniRing(score) {
  var ns = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 36 36'); svg.setAttribute('class', 'cat-bar');
  var bg = document.createElementNS(ns, 'circle');
  [['cx', 18], ['cy', 18], ['r', 15], ['fill', 'none'], ['stroke', '#25212f'], ['stroke-width', 4]].forEach(function (a) { bg.setAttribute(a[0], a[1]); });
  var fg = document.createElementNS(ns, 'circle');
  var c = 2 * Math.PI * 15;
  var col = score >= 80 ? '#4cd6a0' : score >= 60 ? '#f5c451' : '#ff4d6d';
  [['cx', 18], ['cy', 18], ['r', 15], ['fill', 'none'], ['stroke', col], ['stroke-width', 4],
   ['stroke-linecap', 'round'], ['stroke-dasharray', c], ['stroke-dashoffset', c - c * score / 100],
   ['transform', 'rotate(-90 18 18)']].forEach(function (a) { fg.setAttribute(a[0], a[1]); });
  svg.appendChild(bg); svg.appendChild(fg);
  return svg;
}
function el(t, c) { var e = document.createElement(t); if (c) e.className = c; return e; }
function elText(t, c, x) { var e = el(t, c); e.textContent = x; return e; }
function copy(text, btn) {
  navigator.clipboard.writeText(text).then(function () {
    var o = btn.textContent; btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = o; }, 1100);
  });
}
function download(text, name, mime) {
  var b = new Blob([text], { type: mime }); var u = URL.createObjectURL(b);
  var a = document.createElement('a'); a.href = u; a.download = name; a.click();
  setTimeout(function () { URL.revokeObjectURL(u); }, 1000);
}
function toMarkdown(r) {
  var out = '# UI/UX Audit\n\n**' + r.title + '**\n' + r.url + '\n\nScore: **' + r.score + '/100 (' + r.grade + ')**\n';
  r.categories.forEach(function (c) {
    out += '\n## ' + c.name + ' — ' + c.score + '/100\n';
    if (!c.findings.length) { out += '\n_No issues._\n'; return; }
    c.findings.forEach(function (f) {
      out += '\n- **[' + f.sev + '] ' + f.title + '** — ' + f.detail;
      if (f.elems && f.elems.length) out += '\n  - ' + f.elems.slice(0, 25).map(function (e) { return '`' + e.label + '`'; }).join('\n  - ');
      out += '\n';
    });
  });
  return out;
}

/* =====================================================================
   AUDITOR — runs in the page (must be fully self-contained)
   ===================================================================== */
function auditor() {
  document.querySelectorAll('[data-lens-id]').forEach(function (e) { e.removeAttribute('data-lens-id'); });
  var counter = 0;
  function tag(el) { var id = el.getAttribute('data-lens-id'); if (!id) { id = String(++counter); el.setAttribute('data-lens-id', id); } return id; }
  function ref(el) {
    var t = el.tagName.toLowerCase();
    if (el.id) t += '#' + el.id;
    else if (el.classList && el.classList.length) t += '.' + Array.prototype.slice.call(el.classList, 0, 2).join('.');
    var txt = (el.getAttribute('alt') || el.textContent || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ');
    if (txt) t += '  "' + txt.slice(0, 32) + (txt.length > 32 ? '…' : '') + '"';
    return { id: tag(el), label: t.slice(0, 80) };
  }
  function visible(el) {
    var s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function parseColor(c) {
    var m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null;
    var p = m[1].split(',').map(parseFloat);
    return [p[0], p[1], p[2], p[3] == null ? 1 : p[3]];
  }
  function lum(rgb) {
    var a = rgb.slice(0, 3).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }
  function ratio(fg, bg) { var L1 = lum(fg), L2 = lum(bg); var hi = Math.max(L1, L2), lo = Math.min(L1, L2); return (hi + 0.05) / (lo + 0.05); }
  function blendWhite(c) { var a = c[3]; return [c[0] * a + 255 * (1 - a), c[1] * a + 255 * (1 - a), c[2] * a + 255 * (1 - a), 1]; }
  function effBg(el) {
    var n = el;
    while (n && n.nodeType === 1) {
      var bg = parseColor(getComputedStyle(n).backgroundColor);
      if (bg && bg[3] > 0) return bg[3] < 1 ? blendWhite(bg) : bg;
      n = n.parentElement;
    }
    return [255, 255, 255, 1];
  }
  function accName(el) {
    var al = el.getAttribute('aria-label'); if (al && al.trim()) return al.trim();
    var lb = el.getAttribute('aria-labelledby');
    if (lb) { var t = lb.split(/\s+/).map(function (i) { var e = document.getElementById(i); return e ? e.textContent : ''; }).join(' ').trim(); if (t) return t; }
    var txt = (el.textContent || '').trim(); if (txt) return txt;
    var ti = el.getAttribute('title'); if (ti && ti.trim()) return ti.trim();
    var img = el.querySelector && el.querySelector('img[alt]'); if (img && (img.getAttribute('alt') || '').trim()) return img.getAttribute('alt').trim();
    if (el.tagName === 'INPUT' && (el.type === 'submit' || el.type === 'button') && el.value) return el.value;
    return '';
  }

  var findings = {}; // category -> [finding]
  function add(cat, sev, title, detail, elems) { (findings[cat] || (findings[cat] = [])).push({ sev: sev, title: title, detail: detail, elems: elems || [] }); }

  var all = document.querySelectorAll('*');

  // ---- ACCESSIBILITY ----
  var noAlt = [];
  document.querySelectorAll('img').forEach(function (im) {
    if (!im.hasAttribute('alt') && visible(im)) noAlt.push(ref(im));
  });
  if (noAlt.length) add('a11y', 'serious', 'Images without alt text', noAlt.length + ' image(s) have no alt attribute. Add alt="" for decorative images or descriptive text for meaningful ones.', noAlt);

  var noName = [];
  document.querySelectorAll('button, a[href], [role="button"]').forEach(function (b) {
    if (visible(b) && !accName(b)) noName.push(ref(b));
  });
  if (noName.length) add('a11y', 'critical', 'Controls with no accessible name', noName.length + ' button(s)/link(s) have no text, aria-label or title — screen readers announce nothing.', noName);

  var noLabel = [];
  document.querySelectorAll('input, select, textarea').forEach(function (f) {
    var t = (f.type || '').toLowerCase();
    if (['hidden', 'submit', 'button', 'reset', 'image'].indexOf(t) >= 0) return;
    if (!visible(f)) return;
    var labelled = !!accName(f) || (f.id && document.querySelector('label[for="' + (window.CSS && CSS.escape ? CSS.escape(f.id) : f.id) + '"]')) || !!(f.closest && f.closest('label'));
    if (!labelled) noLabel.push(ref(f));
  });
  if (noLabel.length) add('a11y', 'serious', 'Form fields without a label', noLabel.length + ' field(s) rely on placeholder only or have no label. Placeholders disappear on input and aren\'t read reliably.', noLabel);

  if (!document.documentElement.getAttribute('lang')) add('a11y', 'moderate', 'No lang attribute', 'The <html> element has no lang — screen readers can\'t pick the right pronunciation.', [ref(document.documentElement)]);
  if (!document.title || !document.title.trim()) add('a11y', 'moderate', 'Missing page title', 'The document has no <title>.');

  var h1 = document.querySelectorAll('h1');
  if (h1.length === 0) add('a11y', 'moderate', 'No H1 heading', 'The page has no top-level heading to anchor its structure.');
  else if (h1.length > 1) add('a11y', 'minor', 'Multiple H1 headings', h1.length + ' <h1> elements found — usually there should be one main heading.', Array.prototype.map.call(h1, ref));

  var levels = [], skips = [];
  document.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(function (h) {
    var lv = +h.tagName[1];
    if (levels.length && lv - levels[levels.length - 1] > 1) skips.push(ref(h));
    levels.push(lv);
  });
  if (skips.length) add('a11y', 'minor', 'Skipped heading levels', 'Heading levels jump (e.g. h2 → h4). Keep the outline sequential.', skips);

  var posTab = [];
  document.querySelectorAll('[tabindex]').forEach(function (e) { if (+e.getAttribute('tabindex') > 0) posTab.push(ref(e)); });
  if (posTab.length) add('a11y', 'moderate', 'Positive tabindex', posTab.length + ' element(s) use tabindex > 0, which hijacks natural tab order.', posTab);

  if (!document.querySelector('main, [role="main"]')) add('a11y', 'moderate', 'No main landmark', 'No <main> or role="main" — assistive tech can\'t skip to primary content.');

  var generic = [];
  document.querySelectorAll('a[href]').forEach(function (a) {
    if (!visible(a)) return;
    var t = (accName(a) || '').toLowerCase().trim();
    if (['click here', 'here', 'read more', 'more', 'link', 'this'].indexOf(t) >= 0) generic.push(ref(a));
  });
  if (generic.length) add('a11y', 'minor', 'Non-descriptive link text', generic.length + ' link(s) say "click here"/"read more" — out of context they\'re meaningless.', generic);

  var seen = {}, dup = [];
  document.querySelectorAll('[id]').forEach(function (e) { var i = e.id; if (seen[i]) dup.push(ref(e)); else seen[i] = 1; });
  if (dup.length) add('a11y', 'minor', 'Duplicate IDs', dup.length + ' repeated id value(s) — breaks label associations and aria references.', dup);

  // contrast
  var contrast = [], scanned = 0;
  for (var i = 0; i < all.length && scanned < 2500; i++) {
    var e = all[i];
    var hasText = false;
    for (var c = 0; c < e.childNodes.length; c++) if (e.childNodes[c].nodeType === 3 && e.childNodes[c].nodeValue.trim()) { hasText = true; break; }
    if (!hasText || !visible(e)) continue;
    scanned++;
    var st = getComputedStyle(e);
    var fg = parseColor(st.color); if (!fg) continue;
    if (fg[3] < 1) fg = blendWhite(fg);
    var bg = effBg(e);
    var rr = ratio(fg, bg);
    var size = parseFloat(st.fontSize), bold = (+st.fontWeight) >= 700;
    var large = size >= 24 || (size >= 18.66 && bold);
    var need = large ? 3 : 4.5;
    if (rr < need) { var m = ref(e); m.label = 'ratio ' + rr.toFixed(2) + ' (need ' + need + ')  ' + m.label; contrast.push(m); }
  }
  if (contrast.length) add('a11y', 'serious', 'Low colour contrast', contrast.length + ' text element(s) fall below WCAG AA contrast against their background.', contrast);

  // ---- READABILITY ----
  var small = [], sSeen = 0;
  for (var j = 0; j < all.length && sSeen < 2500; j++) {
    var t2 = all[j], txt = false;
    for (var k = 0; k < t2.childNodes.length; k++) if (t2.childNodes[k].nodeType === 3 && t2.childNodes[k].nodeValue.trim()) { txt = true; break; }
    if (!txt || !visible(t2)) continue;
    sSeen++;
    if (parseFloat(getComputedStyle(t2).fontSize) < 12) small.push(ref(t2));
  }
  if (small.length) add('read', 'moderate', 'Text below 12px', small.length + ' text element(s) render under 12px — hard to read, especially on mobile.', small.slice(0, 40));

  // ---- MOBILE / TOUCH ----
  var vp = document.querySelector('meta[name="viewport"]');
  if (!vp) add('mobile', 'serious', 'No viewport meta', 'Without <meta name="viewport"> the page won\'t scale on phones.');
  else {
    var cont = (vp.content || '').toLowerCase();
    if (/user-scalable\s*=\s*no/.test(cont) || /maximum-scale\s*=\s*1(\.0)?\b/.test(cont))
      add('mobile', 'moderate', 'Zoom disabled', 'The viewport blocks pinch-zoom (user-scalable=no / maximum-scale=1) — an accessibility barrier.', [ref(vp)]);
  }
  var smallTap = [];
  document.querySelectorAll('a[href], button, input, select, [role="button"]').forEach(function (b) {
    if (!visible(b)) return;
    if (b.tagName === 'INPUT' && ['hidden', 'checkbox', 'radio'].indexOf((b.type || '').toLowerCase()) >= 0) return;
    var r = b.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) smallTap.push(ref(b));
  });
  if (smallTap.length) add('mobile', 'moderate', 'Small tap targets', smallTap.length + ' control(s) are under 40×40px — below the recommended touch size.', smallTap.slice(0, 40));
  if (document.documentElement.scrollWidth > window.innerWidth + 2)
    add('mobile', 'moderate', 'Horizontal overflow', 'Page content is wider than the viewport (' + document.documentElement.scrollWidth + 'px > ' + window.innerWidth + 'px), causing sideways scroll.');

  // ---- CONSISTENCY ----
  var fonts = {}, sizes = {}, colors = {}, inline = 0, ssc = 0;
  for (var x = 0; x < all.length && ssc < 3000; x++) {
    var n = all[x];
    if (n.getAttribute && n.getAttribute('style')) inline++;
    if (!visible(n)) continue; ssc++;
    var cs = getComputedStyle(n);
    fonts[(cs.fontFamily || '').split(',')[0].replace(/["']/g, '').trim()] = 1;
    sizes[Math.round(parseFloat(cs.fontSize))] = 1;
    colors[cs.color] = 1;
  }
  var nFonts = Object.keys(fonts).length, nSizes = Object.keys(sizes).length, nColors = Object.keys(colors).length;
  if (nFonts > 4) add('design', 'minor', 'Too many font families', nFonts + ' distinct fonts in use — 2–3 keeps a page coherent.');
  if (nSizes > 12) add('design', 'minor', 'Many font sizes', nSizes + ' distinct font sizes — a tighter type scale reads as more intentional.');
  if (nColors > 14) add('design', 'minor', 'Sprawling text-colour palette', nColors + ' distinct text colours — consider a smaller, deliberate set.');
  if (inline > 30) add('design', 'minor', 'Heavy inline styles', inline + ' elements use inline style="" — harder to keep consistent than classes.');

  // ---- STRUCTURE ----
  var nodes = all.length;
  if (nodes > 1500) add('struct', 'minor', 'Large DOM', nodes + ' DOM nodes — big trees slow rendering and hurt responsiveness.');
  var noDim = [];
  document.querySelectorAll('img').forEach(function (im) {
    if (visible(im) && !(im.getAttribute('width') && im.getAttribute('height')) && !(im.style.aspectRatio)) noDim.push(ref(im));
  });
  if (noDim.length) add('struct', 'minor', 'Images without dimensions', noDim.length + ' image(s) lack width/height — can cause layout shift (CLS).', noDim.slice(0, 40));
  var maxDepth = 0;
  (function depth(node, d) { if (d > maxDepth) maxDepth = d; for (var c = 0; c < node.children.length; c++) depth(node.children[c], d + 1); })(document.body || document.documentElement, 0);
  if (maxDepth > 25) add('struct', 'minor', 'Deep DOM nesting', 'Max nesting depth is ' + maxDepth + ' levels — flatter markup is easier to style and faster.');

  // ---- assemble ----
  var defs = [
    ['a11y', 'Accessibility'], ['read', 'Readability'], ['mobile', 'Mobile & Touch'],
    ['design', 'Design Consistency'], ['struct', 'Structure']
  ];
  var cats = defs.map(function (d) {
    var list = findings[d[0]] || [];
    var penalty = 0;
    list.forEach(function (f) {
      var n = f.elems && f.elems.length ? Math.min(f.elems.length, 5) : 1;
      penalty += ({ critical: 15, serious: 8, moderate: 4, minor: 2 }[f.sev]) * (f.elems && f.elems.length ? 1 + (n - 1) * 0.4 : 1);
    });
    return { key: d[0], name: d[1], score: Math.max(0, Math.round(100 - penalty)), findings: list };
  });
  var overall = Math.round(cats.reduce(function (s, c) { return s + c.score; }, 0) / cats.length);
  var grade = overall >= 90 ? 'A' : overall >= 80 ? 'B' : overall >= 70 ? 'C' : overall >= 60 ? 'D' : 'F';

  return {
    url: location.href, title: document.title, ts: Date.now(),
    score: overall, grade: grade,
    stats: { nodes: nodes, interactive: document.querySelectorAll('a[href],button,input,select,textarea,[role="button"]').length,
             fonts: nFonts, sizes: nSizes, textColors: nColors },
    categories: cats
  };
}

/* LOCATOR — highlights an element by its data-lens-id */
function locator(id) {
  var el = document.querySelector('[data-lens-id="' + id + '"]');
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  var r = el.getBoundingClientRect();
  var o = document.createElement('div');
  o.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border:3px solid #ff4d6d;border-radius:4px;box-shadow:0 0 0 4px rgba(255,77,109,.28);transition:opacity .35s;';
  o.style.left = (r.left - 3) + 'px'; o.style.top = (r.top - 3) + 'px';
  o.style.width = r.width + 'px'; o.style.height = r.height + 'px';
  document.body.appendChild(o);
  setTimeout(function () { o.style.opacity = '0'; }, 1500);
  setTimeout(function () { o.remove(); }, 1900);
  return true;
}
