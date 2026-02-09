const { walkBookmarks } = require("../lib/bookmarks");

function findDuplicates(bookmarks) {
  const urlMap = new Map();
  for (const bm of bookmarks) {
    const existing = urlMap.get(bm.url);
    if (existing) {
      existing.push(bm);
    } else {
      urlMap.set(bm.url, [bm]);
    }
  }
  return Array.from(urlMap.values()).filter((group) => group.length > 1);
}

describe("duplicate detection", () => {
  test("finds duplicate URLs across folders", () => {
    const tree = [
      {
        id: "0",
        title: "root",
        children: [
          {
            id: "1",
            title: "Bar",
            children: [
              { id: "2", title: "Google", url: "https://google.com" },
              { id: "3", title: "GitHub", url: "https://github.com" },
            ],
          },
          {
            id: "4",
            title: "Other",
            children: [
              { id: "5", title: "Google Copy", url: "https://google.com" },
            ],
          },
        ],
      },
    ];

    const bookmarks = walkBookmarks(tree);
    const dupes = findDuplicates(bookmarks);

    expect(dupes).toHaveLength(1);
    expect(dupes[0]).toHaveLength(2);
    expect(dupes[0][0].url).toBe("https://google.com");
    expect(dupes[0][1].url).toBe("https://google.com");
  });

  test("returns empty when no duplicates", () => {
    const tree = [
      {
        id: "0",
        title: "root",
        children: [
          { id: "1", title: "Google", url: "https://google.com" },
          { id: "2", title: "GitHub", url: "https://github.com" },
          { id: "3", title: "MDN", url: "https://developer.mozilla.org" },
        ],
      },
    ];

    const bookmarks = walkBookmarks(tree);
    const dupes = findDuplicates(bookmarks);
    expect(dupes).toHaveLength(0);
  });

  test("finds multiple duplicate groups", () => {
    const tree = [
      {
        id: "0",
        title: "root",
        children: [
          { id: "1", title: "A", url: "https://a.com" },
          { id: "2", title: "B", url: "https://b.com" },
          { id: "3", title: "A2", url: "https://a.com" },
          { id: "4", title: "B2", url: "https://b.com" },
          { id: "5", title: "C", url: "https://c.com" },
        ],
      },
    ];

    const bookmarks = walkBookmarks(tree);
    const dupes = findDuplicates(bookmarks);
    expect(dupes).toHaveLength(2);
  });

  test("handles triple duplicates", () => {
    const tree = [
      {
        id: "0",
        title: "root",
        children: [
          { id: "1", title: "G1", url: "https://google.com" },
          { id: "2", title: "G2", url: "https://google.com" },
          { id: "3", title: "G3", url: "https://google.com" },
        ],
      },
    ];

    const bookmarks = walkBookmarks(tree);
    const dupes = findDuplicates(bookmarks);
    expect(dupes).toHaveLength(1);
    expect(dupes[0]).toHaveLength(3);
  });

  test("preserves folderPath in duplicates", () => {
    const tree = [
      {
        id: "0",
        title: "root",
        children: [
          {
            id: "1",
            title: "Work",
            children: [
              { id: "2", title: "Docs", url: "https://docs.google.com" },
            ],
          },
          {
            id: "3",
            title: "Personal",
            children: [
              { id: "4", title: "Docs", url: "https://docs.google.com" },
            ],
          },
        ],
      },
    ];

    const bookmarks = walkBookmarks(tree);
    const dupes = findDuplicates(bookmarks);
    expect(dupes).toHaveLength(1);
    expect(dupes[0][0].folderPath).toBe("root/Work");
    expect(dupes[0][1].folderPath).toBe("root/Personal");
  });
});
