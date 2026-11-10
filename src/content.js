/* SecureWhatsapp – content script for web.whatsapp.com
 *
 * WhatsApp Web's class names are obfuscated and change often, so we find
 * things through stable anchors (#pane-side, #main, header/footer, role and
 * dir attributes) and tag them with our own "sw-*" classes. Every chat row
 * and the open conversation get data-sw-* attributes from that chat's rule,
 * and content.css blurs accordingly. If WhatsApp changes its markup, only
 * the SELECTORS block should need updating.
 */
(() => {
  "use strict";

  const SELECTORS = {
    chatList: "#pane-side",
    chatRow: '[role="listitem"], [role="row"]',
    main: "#main",
    footerInput: 'footer [contenteditable="true"]',
    messageRow: '[role="row"], [data-id], .message-in, .message-out',
    text: "span[dir], .selectable-text, .copyable-text",
    media: "img, video, canvas"
  };

  const root = document.documentElement;
  let settings = { ...SW_DEFAULTS };
  let chatRules = {};
  let currentChat = null; // { key, label } of the open conversation

  // ---------- settings ----------
  function applyGlobalFlags() {
    root.classList.toggle("sw-on", !!settings.enabled);
    root.classList.toggle("sw-hover", !!settings.revealOnHover);
    root.classList.toggle("sw-f-input", !!settings.blurInput);
    const amount = Math.max(2, Math.min(30, Number(settings.blurAmount) || 8));
    root.style.setProperty("--sw-blur", amount + "px");
    if (!settings.enabled) hideUI();
  }

  const ruleFor = (key) => chatRules[key] || settings.defaultRule || SW_DEFAULT_RULE;

  function setRuleAttrs(el, rule) {
    for (const k of SW_RULE_KEYS) el.toggleAttribute("data-sw-" + k, !!rule[k]);
  }

  // ---------- reading names ----------
  // Text of an element including emoji (WhatsApp renders emoji as <img alt>).
  function readText(el) {
    let out = "";
    el.childNodes.forEach((n) => {
      if (n.nodeType === 3) out += n.nodeValue;
      else if (n.nodeType === 1) {
        out += n.tagName === "IMG" ? n.getAttribute("data-plain-text") || n.getAttribute("alt") || "" : readText(n);
      }
    });
    return out;
  }
  const labelOf = (el) => (el.getAttribute("title") || readText(el)).trim();
  const chatFrom = (label) => (label ? { key: swChatKey(label), label } : null);

  const isEmoji = (el) =>
    el.tagName === "IMG" &&
    (el.hasAttribute("data-plain-text") || /emoji/i.test(el.className || "") || /emoji/i.test(el.getAttribute("src") || ""));

  function tag(el, cls) {
    if (el && !el.classList.contains(cls)) el.classList.add(cls);
  }

  // ---------- chat list ----------
  function rowNameEl(row) {
    return row.querySelector("span[title]") || row.querySelector('span[dir="auto"]');
  }
  function chatFromRow(row) {
    const el = rowNameEl(row);
    return el ? chatFrom(labelOf(el)) : null;
  }

  function tagChatList() {
    const list = document.querySelector(SELECTORS.chatList);
    if (!list) return;
    list.querySelectorAll(SELECTORS.chatRow).forEach((row) => {
      const nameEl = rowNameEl(row);
      if (!nameEl) return;
      tag(row, "sw-row");
      row.querySelectorAll("img").forEach((img) => {
        if (!isEmoji(img) && !img.closest(".sw-name, .sw-preview")) tag(img, "sw-avatar");
      });
      tag(nameEl, "sw-name");
      row.querySelectorAll("span[title], span[dir]").forEach((s) => {
        if (s === nameEl || nameEl.contains(s) || s.contains(nameEl)) return;
        if (!s.parentElement.closest(".sw-preview")) tag(s, "sw-preview");
      });
      const chat = chatFrom(labelOf(nameEl));
      if (chat) {
        setRuleAttrs(row, ruleFor(chat.key));
        row.toggleAttribute("data-sw-custom", !!chatRules[chat.key]);
      }
    });
  }

  // ---------- open conversation ----------
  function tagConversation() {
    const main = document.querySelector(SELECTORS.main);
    if (!main) {
      currentChat = null;
      return;
    }
    const header = main.querySelector("header");
    const footer = main.querySelector("footer");
    const inChrome = (el) => (header && header.contains(el)) || (footer && footer.contains(el));

    if (header) {
      tag(header, "sw-header");
      header.querySelectorAll("img").forEach((img) => {
        if (!isEmoji(img)) tag(img, "sw-avatar");
      });
      const spans = Array.from(header.querySelectorAll("span[dir], span[title]"));
      if (spans[0]) {
        currentChat = chatFrom(labelOf(spans[0])) || currentChat;
        // Name plus the subtitle (members list / last seen) follow the Name option.
        spans.forEach((s) => {
          if (!s.parentElement.closest(".sw-name")) tag(s, "sw-name");
        });
      }
    }

    main.querySelectorAll(SELECTORS.text).forEach((el) => {
      if (inChrome(el) || el.parentElement.closest(".sw-msg-text")) return;
      tag(el, "sw-msg-text");
      tag(el.closest(SELECTORS.messageRow) || el.parentElement, "sw-msg");
    });

    main.querySelectorAll(SELECTORS.media).forEach((m) => {
      if (inChrome(m) || isEmoji(m)) return;
      const r = m.getBoundingClientRect();
      const small = r.width > 0 && r.width <= 48 && r.height <= 48; // sender avatars in groups
      m.classList.toggle("sw-avatar", small);
      m.classList.toggle("sw-media", !small);
      tag(m.closest(SELECTORS.messageRow) || m.parentElement, "sw-msg");
    });

    const input = main.querySelector(SELECTORS.footerInput);
    if (input) {
      tag(input, "sw-input");
      tag(footer, "sw-footer");
    }

    if (currentChat) setRuleAttrs(main, ruleFor(currentChat.key));
  }

  function scan() {
    if (!settings.enabled) return;
    try {
      tagChatList();
      tagConversation();
    } catch (e) {
      console.debug("[SecureWhatsapp] scan error", e);
    }
  }

  let scheduled = false;
  function scheduleScan() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      scan();
    }, 120);
  }
  new MutationObserver(scheduleScan).observe(root, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", scan);

  // ---------- per-chat button + panel (in a shadow root so WhatsApp's CSS can't touch it) ----------
  const SHIELD =
    '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 6a3 3 0 0 1 3 3v1h.5a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 16.5v-4A1.5 1.5 0 0 1 8.5 11H9v-1a3 3 0 0 1 3-3zm0 1.6c-.77 0-1.4.63-1.4 1.4v1h2.8v-1c0-.77-.63-1.4-1.4-1.4z"/></svg>';

  const UI_CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    .btn {
      position: fixed; width: 24px; height: 24px; padding: 0; border-radius: 50%;
      border: 1.5px solid #25d366; background: #111b21; color: #25d366; cursor: pointer;
      display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,.45);
    }
    .btn:hover { transform: scale(1.1); }
    .btn.custom { background: #25d366; color: #0b141a; }
    .panel {
      position: fixed; width: 270px; padding: 12px 14px; border-radius: 12px;
      background: #233138; color: #e9edef; box-shadow: 0 10px 30px rgba(0,0,0,.55);
      font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .ph { display: flex; align-items: center; justify-content: space-between; }
    .pt { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #25d366; font-weight: 600; }
    .x { background: none; border: 0; color: #8696a0; font-size: 20px; line-height: 1; cursor: pointer; padding: 0 2px; }
    .pn { font-size: 15px; font-weight: 600; margin: 4px 0 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pm { color: #8696a0; font-size: 12px; margin-bottom: 6px; }
    label { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 0; cursor: pointer; }
    input { width: 16px; height: 16px; accent-color: #25d366; cursor: pointer; }
    .pf { display: flex; justify-content: space-between; gap: 8px; margin-top: 8px; }
    .pf button { padding: 6px 12px; border-radius: 6px; border: 1px solid #3b4a54; background: transparent; color: #e9edef; cursor: pointer; font: inherit; }
    .pf .done { background: #25d366; border-color: #25d366; color: #0b141a; font-weight: 600; margin-left: auto; }
  `;

  let host = null, shadow, btn, panel;
  let hoverChat = null, hideTimer = null, panelChat = null;

  function ensureUI() {
    if (host) return;
    host = document.createElement("div");
    host.id = "sw-ui";
    host.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483646;";
    shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>${UI_CSS}</style>
      <button class="btn" hidden title="SecureWhatsapp: blur settings for this chat" aria-label="Blur settings for this chat">${SHIELD}</button>
      <div class="panel" hidden role="dialog" aria-label="Blur settings for this chat"></div>`;
    btn = shadow.querySelector(".btn");
    panel = shadow.querySelector(".panel");
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (hoverChat) openPanel(hoverChat, btn.getBoundingClientRect());
    });
    // Keep our clicks and keys away from WhatsApp's own handlers.
    for (const t of ["keydown", "keyup", "keypress", "mousedown", "mouseup", "click", "pointerdown", "pointerup", "contextmenu"]) {
      host.addEventListener(t, (e) => {
        if (t === "keydown" && e.key === "Escape") closePanel();
        e.stopPropagation();
      });
    }
    (document.body || root).appendChild(host);
  }

  function hideUI() {
    if (!host) return;
    closePanel();
    btn.hidden = true;
  }

  function showButton(anchor, chat) {
    ensureUI();
    clearTimeout(hideTimer);
    hoverChat = chat;
    const img = anchor.querySelector("img.sw-avatar");
    const ir = img && img.getBoundingClientRect();
    const ar = anchor.getBoundingClientRect();
    const left = ir && ir.width ? ir.left - 6 : ar.left + 8;
    const top = ir && ir.width ? ir.top - 6 : ar.top + Math.max(4, (ar.height - 48) / 2);
    btn.style.left = Math.max(2, left) + "px";
    btn.style.top = Math.max(2, top) + "px";
    btn.classList.toggle("custom", !!chatRules[chat.key]);
    btn.title = (chatRules[chat.key] ? "Custom blur" : "Default blur") + " for “" + chat.label + "” – click to change";
    btn.hidden = false;
  }

  function scheduleHide() {
    if (!host || btn.hidden) return;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (panel.hidden) btn.hidden = true;
    }, 250);
  }

  function anchorAndChat(target) {
    if (!(target instanceof Element)) return null;
    const row = target.closest("#pane-side .sw-row");
    if (row) {
      const chat = chatFromRow(row);
      return chat ? { anchor: row, chat } : null;
    }
    const header = target.closest("#main header");
    if (header && currentChat) return { anchor: header, chat: currentChat };
    return null;
  }

  document.addEventListener(
    "mouseover",
    (e) => {
      if (!settings.enabled || locked) return;
      if (host && e.composedPath().includes(host)) {
        clearTimeout(hideTimer);
        return;
      }
      const hit = anchorAndChat(e.target);
      if (hit) showButton(hit.anchor, hit.chat);
      else scheduleHide();
    },
    true
  );

  document.addEventListener("scroll", () => host && panel.hidden && (btn.hidden = true), true);

  // Alt/Option + click on a chat (or the chat header) opens the panel directly.
  function altClick(e) {
    if (!e.altKey || !settings.enabled || (host && e.composedPath().includes(host))) return;
    const hit = anchorAndChat(e.target);
    if (!hit) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "click") {
      ensureUI();
      openPanel(hit.chat, { left: e.clientX, right: e.clientX, top: e.clientY });
    }
  }
  document.addEventListener("mousedown", altClick, true);
  document.addEventListener("click", altClick, true);

  // Click outside the panel closes it.
  document.addEventListener(
    "mousedown",
    (e) => {
      if (panelChat && !e.composedPath().includes(host)) closePanel();
    },
    true
  );

  function openPanel(chat, rect) {
    panelChat = chat;
    renderPanel();
    panel.hidden = false;
    btn.hidden = false;
    const w = 270, h = panel.offsetHeight || 300;
    let left = rect.right + 10;
    if (left + w > innerWidth - 8) left = Math.max(8, rect.left - w - 10);
    const top = Math.max(8, Math.min(rect.top, innerHeight - h - 8));
    panel.style.left = left + "px";
    panel.style.top = top + "px";
    panel.querySelector("input")?.focus();
  }

  function closePanel() {
    if (!host) return;
    panelChat = null;
    panel.hidden = true;
    btn.hidden = true;
  }

  function renderPanel() {
    if (!panelChat || !panel) return;
    const custom = !!chatRules[panelChat.key];
    const rule = ruleFor(panelChat.key);
    panel.innerHTML = `
      <div class="ph"><span class="pt">Blur for this chat</span><button class="x" aria-label="Close">×</button></div>
      <div class="pn"></div>
      <div class="pm"></div>
      <div class="rows"></div>
      <div class="pf"><button class="reset">Use default</button><button class="done">Done</button></div>`;
    panel.querySelector(".pn").textContent = panelChat.label;
    panel.querySelector(".pm").textContent = custom ? "Custom settings for this chat" : "Using your default settings";
    const rows = panel.querySelector(".rows");
    for (const k of SW_RULE_KEYS) {
      const label = document.createElement("label");
      const text = document.createElement("span");
      text.textContent = SW_RULE_LABELS[k];
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !!rule[k];
      input.addEventListener("change", () => {
        const chat = panelChat;
        saveChatRule(chat, { ...ruleFor(chat.key), [k]: input.checked });
      });
      label.append(text, input);
      rows.append(label);
    }
    const reset = panel.querySelector(".reset");
    reset.hidden = !custom;
    reset.addEventListener("click", () => saveChatRule(panelChat, null));
    panel.querySelector(".done").addEventListener("click", closePanel);
    panel.querySelector(".x").addEventListener("click", closePanel);
    btn.classList.toggle("custom", custom);
  }

  async function saveChatRule(chat, rule) {
    const next = { ...chatRules };
    if (rule) {
      const clean = {};
      for (const k of SW_RULE_KEYS) clean[k] = !!rule[k];
      next[chat.key] = { ...clean, label: chat.label };
    } else {
      delete next[chat.key];
    }
    chatRules = next;
    scan();
    renderPanel();
    await chrome.storage.local.set({ chatRules: next });
  }

  // ---------- privacy screen ----------
  let locked = false;
  let lockEl = null;
  let popupOpenedAt = 0;

  async function sha256(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("securewhatsapp:" + text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function buildLock() {
    const el = document.createElement("div");
    el.id = "sw-lock";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "WhatsApp is hidden");
    const hasPin = !!settings.pinHash;
    el.innerHTML = `
      <div class="sw-lock-card">
        <div class="sw-lock-icon">${SHIELD.replace(/width="14" height="14"/, 'width="56" height="56"')}</div>
        <h1>WhatsApp is hidden</h1>
        ${hasPin
          ? `<form class="sw-lock-form">
               <input type="password" inputmode="numeric" autocomplete="off" placeholder="Enter PIN" aria-label="PIN" />
               <button type="submit">Unlock</button>
             </form>
             <p class="sw-lock-error" aria-live="polite"></p>`
          : `<p>Click anywhere or press <kbd>Enter</kbd> to show it again.</p>`}
        ${hasPin ? "" : '<p class="sw-lock-hint">Shortcut: <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd></p>'}
      </div>`;
    if (hasPin) {
      const form = el.querySelector("form");
      const input = el.querySelector("input");
      const err = el.querySelector(".sw-lock-error");
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if ((await sha256(input.value)) === settings.pinHash) unlock();
        else {
          err.textContent = "Wrong PIN";
          input.value = "";
          input.focus();
        }
      });
      setTimeout(() => input.focus(), 30);
    } else {
      el.addEventListener("click", unlock);
    }
    el.addEventListener("keydown", (e) => e.stopPropagation(), true);
    return el;
  }

  function onLockedKey(e) {
    if (locked && !settings.pinHash && ["Enter", "Escape", " "].includes(e.key)) {
      e.preventDefault();
      unlock();
    }
  }

  function lock() {
    if (locked) return;
    locked = true;
    hideUI();
    root.classList.add("sw-locked");
    lockEl = buildLock();
    (document.body || root).appendChild(lockEl);
    window.addEventListener("keydown", onLockedKey, true);
    chrome.storage.local.set({ locked: true }); // survives page refresh
  }

  function unlock() {
    if (!locked) return;
    unlockLocal();
    chrome.storage.local.set({ locked: false });
  }

  function unlockLocal() {
    if (!locked) return;
    locked = false;
    root.classList.remove("sw-locked");
    lockEl?.remove();
    lockEl = null;
    window.removeEventListener("keydown", onLockedKey, true);
  }

  // Switching away locks – but not when you just opened the extension popup.
  window.addEventListener("blur", () => {
    if (!settings.lockOnFocusLoss) return;
    setTimeout(() => {
      if (Date.now() - popupOpenedAt > 1500 && !document.hasFocus()) lock();
    }, 400);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && settings.lockOnFocusLoss) lock();
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg?.type) {
      case "SW_TOGGLE_LOCK":
        if (!locked) lock();
        else if (!settings.pinHash) unlock();
        else lockEl?.querySelector("input")?.focus(); // PIN set: only the correct PIN unlocks
        break;
      case "SW_LOCK": lock(); break;
      case "SW_POPUP_OPEN": popupOpenedAt = Date.now(); break;
    }
    sendResponse({ ok: true, locked, currentChat });
  });

  // ---------- start ----------
  chrome.storage.sync.get(null, (stored) => {
    settings = { ...SW_DEFAULTS, ...stored, defaultRule: { ...SW_DEFAULT_RULE, ...(stored.defaultRule || {}) } };
    applyGlobalFlags();
    scan();
    chrome.storage.local.get(["chatRules", "locked"], ({ chatRules: r, locked: wasLocked }) => {
      chatRules = r || {};
      if (wasLocked) lock();
      scan();
    });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync") {
      for (const [k, v] of Object.entries(changes)) settings[k] = v.newValue;
      settings.defaultRule = { ...SW_DEFAULT_RULE, ...(settings.defaultRule || {}) };
      applyGlobalFlags();
    }
    if (area === "local" && changes.chatRules) chatRules = changes.chatRules.newValue || {};
    if (area === "local" && changes.locked) {
      if (changes.locked.newValue && !locked) lock();
      if (!changes.locked.newValue && locked) unlockLocal();
    }
    scan();
    if (panelChat) renderPanel();
  });
})();
