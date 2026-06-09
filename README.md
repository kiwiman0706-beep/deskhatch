<div align="center">

<img src="assets/logo.svg" alt="DeskHatch" width="84" />

# DeskHatch

A thin launcher bar that docks at the very **top edge** of your screen; click a
button and a **drawer slides down right beneath it** — your mail, calendar,
notes, files and tools, one slam-to-the-top away.

<em>画面最上部に常駐する万能ランチャーバー。ボタンを押すと真下にドロワーが開きます。</em>

[![Release](https://img.shields.io/github/v/release/kiwiman0706-beep/deskhatch?style=flat-square)](https://github.com/kiwiman0706-beep/deskhatch/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/kiwiman0706-beep/deskhatch/total?style=flat-square)](https://github.com/kiwiman0706-beep/deskhatch/releases)
[![License: MIT](https://img.shields.io/github/license/kiwiman0706-beep/deskhatch?style=flat-square)](LICENSE)
![Windows](https://img.shields.io/badge/Windows-0078D6?style=flat-square&logo=windows&logoColor=white)
![macOS](https://img.shields.io/badge/macOS-000000?style=flat-square&logo=apple&logoColor=white)

<img src="docs/media/hero.svg" alt="DeskHatch demo" width="720" />

</div>

---

## ✨ Why DeskHatch

- **Always within reach.** The bar lives at the screen's top edge — *slam* your
  mouse upward and you hit it without aiming (Fitts's law). Auto-hide or always-on.
- **One drawer at a time.** Click a button → a single drawer slides down beneath
  it. Pin 📌 to keep several open side by side.
- **Any web app as a drawer.** Gmail, Calendar, Keep, Tasks, Drive, Maps,
  **Gemini**, LINE WORKS, internal tools… sign in to Google **once** and they're
  all signed in.
- **Files, fast.** An Explorer-style browser (This PC → folders), pinned folder
  buttons, an **Apps** shortcut (Windows Start Menu / macOS Applications), and a
  **📎 Clip** for stashing files / URLs / text.
- **Built-in tools.** Editor, calculator, **timer**, **stopwatch**, clipboard
  history, bookmarks, quick web search.
- **Yours to shape.** Add / remove / reorder / edit buttons, drag to merge into
  tabs, themes (incl. classic-Mac rounded corners), multi-monitor.
- **Polished plumbing.** Windows AppBar space-reservation, **auto-update**
  (Windows), **English / 日本語** UI (auto-detected, switchable; drop-in language
  packs), system-tray Restart / Quit.

## ⬇️ Install

**Windows** — download `DeskHatch-Setup-x.y.z-x64.exe` (installer, auto-updates)
or the portable `.exe` from the [**latest release**](https://github.com/kiwiman0706-beep/deskhatch/releases/latest).
*(A winget package is on the way.)*

**macOS** — download the universal `.dmg` from the
[latest release](https://github.com/kiwiman0706-beep/deskhatch/releases/latest).
It's unsigned, so on first launch **right-click the app → Open**.

> Unsigned builds may show a SmartScreen / Gatekeeper prompt on first run
> (choose *More info → Run* / *Open*). The app then updates itself on Windows.

## 🖼️ Screenshots

> Drop real captures into `docs/media/` and they'll show here
> (`shot-bar.png`, `shot-drawer.png`, `shot-settings.png`).

<img src="docs/media/hero.svg" alt="Bar and drawer" width="640" />

## 🧠 How it works

A **transparent, frameless, always-on-top** strip pinned to the top edge. The
renderer toggles **click pass-through** so the desktop stays usable except over
the bar / an open drawer, and **resizes the window** to fit open drawers. Web
pages embed via `<webview>` on a shared session, so logins persist.

## 🛠️ Build from source

```bash
npm install
npm start            # run
npm test             # unit tests (pure logic)
npm run dist         # Windows installer + portable
npm run dist:mac     # macOS dmg + zip (run on a Mac)
```
Releases are cut by tagging `vX.Y.Z` (GitHub Actions builds Windows + macOS and
publishes them, plus the winget update). See `docs/PUBLISHING.md`.

### Add a drawer
Edit `src/renderer/config.js`:
```js
{ id: 'sheet', label: 'Sheet', icon: '📊', type: 'page', mobile: false, width: 900,
  url: 'https://docs.google.com/spreadsheets/d/XXXX' }
```
`type: 'page'` embeds a URL, `'folder'` pins a folder, `'files'` opens *This PC*.

### Add a language
Copy `src/renderer/locales/en.json` to e.g. `fr.json`, set `"__name__"`, translate
the values — it appears automatically in **Settings → Language**.

## 📋 Notes & limitations
- Embedded Google **Keep / Tasks** have no public API (pages only).
- The file browser is a custom cross-platform UI (not the native shell view).
- Pinned drawers can overlap; no auto-tiling yet.

## 🙏 Credits
Built with [Electron](https://www.electronjs.org/). Inspired by the **SmartCenter**
launcher bar from Lotus SuperOffice, and the classic Mac menu bar.

## 📄 License
[MIT](LICENSE) © DeskHatch
