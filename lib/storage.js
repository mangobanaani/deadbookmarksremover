/**
 * Storage helpers for scan history using chrome.storage.local.
 */

const MAX_HISTORY = 20;

async function saveLastScan(summary, dead, duplicates) {
  const entry = {
    date: new Date().toISOString(),
    ...summary,
  };

  const { scanHistory = [] } = await chrome.storage.local.get("scanHistory");
  scanHistory.unshift(entry);
  if (scanHistory.length > MAX_HISTORY) scanHistory.length = MAX_HISTORY;

  await chrome.storage.local.set({
    scanHistory,
    lastScan: {
      ...entry,
      dead,
      duplicates,
    },
  });
}

async function getLastScan() {
  const { lastScan } = await chrome.storage.local.get("lastScan");
  return lastScan || null;
}

async function getScanHistory() {
  const { scanHistory = [] } = await chrome.storage.local.get("scanHistory");
  return scanHistory;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { saveLastScan, getLastScan, getScanHistory, MAX_HISTORY };
}
