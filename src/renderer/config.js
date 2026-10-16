// Drawer definitions. Edit here, or use the in-app ☰ → 設定 (saved to
// localStorage; L("既定に戻す") restores this list).
//
//   type:  'page'   -> embeds a website in a <webview>
//          'files'  -> file browser starting at "This PC" (drive list)
//          'folder' -> file browser starting at a specific folder (`path`)
//   url:    page URL (type 'page')
//   path:   folder path (type 'folder'); "@desktop"/"@documents"/"@downloads"/
//           "@home"/"@pc" resolve to those well-known locations
//   mobile: true -> request the site's smartphone layout (type 'page')
//   width:  drawer width in px (independent of the button width)
//
// The drawer opens directly beneath its button (left edges aligned, clamped
// into view). Drag the drawer's right/bottom/corner to resize; size is remembered.
window.SS_TABS = [
  { id: 'mail', label: L('メール'), icon: '✉', type: 'page', mobile: false, width: 720,
    url: 'https://mail.google.com/' },

  { id: 'todo', label: 'ToDo', icon: '✓', type: 'page', mobile: true, width: 360,
    url: 'https://tasks.google.com/embed/?fullWidth=1' },

  { id: 'cal-month', label: L('月'), icon: '📅', type: 'page', mobile: false, width: 600,
    url: 'https://calendar.google.com/calendar/u/0/r/month' },

  { id: 'cal-day', label: L('今日'), icon: '📆', type: 'page', mobile: false, width: 460,
    url: 'https://calendar.google.com/calendar/u/0/r/day' },

  { id: 'keep', label: L('メモ'), icon: '📝', type: 'page', mobile: true, width: 400,
    url: 'https://keep.google.com/' },

  { id: 'contacts', label: L('連絡先'), icon: '👤', type: 'page', mobile: true, width: 420,
    url: 'https://contacts.google.com/' },

  { id: 'drive', label: L('ドライブ'), icon: '🗂', type: 'page', mobile: true, width: 480,
    url: 'https://drive.google.com/' },

  { id: 'maps', label: L('マップ'), icon: '🗺', type: 'page', mobile: true, width: 480,
    url: 'https://maps.google.com/' },

  { id: 'translate', label: L('翻訳'), icon: '🌐', type: 'page', mobile: true, width: 420,
    url: 'https://translate.google.com/' },

  { id: 'gemini', label: 'Gemini', icon: '✨', type: 'page', mobile: false, width: 600,
    url: 'https://gemini.google.com/app' },

  { id: 'photos', label: L('フォト'), icon: '🖼', type: 'page', mobile: false, width: 560,
    url: 'https://photos.google.com/' },

  { id: 'messages', label: L('メッセージ'), icon: '📱', type: 'page', mobile: false, width: 420,
    url: 'https://messages.google.com/web' },

  { id: 'meet', label: 'Meet', icon: '🎥', type: 'page', mobile: false, width: 480,
    url: 'https://meet.google.com/' },

  { id: 'wikipedia', label: 'Wikipedia', icon: '📖', type: 'page', mobile: true, width: 460,
    url: 'https://ja.m.wikipedia.org/' },

  { id: 'desktop', label: 'Desktop', icon: '🖳', type: 'folder', path: '@desktop', width: 460 },

  // Launcher: drop app shortcuts / files here to register one-click buttons.
  { id: 'launch', label: L('ランチャー'), icon: '🎯', type: 'launcher', width: 340 },

  { id: 'clock', label: L('タイマー'), icon: '⏲', type: 'tool', tool: 'clock', width: 340, height: 480 },

  { id: 'pc', label: 'My Computer', icon: '💻', type: 'files', width: 460 },
];

// Local-app presets: companion desktop apps that serve their UI over loopback
// HTTP and can be opened as a drawer. These are NOT on the bar by default —
// they appear in ☰ → 設定 → "＋ 項目を追加" and in a button's right-click
// "新規項目を追加", so a user adds the ones they actually have installed.
//
// Adding another app (a business-card manager, a document manager…) is one
// entry here — no new code — as long as that app satisfies the contract in
// docs/LOCALAPP-PROTOCOL.md:
//
//   url        the UI to embed. Loopback only (127.0.0.1 / ::1 / localhost).
//   health     GET endpoint that proves the app is up. Relative to `url`.
//   expect     subset the health JSON must match, so we don't mistake another
//              process that happens to hold the port for our app.
//   launch     per-platform { exe, args } — 'win32'/'win', 'darwin'/'mac',
//              'linux'. %VARS% in `exe` are expanded. The app is started
//              detached and is NOT stopped when the drawer closes or DeskHatch
//              quits. `args` should put it in a "serve, don't show a window"
//              mode if it has one.
//   actions    extra right-click entries. `get` hits a loopback endpoint on the
//              running app; `launchArgs` starts the executable with those
//              arguments. With both, `get` is used when the app is up.
//   platforms  where this drawer makes sense; omit for "everywhere".
//   download   optional page to open when the executable can't be found.
window.SS_LOCALAPPS = [
  {
    id: 'dsbooks', label: L('本棚'), icon: '📚', type: 'localapp', width: 520,
    url: 'http://127.0.0.1:47817/',
    health: '/ping',
    expect: { app: 'dsbooks' },
    launch: {
      win32: { exe: '%LOCALAPPDATA%\\Programs\\DSBooks\\DSBooks.exe', args: ['--background'] },
    },
    actions: [
      // Running: bring DSBooks' own shelf window forward. Not running: start it
      // with no --background, which shows that window itself.
      { label: L('本棚ウインドウを開く'), get: '/show', launchArgs: [] },
      { label: L('表紙キャッシュ作成ツール'), launchArgs: ['--library-tools'] },
    ],
    platforms: ['win32'], // no macOS build of DSBooks yet
  },
];
