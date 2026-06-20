'use strict';

var tabId = null, tabUrl = '', captures = [], filterMethod = 'ALL', filterText = '';
var openId = null, lastOut = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  var tab = tabs[0];
  tabId = tab.id;
  tabUrl = tab.url || '';
  try { document.getElementById('host').textContent = new URL(tabUrl).host || tabUrl; }
  catch (e) { document.getElementById('host').textContent = tabUrl; }

  // view switch
  document.querySelectorAll('.seg-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.seg-btn').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      var v = b.dataset.view;
      document.getElementById('view-net').classList.toggle('active', v === 'net');
      document.getElementById('view-page').classList.toggle('active', v === 'page');
    });
  });

  // method chips
  document.querySelectorAll('.chip').forEach(function (c) {
    c.addEventListener('click', function () {
      document.querySelectorAll('.chip').forEach(function (x) { x.classList.remove('active'); });
      c.classList.add('active');
      filterMethod = c.dataset.m;
      render();
    });
  });

  document.getElementById('search').addEventListener('input', function (e) {
    filterText = e.target.value.toLowerCase(); render();
  });
  document.getElementById('clear').addEventListener('click', async function () {
    await chrome.runtime.sendMessage({ type: 'CLEAR', tabId: tabId });
    captures = []; openId = null; render();
  });
  document.getElementById('export').addEventListener('click', function () {
    download(JSON.stringify(filtered(), null, 2), 'devpeek-network.json', 'application/json');
  });

  // page-data actions
  document.querySelectorAll('.act').forEach(function (b) {
    b.addEventListener('click', function () { runAction(b.dataset.act, b.textContent); });
  });
  document.getElementById('out-copy').addEventListener('click', function () {
    if (lastOut != null) copy(typeof lastOut === 'string' ? lastOut : JSON.stringify(lastOut, null, 2), this);
  });
  document.getElementById('out-dl').addEventListener('click', function () {
    if (lastOut == null) return;
    var d = currentOut;
    download(typeof lastOut === 'string' ? lastOut : JSON.stringify(lastOut, null, 2), d.file, d.mime);
  });

  await refresh();
  setInterval(refresh, 1500); // live update while open
}

async function refresh() {
  var data = await chrome.runtime.sendMessage({ type: 'GET_CAPTURES', tabId: tabId });
  captures = data || [];
  render();
}

function filtered() {
  return captures.filter(function (c) {
    if (filterMethod === 'ERR') { if (c.ok) return false; }
    else if (filterMethod !== 'ALL' && c.method !== filterMethod) return false;
    if (filterText && c.url.toLowerCase().indexOf(filterText) === -1) return false;
    return true;
  });
}

function render() {
  var list = document.getElementById('net-list');
  var rows = filtered();
  document.getElementById('count').textContent = rows.length + ' / ' + captures.length + ' calls';
  document.getElementById('net-empty').classList.toggle('show', captures.length === 0);
  list.textContent = '';

  rows.slice().reverse().forEach(function (c) {
    var row = el('div', 'row' + (openId === c.id ? ' open' : ''));
    row.appendChild(badge(c.method));

    var url = el('span', 'url');
    try {
      var u = new URL(c.url);
      url.appendChild(elText('span', 'path', u.pathname + u.search));
      url.appendChild(elText('span', 'origin', '  ' + u.host));
    } catch (e) { url.textContent = c.url; }
    url.title = c.url;
    row.appendChild(url);

    var stClass = c.status === 0 ? 'bad' : c.status >= 400 ? 'bad' : c.status >= 300 ? 'warn' : 'ok';
    row.appendChild(elText('span', 'st ' + stClass, c.status || 'ERR'));
    row.appendChild(elText('span', 'dur', (c.duration != null ? c.duration + 'ms' : '')));

    row.addEventListener('click', function () {
      openId = openId === c.id ? null : c.id; render();
    });
    list.appendChild(row);

    if (openId === c.id) list.appendChild(detail(c));
  });
}

