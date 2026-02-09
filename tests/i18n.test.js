const fs = require("fs");
const path = require("path");

const messagesPath = path.join(__dirname, "..", "_locales", "en", "messages.json");
const popupHtmlPath = path.join(__dirname, "..", "popup.html");
const popupJsPath = path.join(__dirname, "..", "popup.js");
const manifestPath = path.join(__dirname, "..", "manifest.json");

describe("i18n messages", () => {
  let messages;
  let popupHtml;
  let popupJs;
  let manifest;

  beforeAll(() => {
    messages = JSON.parse(fs.readFileSync(messagesPath, "utf-8"));
    popupHtml = fs.readFileSync(popupHtmlPath, "utf-8");
    popupJs = fs.readFileSync(popupJsPath, "utf-8");
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  });

  test("messages.json is valid JSON with required structure", () => {
    expect(typeof messages).toBe("object");
    for (const [key, value] of Object.entries(messages)) {
      expect(value).toHaveProperty("message");
      expect(typeof value.message).toBe("string");
      expect(value).toHaveProperty("description");
    }
  });

  test("all data-i18n keys in popup.html exist in messages.json", () => {
    const regex = /data-i18n="([^"]+)"/g;
    let match;
    const keys = [];
    while ((match = regex.exec(popupHtml)) !== null) {
      keys.push(match[1]);
    }

    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(messages).toHaveProperty(key, expect.objectContaining({ message: expect.any(String) }));
    }
  });

  test("all i18n() calls in popup.js reference keys that exist in messages.json", () => {
    const regex = /i18n\("([^"]+)"/g;
    let match;
    const keys = new Set();
    while ((match = regex.exec(popupJs)) !== null) {
      keys.add(match[1]);
    }

    expect(keys.size).toBeGreaterThan(0);
    for (const key of keys) {
      expect(messages).toHaveProperty(key, expect.objectContaining({ message: expect.any(String) }));
    }
  });

  test("manifest.json uses __MSG_ references that exist", () => {
    const msgRefRegex = /__MSG_(\w+)__/g;
    const manifestStr = JSON.stringify(manifest);
    let match;
    const keys = [];
    while ((match = msgRefRegex.exec(manifestStr)) !== null) {
      keys.push(match[1]);
    }

    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(messages).toHaveProperty(key, expect.objectContaining({ message: expect.any(String) }));
    }
  });

  test("manifest.json has default_locale set", () => {
    expect(manifest.default_locale).toBe("en");
  });

  test("no empty message strings", () => {
    for (const [key, value] of Object.entries(messages)) {
      expect(value.message.length).toBeGreaterThan(0);
    }
  });

  test("expected core keys exist", () => {
    const coreKeys = [
      "extName", "extDescription", "appTitle", "scanBtn", "stopBtn",
      "scanComplete", "scanStopped", "selectAll", "removeSelected",
      "recheck", "exportJson", "exportCsv", "duplicatesTitle",
    ];
    for (const key of coreKeys) {
      expect(messages).toHaveProperty(key);
    }
  });
});
