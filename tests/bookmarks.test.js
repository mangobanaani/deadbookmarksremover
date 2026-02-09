const { walkBookmarks, checkBookmark } = require("../lib/bookmarks");

// --- Mocks ---

global.AbortController = class {
  constructor() {
    this.signal = { aborted: false, addEventListener: jest.fn() };
  }
  abort() {
    this.signal.aborted = true;
  }
};

let fetchResponses = {};
let fetchErrors = {};

function defaultFetchMock(url, opts) {
  if (fetchErrors[url]) {
    return Promise.reject(new Error(fetchErrors[url]));
  }
  const resp = fetchResponses[url] || { status: 200, type: "basic" };
  return Promise.resolve({
    status: resp.status,
    type: resp.type || "basic",
    ok: resp.status >= 200 && resp.status < 300,
  });
}

global.fetch = jest.fn(defaultFetchMock);
global.setTimeout = jest.fn((fn, ms) => 42);
global.clearTimeout = jest.fn();

// --- Tests ---

describe("walkBookmarks()", () => {
  test("extracts bookmarks from nested tree", () => {
    const tree = [
      {
        id: "0",
        title: "root",
        children: [
          {
            id: "1",
            title: "Bookmarks Bar",
            children: [
              { id: "2", title: "Google", url: "https://google.com" },
              { id: "3", title: "GitHub", url: "https://github.com" },
              {
                id: "4",
                title: "Folder",
                children: [
                  { id: "5", title: "Deep", url: "https://deep.example.com" },
                ],
              },
            ],
          },
        ],
      },
    ];

    const result = walkBookmarks(tree);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ id: "2", title: "Google", url: "https://google.com" });
    expect(result[2]).toMatchObject({ id: "5", title: "Deep", url: "https://deep.example.com" });
  });

  test("includes domain and folderPath", () => {
    const tree = [
      {
        id: "0",
        title: "root",
        children: [
          {
            id: "1",
            title: "Bookmarks Bar",
            children: [
              { id: "2", title: "Google", url: "https://www.google.com/search" },
              {
                id: "3",
                title: "Dev",
                children: [
                  { id: "4", title: "MDN", url: "https://developer.mozilla.org" },
                ],
              },
            ],
          },
        ],
      },
    ];

    const result = walkBookmarks(tree);
    expect(result[0].domain).toBe("www.google.com");
    expect(result[0].folderPath).toBe("root/Bookmarks Bar");
    expect(result[1].domain).toBe("developer.mozilla.org");
    expect(result[1].folderPath).toBe("root/Bookmarks Bar/Dev");
  });

  test("skips non-http bookmarks", () => {
    const tree = [
      {
        id: "0",
        children: [
          { id: "1", title: "JS", url: "javascript:void(0)" },
          { id: "2", title: "Chrome", url: "chrome://settings" },
          { id: "3", title: "FTP", url: "ftp://files.example.com" },
          { id: "4", title: "Valid", url: "https://valid.com" },
        ],
      },
    ];

    const result = walkBookmarks(tree);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("4");
  });

  test("handles empty tree", () => {
    const result = walkBookmarks([{ id: "0", children: [] }]);
    expect(result).toHaveLength(0);
  });

  test("handles folders with no children property", () => {
    const tree = [{ id: "0", title: "separator" }];
    const result = walkBookmarks(tree);
    expect(result).toHaveLength(0);
  });
});