function detail(c) {
  var d = el('div', 'detail');

  var acts = el('div', 'acts');
  acts.appendChild(actionBtn('Copy cURL', function (b) { copy(toCurl(c), b); }));
  acts.appendChild(actionBtn('Copy fetch', function (b) { copy(toFetch(c), b); }));
  acts.appendChild(actionBtn('Copy response', function (b) { copy(c.respBody || '', b); }));
  d.appendChild(acts);

  d.appendChild(elText('h4', '', 'General'));
  d.appendChild(elText('p', 'kv',
    c.method + '  ' + c.status + ' ' + (c.statusText || '') + '  ·  ' + c.type + '  ·  ' + c.duration + 'ms\n' + c.url));

  if (hasKeys(c.reqHeaders)) { d.appendChild(elText('h4', '', 'Request headers')); d.appendChild(elText('p', 'kv', headerStr(c.reqHeaders))); }
  if (c.reqBody) { d.appendChild(elText('h4', '', 'Request body')); d.appendChild(elText('pre', 'body-box', pretty(c.reqBody))); }
  if (hasKeys(c.respHeaders)) { d.appendChild(elText('h4', '', 'Response headers')); d.appendChild(elText('p', 'kv', headerStr(c.respHeaders))); }
  d.appendChild(elText('h4', '', 'Response body'));
  d.appendChild(elText('pre', 'body-box', pretty(c.respBody || '(empty)')));
  return d;
}

/* ---------- page data ---------- */
var currentOut = { file: 'devpeek.txt', mime: 'text/plain' };

async function runAction(act, label) {
  var map = {
    info: extractInfo, links: extractLinks, images: extractImages, tables: extractTables,
    headings: extractHeadings, jsonld: extractJsonLd, selection: extractSelection, text: extractText
  };
  var res = await exec(map[act]);
  document.getElementById('out-label').textContent = label;
  var out = document.getElementById('out');

  if (res && res.__error) {
    out.textContent = 'Cannot read this page (' + res.__error + ').\nDevPeek can\'t run on chrome:// pages, the Web Store, or other restricted URLs.';
    lastOut = null; setOutBtns(false); return;
  }

  if (act === 'tables') {
    if (!res || !res.length) { out.textContent = 'No tables found on this page.'; lastOut = null; setOutBtns(false); return; }
    lastOut = res.join('\n\n--- next table ---\n\n');
    currentOut = { file: 'devpeek-tables.csv', mime: 'text/csv' };
    out.textContent = lastOut;
  } else if (act === 'text' || act === 'selection') {
    lastOut = res || (act === 'selection' ? '(nothing selected)' : '(empty)');
    currentOut = { file: 'devpeek-' + act + '.txt', mime: 'text/plain' };
    out.textContent = lastOut;
  } else {
    lastOut = res;
    currentOut = { file: 'devpeek-' + act + '.json', mime: 'application/json' };
    out.textContent = JSON.stringify(res, null, 2);
  }
  setOutBtns(lastOut != null);
}

async function exec(func) {
  try {
    var r = await chrome.scripting.executeScript({ target: { tabId: tabId }, func: func });
    return r && r[0] ? r[0].result : null;
  } catch (e) { return { __error: e.message }; }
}
function setOutBtns(on) {
  document.getElementById('out-copy').disabled = !on;
  document.getElementById('out-dl').disabled = !on;
}

