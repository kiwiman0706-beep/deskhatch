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

  // Installed apps: Windows Start Menu programs / macOS Applications (auto per-OS).
  { id: 'apps', label: L('アプリ'), icon: '🚀', type: 'folder', path: '@apps', width: 460 },

  // Launcher: drop app shortcuts / files here to register one-click buttons.
  { id: 'launch', label: L('ランチャー'), icon: '🎯', type: 'launcher', width: 340 },

  { id: 'clock', label: L('タイマー'), icon: '⏲', type: 'tool', tool: 'clock', width: 340, height: 480 },

  { id: 'pc', label: 'My Computer', icon: '💻', type: 'files', width: 460 },
];
