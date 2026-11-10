importScripts("defaults.js");

const OLD_KEYS = ["blurMessages", "blurMedia", "blurPreviews", "blurNames", "blurAvatars"];

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.sync.get(null);
  await chrome.storage.sync.remove(OLD_KEYS);
  await chrome.storage.sync.set({
    ...SW_DEFAULTS,
    ...current,
    defaultRule: { ...SW_DEFAULT_RULE, ...(current.defaultRule || {}) }
  });
  const { chatRules } = await chrome.storage.local.get("chatRules");
  if (!chatRules) await chrome.storage.local.set({ chatRules: {} });
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-privacy") {
    const { enabled = true } = await chrome.storage.sync.get("enabled");
    await chrome.storage.sync.set({ enabled: !enabled });
    return;
  }
  if (command === "toggle-lock") {
    const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
    for (const tab of tabs) chrome.tabs.sendMessage(tab.id, { type: "SW_TOGGLE_LOCK" }).catch(() => {});
  }
});