// these run in the page (no outer references allowed)
function extractInfo() {
  var m = function (n) {
    var e = document.querySelector('meta[name="' + n + '"]') || document.querySelector('meta[property="' + n + '"]');
    return e ? e.content : '';
  };
  return {
    title: document.title, url: location.href, lang: document.documentElement.lang || '',
    charset: document.characterSet, description: m('description'), keywords: m('keywords'),
    'og:title': m('og:title'), 'og:description': m('og:description'), 'og:image': m('og:image'),
    'og:type': m('og:type'), viewport: m('viewport'),
    canonical: (document.querySelector('link[rel="canonical"]') || {}).href || ''
  };
}
function extractLinks() {
  return Array.prototype.map.call(document.querySelectorAll('a[href]'), function (a) {
    return { text: (a.textContent || '').trim().slice(0, 140), href: a.href };
  }).filter(function (x) { return x.href; });
}
function extractImages() {
  return Array.prototype.map.call(document.images, function (i) {
    return { src: i.currentSrc || i.src, alt: i.alt || '', w: i.naturalWidth, h: i.naturalHeight };
  });
}
function extractHeadings() {
  return Array.prototype.map.call(document.querySelectorAll('h1,h2,h3,h4,h5,h6'), function (h) {
    return { level: +h.tagName[1], text: (h.textContent || '').trim() };
  });
}
function extractJsonLd() {
  var out = [];
  document.querySelectorAll('script[type="application/ld+json"]').forEach(function (s) {
    try { out.push(JSON.parse(s.textContent)); }
    catch (e) { out.push({ __parseError: true, raw: (s.textContent || '').slice(0, 500) }); }
  });
  return out;
}
function extractTables() {
  var esc = function (v) {
    v = (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };
  return Array.prototype.map.call(document.querySelectorAll('table'), function (t) {
    return Array.prototype.map.call(t.rows, function (r) {
      return Array.prototype.map.call(r.cells, function (c) { return esc(c.textContent); }).join(',');
    }).join('\n');
  }).filter(Boolean);
}
function extractSelection() { return String(window.getSelection()); }
function extractText() { return document.body ? document.body.innerText : ''; }

/* ---------- helpers ---------- */
function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
function elText(tag, cls, txt) { var e = el(tag, cls); e.textContent = txt; return e; }
function badge(method) {
  var m = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].indexOf(method) >= 0 ? method : 'OTHER';
  return elText('span', 'm ' + m, method.length > 4 ? method.slice(0, 3) : method);
}
function actionBtn(label, fn) {
  var b = elText('button', 'btn ghost', label);
  b.addEventListener('click', function (e) { e.stopPropagation(); fn(b); });
  return b;
}
function hasKeys(o) { return o && Object.keys(o).length > 0; }
function headerStr(o) { return Object.keys(o).map(function (k) { return k + ': ' + o[k]; }).join('\n'); }
function pretty(s) {
  if (typeof s !== 'string') return String(s);
  var t = s.trim();
  if ((t[0] === '{' || t[0] === '[')) { try { return JSON.stringify(JSON.parse(t), null, 2); } catch (e) {} }
  return s;
}
function toCurl(c) {
  var q = function (v) { return "'" + String(v).replace(/'/g, "'\\''") + "'"; };
  var s = 'curl ' + q(c.url);
  if (c.method && c.method !== 'GET') s += " \\\n  -X " + c.method;
  Object.keys(c.reqHeaders || {}).forEach(function (k) { s += " \\\n  -H " + q(k + ': ' + c.reqHeaders[k]); });
  if (c.reqBody) s += " \\\n  --data-raw " + q(c.reqBody);
  return s;
}
function toFetch(c) {
  var opt = { method: c.method };
  if (hasKeys(c.reqHeaders)) opt.headers = c.reqHeaders;
  if (c.reqBody) opt.body = c.reqBody;
  return 'fetch(' + JSON.stringify(c.url) + ', ' + JSON.stringify(opt, null, 2) + ');';
}
function copy(text, btn) {
  navigator.clipboard.writeText(text).then(function () {
    if (!btn) return; var old = btn.textContent; btn.textContent = 'Copied';
    setTimeout(function () { btn.textContent = old; }, 1100);
  });
}
function download(text, name, mime) {
  var blob = new Blob([text], { type: mime || 'text/plain' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}
