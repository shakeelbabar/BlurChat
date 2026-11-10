// Shared settings & helpers (used by content script, popup and background).

// What can be blurred for each chat.
var SW_RULE_KEYS = ["avatar", "name", "preview", "messages", "media"];
var SW_RULE_LABELS = {
  avatar: "Profile picture (DP)",
  name: "Name / title",
  preview: "Last message line",
  messages: "Messages in the chat",
  media: "Photos & videos in the chat"
};
var SW_RULE_SHORT = { avatar: "DP", name: "Name", preview: "Last msg", messages: "Messages", media: "Media" };

// Applied to every chat that has no custom rule: only the last-message line.
var SW_DEFAULT_RULE = { avatar: false, name: false, preview: true, messages: false, media: false };

// chrome.storage.sync
var SW_DEFAULTS = {
  enabled: true,           // master switch
  defaultRule: { ...SW_DEFAULT_RULE },
  blurInput: false,        // the text box you type in
  revealOnHover: true,     // un-blur while the mouse is over an item
  lockOnFocusLoss: false,  // privacy screen when you switch away
  blurAmount: 8,           // px
  pinHash: ""              // optional PIN (SHA-256) for the privacy screen
};
// chrome.storage.local: { chatRules: { [chatKey]: { avatar, name, preview, messages, media, label } } }

// Stable key for a chat name (ignores emoji, spacing, direction marks, case).
function swChatKey(name) {
  const raw = (name || "").normalize("NFKC").trim();
  const key = raw.toLowerCase().replace(/[^\p{L}\p{N}+]/gu, "");
  return key || raw;
}
