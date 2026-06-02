// Drawer definitions. Edit this list to add/remove buttons.
//
//   type:  'page'  -> embeds a website in a <webview>
//          'files' -> a local "folder" you can drop files onto
//   url:    page URL (type 'page')
//   mobile: true -> request the site's smartphone layout (mobile UA + narrow view)
//   width:  drawer width in px (independent of the button width)
//
// The drawer opens directly beneath its button, with their LEFT edges aligned.
// If that would push the drawer off the right of the screen, it is clamped left.
window.SS_TABS = [
  { id: 'mail', label: 'メール', icon: '✉', type: 'page', mobile: true, width: 420,
    url: 'https://mail.google.com/' },

  { id: 'todo', label: 'ToDo', icon: '✓', type: 'page', mobile: true, width: 360,
    url: 'https://tasks.google.com/embed/?fullWidth=1' },

  { id: 'talk', label: 'トーク', icon: '💬', type: 'page', mobile: true, width: 420,
    url: 'https://line.worksmobile.com/' },

  // Calendar shows month + day side by side (two embedded views).
  { id: 'cal', label: 'カレンダー', icon: '📅', type: 'split', width: 820, panes: [
    { label: '月', url: 'https://calendar.google.com/calendar/u/0/r/month', mobile: false },
    { label: '日', url: 'https://calendar.google.com/calendar/u/0/r/day', mobile: false },
  ] },

  { id: 'keep', label: 'メモ', icon: '📝', type: 'page', mobile: true, width: 400,
    url: 'https://keep.google.com/' },

  { id: 'docs', label: 'My Documents', icon: '📁', type: 'files', width: 460 },
];
