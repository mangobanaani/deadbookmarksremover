const $ = (sel) => document.querySelector(sel);

let deadList = [];
let duplicateGroups = [];
let currentFilter = { errorType: "all", folder: "all", sort: "order" };

// --- Init ---

document.addEventListener("DOMContentLoaded", init);

async function init() {
  localizeUI();

  $("#scan-btn").addEventListener("click", onScanClick);
  $("#stop-btn").addEventListener("click", onStopClick);
  $("#remove-selected-btn").addEventListener("click", removeSelected);

  // Filters
  const filterErrorType = $("#filter-error-type");
  const filterFolder = $("#filter-folder");
  const filterSort = $("#filter-sort");
  if (filterErrorType) filterErrorType.addEventListener("change", onFilterChange);
  if (filterFolder) filterFolder.addEventListener("change", onFilterChange);
  if (filterSort) filterSort.addEventListener("change", onFilterChange);

  // Export
  const exportJson = $("#export-json-btn");
  const exportCsv = $("#export-csv-btn");
  if (exportJson) exportJson.addEventListener("click", () => exportData("json"));
  if (exportCsv) exportCsv.addEventListener("click", () => exportData("csv"));

  // Listen for messages from service worker
  chrome.runtime.onMessage.addListener(onMessage);

  // Restore state
  const status = await chrome.runtime.sendMessage({ type: "GET_STATUS" });
  if (status) {
    restoreFromStatus(status);
  }

  // Show last scan info
  showLastScanInfo();
}

function restoreFromStatus(status) {
  if (status.running) {
    $("#scan-btn").disabled = true;
    $("#stop-btn").hidden = false;
    $("#progress-section").hidden = false;
    updateProgress(status.checked, status.total);

    deadList = status.dead || [];
    duplicateGroups = status.duplicates || [];
    renderDeadList();
    renderDuplicates();
  } else if (status.dead && status.dead.length > 0) {
    deadList = status.dead;
    duplicateGroups = status.duplicates || [];
    showResults(deadList.length, status.checked || status.total || 0, false);
    renderDeadList();
    renderDuplicates();
  }
}

// --- Scan controls ---

async function onScanClick() {
  // Request optional host permissions (must be in user gesture)
  try {
    const granted = await chrome.permissions.request({
      origins: ["<all_urls>"],
    });
    if (!granted) return;
  } catch {}

  deadList = [];
  duplicateGroups = [];
  $("#scan-btn").disabled = true;
  $("#stop-btn").hidden = false;
  $("#results").hidden = true;
  $("#dead-list").innerHTML = "";
  $("#remove-selected-btn").hidden = true;
  $("#select-all-wrap").hidden = true;
  $("#progress-section").hidden = false;
  $("#filter-bar").hidden = true;
  $("#duplicates-section").hidden = true;
  $("#export-bar").hidden = true;
  updateProgress(0, 0);

  chrome.runtime.sendMessage({ type: "START_SCAN" });
}

function onStopClick() {
  chrome.runtime.sendMessage({ type: "STOP_SCAN" });
}

// --- Message handling ---

function onMessage(msg) {
  switch (msg.type) {
    case "SCAN_PROGRESS":
      updateProgress(msg.checked, msg.total);
      break;
    case "SCAN_FOUND_DEAD":
      deadList.push(msg.bookmark);
      appendDeadItem(msg.bookmark);
      break;
    case "SCAN_COMPLETE":
      deadList = msg.dead || deadList;
      duplicateGroups = msg.duplicates || [];
      showResults(deadList.length, msg.checked, false);
      renderDuplicates();
      showLastScanInfo();
      break;
    case "DUPLICATES_FOUND":
      duplicateGroups = msg.duplicates || [];
      renderDuplicates();
      break;
  }
}

// --- UI updates ---

function updateProgress(checked, total) {
  const pct = total > 0 ? (checked / total) * 100 : 0;
  $("#progress-fill").style.width = `${pct}%`;
  $("#progress-text").textContent = i18n("progressText", [checked, total]) || `${checked} / ${total} checked`;
}

