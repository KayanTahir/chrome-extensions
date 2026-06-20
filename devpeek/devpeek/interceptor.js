// Runs in the page's MAIN world at document_start, before the page makes any calls.
// Patches fetch + XMLHttpRequest and forwards each completed call to the content script.
(function () {
  if (window.__devpeekInstalled) return;
  window.__devpeekInstalled = true;

  var MAXBODY = 100000; // cap stored bodies at ~100 KB

  function id() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function abs(u) {
    try { return new URL(u, location.href).href; } catch (e) { return String(u); }
  }
  function trunc(s) {
    if (typeof s !== 'string') return s;
    return s.length > MAXBODY ? s.slice(0, MAXBODY) + '\n…[truncated by DevPeek]' : s;
  }
  function send(p) {
    try { window.postMessage({ __devpeek: true, payload: p }, '*'); } catch (e) {}
  }
  function readable(ct) {
    return !ct || /json|text|xml|javascript|urlencoded|html|csv|graphql/i.test(ct);
  }

  // ---- fetch ----
  var origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function () {
      var args = arguments;
      var start = performance.now();
      var input = args[0], init = args[1] || {};
      var url = '', method = 'GET', reqHeaders = {}, reqBody = null;
      try {
        if (typeof Request !== 'undefined' && input instanceof Request) {
          url = input.url; method = input.method || 'GET';
          if (input.headers && input.headers.forEach) input.headers.forEach(function (v, k) { reqHeaders[k] = v; });
        } else {
          url = String(input);
        }
        if (init.method) method = init.method;
        if (init.headers) {
          if (typeof Headers !== 'undefined' && init.headers instanceof Headers) init.headers.forEach(function (v, k) { reqHeaders[k] = v; });
          else if (Array.isArray(init.headers)) init.headers.forEach(function (p) { reqHeaders[p[0]] = p[1]; });
          else for (var k in init.headers) reqHeaders[k] = init.headers[k];
        }
        if (init.body && typeof init.body === 'string') reqBody = trunc(init.body);
      } catch (e) {}

      return origFetch.apply(this, args).then(function (res) {
        var clone;
        try { clone = res.clone(); } catch (e) { clone = null; }
        var respHeaders = {};
        try { res.headers.forEach(function (v, k) { respHeaders[k] = v; }); } catch (e) {}
        var ct = respHeaders['content-type'] || '';
        var finish = function (body) {
          send({ id: id(), type: 'fetch', method: method.toUpperCase(), url: abs(url),
            status: res.status, statusText: res.statusText, ok: res.ok,
            reqHeaders: reqHeaders, reqBody: reqBody, respHeaders: respHeaders,
            respBody: body, duration: Math.round(performance.now() - start), ts: Date.now() });
        };
        if (clone && readable(ct)) {
          clone.text().then(function (t) { finish(trunc(t)); }).catch(function () { finish('[unreadable body]'); });
        } else {
          finish('[binary or unreadable body' + (ct ? ', ' + ct : '') + ']');
        }
        return res;
      }).catch(function (err) {
        send({ id: id(), type: 'fetch', method: method.toUpperCase(), url: abs(url),
          status: 0, statusText: 'NETWORK ERROR', ok: false,
          reqHeaders: reqHeaders, reqBody: reqBody, respHeaders: {},
          respBody: '[network error] ' + err, duration: Math.round(performance.now() - start), ts: Date.now() });
        throw err;
      });
    };
  }

  // ---- XMLHttpRequest ----
  var OrigXHR = window.XMLHttpRequest;
  if (OrigXHR) {
    function PatchedXHR() {
      var xhr = new OrigXHR();
      var meta = { method: 'GET', url: '', reqHeaders: {}, reqBody: null, start: 0 };
      var open = xhr.open;
      xhr.open = function (m, u) {
        meta.method = (m || 'GET').toUpperCase(); meta.url = u;
        return open.apply(xhr, arguments);
      };
      var setH = xhr.setRequestHeader;
      xhr.setRequestHeader = function (k, v) { meta.reqHeaders[k] = v; return setH.apply(xhr, arguments); };
      var origSend = xhr.send;
      xhr.send = function (body) {
        meta.reqBody = typeof body === 'string' ? trunc(body) : (body == null ? null : '[' + (body.constructor && body.constructor.name || 'binary') + ']');
        meta.start = performance.now();
        xhr.addEventListener('loadend', function () {
          var respHeaders = {};
          try {
            (xhr.getAllResponseHeaders() || '').trim().split(/[\r\n]+/).forEach(function (line) {
              var i = line.indexOf(':');
              if (i > 0) respHeaders[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
            });
          } catch (e) {}
          var respBody = '';
          try {
            if (xhr.responseType === '' || xhr.responseType === 'text') respBody = trunc(xhr.responseText);
            else if (xhr.responseType === 'json') respBody = trunc(JSON.stringify(xhr.response));
            else respBody = '[' + xhr.responseType + ' response]';
          } catch (e) { respBody = '[unreadable body]'; }
          send({ id: id(), type: 'xhr', method: meta.method, url: abs(meta.url),
            status: xhr.status, statusText: xhr.statusText, ok: xhr.status >= 200 && xhr.status < 300,
            reqHeaders: meta.reqHeaders, reqBody: meta.reqBody, respHeaders: respHeaders,
            respBody: respBody, duration: Math.round(performance.now() - meta.start), ts: Date.now() });
        });
        return origSend.apply(xhr, arguments);
      };
      return xhr;
    }
    PatchedXHR.prototype = OrigXHR.prototype;
    ['UNSENT', 'OPENED', 'HEADERS_RECEIVED', 'LOADING', 'DONE'].forEach(function (k) {
      try { PatchedXHR[k] = OrigXHR[k]; } catch (e) {}
    });
    window.XMLHttpRequest = PatchedXHR;
  }
})();
