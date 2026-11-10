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
  await injectIntoOpenTabs();
});

// Chrome doesn't add content scripts to tabs that were already open when the
// extension was installed, updated or reloaded – do it now so no page refresh is needed.
async function injectIntoOpenTabs() {
  const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  for (const tab of tabs) {
    try {
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["src/content.css"] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["src/defaults.js", "src/content.js"] });
    } catch (e) {
      console.debug("[BlurChat] could not inject into tab", tab.id, e);
    }
  }
}

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
