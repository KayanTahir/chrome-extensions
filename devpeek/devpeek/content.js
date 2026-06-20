// Isolated world. Relays captured calls from the page to the service worker.
// On a fresh top-level document load, reset that tab's capture buffer.
if (window.top === window) {
  try { chrome.runtime.sendMessage({ type: 'RESET' }); } catch (e) {}
}

window.addEventListener('message', function (e) {
  if (e.source !== window) return;
  var d = e.data;
  if (!d || d.__devpeek !== true || !d.payload) return;
  try { chrome.runtime.sendMessage({ type: 'CAPTURE', payload: d.payload }); } catch (err) {}
});