function showResults(deadCount, checked, aborted) {
  $("#scan-btn").disabled = false;
  $("#stop-btn").hidden = true;
  $("#results").hidden = false;

  const label = aborted ? i18n("scanStopped") || "Scan stopped." : i18n("scanComplete") || "Scan complete.";
  const found = i18n("foundDead", [deadCount, checked]) || `Found ${deadCount} dead bookmark${deadCount !== 1 ? "s" : ""} out of ${checked} checked.`;
  $("#summary").textContent = `${label} ${found}`;

  if (deadCount > 0) {
    $("#remove-selected-btn").hidden = false;
    $("#select-all-wrap").hidden = false;
    $("#select-all").checked = false;
    $("#select-all").onchange = (e) => {
      document.querySelectorAll('#dead-list input[type="checkbox"]:not(:disabled)').forEach((cb) => {
        cb.checked = e.target.checked;
      });
    };
    $("#filter-bar").hidden = false;
    $("#export-bar").hidden = false;
    populateFolderFilter();
  }
}

function appendDeadItem(item) {
  const li = document.createElement("li");
  li.id = `bm-${item.id}`;
  li.dataset.errorType = item.errorType || "";
  li.dataset.folder = item.folderPath || "";
  li.dataset.domain = item.domain || "";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "bm-checkbox";
  checkbox.dataset.bmId = item.id;

  const info = document.createElement("div");
  info.className = "bookmark-info";
  info.innerHTML = `
    <div class="bookmark-title" title="${esc(item.title)}">${esc(item.title || item.url)}</div>
    <div class="bookmark-url" title="${esc(item.url)}">${esc(item.url)}</div>
  `;

  const status = document.createElement("span");
  status.className = "bookmark-status";
  status.textContent = item.reason;

  const recheckBtn = document.createElement("button");
  recheckBtn.className = "recheck-btn";
  recheckBtn.textContent = i18n("recheck") || "Re-check";
  recheckBtn.addEventListener("click", () => recheckItem(item, li, recheckBtn));

  li.append(checkbox, info, status, recheckBtn);
  $("#dead-list").appendChild(li);
}

function renderDeadList() {
  $("#dead-list").innerHTML = "";
  const filtered = getFilteredList();
  for (const item of filtered) {
    appendDeadItem(item);
  }
}

// --- Filtering ---

function onFilterChange() {
  const filterErrorType = $("#filter-error-type");
  const filterFolder = $("#filter-folder");
  const filterSort = $("#filter-sort");

  currentFilter.errorType = filterErrorType ? filterErrorType.value : "all";
  currentFilter.folder = filterFolder ? filterFolder.value : "all";
  currentFilter.sort = filterSort ? filterSort.value : "order";

  renderDeadList();
}

function getFilteredList() {
  let list = [...deadList];

  if (currentFilter.errorType !== "all") {
    list = list.filter((d) => d.errorType === currentFilter.errorType);
  }

  if (currentFilter.folder !== "all") {
    list = list.filter((d) => d.folderPath === currentFilter.folder);
  }

  switch (currentFilter.sort) {
    case "title":
      list.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
      break;
    case "domain":
      list.sort((a, b) => (a.domain || "").localeCompare(b.domain || ""));
      break;
    case "status":
      list.sort((a, b) => (a.reason || "").localeCompare(b.reason || ""));
      break;
    default:
      break;
  }

  return list;
}

function populateFolderFilter() {
  const select = $("#filter-folder");
  if (!select) return;

  const folders = new Set(deadList.map((d) => d.folderPath).filter(Boolean));
  select.innerHTML = '<option value="all">All folders</option>';
  for (const folder of [...folders].sort()) {
    const opt = document.createElement("option");
    opt.value = folder;
    opt.textContent = folder;
    select.appendChild(opt);
  }
}

// --- Re-check ---

async function recheckItem(bookmark, li, btn) {
  btn.disabled = true;
  btn.textContent = i18n("checking") || "Checking...";

  const response = await chrome.runtime.sendMessage({
    type: "RECHECK_ONE",
    bookmark,
  });

  if (response && response.alive) {
    li.classList.add("alive");
    li.querySelector(".bookmark-status").textContent = i18n("alive") || "Alive";
    li.querySelector(".bookmark-status").style.color = "#16a34a";
    btn.hidden = true;
    li.querySelector(".bm-checkbox").disabled = true;
    deadList = deadList.filter((d) => d.id !== bookmark.id);
  } else {
    btn.disabled = false;
    btn.textContent = i18n("recheck") || "Re-check";
  }
}

// --- Duplicates ---

