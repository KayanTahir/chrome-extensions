// Service worker: per-tab capture buffer with session-storage fallback.
var mem = {};
var CAP = 500;
var BADGE = '#39C0CE';

function persist(tabId) {
  var o = {}; o['t' + tabId] = mem[tabId];
  chrome.storage.session.set(o);
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  var senderTab = sender.tab && sender.tab.id;

  if (msg.type === 'CAPTURE') {
    if (senderTab == null) return;
    var arr = mem[senderTab] || (mem[senderTab] = []);
    arr.push(msg.payload);
    if (arr.length > CAP) arr.splice(0, arr.length - CAP);
    persist(senderTab);
    chrome.action.setBadgeText({ tabId: senderTab, text: String(arr.length) });
    chrome.action.setBadgeBackgroundColor({ tabId: senderTab, color: BADGE });
    return;
  }

  if (msg.type === 'RESET') {
    if (senderTab == null) return;
    mem[senderTab] = [];
    chrome.storage.session.remove('t' + senderTab);
    chrome.action.setBadgeText({ tabId: senderTab, text: '' });
    return;
  }

  if (msg.type === 'GET_CAPTURES') {
    var tabId = msg.tabId;
    if (mem[tabId]) { sendResponse(mem[tabId]); return true; }
    chrome.storage.session.get('t' + tabId).then(function (o) {
      sendResponse(o['t' + tabId] || []);
    });
    return true;
  }

  if (msg.type === 'CLEAR') {
    var t = msg.tabId;
    mem[t] = [];
    chrome.storage.session.remove('t' + t);
    chrome.action.setBadgeText({ tabId: t, text: '' });
    sendResponse(true);
    return true;
  }
});

chrome.tabs.onRemoved.addListener(function (tabId) {
  delete mem[tabId];
  chrome.storage.session.remove('t' + tabId);
});
