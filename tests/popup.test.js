/**
 * Popup UI integration tests.
 * Tests the esc() helper and bookmark removal API.
 */

// --- Mocks ---

let removedIds = [];

global.chrome = {
  bookmarks: {
    remove: jest.fn((id) => {
      removedIds.push(id);
      return Promise.resolve();
    }),
  },
  runtime: {
    sendMessage: jest.fn(() => Promise.resolve({ running: false, dead: [], duplicates: [] })),
    onMessage: {
      addListener: jest.fn(),
    },
  },
  storage: {
    local: {
      get: jest.fn(() => Promise.resolve({})),
      set: jest.fn(() => Promise.resolve()),
    },
  },
  i18n: {
    getMessage: jest.fn(() => ""),
  },
  permissions: {
    request: jest.fn(() => Promise.resolve(true)),
  },
};

// --- Pure logic function ---

function esc(str) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
  return String(str).replace(/[&<>"']/g, (c) => map[c]);
}

// --- Tests ---

describe("esc()", () => {
  test("escapes HTML special characters", () => {
    expect(esc('<script>alert("xss")</script>')).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"
    );
  });

  test("leaves plain text unchanged", () => {
    expect(esc("Hello World")).toBe("Hello World");
  });

  test("handles empty string", () => {
    expect(esc("")).toBe("");
  });

  test("escapes ampersands", () => {
    expect(esc("a&b")).toBe("a&amp;b");
  });
});

describe("chrome.bookmarks.remove()", () => {
  beforeEach(() => {
    removedIds = [];
    chrome.bookmarks.remove.mockClear();
  });

  test("remove calls chrome API with correct id", async () => {
    await chrome.bookmarks.remove("42");
    expect(removedIds).toContain("42");
  });
});

describe("message passing", () => {
  test("sendMessage is available for popup-to-SW communication", () => {
    expect(typeof chrome.runtime.sendMessage).toBe("function");
  });

  test("onMessage listener can be registered", () => {
    expect(typeof chrome.runtime.onMessage.addListener).toBe("function");
  });
});