function renderDuplicates() {
  const section = $("#duplicates-section");
  if (!section) return;

  if (duplicateGroups.length === 0) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  const list = $("#duplicates-list");
  list.innerHTML = "";

  for (const group of duplicateGroups) {
    const groupDiv = document.createElement("div");
    groupDiv.className = "duplicate-group";

    const header = document.createElement("div");
    header.className = "duplicate-header";
    header.textContent = `${esc(group[0].url)} (${group.length} copies)`;
    header.addEventListener("click", () => {
      groupDiv.classList.toggle("collapsed");
    });
    groupDiv.appendChild(header);

    const items = document.createElement("ul");
    items.className = "duplicate-items";
    for (const bm of group) {
      const li = document.createElement("li");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "dup-checkbox";
      cb.dataset.bmId = bm.id;
      li.appendChild(cb);
      const span = document.createElement("span");
      span.textContent = `${bm.title || bm.url} — ${bm.folderPath || "root"}`;
      li.appendChild(span);
      items.appendChild(li);
    }
    groupDiv.appendChild(items);
    list.appendChild(groupDiv);
  }
}

// --- Export ---

function exportData(format) {
  let content, filename, mime;

  if (format === "json") {
    content = JSON.stringify(deadList, null, 2);
    filename = "dead-bookmarks.json";
    mime = "application/json";
  } else {
    const rows = [["ID", "Title", "URL", "Reason", "Error Type", "Status Code", "Domain", "Folder"]];
    for (const d of deadList) {
      rows.push([d.id, d.title, d.url, d.reason, d.errorType, d.statusCode, d.domain, d.folderPath]);
    }
    content = rows.map((r) => r.map((c) => `"${String(c || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    filename = "dead-bookmarks.csv";
    mime = "text/csv";
  }

  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Remove ---

function removeSelected() {
  const checked = document.querySelectorAll('#dead-list input[type="checkbox"]:checked:not(:disabled)');
  if (checked.length === 0) return;

  const count = checked.length;
  const btn = $("#remove-selected-btn");

  if (!btn.dataset.armed) {
    btn.dataset.armed = "1";
    btn.textContent = i18n("confirmRemove", [count]) || `Confirm remove ${count} bookmark${count !== 1 ? "s" : ""}?`;
    btn.classList.add("armed");
    btn._disarmTimer = setTimeout(() => disarmBtn(), 3000);
    return;
  }

  disarmBtn();
  btn.disabled = true;
  btn.textContent = i18n("removing") || "Removing...";

  (async () => {
    for (const cb of checked) {
      const id = cb.dataset.bmId;
      const li = cb.closest("li");
      try {
        await chrome.bookmarks.remove(id);
        li.remove();
        deadList = deadList.filter((d) => d.id !== id);
      } catch {
        li.classList.add("error");
      }
    }
    const remaining = document.querySelectorAll("#dead-list li");
    if (remaining.length === 0) {
      $("#remove-selected-btn").hidden = true;
      $("#select-all-wrap").hidden = true;
      $("#summary").textContent = i18n("allRemoved") || "All dead bookmarks removed.";
    }
    btn.disabled = false;
    btn.textContent = i18n("removeSelected") || "Remove Selected";
  })();
}

// Also allow removing duplicates
document.addEventListener("click", (e) => {
  if (e.target.id === "remove-dup-selected-btn") {
    removeDuplicateSelected();
  }
});

async function removeDuplicateSelected() {
  const checked = document.querySelectorAll('.dup-checkbox:checked');
  for (const cb of checked) {
    try {
      await chrome.bookmarks.remove(cb.dataset.bmId);
      cb.closest("li").remove();
    } catch {}
  }
}

function disarmBtn() {
  const btn = $("#remove-selected-btn");
  delete btn.dataset.armed;
  clearTimeout(btn._disarmTimer);
  btn.classList.remove("armed");
  btn.textContent = i18n("removeSelected") || "Remove Selected";
}

// --- Last scan info ---

async function showLastScanInfo() {
  try {
    const { lastScan } = await chrome.storage.local.get("lastScan");
    if (lastScan && lastScan.date) {
      const el = $("#last-scan-info");
      if (el) {
        const d = new Date(lastScan.date);
        el.textContent = `${i18n("lastScanned") || "Last scanned:"} ${d.toLocaleString()} — ${lastScan.deadCount} dead of ${lastScan.total}`;
        el.hidden = false;
      }
    }
  } catch {}
}

// --- i18n ---

function localizeUI() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    const msg = i18n(key);
    if (msg) el.textContent = msg;
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.dataset.i18nTitle;
    const msg = i18n(key);
    if (msg) el.title = msg;
  });
}

function i18n(key, subs) {
  try {
    return chrome.i18n.getMessage(key, subs) || "";
  } catch {
    return "";
  }
}

// --- Util ---

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}
