importScripts("lib/bookmarks.js", "lib/messages.js", "lib/rate-limiter.js");

const CONCURRENCY = 10;
const rateLimiter = new DomainRateLimiter(2);
const KEEPALIVE_INTERVAL = "scan-keepalive";

let scanState = {
  running: false,
  total: 0,
  checked: 0,
  dead: [],
  duplicates: [],
  abortController: null,
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case MSG.START_SCAN:
      startScan();
      sendResponse({ ok: true });
      break;
    case MSG.STOP_SCAN:
      stopScan();
      sendResponse({ ok: true });
      break;
    case MSG.GET_STATUS:
      sendResponse({
        running: scanState.running,
        total: scanState.total,
        checked: scanState.checked,
        dead: scanState.dead,
        duplicates: scanState.duplicates,
      });
      break;
    case MSG.RECHECK_ONE:
      recheckOne(msg.bookmark).then((result) => sendResponse(result));
      return true; // async response
    default:
      break;
  }
});

function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

async function startScan() {
  if (scanState.running) return;

  scanState = {
    running: true,
    total: 0,
    checked: 0,
    dead: [],
    duplicates: [],
    abortController: new AbortController(),
  };

  chrome.action.setBadgeText({ text: "" });

  // Keepalive alarm to prevent SW termination
  chrome.alarms.create(KEEPALIVE_INTERVAL, { periodInMinutes: 25 / 60 });

  const tree = await chrome.bookmarks.getTree();
  const bookmarks = walkBookmarks(tree);
  scanState.total = bookmarks.length;

  if (bookmarks.length === 0) {
    finishScan();
    return;
  }

  broadcast({ type: MSG.SCAN_PROGRESS, checked: 0, total: scanState.total });

  // Detect duplicates
  const urlMap = new Map();
  for (const bm of bookmarks) {
    const existing = urlMap.get(bm.url);
    if (existing) {
      existing.push(bm);
    } else {
      urlMap.set(bm.url, [bm]);
    }
  }
  scanState.duplicates = Array.from(urlMap.values()).filter((group) => group.length > 1);
  if (scanState.duplicates.length > 0) {
    broadcast({ type: MSG.DUPLICATES_FOUND, duplicates: scanState.duplicates });
  }

  // Worker queue
  const queue = [...bookmarks];
  let queueIdx = 0;
  const signal = scanState.abortController.signal;
  const workers = [];

  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push(
      (async () => {
        while (queueIdx < queue.length && !signal.aborted) {
          const bm = queue[queueIdx++];
          const domain = bm.domain || "";
          if (domain) await rateLimiter.acquire(domain);
          const result = await checkBookmark(bm, signal);
          if (domain) rateLimiter.release(domain);
          if (signal.aborted) break;

          scanState.checked++;
          broadcast({
            type: MSG.SCAN_PROGRESS,
            checked: scanState.checked,
            total: scanState.total,
          });

          if (result) {
            scanState.dead.push(result);
            broadcast({ type: MSG.SCAN_FOUND_DEAD, bookmark: result });
          }
        }
      })()
    );
  }

  await Promise.all(workers);
  finishScan();
}

function stopScan() {
  if (scanState.abortController) {
    scanState.abortController.abort();
  }
  scanState.running = false;
  rateLimiter.reset();
  chrome.alarms.clear(KEEPALIVE_INTERVAL);
}

function finishScan() {
  scanState.running = false;
  chrome.alarms.clear(KEEPALIVE_INTERVAL);

  const count = scanState.dead.length;
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });

  broadcast({
    type: MSG.SCAN_COMPLETE,
    dead: scanState.dead,
    checked: scanState.checked,
    total: scanState.total,
    duplicates: scanState.duplicates,
  });

  // Save to storage
  saveScanResult();
}

async function saveScanResult() {
  const summary = {
    date: new Date().toISOString(),
    total: scanState.total,
    checked: scanState.checked,
    deadCount: scanState.dead.length,
    duplicateGroups: scanState.duplicates.length,
  };

  try {
    const { scanHistory = [] } = await chrome.storage.local.get("scanHistory");
    scanHistory.unshift(summary);
    if (scanHistory.length > 20) scanHistory.length = 20;

    await chrome.storage.local.set({
      scanHistory,
      lastScan: {
        ...summary,
        dead: scanState.dead,
        duplicates: scanState.duplicates,
      },
    });
  } catch {}
}

async function recheckOne(bookmark) {
  const result = await checkBookmark(bookmark);
  if (!result) {
    // Bookmark is alive now — remove from dead list
    scanState.dead = scanState.dead.filter((d) => d.id !== bookmark.id);
    const count = scanState.dead.length;
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
  }
  return { alive: !result, result };
}

// Keepalive handler — just keeps the SW alive during scan
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_INTERVAL && !scanState.running) {
    chrome.alarms.clear(KEEPALIVE_INTERVAL);
  }
});
