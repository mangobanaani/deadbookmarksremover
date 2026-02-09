const TIMEOUT_MS = 8000;

/**
 * Walk a chrome.bookmarks tree and return flat array of HTTP bookmarks.
 * Each entry includes domain and folderPath.
 */
function walkBookmarks(tree) {
  const results = [];

  function walk(nodes, path) {
    for (const node of nodes) {
      const currentPath = node.title ? (path ? `${path}/${node.title}` : node.title) : path;

      if (node.url && node.url.startsWith("http")) {
        let domain = "";
        try {
          domain = new URL(node.url).hostname;
        } catch {}
        results.push({
          id: node.id,
          title: node.title,
          url: node.url,
          domain,
          folderPath: path || "",
        });
      }
      if (node.children) walk(node.children, currentPath);
    }
  }

  walk(tree, "");
  return results;
}

/**
 * Check if a bookmark is dead. Returns null if alive, or an enriched
 * object with reason, errorType, and statusCode if dead.
 */
async function checkBookmark(bm, signal) {
  if (signal && signal.aborted) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    if (signal) {
      signal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    const resp = await fetch(bm.url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timer);

    if (resp.status === 429) return null;
    if (resp.status >= 400) {
      return {
        ...bm,
        reason: `HTTP ${resp.status}`,
        statusCode: resp.status,
        errorType: resp.status >= 500 ? "http-5xx" : "http-4xx",
      };
    }

    return null;
  } catch (e) {
    if (signal && signal.aborted) return null;

    // HEAD failed, retry with GET (some servers block HEAD)
    try {
      const controller2 = new AbortController();
      const timer2 = setTimeout(() => controller2.abort(), TIMEOUT_MS);

      if (signal) {
        signal.addEventListener("abort", () => controller2.abort(), { once: true });
      }

      const resp2 = await fetch(bm.url, {
        method: "GET",
        signal: controller2.signal,
        redirect: "follow",
      });

      clearTimeout(timer2);

      if (resp2.status === 429) return null;
      if (resp2.status >= 400) {
        return {
          ...bm,
          reason: `HTTP ${resp2.status}`,
          statusCode: resp2.status,
          errorType: resp2.status >= 500 ? "http-5xx" : "http-4xx",
        };
      }

      return null;
    } catch {
      return {
        ...bm,
        reason: "Unreachable",
        statusCode: 0,
        errorType: "unreachable",
      };
    }
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { walkBookmarks, checkBookmark, TIMEOUT_MS };
}
