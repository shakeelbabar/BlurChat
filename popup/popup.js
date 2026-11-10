const $ = (id) => document.getElementById(id);
const OTHER_TOGGLES = ["enabled", "blurInput", "revealOnHover", "lockOnFocusLoss"];

let s = { ...SW_DEFAULTS };
let chatRules = {};
let current = null; // { key, label }
const expanded = new Set();

async function sha256(text) {
  // Must match src/content.js
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("securewhatsapp:" + text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Changing or removing an existing PIN requires the current one.
async function currentPinOk() {
  if (!s.pinHash) return true;
  if ((await sha256($("currentPin").value.trim())) === s.pinHash) return true;
  $("pinNote").textContent = "Current PIN is wrong.";
  $("currentPin").value = "";
  $("currentPin").focus();
  return false;
}

const summary = (rule) => {
  const on = SW_RULE_KEYS.filter((k) => rule[k]).map((k) => SW_RULE_SHORT[k]);
  return on.length ? "Blur: " + on.join(", ") : "Nothing blurred";
};

// Builds switch rows for a rule. onChange(key, checked)
function ruleRows(container, rule, onChange) {
  container.textContent = "";
  for (const k of SW_RULE_KEYS) {
    const label = document.createElement("label");
    label.className = "row";
    const text = document.createElement("span");
    text.textContent = SW_RULE_LABELS[k];
    const sw = document.createElement("span");
    sw.className = "switch";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = !!rule[k];
    input.addEventListener("change", () => onChange(k, input.checked));
    sw.append(input, document.createElement("span"));
    label.append(text, sw);
    container.append(label);
  }
}

async function saveRules() {
  await chrome.storage.local.set({ chatRules });
}

function setChatRule(key, label, rule) {
  if (rule) {
    const clean = {};
    SW_RULE_KEYS.forEach((k) => (clean[k] = !!rule[k]));
    chatRules[key] = { ...clean, label };
  } else delete chatRules[key];
  saveRules();
  render();
}

function render() {
  OTHER_TOGGLES.forEach((k) => ($(k).checked = !!s[k]));
  $("blurAmount").value = s.blurAmount;
  $("blurAmountValue").textContent = s.blurAmount + "px";
  $("options").classList.toggle("off", !s.enabled);

  // This chat
  if (current) {
    $("currentSection").hidden = false;
    $("currentName").textContent = current.label;
    const custom = chatRules[current.key];
    $("currentBadge").textContent = custom ? "Custom" : "Default";
    $("currentBadge").classList.toggle("custom", !!custom);
    $("currentReset").hidden = !custom;
    ruleRows($("currentRows"), custom || s.defaultRule, (k, v) =>
      setChatRule(current.key, current.label, { ...(chatRules[current.key] || s.defaultRule), [k]: v })
    );
  }

  // Default
  ruleRows($("defaultRows"), s.defaultRule, (k, v) => {
    s.defaultRule = { ...s.defaultRule, [k]: v };
    chrome.storage.sync.set({ defaultRule: s.defaultRule });
    render();
  });

  // Custom list
  const list = $("customList");
  list.textContent = "";
  const entries = Object.entries(chatRules).sort((a, b) => (a[1].label || "").localeCompare(b[1].label || ""));
  $("customCount").textContent = entries.length ? `(${entries.length})` : "";
  $("customEmpty").hidden = entries.length > 0;
  for (const [key, rule] of entries) {
    const li = document.createElement("li");
    li.classList.toggle("open", expanded.has(key));
    const head = document.createElement("div");
    head.className = "item-head";
    const chev = document.createElement("span");
    chev.className = "chev";
    chev.textContent = "›";
    const text = document.createElement("div");
    text.className = "item-text";
    const name = document.createElement("div");
    name.className = "item-name";
    name.textContent = rule.label || key;
    const sum = document.createElement("div");
    sum.className = "item-sum";
    sum.textContent = summary(rule);
    text.append(name, sum);
    const del = document.createElement("button");
    del.title = "Remove – use default";
    del.setAttribute("aria-label", "Remove custom blur for " + (rule.label || key));
    del.textContent = "×";
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      expanded.delete(key);
      setChatRule(key, rule.label, null);
    });
    head.append(chev, text, del);
    head.addEventListener("click", () => {
      expanded.has(key) ? expanded.delete(key) : expanded.add(key);
      render();
    });
    li.append(head);
    if (expanded.has(key)) {
      const body = document.createElement("div");
      body.className = "item-body";
      ruleRows(body, rule, (k, v) => setChatRule(key, rule.label, { ...rule, [k]: v }));
      li.append(body);
    }
    list.append(li);
  }

  // PIN
  const hasPin = !!s.pinHash;
  $("clearPin").hidden = !hasPin;
  $("currentPinRow").hidden = !hasPin;
  $("pinNote").textContent = hasPin ? "PIN set — needed to unlock the privacy screen." : "No PIN — click to unlock.";
  $("pin").placeholder = hasPin ? "Change PIN" : "Set a PIN (optional)";
}

