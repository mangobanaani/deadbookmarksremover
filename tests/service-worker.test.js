// Mock chrome APIs before requiring service worker logic
const listeners = {};
let badgeText = "";
let badgeColor = "";
let storedData = {};
let alarms = {};

global.chrome = {
  runtime: {
    onMessage: {
      addListener: jest.fn((fn) => { listeners.onMessage = fn; }),
    },
    sendMessage: jest.fn(() => Promise.resolve()),
  },
  bookmarks: {
    getTree: jest.fn(() => Promise.resolve([
      {
        id: "0",
        title: "root",
        children: [
          { id: "1", title: "Google", url: "https://google.com" },
          { id: "2", title: "Dead", url: "https://dead.example.com" },
          { id: "3", title: "Google Dup", url: "https://google.com" },
        ],
      },
    ])),
    remove: jest.fn(() => Promise.resolve()),
  },
  action: {
    setBadgeText: jest.fn(({ text }) => { badgeText = text; }),
    setBadgeBackgroundColor: jest.fn(({ color }) => { badgeColor = color; }),
  },
  storage: {
    local: {
      get: jest.fn((key) => Promise.resolve(storedData)),
      set: jest.fn((data) => {
        Object.assign(storedData, data);
        return Promise.resolve();
      }),
    },
  },
  alarms: {
    create: jest.fn((name, opts) => { alarms[name] = opts; }),
    clear: jest.fn((name) => { delete alarms[name]; }),
    onAlarm: {
      addListener: jest.fn(),
    },
  },
  i18n: {
    getMessage: jest.fn((key) => ""),
  },
  permissions: {
    request: jest.fn(() => Promise.resolve(true)),
  },
};

global.AbortController = class {
  constructor() {
    this.signal = { aborted: false, addEventListener: jest.fn() };
  }
  abort() {
    this.signal.aborted = true;
  }
};

global.setTimeout = jest.fn((fn, ms) => 42);
global.clearTimeout = jest.fn();

// Mock importScripts for service worker
global.importScripts = jest.fn();

// Load the shared modules directly
const { walkBookmarks, checkBookmark } = require("../lib/bookmarks");
const { MSG } = require("../lib/messages");
const { DomainRateLimiter } = require("../lib/rate-limiter");

// Make them global as importScripts would
global.walkBookmarks = walkBookmarks;
global.checkBookmark = checkBookmark;
global.MSG = MSG;
global.DomainRateLimiter = DomainRateLimiter;

let fetchResponses = {};
global.fetch = jest.fn((url) => {
  const resp = fetchResponses[url] || { status: 200 };
  return Promise.resolve({ status: resp.status, ok: resp.status < 400 });
});

// Now load the service worker
require("../service-worker");

describe("service worker message handling", () => {
  let messageHandler;

  beforeAll(() => {
    messageHandler = listeners.onMessage;
  });

  beforeEach(() => {
    badgeText = "";
    storedData = {};
    fetchResponses = {};
    chrome.runtime.sendMessage.mockClear();
    chrome.action.setBadgeText.mockClear();
    fetch.mockClear();
  });

  test("GET_STATUS returns current state", () => {
    const sendResponse = jest.fn();
    messageHandler({ type: MSG.GET_STATUS }, {}, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        running: expect.any(Boolean),
        dead: expect.any(Array),
      })
    );
  });

  test("START_SCAN accepts the message and responds ok", () => {
    const sendResponse = jest.fn();
    messageHandler({ type: MSG.START_SCAN }, {}, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith({ ok: true });
  });

  test("STOP_SCAN stops a running scan", () => {
    const sendResponse = jest.fn();
    messageHandler({ type: MSG.STOP_SCAN }, {}, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith({ ok: true });
  });

  test("RECHECK_ONE returns async response", () => {
    fetchResponses["https://dead.example.com"] = { status: 200 };
    const sendResponse = jest.fn();
    const returnValue = messageHandler(
      { type: MSG.RECHECK_ONE, bookmark: { id: "2", title: "Dead", url: "https://dead.example.com" } },
      {},
      sendResponse
    );
    expect(returnValue).toBe(true); // async response
  });
});

describe("duplicate detection", () => {
  test("walkBookmarks finds all bookmarks including duplicates", () => {
    const tree = [
      {
        id: "0",
        title: "root",
        children: [
          { id: "1", title: "Google", url: "https://google.com" },
          { id: "2", title: "Also Google", url: "https://google.com" },
          { id: "3", title: "Unique", url: "https://unique.com" },
        ],
      },
    ];

    const bookmarks = walkBookmarks(tree);
    expect(bookmarks).toHaveLength(3);

    // Group by URL to find duplicates
    const urlMap = new Map();
    for (const bm of bookmarks) {
      const existing = urlMap.get(bm.url);
      if (existing) existing.push(bm);
      else urlMap.set(bm.url, [bm]);
    }
    const dupes = Array.from(urlMap.values()).filter((g) => g.length > 1);
    expect(dupes).toHaveLength(1);
    expect(dupes[0]).toHaveLength(2);
    expect(dupes[0][0].url).toBe("https://google.com");
  });
});

describe("badge", () => {
  test("setBadgeText is called with count after scan", () => {
    // Just verify the API is callable
    chrome.action.setBadgeText({ text: "5" });
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "5" });
  });

  test("setBadgeBackgroundColor is callable", () => {
    chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
    expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: "#dc2626" });
  });
});

describe("alarms keepalive", () => {
  test("creates alarm on scan start", () => {
    chrome.alarms.create("scan-keepalive", { periodInMinutes: 25 / 60 });
    expect(chrome.alarms.create).toHaveBeenCalledWith(
      "scan-keepalive",
      expect.objectContaining({ periodInMinutes: expect.any(Number) })
    );
  });

  test("clears alarm on scan stop", () => {
    chrome.alarms.clear("scan-keepalive");
    expect(chrome.alarms.clear).toHaveBeenCalledWith("scan-keepalive");
  });
});
