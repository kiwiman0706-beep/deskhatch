# DeskHatch Browser (Level 1)

A standalone "browser" that **does not embed a webview**. Instead it drives the
user's **real Edge/Chrome** (in a dedicated profile) as borderless app-mode
windows, and manages them as tabs from a slim top bar.

## Why this works where the embedded DeskHatch drawer doesn't

Google blocks sign-in inside **embedded webviews** (Electron `<webview>`,
WebView2, CEF…) because the host app could script the page and steal passwords.
It does **not** block genuine standalone browsers (Chrome, Edge, Vivaldi,
Brave…).

DeskHatch Browser stays on the allowed side of that line:

- The web pages run in a **real Edge/Chrome process** → Google treats them as a
  normal browser → **sign-in works**, extensions/PWA all real.
- Electron here renders **only our own chrome** (the top bar / tabs / omnibox).
  It never hosts a Google page, so there is no embedded-webview to detect.

This is the same idea as DeskHatch's "app-mode + nyoki" feature, promoted into a
full product: **dedicated profile + tab model + omnibox**.

## Architecture

```
┌─────────────────────────────────────────────┐
│  Shell (Electron)  — our chrome only          │
│  src/renderer  : top bar, omnibox, tab strip  │
│  src/preload   : IPC bridge (window.browser)  │
│  src/main                                     │
│    main.js   : tab model + IPC + shell window │
│    engine.js : find Edge/Chrome, launch       │
│                `--app=URL --user-data-dir=…`  │
│    winmgr.js : list/move/raise/close real     │
│                windows via Win32 (koffi)      │
└─────────────────────────────────────────────┘
        │ spawn                       ▲ move/front/close (by hwnd)
        ▼                             │
┌─────────────────────────────────────────────┐
│  Real Edge/Chrome app-mode windows           │
│  (dedicated DeskHatch profile)  ← Google OK   │
└─────────────────────────────────────────────┘
```

### Tab lifecycle
1. **Open** (quick link / omnibox): `engine.launch()` spawns an `--app=` window
   in our profile at the docked rect. The page belongs to the browser process,
   not our spawn child, so `main.js` polls the top-level window list and adopts
   the newly-appeared window (`hwnd`) as the tab.
2. **Activate**: restore + bring the tab's window to the front.
3. **Close**: `winmgr.close()` posts `WM_CLOSE` to the window.
4. Titles are refreshed every 1.5 s from the live window list; if the user
   closes a window directly, its tab disappears.

## Run (Windows)

```bash
cd browser
npm install          # electron + (optional) koffi for window control
npm start
```

- **koffi** is optional but required for the tab/window management (move, raise,
  close, title sync). Without it the bar still opens windows, but can't dock or
  track them. Install fails are ignored (optionalDependencies).
- First run creates the dedicated profile under Electron's `userData/engine-profile`.
  Sign in to Google **once** there; the session persists afterwards.

## Status / not yet done (next steps)
- Back/forward/reload, and reading the live URL of a tab (needs CDP, below).
- **Tighter control** would come from launching the engine with
  `--remote-debugging-port` and talking CDP (navigate, read URL/title/favicon,
  capture thumbnails) instead of polling window titles.
- Per-tab docking memory, drag-to-reorder, persistence across restarts.
- macOS/Linux engine paths (currently window control is Windows-only).
- Packaging/auto-update (mirror DeskHatch's electron-builder setup).

## Relationship to DeskHatch
Forked from the DeskHatch repo; `winmgr.js`/`engine.js` are adapted from
`src/main/winmgr.js` and `src/main/system.js`. Can be split into its own
repository later.
