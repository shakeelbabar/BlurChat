# SecureWhatsapp

A Chrome extension that keeps WhatsApp Web private when people can see your screen.

## Features
- **Per-chat blur rules** – for each chat choose what to blur:
  profile picture (DP), name/title, last message line, messages in the chat, photos & videos in the chat
- **Default rule** for every other chat – out of the box only the *last message line* is blurred
- **Set a chat's rule right in WhatsApp** – hover a chat (or the open chat's header) and click the green
  shield that appears on its picture, or <kbd>Option</kbd>/<kbd>Alt</kbd>+click the chat. A filled shield means the chat has a custom rule.
- **Popup** – edit the open chat, the default rule, and every chat you've customised (remove one to send it back to the default)
- **Reveal on hover**, optional blur of the text you type, adjustable strength
- **Privacy screen** with optional PIN, and auto-hide when you switch away
- Runs only on `web.whatsapp.com`, no network requests, no data leaves your browser

Chats are matched by their display name, so renaming a contact means setting its rule again.

## Keyboard shortcuts
| Shortcut | Action |
|---|---|
| `Alt+Shift+X` (`Option+Shift+X` on Mac) | Turn blurring on/off |
| `Alt+Shift+L` (`Option+Shift+L` on Mac) | Show/hide the privacy screen |

Change them at `chrome://extensions/shortcuts`.

## Install (developer mode)
1. Open `chrome://extensions` (also works in Edge, Brave, Arc: `edge://extensions`, etc.)
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and pick this `SecureWhatsapp` folder
4. Reload any open WhatsApp Web tab
5. Pin the extension and click its icon for settings

## Files
```
manifest.json        extension config (Manifest V3)
src/defaults.js      default settings and the list of blur options
src/content.js       finds chats/messages, applies per-chat rules, shield button & panel
src/content.css      blur + privacy-screen styles
src/background.js    keyboard shortcuts
popup/               settings popup
icons/               extension icons
```

## If something stops being blurred
WhatsApp changes its page structure from time to time. All the page lookups are in the
`SELECTORS` block at the top of `src/content.js` — update them there, then press the reload
button on the extension in `chrome://extensions` and reload WhatsApp Web.

## Notes
- The PIN is a casual deterrent against someone at your desk, not strong security: anyone
  with access to your unlocked computer could disable the extension.
- Desktop notifications are shown by Chrome, not the page. To hide message text in them,
  turn off previews in WhatsApp → Settings → Notifications.

## Forgot your PIN?
The privacy screen stays up through page refreshes, and the PIN can't be changed without the current one.
To recover:
1. Open `chrome://extensions` and click **Remove** on SecureWhatsapp (this erases its settings, including the PIN and your per-chat rules).
2. Click **Load unpacked** and pick this folder again.
3. Refresh WhatsApp Web, then set your per-chat rules and a new PIN.