async function loadAll() {
  const stored = await chrome.storage.sync.get(null);
  s = { ...SW_DEFAULTS, ...stored, defaultRule: { ...SW_DEFAULT_RULE, ...(stored.defaultRule || {}) } };
  chatRules = (await chrome.storage.local.get("chatRules")).chatRules || {};
}

async function findWhatsAppTab() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active?.url?.startsWith("https://web.whatsapp.com")) return active;
  const [any] = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  return any || null;
}

(async () => {
  await loadAll();

  const tab = await findWhatsAppTab();
  if (!tab) {
    $("status").textContent = "Open web.whatsapp.com to use";
    $("status").classList.add("warn");
  } else {
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { type: "SW_POPUP_OPEN" });
      current = res?.currentChat || null;
    } catch {
      $("status").textContent = "Reload the WhatsApp tab to activate";
      $("status").classList.add("warn");
    }
  }
  render();

  chrome.storage.onChanged.addListener(async () => {
    await loadAll();
    render();
  });

  OTHER_TOGGLES.forEach((k) =>
    $(k).addEventListener("change", (e) => {
      s[k] = e.target.checked;
      chrome.storage.sync.set({ [k]: s[k] });
      render();
    })
  );

  $("currentReset").addEventListener("click", () => current && setChatRule(current.key, current.label, null));

  $("blurAmount").addEventListener("input", (e) => {
    s.blurAmount = Number(e.target.value);
    $("blurAmountValue").textContent = s.blurAmount + "px";
    chrome.storage.sync.set({ blurAmount: s.blurAmount });
  });

  $("savePin").addEventListener("click", async () => {
    const pin = $("pin").value.trim();
    if (pin.length < 4) {
      $("pinNote").textContent = "PIN must be at least 4 characters.";
      return;
    }
    if (!(await currentPinOk())) return;
    s.pinHash = await sha256(pin);
    await chrome.storage.sync.set({ pinHash: s.pinHash });
    $("pin").value = "";
    $("currentPin").value = "";
    render();
    $("pinNote").textContent = "PIN saved.";
  });

  $("clearPin").addEventListener("click", async () => {
    if (!(await currentPinOk())) return;
    $("currentPin").value = "";
    s.pinHash = "";
    await chrome.storage.sync.set({ pinHash: "" });
    render();
  });

  $("lockNow").addEventListener("click", async () => {
    const t = await findWhatsAppTab();
    if (!t) return chrome.tabs.create({ url: "https://web.whatsapp.com/" });
    try {
      await chrome.tabs.sendMessage(t.id, { type: "SW_LOCK" });
      window.close();
    } catch {
      $("status").textContent = "Reload the WhatsApp tab first";
      $("status").classList.add("warn");
    }
  });

  $("shortcuts").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  });
})();