describe("checkBookmark()", () => {
  beforeEach(() => {
    fetchResponses = {};
    fetchErrors = {};
    fetch.mockImplementation(defaultFetchMock);
  });

  test("returns null for HTTP 200", async () => {
    fetchResponses["https://ok.com"] = { status: 200 };
    const result = await checkBookmark({ id: "1", title: "OK", url: "https://ok.com" });
    expect(result).toBeNull();
  });

  test("returns dead with errorType http-4xx for HTTP 404", async () => {
    fetchResponses["https://dead.com"] = { status: 404 };
    const result = await checkBookmark({ id: "1", title: "Dead", url: "https://dead.com" });
    expect(result).toMatchObject({
      id: "1",
      url: "https://dead.com",
      reason: "HTTP 404",
      statusCode: 404,
      errorType: "http-4xx",
    });
  });

  test("returns dead with errorType http-5xx for HTTP 500", async () => {
    fetchResponses["https://error.com"] = { status: 500 };
    const result = await checkBookmark({ id: "1", title: "Err", url: "https://error.com" });
    expect(result).toMatchObject({
      reason: "HTTP 500",
      statusCode: 500,
      errorType: "http-5xx",
    });
  });

  test("treats HTTP 429 as alive (rate-limited, not dead)", async () => {
    fetchResponses["https://ratelimited.com"] = { status: 429 };
    const result = await checkBookmark({ id: "1", title: "RL", url: "https://ratelimited.com" });
    expect(result).toBeNull();
  });

  test("retries with GET when HEAD fails, returns null if GET succeeds", async () => {
    let callCount = 0;
    fetch.mockImplementation((url, opts) => {
      callCount++;
      if (opts.method === "HEAD") return Promise.reject(new Error("HEAD blocked"));
      return Promise.resolve({ status: 200, type: "basic" });
    });

    const result = await checkBookmark({ id: "1", title: "Retry", url: "https://retry.com" });
    expect(result).toBeNull();
    expect(callCount).toBe(2);
  });

  test("returns unreachable with errorType when both HEAD and GET fail", async () => {
    fetch.mockImplementation(() => Promise.reject(new Error("Network error")));

    const result = await checkBookmark({ id: "1", title: "Down", url: "https://down.com" });
    expect(result).toMatchObject({
      reason: "Unreachable",
      statusCode: 0,
      errorType: "unreachable",
    });
  });

  test("returns null for HTTP 301 redirect (status < 400)", async () => {
    fetchResponses["https://redirect.com"] = { status: 301 };
    const result = await checkBookmark({ id: "1", title: "Redir", url: "https://redirect.com" });
    expect(result).toBeNull();
  });

  test("returns dead for HTTP 403", async () => {
    fetchResponses["https://forbidden.com"] = { status: 403 };
    const result = await checkBookmark({ id: "1", title: "Forbidden", url: "https://forbidden.com" });
    expect(result).toMatchObject({
      reason: "HTTP 403",
      statusCode: 403,
      errorType: "http-4xx",
    });
  });

  test("treats 429 on GET retry as alive", async () => {
    fetch.mockImplementation((url, opts) => {
      if (opts.method === "HEAD") return Promise.reject(new Error("HEAD blocked"));
      return Promise.resolve({ status: 429, type: "basic" });
    });
    const result = await checkBookmark({ id: "1", title: "RL2", url: "https://rl2.com" });
    expect(result).toBeNull();
  });

  test("respects abort signal", async () => {
    const signal = { aborted: true, addEventListener: jest.fn() };
    const result = await checkBookmark({ id: "1", title: "X", url: "https://x.com" }, signal);
    expect(result).toBeNull();
  });
});

describe("parallel scanning", () => {
  beforeEach(() => {
    fetchResponses = {};
    fetchErrors = {};
    fetch.mockImplementation(defaultFetchMock);
  });

  test("processes multiple bookmarks concurrently", async () => {
    const bookmarks = Array.from({ length: 20 }, (_, idx) => ({
      id: String(idx),
      title: `Bookmark ${idx}`,
      url: `https://example${idx}.com`,
    }));

    bookmarks.forEach((bm, idx) => {
      fetchResponses[bm.url] = { status: idx % 5 === 0 ? 404 : 200 };
    });

    const results = await Promise.all(bookmarks.map((bm) => checkBookmark(bm)));
    expect(results).toHaveLength(20);

    const dead = results.filter((r) => r !== null);
    expect(dead).toHaveLength(4);
    dead.forEach((d) => expect(d.reason).toBe("HTTP 404"));
  });
});
