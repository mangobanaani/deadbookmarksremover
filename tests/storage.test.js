let storedData = {};

global.chrome = {
  storage: {
    local: {
      get: jest.fn((key) => {
        if (typeof key === "string") {
          return Promise.resolve({ [key]: storedData[key] });
        }
        return Promise.resolve(storedData);
      }),
      set: jest.fn((data) => {
        Object.assign(storedData, data);
        return Promise.resolve();
      }),
    },
  },
};

const { saveLastScan, getLastScan, getScanHistory, MAX_HISTORY } = require("../lib/storage");

describe("storage", () => {
  beforeEach(() => {
    storedData = {};
    chrome.storage.local.get.mockClear();
    chrome.storage.local.set.mockClear();
  });

  test("saveLastScan stores summary and dead list", async () => {
    const summary = { total: 100, checked: 100, deadCount: 5, duplicateGroups: 1 };
    const dead = [{ id: "1", url: "https://dead.com", reason: "HTTP 404" }];
    const duplicates = [[{ id: "2", url: "https://dup.com" }, { id: "3", url: "https://dup.com" }]];

    await saveLastScan(summary, dead, duplicates);

    expect(chrome.storage.local.set).toHaveBeenCalled();
    const setArg = chrome.storage.local.set.mock.calls[0][0];
    expect(setArg.lastScan).toMatchObject({
      total: 100,
      deadCount: 5,
      dead,
      duplicates,
    });
    expect(setArg.lastScan.date).toBeDefined();
    expect(setArg.scanHistory).toHaveLength(1);
  });

  test("getLastScan returns stored scan", async () => {
    storedData.lastScan = { date: "2024-01-01", total: 50, deadCount: 3 };

    const result = await getLastScan();
    expect(result).toMatchObject({ total: 50, deadCount: 3 });
  });

  test("getLastScan returns null when no scan stored", async () => {
    const result = await getLastScan();
    expect(result).toBeNull();
  });

  test("getScanHistory returns history array", async () => {
    storedData.scanHistory = [
      { date: "2024-01-02", total: 100 },
      { date: "2024-01-01", total: 50 },
    ];

    const result = await getScanHistory();
    expect(result).toHaveLength(2);
    expect(result[0].date).toBe("2024-01-02");
  });

  test("getScanHistory returns empty array when no history", async () => {
    const result = await getScanHistory();
    expect(result).toEqual([]);
  });

  test("history is capped at MAX_HISTORY entries", async () => {
    storedData.scanHistory = Array.from({ length: MAX_HISTORY }, (_, i) => ({
      date: `2024-01-${String(i + 1).padStart(2, "0")}`,
      total: i * 10,
    }));

    await saveLastScan({ total: 999, checked: 999, deadCount: 0, duplicateGroups: 0 }, [], []);

    const setArg = chrome.storage.local.set.mock.calls[0][0];
    expect(setArg.scanHistory).toHaveLength(MAX_HISTORY);
    expect(setArg.scanHistory[0].total).toBe(999); // newest first
  });

  test("MAX_HISTORY is 20", () => {
    expect(MAX_HISTORY).toBe(20);
  });
});
