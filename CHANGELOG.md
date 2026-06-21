# Changelog / バージョン履歴

DeskHatch の全リリースを公開日（**UTC**、日本時間 JST は +9h）とともに記録。
各バージョンの変更内容は、そのリリースが公開された時刻までのコミットを機械的に割り当てたもの（近似。リリースは GitHub Actions の自動ビルドで頻繁に切られているため、ごく短時間差のリリースは「再ビルドのみ」のことがある）。

GitHub Releases: <https://github.com/kiwiman0706-beep/deskhatch/releases>

凡例: **stable**=通常版 / **beta**=テスト版（プレリリース）

---

## Unreleased（未リリース）

- docs: add CHANGELOG with full version history and release dates (`155a6c6`)

## v0.1.71-beta.2 — 2026-06-20 20:45 UTC · beta

- Per-drawer engine choice: embedded webview vs real browser (`77093da`)

## v0.1.71-beta.1 — 2026-06-20 12:26 UTC · beta

- Release v0.1.71-beta.1 (in-window Google sign-in disguise) (`e66101b`)
- Make in-window Google sign-in robust across drawers (`523e4cb`)
- Add DeskHatch Browser (Level 1): standalone shell driving the real Edge/Chrome (`43743ba`)
- Google drawers: open as real Edge/Chrome "app-mode" window docked under the bar (`29cfd83`)
- fix(store): open Google in the real browser instead of removing it (Plan B') (`6dd2e25`)
- fix(store): hide Google sign-in + Google drawers in the MSIX build (`19127da`)

## v0.1.68-beta.3 — 2026-06-19 01:43 UTC · beta

- feat(nyoki, win): option to disable the system minimize animation (`91600b5`)

## v0.1.68-beta.2 — 2026-06-18 19:43 UTC · beta

- fix(nyoki): dock summoned window under its bar button; don't re-position after user resize (`215972a`)

## v0.1.68-beta.1 — 2026-06-18 16:58 UTC · beta

- feat(experimental, win): summon external windows as drawers ('Nyokitt') (`b339a44`)
- fix(store): generate branded MSIX tile assets (policy 10.1.1.11) (`dd2939c`)
- docs: update privacy policy contact email (`04cc260`)
- docs: add privacy policy page for Microsoft Store submission (`e0ae319`)
- build: add MSIX (appx) Store package + manual msix workflow (`6d3999c`)

## v0.1.66 — 2026-06-16 02:41 UTC · stable

- release: v0.1.66 (stable); Windows ARM64 uses notify-only updates (`9f5cbbb`)

## v0.1.66-beta.2 — 2026-06-16 00:38 UTC · beta

- build: add secondary Windows ARM64 release job (isolated, non-blocking) (`6afc71f`)
- chore(winget): align package identifier casing to Theta.DeskHatch (`6d9c6af`)

## v0.1.66-beta.1 — 2026-06-15 03:59 UTC · beta

- fix(macOS): exit-fullscreen via CGEventPost, opt-in 🟢 button, icon fallback (`35f52c9`)

## v0.1.65 — 2026-06-15 00:22 UTC · stable

- fix(macOS): app-menu icons; feat: beta update channel (opt-in) (`481163c`)

## v0.1.64 — 2026-06-15 00:04 UTC · stable

- feat(macOS): keep bar in fullscreen + add an 'exit fullscreen' button (`339ef75`)

## v0.1.63 — 2026-06-14 23:54 UTC · stable

- fix(macOS): keep the bar off fullscreen Spaces so window controls stay clickable (`104dcec`)

## v0.1.62 — 2026-06-14 22:43 UTC · stable

- feat: folder-drawer preview pane (toggle); fix: fullscreen hide is per-monitor (`0c4eb87`)

## v0.1.61 — 2026-06-14 16:23 UTC · stable

- fix: app menu shows real icons — resolve .lnk targets; full-width pin hint (`e84000c`)

## v0.1.60 — 2026-06-14 15:06 UTC · stable

- feat: XP/7-style app menu in the ☰ menu (pins, search, real icons, shortcuts) (`3609161`)

## v0.1.59 — 2026-06-14 13:10 UTC · stable

- feat: classic cascading Start Menu (reads Start Menu Programs tree) (`95ef9b8`)

## v0.1.58 — 2026-06-14 05:58 UTC · stable

- feat: launcher drawer — drop app shortcuts to auto-register one-click buttons (`5ddc170`)

## v0.1.57 — 2026-06-14 05:26 UTC · stable

- feat: auto-hide the bar while a full-screen app is foreground (`8a3bb42`)

## v0.1.56 — 2026-06-14 02:04 UTC · stable

- feat: sticky notes — pin a scrapbook note as a floating always-on-top card (`42c4c67`)

## v0.1.55 — 2026-06-13 16:14 UTC · stable

- feat: region screenshot -> scrap (capture, crop, clip as embedded image) (`570c531`)

## v0.1.54 — 2026-06-13 16:11 UTC · stable

_（再ビルド／微修正のみ — 新規コミットなし）_

## v0.1.53 — 2026-06-13 16:09 UTC · stable

- feat: per-drawer global hotkeys (assign a key to open any drawer) (`7dbe04c`)

## v0.1.52 — 2026-06-13 16:07 UTC · stable

- feat: workspaces — save & switch named bar layouts (Settings) (`5910709`)
- feat: full-text search across the scrapbook (standalone window) (`e58cbb5`)

## v0.1.51 — 2026-06-13 15:54 UTC · stable

- feat: add Game Boy (DMG green) and Lotus SmartCenter homage themes (`a406185`)

## v0.1.50 — 2026-06-13 12:15 UTC · stable

- feat: more retro themes — iMac 5 flavors, OS X 10.0 Aqua pinstripe, ThinkPad, PC-98, Amiga (`470ba7d`)

## v0.1.49 — 2026-06-13 12:10 UTC · stable

- feat: add iMac G3 (Bondi Blue) theme — bondi-blue bar + icy translucent accents (`3e5363c`)

## v0.1.48 — 2026-06-13 12:05 UTC · stable

- feat: add Sony VAIO (505) theme — magnesium silver bar + VAIO violet accents (`d13b0c0`)

## v0.1.47 — 2026-06-13 11:58 UTC · stable

- feat: flesh out OS themes with multi-slot color (Win95, Vista, Mac OS 9, Tiger) (`aad87b0`)

## v0.1.46 — 2026-06-13 11:50 UTC · stable

- feat: multi-slot theming (menu/buttons/press/drawer-title/right tray) + XP showcase (`47906ff`)

## v0.1.45 — 2026-06-12 23:34 UTC · stable

- fix: theme picker divider is a disabled separator (no duplicate classicmac value) (`44d37a2`)
- feat: historic-OS homage theme set (Win95/XP/7/8, Aqua, NeXTSTEP, BeOS, Ubuntu) (`2370ce8`)

## v0.1.44 — 2026-06-12 09:44 UTC · stable

- fix(audit): hotkey defaults, clip-storage quota, silent timer completion (`23fc50e`)

## v0.1.43 — 2026-06-12 09:02 UTC · stable

- fix: bar no longer eats clicks below it (capture visible rects, not the whole window) (`0b944d9`)

## v0.1.42 — 2026-06-12 01:34 UTC · stable

- feat: global hotkeys — capture clipboard, reveal bar, open Clip/Scrapbook (`d218aad`)

## v0.1.41 — 2026-06-11 21:14 UTC · stable

- feat: standalone 3-pane scrapbook window (boxes | notes | content) (`e420337`)

## v0.1.40 — 2026-06-11 21:10 UTC · stable

- feat: Markdown web-clips localize images to a _files folder (Obsidian-friendly) (`99381dd`)

## v0.1.39 — 2026-06-11 20:48 UTC · stable

- feat: self-contained web-clips — inline images as data URIs (Phase 2) (`18457bc`)

## v0.1.38 — 2026-06-11 16:45 UTC · stable

- feat: rich web-clip capture (text + images + tables), .html or .md (`e885b53`)

## v0.1.37 — 2026-06-11 16:13 UTC · stable

- demo: reword scrapbook caption to 'sort your notes into boxes' (`2104dba`)
- docs: embed a self-running HTML demo on the landing page (`9649ae4`)

## v0.1.36 — 2026-06-11 15:03 UTC · stable

- demo: preinstall timer & calculator on the bar; figures in the added web drawer; bigger bottom-right exit (`d22f2d5`)

## v0.1.35 — 2026-06-11 14:46 UTC · stable

- fix: guard webview against invalid URLs; drop bar right-click menu; richer demo scrapbook (`27cb400`)

## v0.1.34 — 2026-06-11 14:28 UTC · stable

- feat: right-click the empty bar for a quick-add menu (`aee8c1b`)

## v0.1.33 — 2026-06-11 14:08 UTC · stable

_（再ビルド／微修正のみ — 新規コミットなし）_

## v0.1.32 — 2026-06-11 14:06 UTC · stable

- demo: one-tap exit, website-like dummy page, timer not 'from ToDo', richer scrapbook + show result (`1cf6e63`)
- feat: persistent Timer & Stopwatch in one drawer (keeps running when closed) (`fa2b565`)

## v0.1.31 — 2026-06-11 03:06 UTC · stable

- demo: fit drawer heights + open the added folder; calc: iPhone-style with hideable keypad (`4499c53`)

## v0.1.30 — 2026-06-11 02:53 UTC · stable

- demo: windowed stage, richer mail/calendar, URL follow-through, reorder act, near-cursor menus, slower (`4db1f06`)

## v0.1.29 — 2026-06-11 02:32 UTC · stable

- feat: guided 'stage' demo — scripted walkthrough on a fake desktop (DEMO mode) (`8005f69`)

## v0.1.28 — 2026-06-11 01:55 UTC · stable

- overview: focus on what users DO; drop LINE WORKS default (`1c9b65a`)

## v0.1.27 — 2026-06-11 01:38 UTC · stable

- docs+demo: feature the unified Clip/Boxes story; captioned demo mode (`3a89d0f`)

## v0.1.26 — 2026-06-11 01:17 UTC · stable

- fix: post-drop box popup now fires for bar drops (the common case) (`d0f15d5`)

## v0.1.25 — 2026-06-11 01:11 UTC · stable

- fix: always show the post-drop box popup (was hidden when no boxes existed) (`e0dac8a`)

## v0.1.24 — 2026-06-11 00:53 UTC · stable

- fix: disable drag-intake picker (caused full-input freeze / force-quit) (`95a9ae5`)

## v0.1.23 — 2026-06-10 22:33 UTC · stable

- fix(update): skip Authenticode check on unsigned builds (real cause of update failure) (`9fdafed`)

## v0.1.22 — 2026-06-10 16:25 UTC · stable

- feat: post-drop box-picker popup (macOS intake + Windows fallback) (`29c77d5`)
- feat: Phase 2 — drag-intake box picker + folder-button drop (Windows) (`b9fd45a`)

## v0.1.20 — 2026-06-10 15:59 UTC · stable

- fix(update): disable differential download (fixes stuck 'downloading…') (`d543552`)

## v0.1.19 — 2026-06-10 15:53 UTC · stable

- fix: bottom-left resize corner on all drawers; surface stuck/failed updates (`470a3e3`)

## v0.1.18 — 2026-06-10 15:33 UTC · stable

- feat: widen 📎 panel + left-edge resize; drag a clip onto a box to file it (`f89c151`)

## v0.1.17 — 2026-06-10 14:56 UTC · stable

- feat: unify Clip + Scrap into one 📎 inbox/organizer (Phase 1) (`2ba2dbc`)

## v0.1.16 — 2026-06-10 14:26 UTC · stable

- fix(update): bundle electron-updater + set GitHub publish feed; surface Update/Demo in Settings (`54f471f`)

## v0.1.15 — 2026-06-10 12:02 UTC · stable

- feat: Scrapbook (紙copi-style) drawer — boxes=folders, notes=.md files (`423f92a`)
- feat: Scrapbook (紙copi-style) — boxes=folders, notes=.md files on disk (`b2f9629`)

## v0.1.14 — 2026-06-10 01:53 UTC · stable

- feat: Demo mode (sample content + auto-cycling drawers) for screen recording (`0fca3c3`)
- docs: richer hero (Clip/drag scene) + emphasize files/drag/URL/text (`1d69fd7`)
- docs(site): cache-bust hero image (?v=2) so the updated animation shows (`d71fda4`)
- docs: richer hero animation; drawer now slides out from UNDER the bar (`8d1e0d0`)

## v0.1.13 — 2026-06-09 13:40 UTC · stable

- feat(update): tray 'Check for updates' with feedback; fix landing logo path (`ef8c2ce`)

## v0.1.12 — 2026-06-09 13:36 UTC · stable

- docs: de-emphasize SmartCenter (small credit only), drop winget command for now; tools: Timer/Stopwatch selectable as drawers (`af223af`)
- docs: GIF-ready README + GitHub Pages landing page + animated hero (`df6a9ac`)

## v0.1.11 — 2026-06-09 07:48 UTC · stable

- feat: show version in menu, document macOS menu-bar drop in the guide, polish slides (`6ecc840`)

## v0.1.10 — 2026-06-09 06:35 UTC · stable

- feat: tray Restart/Force-quit, Stopwatch & Timer tools, Gemini drawer (`434f6e5`)

## v0.1.9 — 2026-06-09 00:33 UTC · stable

- feat(mac): drop files/text onto the menu-bar (Tray) icon to add to the Clip (`dc18b36`)

## v0.1.8 — 2026-06-09 00:23 UTC · stable

- feat(clip): native +File/+Folder buttons (reliable intake; macOS can't drop) (`a23d70d`)

## v0.1.7 — 2026-06-09 00:04 UTC · stable

- fix(dnd): accept drops anywhere on the overlay + visible feedback; Gmail desktop default (`762df2e`)

## v0.1.6 — 2026-06-08 22:58 UTC · stable

- fix(i18n): regenerate i18n.js correctly (previous build had a broken INLINE) (`54191f7`)
- feat: make 'close drawers when leaving the app' optional (default off) (`3b6687a`)

## v0.1.5 — 2026-06-08 16:29 UTC · stable

- fix(i18n): relaunch the app on language change instead of in-place reload (`3221463`)

## v0.1.4 — 2026-06-08 15:53 UTC · stable

- fix(i18n): bundle en/ja inline (no runtime file IO) + visible error overlay (`6a7c563`)

## v0.1.3 — 2026-06-08 13:04 UTC · stable

- release v0.1.3 (`e4b2bc5`)
- refactor(i18n): external language packs (locales/*.json), drop-in languages (`c62634a`)

## v0.1.2 — 2026-06-08 12:12 UTC · stable

- release v0.1.2 (`41270e5`)
- i18n: translate the in-app guide, help tab and settings/editor strings (`447555f`)
- feat(i18n): English UI with auto language detection + settings toggle (`ca0f670`)

## v0.1.1 — 2026-06-08 11:56 UTC · stable

- release v0.1.1 (`b54e3eb`)
- feat: fix drawer scroll, open live url externally, close on focus loss, apps preset (`70f33a7`)

## v0.1.0 — 2026-06-08 05:59 UTC · stable

- ci: allow manual release via workflow_dispatch version input (`3976c67`)
- chore: correct repo name casing to deskhatch (lowercase) (`5b65617`)
- chore: point update feed + docs at renamed repo (Deskhatch) (`bc596e9`)
- feat(update): Windows silent auto-update, macOS update notice (`1f7f988`)
- ci: build macOS dmg/zip on hosted runner and add to the release (`5e0e712`)
- fix(overlay): drive click pass-through from cursor geometry, not DOM mousemove (`051c52f`)
- docs: rename README title to DeskHatch (`ba14802`)
- ci: winget publishing pipeline (build + GitHub Release + auto winget PR) (`51961e1`)
- build: distinct filenames for NSIS Setup vs Portable (`d3d5aa2`)
- build: clean artifact names + Windows publisherName for distribution (`09d4c3a`)
- Open URLs via the default browser's exe directly (fix google.com no-op) (`e552251`)
- Remove temp URL diagnostic alert from search submit (`e63e831`)
- TEMP: alert the exact URL handed to the OS (diagnose google.com no-op) (`b387f3d`)
- Propagate system:external failures so we can diagnose Google search (`e3a1c2d`)
- Make search submit throw-proof and surface failures (`28d4a4e`)
- Fix search box Enter swallowed by IME conversion (`a9cdddf`)
- Add right-end search box that opens the system browser (`87df594`)
- Add Chrome-style omnibox mini-browser drawer (`47547f0`)
- Add animated SVG mock-ups to the help slideshow (`6bfe4d6`)
- Add HTML slideshow help guide (menu + first-run intro) (`b8ba467`)
- Add --selftest harness for headless spacer/bar geometry verification (`4f76b53`)
- Fix spacer band: re-place every rePin, not once (drop spacerKey cache) (`a21282b`)
- Try to shrink spacer below Windows' min window height (minHeight:1) (`e446702`)
- Fix spacer overflow: align its bottom to the bar, spill surplus upward (`1d86782`)
- Add diag2 log: actual spacer/bar bounds after pinning (`a3d1cbf`)
- Stop spacer overflow for good: keep it short, behind the opaque bar (`f424922`)
- Fix spacer overflow on secondary / different-DPI monitors (`3d1791f`)
- Disguise embedded browser for Google sign-in (User-Agent Client Hints) (`bcacb08`)
- Add macOS support: position bar below the menu bar, accessory mode, build target (`8f089e2`)
- Fix classic-Mac black corners: paint via bar pseudo-elements (`08dc37f`)
- Classic-Mac rounded corners: black fillers behind the bar's rounded top (`0b16111`)
- round-ends: round the TOP corners (classic-Mac rounded screen corners) (`e186f35`)
- Buttons reach the top edge; rounded-ends + Classic Mac theme; launch-at-login (`e8584f0`)
- Rebrand to DeskHatch + new hatch logo/icon (`510d771`)
- Add per-account "reset & re-login" (clears the sticky secure-browser block) (`168176c`)
- Add a small "other monitors' drawers" button per bar (`20cdd9d`)
- Never strand the bar when a chosen monitor is unplugged (`c4c2201`)
- Phase 2: per-display bar profiles (different bar per monitor) (`39e9789`)
- Add ‹ › scroll buttons when the bar overflows (wheel still works) (`23a4030`)
- Hide the bar's horizontal scrollbar (the "gap" under buttons) (`3b7dcff`)
- Reserve: always re-pin via poll (multi-monitor robustness) + log reservedDip (`6a70591`)
- Size bar windows from the OS-granted reservation rect (DPI-correct) (`c409463`)
- Spacer shorter than the bar so it can't peek below (multi-DPI) (`a681743`)
- Reliably tint the reservation spacer to the bar colour (`592476e`)
- Spacer follows the theme color and fits the bar exactly (no green peek) (`ca0ca6f`)
- Fix multi-display AppBar runaway (marching bar / pushed-down windows) (`4f7e280`)
- Fix AppBar reservation on secondary/mixed-DPI displays (`85d8bd4`)
- Phase 1: show the bar on multiple displays (per-display windows) (`e7dbbf3`)
- Windows build setup (electron-builder) + login UA fix (`f9d19ef`)
- Theme / colour presets (`0a3347e`)
- Settings import/export + ungroup tabs (`b2ce4a1`)
- B: drag-merge buttons into a tab group; generalize tabs; fix drop outline (`5e9c637`)
- Inline edit (A): right-click "編集" opens a per-item editor (`1cd86a9`)
- Direct bar editing: drag-reorder buttons + right-click menu (`ef52bd7`)
- Phase 3: clip polish — thumbnails, reorder, per-item temporary, clear-all (`2c42ec9`)
- Phase 2: promote clip items to permanent bar buttons + native icons (`894a933`)
- Fix window operation while a drawer is open; accept dropped text (`785cd29`)
- Drag & drop intake: clip (temporary holding) drawer + file viewers (`612caad`)
- Add ONVIF/RTSP camera drawer (e.g. Tapo) via ffmpeg -> fragmented MP4 (`78b0c8f`)
- Keep-alive drawers, multi-display target, and tool drawers as items (`4b09f38`)
- Add "open in browser" header button and a bookmarks tool (`29f5df9`)
- Add tabbed drawers, system/device shortcuts, and built-in tools (`f0d0300`)
- Event-driven re-pin (with poll fallback selectable in settings) (`6c54582`)
- Re-pin BOTH the spacer and the real bar to the top when reserving (`075c0ad`)
- Two-window reservation: opaque spacer holds the top strip (`5c9be07`)
- Re-pin the bar to the top edge when reserving (AppBar displacement fix) (`b855809`)
- Add SMARTSUITE_OPAQUE flag to test non-transparent AppBar reservation (`b9ae384`)
- Auto-hide reveal over maximized windows: raise + no background throttle (`562a701`)
- Auto-hide: reveal at the top edge even over maximized windows (`cdfa24e`)
- Default to auto-hide + no reservation; mark reserve experimental (`838e476`)
- Make AppBar reservation DPI-aware (`99519a2`)
- Fix AppBar reservation and immediate temp-hide (`c24daaa`)
- Bar display modes (reserve/auto-hide), horizontal scroll, temp-hide (`ce55b6d`)
- Add Maps / Translate / Photos / Messages / Meet to default drawers (`9169b72`)
- Multi-account support (per-account sessions) + more default Google apps (`9ebeb9a`)
- Add a Quit button to the ☰ menu (`706f2d0`)
- Fix bar not pinning to the top edge (AppBar reservation leak) (`a08b351`)
- Fix drawer sizing/resize; folder-shortcut buttons; split calendar into 月/今日 (`081b3f0`)
- Improve Google sign-in for the embedded-pages approach (`cee1c5b`)
- Colorful logo + calendar month/day split view (`945134a`)
- Add a brand logo mark; use it as the left menu button and app/tray icon (`d853193`)
- Add settings/help menu, editable items, and resizable+remembered drawers (`7e62f66`)
- Replace My Documents drop-zone with an Explorer-style file browser (`ff39039`)
- Add test scaffolding: extract pure logic, Vitest unit + Playwright E2E (`b379b4f`)
- Scaffold SmartCenter-style top-edge drawer launcher (Electron) (`0ed6e9b`)

---

> リポジトリは `smartsuite.next` → `deskhatch` にリネーム済み。リリースは `release` ワークフロー（タグ push / 手動実行）で Windows・macOS を自動ビルドし公開。
