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
- **My Documents** is a folder-like drop zone — drag files onto it to list them.
- A **tray icon** (Windows) toggles the bar; on macOS this becomes a menu-bar item.

## Run

```bash
npm install
npm start
```

`npm install` pulls Electron (and, optionally, `koffi` for the native AppBar).

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

- Embedded Google **login may be blocked** in some webviews ("this browser may not
  be secure"). Workarounds: external-browser login, or a desktop Chrome UA.
- **Google Keep / Tasks** have no consumer API; they're embedded as pages only.
- Dropped files are listed in memory (no persistence yet).
- Pinned drawers can overlap horizontally; no auto-tiling yet.
- Multi-monitor: the bar lives on the primary display (target monitor is a future
  setting).
