# SmartSuite.next

A modern take on the classic **Lotus SmartCenter** bar: a thin strip docks at the
**top edge** of the screen, and clicking a button **slides a single drawer down
directly beneath it**. Built with **Electron** so any web page (Google services,
LINE WORKS, internal tools…) can be embedded as a drawer.

> Status: early scaffold. The drawer UX is functional; the native Windows AppBar
> space-reservation and the macOS menu-bar shell are stubbed/experimental (see
> "Platform shell" below).

## Behaviour (the agreed spec)

- Thin top bar with buttons: `メール / ToDo / トーク / カレンダー / メモ / My Documents`.
- Click a button → its drawer slides in **right below the button**, with the
  **button's left edge aligned to the drawer's left edge**. Button width and
  drawer width are independent.
- If a left-aligned drawer would run off the right of the screen, it is
  **clamped left** so it stays fully visible (option 1).
- **One drawer at a time by default.** Switching buttons closes the previous one.
- **Pin (📌)** keeps a drawer open so you can lay out several side by side — the
  classic "all drawers open" look is simply *everything pinned*. Nothing opens
  multiple drawers automatically.
- Embedded pages request the **mobile layout** (`mobile: true`) so narrow phone
  views fit the drawer nicely.
- **My Documents** is an Explorer-style file browser: start at **This PC** (drive
  list), navigate folders, **double-click to open/run** files, and use the native
  **right-click menu** (open / reveal in Explorer / copy path / copy to a chosen
  folder / move to trash). Shortcut "places" (PC, Desktop, Documents, Downloads,
  Home) plus a **＋ to pin your own folders** (remembered via localStorage). Real
  native file icons via `app.getFileIcon`.
- A **☰ menu button** at the left end opens **設定 / ヘルプ**. Settings let you
  **add / delete / reorder / edit** the drawers (icon, label, type, URL, mobile,
  width) — saved to localStorage; "既定に戻す" restores `config.js`.
- Drawers are **resizable** (drag the bottom-right grip); each drawer's size is
  **remembered per id**.
- A **tray icon** (Windows) toggles the bar; on macOS this becomes a menu-bar item.

## Run

```bash
npm install
npm start
```

`npm install` pulls Electron (and, optionally, `koffi` for the native AppBar).

## Testing

```bash
npm test          # Vitest unit tests (pure logic, runs anywhere incl. headless/CI)
npm run test:e2e  # Playwright drives the real Electron app (needs a display)
```

- **Unit tests** (`tests/`) cover the pure logic extracted into
  `src/renderer/lib/` — drawer placement (`computeLeft` left-align + right-edge
  clamp, `computeHeight`) and the click state machine (`resolveClick`:
  open/close/focus + which drawers to close). No DOM or Electron needed.
- **E2E** (`e2e/`) launches Electron via Playwright, clicks buttons, and asserts
  a drawer opens **aligned beneath its button**, that **only one unpinned drawer**
  is open at a time, and saves a screenshot. It uses the offline *My Documents*
  drawer, so it needs **no network**. On a Windows/macOS desktop it just runs; on
  headless Linux wrap it: `xvfb-run -a npm run test:e2e`.

Claude Code can run both and read the results/screenshot; the live "feel" of the
overlay is the one thing only a human can judge.

## Project layout

```
src/
  main/
    main.js      Electron main process: overlay window, tray, IPC
    appbar.js    Windows AppBar (SHAppBarMessage) via koffi — guarded, optional
  preload/
    preload.js   Safe bridge: mouse pass-through, window height, file paths
  renderer/
    index.html
    config.js    ← edit this to add/remove drawers
    renderer.js  Bar, button-anchored slide-in, pinning, files drop zone
    styles.css
    lib/
      layout.js  Pure placement math (computeLeft / computeHeight)
      drawers.js Pure click state machine (resolveClick)
tests/           Vitest unit tests for src/renderer/lib
e2e/             Playwright + Electron end-to-end tests
scripts/
  generate-icons.js   Builds assets/tray.png & icon.png (no deps)
```

### Adding a drawer

Edit `src/renderer/config.js`:

```js
{ id: 'sheet', label: '集計表', icon: '📊', type: 'page', mobile: false, width: 900,
  url: 'https://docs.google.com/spreadsheets/d/XXXX' }
```

`type: 'page'` embeds a URL; `type: 'files'` makes a drop-zone folder.

## How the overlay works

The window is a **transparent, frameless, always-on-top** strip pinned to the top.
The renderer:

1. toggles **click pass-through** (`setIgnoreMouse`) so the desktop stays usable
   everywhere except over the bar / an open drawer, and
2. **resizes the window height** to fit open drawers, so nothing below them is
   blocked.

Embedded pages use a shared `persist:smartsuite` session so you stay logged in.

## Platform shell (follow-ups)

- **Windows AppBar (space reservation).** `src/main/appbar.js` wires
  `SHAppBarMessage` through `koffi` so maximized windows sit *below* the bar. It is
  fully guarded: without koffi / off-Windows / on any error it falls back to the
  plain top overlay. The native path is **unverified on Windows hardware** — treat
  as experimental.
- **macOS.** The idiomatic equivalent of a top drawer is a **menu-bar (status
  item) dropdown**. The shared web UI is portable; only this launch shell needs a
  mac implementation.

## Known limitations / TODO

- **Google sign-in:** the shared `persist:smartsuite` session uses a desktop
  Chrome user-agent, and "Google にログイン" (menu / tray) opens a dedicated login
  window on that session, so signing in once authenticates every embedded page.
  This sidesteps the "this browser may not be secure" wall; if Google still blocks
  it, the robust fallback is the OAuth-API route.
- **Google Keep / Tasks** have no consumer API; they're embedded as pages only.
- The file browser embeds a **custom** Explorer-like UI (Node `fs` + Electron
  `shell`), not the native Windows Explorer control — this keeps it cross-platform
  and gives us the right-click menu, at the cost of not being the literal shell view.
- Pinned drawers can overlap horizontally; no auto-tiling yet.
- Multi-monitor: the bar lives on the primary display (target monitor is a future
  setting).
