'use strict';

/* global SS_TABS */

const BAR_H = 44;
const MARGIN = 6;
const ANIM_MS = 200;
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
  'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

// Use the *screen* height, not the overlay window's (which is only the bar tall
// until a drawer opens).
const drawerHeight = () => Math.min(720, Math.floor(window.screen.availHeight * 0.8));

// The "logo" menu pseudo-tab pinned to the left of the bar.
const MENU_TAB = { id: '__menu', label: L('メニュー'), icon: '☰', type: 'menu', width: 380 };

// The "clip" (temporary holding) pseudo-tab — a drop target / bin.
const CLIP_TAB = { id: '__clip', label: L('クリップ'), icon: '📎', type: 'clip', width: 640 };
// The "other monitors' drawers" pseudo-tab — open another monitor's items here.
const OTHERS_TAB = { id: '__others', label: L('別モニタのドロワー'), icon: '🖥', type: 'others', width: 320 };
// The "how-to guide" pseudo-tab — an HTML feature-overview slideshow.
const HELP_TAB = { id: '__help', label: L('使い方ガイド'), icon: '❔', type: 'help', width: 620 };

// File viewers by extension (others open with the default app).
const VIEWER_EXT = {
  image: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico'],
  video: ['.mp4', '.webm', '.ogg', '.mov', '.m4v'],
  audio: ['.mp3', '.wav', '.m4a', '.aac', '.flac', '.oga'],
  pdf: ['.pdf'],
  html: ['.html', '.htm'],
  text: ['.txt', '.md', '.log', '.json', '.csv', '.xml', '.js', '.css', '.ini', '.yml', '.yaml'],
};
function viewerForExt(ext) {
  for (const k in VIEWER_EXT) if (VIEWER_EXT[k].includes(ext)) return k;
  return null;
}
const viewerIcon = (v) => ({ image: '🖼', video: '🎬', audio: '🎵', pdf: '📄', html: '🌐', text: '📃' }[v] || '📦');

// Brand mark: a top bar with a drawer hanging beneath it. Inline SVG so it can
// be tinted (white on the teal bar) and needs no external file / CSP allowance.
const logoMark = (color) =>
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
  `<rect x="4" y="4.2" width="16" height="3.1" rx="1.5" fill="${color}"/>` +
  `<rect x="6" y="9.4" width="12" height="9.4" rx="2" fill="${color}"/>` +
  '<rect x="9" y="11.8" width="6" height="1.6" rx="0.8" fill="rgba(0,0,0,.22)"/>' +
  '<rect x="9" y="15.2" width="6" height="1.6" rx="0.8" fill="rgba(0,0,0,.22)"/></svg>';

// This window's display id (from main via ?d=). Bar items are stored per display
// so each monitor can have a different bar; everything else is shared.
const MY_DISPLAY = new URLSearchParams(location.search).get('d') || '';
// Demo mode (for screen recording): show SAMPLE content instead of real web
// apps/files, keep the bar visible, and auto-cycle drawers. Toggle from the tray.
const DEMO = (() => { try { return localStorage.getItem('ss.demo') === '1' || new URLSearchParams(location.search).get('demo') === '1'; } catch (_) { return false; } })();
const TABS_KEY = MY_DISPLAY ? 'ss.tabs.' + MY_DISPLAY : 'ss.tabs';

// --- Persistence (localStorage) -------------------------------------------
const Store = {
  getTabs() {
    try {
      let s = JSON.parse(localStorage.getItem(TABS_KEY));
      // First run on this monitor: fall back to the shared set, then defaults.
      if (!(Array.isArray(s) && s.length) && TABS_KEY !== 'ss.tabs') s = JSON.parse(localStorage.getItem('ss.tabs'));
      return Array.isArray(s) && s.length ? s : null;
    } catch (_) { return null; }
  },
  saveTabs(t) { localStorage.setItem(TABS_KEY, JSON.stringify(t)); },
  clearTabs() { localStorage.removeItem(TABS_KEY); },
  getSize(id) {
    try { return JSON.parse(localStorage.getItem('ss.size.' + id)) || null; } catch (_) { return null; }
  },
  saveSize(id, s) { localStorage.setItem('ss.size.' + id, JSON.stringify(s)); },
  getDisplay() {
    const def = { mode: 'autohide', reserve: false, repin: 'event', theme: 'teal', roundEnds: false };
    try { const d = JSON.parse(localStorage.getItem('ss.display')); return d && d.mode ? { ...def, ...d } : def; } catch (_) { return def; }
  },
  saveDisplay(d) { localStorage.setItem('ss.display', JSON.stringify(d)); },
  getAccounts() {
    try { const a = JSON.parse(localStorage.getItem('ss.accounts')); return Array.isArray(a) ? a : []; } catch (_) { return []; }
  },
  saveAccounts(a) { localStorage.setItem('ss.accounts', JSON.stringify(a)); },
  getClips() {
    try { const c = JSON.parse(localStorage.getItem('ss.clips')); return Array.isArray(c) ? c : []; } catch (_) { return []; }
  },
  saveClips(c) { localStorage.setItem('ss.clips', JSON.stringify(c)); },
  // "Don't show the intro guide on startup again."
  getHelpSkip() { return localStorage.getItem('ss.help.skip') === '1'; },
  setHelpSkip(v) { if (v) localStorage.setItem('ss.help.skip', '1'); else localStorage.removeItem('ss.help.skip'); },
  // Close unpinned drawers when focus leaves the app (off by default so OS
  // screenshot tools / Alt-Tab don't dismiss a drawer you're capturing).
  getCloseOnLeave() { return localStorage.getItem('ss.closeOnLeave') === '1'; },
  setCloseOnLeave(v) { if (v) localStorage.setItem('ss.closeOnLeave', '1'); else localStorage.removeItem('ss.closeOnLeave'); },
  // Post-drop box-picker popup (on by default).
  getDropMenu() { return localStorage.getItem('ss.dropMenu') !== '0'; },
  setDropMenu(v) { if (v) localStorage.removeItem('ss.dropMenu'); else localStorage.setItem('ss.dropMenu', '0'); },
  getScrapRoot() { return localStorage.getItem('ss.scrap.root') || ''; },
  setScrapRoot(p) { if (p) localStorage.setItem('ss.scrap.root', p); else localStorage.removeItem('ss.scrap.root'); },
  // Search engine for the right-end 🔍 box (id into SEARCH_ENGINES).
  getSearchEngine() { return localStorage.getItem('ss.search.engine') || 'google'; },
  setSearchEngine(id) { localStorage.setItem('ss.search.engine', id); },
};

// Search-box presets. %s is replaced with the URL-encoded query.
const SEARCH_ENGINES = [
  { id: 'google', name: 'Google', q: 'https://www.google.com/search?q=%s' },
  { id: 'bing', name: 'Bing', q: 'https://www.bing.com/search?q=%s' },
  { id: 'duckduckgo', name: 'DuckDuckGo', q: 'https://duckduckgo.com/?q=%s' },
  { id: 'yahoojp', name: 'Yahoo! JAPAN', q: 'https://search.yahoo.co.jp/search?p=%s' },
  { id: 'youtube', name: 'YouTube', q: 'https://www.youtube.com/results?search_query=%s' },
  { id: 'wikipediaja', name: L('Wikipedia（日本語）'), q: 'https://ja.wikipedia.org/w/index.php?search=%s' },
  { id: 'amazonjp', name: 'Amazon.co.jp', q: 'https://www.amazon.co.jp/s?k=%s' },
  { id: 'gmaps', name: L('Google マップ'), q: 'https://www.google.com/maps/search/%s' },
];
const searchEngine = () => SEARCH_ENGINES.find((e) => e.id === Store.getSearchEngine()) || SEARCH_ENGINES[0];

// Turn a query into a URL: a site if it has a scheme or looks like a
// domain/localhost/IP with no spaces; otherwise the chosen engine's search.
function searchOrUrl(q) {
  q = (q || '').trim();
  if (!q) return '';
  if (/^(https?|file|about|chrome|view-source):/i.test(q)) return q;
  const noSpace = !/\s/.test(q);
  const domainish = /^localhost(:\d+)?(\/|$)/i.test(q)
    || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(q)
    || /^[^\s/]+\.[^\s/]{2,}([/?#].*)?$/.test(q);
  if (noSpace && domainish) return 'https://' + q;
  let tmpl = 'https://www.google.com/search?q=%s';
  try { const e = searchEngine(); if (e && e.q) tmpl = e.q; } catch (_) { /* fall back to Google */ }
  return tmpl.replace('%s', encodeURIComponent(q));
}

// Accounts: the built-in "default" (shared session) plus user-added ones, each
// with its own isolated session partition.
const partitionFor = (id) => (!id || id === 'default') ? 'persist:smartsuite' : 'persist:acct-' + id;
const accountsFull = () => [{ id: 'default', name: L('既定') }].concat(Store.getAccounts());
const addAccount = (name) => {
  const arr = Store.getAccounts();
  arr.push({ id: 'a' + Date.now().toString(36), name });
  Store.saveAccounts(arr);
};
const removeAccount = (id) => {
  Store.saveAccounts(Store.getAccounts().filter((a) => a.id !== id));
  window.auth.logout(partitionFor(id)); // clear its cookies too
};

// Color themes (CSS variables). --bar-fg flips to dark for the light theme.
const THEMES = {
  teal: { '--teal-light': '#2e8b8b', '--teal': '#1f6f6f', '--teal-dark': '#145252', '--bar-fg': '#eafafa' },
  graphite: { '--teal-light': '#4a4f57', '--teal': '#2c3038', '--teal-dark': '#14171c', '--bar-fg': '#eef1f4' },
  ocean: { '--teal-light': '#2f7fd6', '--teal': '#1f63ad', '--teal-dark': '#154a85', '--bar-fg': '#eaf2fb' },
  forest: { '--teal-light': '#3f9d5a', '--teal': '#2c7d44', '--teal-dark': '#1d5a30', '--bar-fg': '#eafaef' },
  plum: { '--teal-light': '#8a5cc0', '--teal': '#6a3fa0', '--teal-dark': '#4c2a78', '--bar-fg': '#f3ecfb' },
  sunset: { '--teal-light': '#e0913c', '--teal': '#d4682f', '--teal-dark': '#a8481b', '--bar-fg': '#fff1e6' },
  rose: { '--teal-light': '#e06aa0', '--teal': '#c24683', '--teal-dark': '#933063', '--bar-fg': '#fdeef5' },
  light: { '--teal-light': '#eef2f6', '--teal': '#d7dee6', '--teal-dark': '#aeb9c6', '--bar-fg': '#2a3340' },
  classicmac: { '--teal-light': '#fbfbfb', '--teal': '#e9e9ec', '--teal-dark': '#000000', '--bar-fg': '#0a0a0a' },
};
const THEME_LABELS = [
  ['teal', L('Teal（既定）')], ['graphite', L('Graphite（ダーク）')], ['ocean', 'Ocean'],
  ['forest', 'Forest'], ['plum', 'Plum'], ['sunset', 'Sunset'], ['rose', 'Rose'],
  ['light', 'Light'], ['classicmac', 'Classic Mac'],
];
function applyTheme(key) {
  const t = THEMES[key] || THEMES.teal;
  for (const k in t) document.documentElement.style.setProperty(k, t[k]);
}

const defaultTabs = () => JSON.parse(JSON.stringify(window.SS_TABS || []));
const loadTabs = () => Store.getTabs() || defaultTabs();

const bar = document.getElementById('bar');
const peek = document.getElementById('peek');
let tabs = loadTabs();

/** id -> { el, btn, pinned } */
const open = {};
let demoStage = false; // guided stage demo is running
let demoStageH = 0;    // stage band height (px)
/** id -> { el, btn, tab } : kept-alive drawers hidden off-screen (audio keeps playing) */
const bg = {};
let zCounter = 100;
let dragging = false; // true while a drawer is being resized

// Bar visibility state
const PEEK = 4;
let display = Store.getDisplay(); // { mode: 'always'|'autohide', reserve: bool }
let tempHidden = false;           // one-shot "get out of my way"
let hovering = false;             // pointer over bar/peek
let atEdge = false;               // cursor at the very top edge (from main)
let hideTimer = null;
let searchEl = null;              // the right-end 🔍 search popover, while open

// ---------------------------------------------------------------------------
// Mouse pass-through: capture over the bar/drawers, pass through elsewhere.
// When only the bar is showing, capture the whole (44px) window so it reliably
// receives clicks AND file drops; pass through when hidden; cursor-based when a
// drawer is open (transparent areas beside it must stay click-through).
// ---------------------------------------------------------------------------
// The overlay is one full-screen, mostly-transparent window, and a single
// setIgnoreMouseEvents flag governs the WHOLE window. Deciding that flag from
// DOM `mousemove` hit-testing was unreliable: a <webview> swallows host-level
// mousemove, so a click landing on a drawer's embedded page leaked through to
// the window behind; and the async toggle lagged a click made right after the
// cursor reached the bar (the click fell through before capture turned on).
// Instead we hand the main process the interactive rectangles and let its
// existing high-frequency cursor watch hit-test the real pointer position —
// immune to webview event capture and free of the per-click toggle race.
window.overlay.setIgnoreMouse(true);

// Report what should be clickable right now:
//   'none'  hidden            -> the whole window passes clicks through
//   'all'   bar only / drag   -> the whole window captures
//   'rects' drawer/popover    -> capture only over the bar + open-drawer +
//                                search-popover rects (window-local CSS px ==
//                                DIP; main converts).
function pushHit() {
  if (!barShouldShow()) return window.overlay.setHit('none', []);
  if (dragging) return window.overlay.setHit('all', []);
  if (demoStage) return window.overlay.setHit('all', []);
  const interactive = [bar, ...Object.keys(open).map((id) => open[id].el)];
  if (searchEl) interactive.push(searchEl);
  if (interactive.length === 1) return window.overlay.setHit('all', []); // bar only
  const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
  window.overlay.setHit('rects', interactive.map(r));
}

// ---------------------------------------------------------------------------
// Bar visibility + window height. Shrinks to a 4px peek when hidden, to the bar
// when idle, and grows to fit open drawers when any are open.
// ---------------------------------------------------------------------------
const isHiddenMode = () => display.mode === 'autohide' || tempHidden;

function barShouldShow() {
  if (DEMO) return true;                       // demo: keep the bar on screen
  if (searchEl) return true;                   // search popover is open
  if (demoStage) return true;                  // guided stage demo
  if (pickerEl) return true;                   // drag-intake picker is open
  if (Object.keys(open).length) return true; // a drawer is open
  if (!isHiddenMode()) return true;           // always-show mode
  return hovering || atEdge;                  // hidden mode: reveal at top edge
}

function reflowHeight() {
  if (demoStage) { window.overlay.setHeight(demoStageH || window.screen.availHeight); window.overlay.setHit('all', []); return; }
  const shown = barShouldShow();
  bar.classList.toggle('hidden', !shown);
  peek.classList.toggle('on', !shown);
  if (!shown) { window.overlay.setHeight(PEEK); }
  else {
    const heights = Object.keys(open).map((id) => open[id].el.offsetHeight);
    if (searchEl) heights.push(searchEl.offsetHeight); // fit the search popover
    if (pickerEl) heights.push(pickerEl.offsetHeight); // fit the drag-intake picker
    window.overlay.setHeight(window.SSLayout.computeHeight(BAR_H, heights));
  }
  // Re-report the interactive geometry whenever visibility/size changes; the
  // main process drives the actual click pass-through from these rects.
  pushHit();
}

function scheduleHide() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(reflowHeight, 350);
}

function applyDisplay() {
  Store.saveDisplay(display);
  applyTheme(display.theme);
  bar.classList.toggle('round-ends', !!display.roundEnds);
  const barColor = (THEMES[display.theme] || THEMES.teal)['--teal'];
  window.overlay.setDisplay({ ...display, barColor }); // main toggles AppBar reservation + spacer color
  reflowHeight();
}

// ---------------------------------------------------------------------------
// Drawer construction
// ---------------------------------------------------------------------------
async function resolveStart(startPath) {
  if (!startPath) return '::pc';
  if (startPath[0] === '@') return window.files.special(startPath.slice(1));
  return startPath;
}

function buildFilesPanel(startPath) {
  const wrap = document.createElement('div');
  wrap.className = 'ss-fb';

  const places = document.createElement('div');
  places.className = 'ss-fb-places';

  const nav = document.createElement('div');
  nav.className = 'ss-fb-nav';
  const back = document.createElement('button');
  back.className = 'ss-fb-btn'; back.textContent = '←'; back.title = L('戻る');
  const up = document.createElement('button');
  up.className = 'ss-fb-btn'; up.textContent = '↑'; up.title = L('上のフォルダへ');
  const crumb = document.createElement('span');
  crumb.className = 'ss-fb-path';
  nav.append(back, up, crumb);

  const list = document.createElement('ul');
  list.className = 'ss-fb-list';

  wrap.append(places, nav, list);

  const history = [];
  let current = null;

  async function load(p, push = true) {
    const res = await window.files.list(p);
    if (res.error) {
      list.innerHTML = `<li class="ss-fb-err">${L('開けません: ')}${res.error}</li>`;
      return;
    }
    if (push && current && current !== res.path) history.push(current);
    current = res.path;
    crumb.textContent = res.path === '::pc' ? 'PC' : res.path;
    crumb.title = crumb.textContent;
    back.disabled = history.length === 0;
    up.disabled = !res.parent;
    up.onclick = () => res.parent && load(res.parent);
    renderEntries(res.entries);
  }

  function renderEntries(entries) {
    list.innerHTML = '';
    if (!entries.length) {
      list.innerHTML = L('<li class="ss-fb-empty">（空のフォルダ）</li>');
      return;
    }
    for (const ent of entries) {
      const li = document.createElement('li');
      li.className = 'ss-fb-row';
      li.title = ent.path;
      const emoji = document.createElement('span');
      emoji.className = 'ss-fb-emoji';
      emoji.textContent = ent.isDir ? '📁' : '📄';
      const name = document.createElement('span');
      name.className = 'ss-fb-name';
      name.textContent = ent.name;
      li.append(emoji, name);

      li.addEventListener('dblclick', () => {
        // macOS .app bundles are directories — launch them instead of descending.
        if (ent.isDir && !/\.app$/i.test(ent.name)) load(ent.path);
        else window.files.open(ent.path);
      });

      li.addEventListener('contextmenu', async (e) => {
        e.preventDefault();
        const action = await window.files.contextMenu({
          path: ent.path, isFile: ent.isFile, isDir: ent.isDir,
        });
        if (!action) return;
        if (action === 'open') window.files.open(ent.path);
        else if (action === 'reveal') window.files.reveal(ent.path);
        else if (action === 'copy-path') window.files.copyPath(ent.path);
        else if (action === 'copy-to') {
          const dir = await window.files.pickFolder();
          if (dir) await window.files.copyTo(ent.path, dir);
        } else if (action === 'trash') {
          await window.files.trash(ent.path);
          load(current, false);
        }
      });

      list.appendChild(li);

      // Swap the emoji for the real native icon once it resolves.
      window.files.icon(ent.path).then((url) => {
        if (!url) return;
        const img = document.createElement('img');
        img.className = 'ss-fb-ico'; img.alt = '';
        img.src = url;
        li.replaceChild(img, emoji);
      });
    }
  }

  back.onclick = () => {
    const p = history.pop();
    if (p != null) load(p, false);
  };

  async function initPlaces() {
    const base = await window.files.places();
    const custom = JSON.parse(localStorage.getItem('ss.places') || '[]');
    places.innerHTML = '';
    for (const pl of [...base, ...custom]) {
      const b = document.createElement('button');
      b.className = 'ss-fb-place';
      b.textContent = `${pl.icon || '📁'} ${pl.name}`;
      b.title = pl.path;
      b.onclick = () => load(pl.path);
      places.appendChild(b);
    }
    const add = document.createElement('button');
    add.className = 'ss-fb-place ss-fb-add';
    add.textContent = L('＋');
    add.title = L('フォルダを追加');
    add.onclick = async () => {
      const dir = await window.files.pickFolder();
      if (!dir) return;
      const arr = JSON.parse(localStorage.getItem('ss.places') || '[]');
      arr.push({ name: dir.split(/[\\/]/).filter(Boolean).pop() || dir, path: dir, icon: '📁' });
      localStorage.setItem('ss.places', JSON.stringify(arr));
      initPlaces();
    };
    places.appendChild(add);
  }

  initPlaces();
  resolveStart(startPath).then((p) => load(p, false));
  return wrap;
}

function makeWebview(url, mobile, partition) {
  const wv = document.createElement('webview');
  wv.className = 'ss-webview';
  const part = partition || 'persist:smartsuite';
  window.auth.ensure(part); // make sure this partition has the desktop Chrome UA
  wv.setAttribute('partition', part);
  wv.setAttribute('allowpopups', '');
  if (mobile) wv.setAttribute('useragent', MOBILE_UA);
  wv.setAttribute('src', url);
  return wv;
}

// Chrome-style omnibox: a query is a URL if it has a scheme, or looks like a
// domain / localhost / IP and has no spaces; otherwise it's a Google search.
function omniToUrl(q) {
  q = (q || '').trim();
  if (!q) return '';
  if (/^(https?|file|about|chrome|view-source):/i.test(q)) return q;
  const noSpace = !/\s/.test(q);
  const domainish = /^localhost(:\d+)?(\/|$)/i.test(q)
    || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(q)
    || /^[^\s/]+\.[^\s/]{2,}([/?#].*)?$/.test(q);
  if (noSpace && domainish) return 'https://' + q;
  return 'https://www.google.com/search?q=' + encodeURIComponent(q);
}

// Mini-browser drawer: a combined search/address bar (omnibox) over a webview,
// with back / forward / reload and "open in the system browser".
function buildBrowser(tab, partition) {
  const wrap = el('div', 'ss-browser');
  const barEl = el('div', 'ss-browser-bar');
  const back = el('button', 'ss-browser-btn', '◀'); back.title = L('戻る');
  const fwd = el('button', 'ss-browser-btn', '▶'); fwd.title = L('進む');
  const reload = el('button', 'ss-browser-btn', '⟳'); reload.title = L('再読み込み');
  const omni = el('input', 'ss-browser-omni');
  omni.type = 'text'; omni.spellcheck = false; omni.placeholder = L('検索 または URL を入力');
  const ext = el('button', 'ss-browser-btn', '↗'); ext.title = L('標準ブラウザで開く');
  barEl.append(back, fwd, reload, omni, ext);

  const home = tab.url || 'https://www.google.com/';
  const wv = makeWebview(home, false, partition);
  wrap.append(barEl, wv);

  const navTo = (q) => { const u = omniToUrl(q); if (u) wv.setAttribute('src', u); };
  omni.addEventListener('keydown', (e) => { if (e.isComposing || e.keyCode === 229) return; if (e.key === 'Enter') { e.preventDefault(); navTo(omni.value); } });
  omni.addEventListener('focus', () => omni.select());
  back.onclick = () => { try { if (wv.canGoBack()) wv.goBack(); } catch (_) { /* not ready */ } };
  fwd.onclick = () => { try { if (wv.canGoForward()) wv.goForward(); } catch (_) { /* not ready */ } };
  reload.onclick = () => { try { wv.reload(); } catch (_) { /* not ready */ } };
  ext.onclick = () => { let u = ''; try { u = wv.getURL(); } catch (_) { u = omni.value; } if (u) window.system.external(u); };

  const sync = () => {
    try {
      if (document.activeElement !== omni) omni.value = wv.getURL() || '';
      back.disabled = !wv.canGoBack();
      fwd.disabled = !wv.canGoForward();
    } catch (_) { /* not ready */ }
  };
  wv.addEventListener('did-navigate', sync);
  wv.addEventListener('did-navigate-in-page', sync);
  wv.addEventListener('dom-ready', sync);
  return wrap;
}

// Tabbed drawer: switch between several panes in one drawer (lazy-loaded).
// Each pane is a mini tab-config of any type (page/folder/viewer/tool/...),
// rendered via buildBody, so a tab group can mix kinds.
function buildTabsPanel(tab) {
  const wrap = el('div', 'ss-tabs');
  const tabbar = el('div', 'ss-tabs-bar');
  const view = el('div', 'ss-tabs-view');
  wrap.append(tabbar, view);
  const panes = tab.panes || [];
  const made = [];

  function show(i) {
    [...tabbar.children].forEach((b, idx) => b.classList.toggle('active', idx === i));
    wrap.dataset.activeUrl = (panes[i] && panes[i].url) || '';
    if (!made[i]) {
      const sub = Object.assign({ type: 'page' }, panes[i]);
      if (tab.account && !sub.account) sub.account = tab.account; // inherit account
      const node = buildBody(sub);
      node.style.position = 'absolute';
      node.style.inset = '0';
      node.style.display = 'none';
      view.appendChild(node);
      made[i] = node;
    }
    made.forEach((n, idx) => { if (n) n.style.display = idx === i ? '' : 'none'; });
  }

  panes.forEach((p, i) => {
    const b = el('button', 'ss-tabs-tab', p.label || (L('タブ') + (i + 1)));
    b.onclick = () => show(i);
    tabbar.appendChild(b);
  });
  if (panes.length) show(0);
  return wrap;
}

// --- Built-in tools --------------------------------------------------------
function buildEditor() {
  const wrap = el('div', 'ss-editor');
  const barEl = el('div', 'ss-editor-bar');
  const ta = document.createElement('textarea');
  ta.className = 'ss-editor-area';
  ta.value = localStorage.getItem('ss.editor') || '';
  ta.oninput = () => localStorage.setItem('ss.editor', ta.value);
  const save = el('button', 'ss-set-btn', L('ファイルに保存'));
  save.onclick = () => window.files.saveText(ta.value);
  const clear = el('button', 'ss-set-btn', L('クリア'));
  clear.onclick = () => { ta.value = ''; localStorage.setItem('ss.editor', ''); };
  barEl.append(save, clear);
  wrap.append(barEl, ta);
  return wrap;
}

// Small shunting-yard evaluator (CSP-safe; no eval/Function).
function calcEval(expr) {
  const toks = expr.match(/(\d+\.?\d*|\.\d+|[+\-*/()])/g);
  if (!toks) return '';
  const prec = { '+': 1, '-': 1, '*': 2, '/': 2 };
  const out = [], ops = [];
  for (const t of toks) {
    if (/^[\d.]/.test(t)) out.push(Number(t));
    else if (t === '(') ops.push(t);
    else if (t === ')') { while (ops.length && ops[ops.length - 1] !== '(') out.push(ops.pop()); ops.pop(); }
    else { while (ops.length && prec[ops[ops.length - 1]] >= prec[t]) out.push(ops.pop()); ops.push(t); }
  }
  while (ops.length) out.push(ops.pop());
  const st = [];
  for (const t of out) {
    if (typeof t === 'number') { st.push(t); continue; }
    const b = st.pop(), a = st.pop();
    st.push(t === '+' ? a + b : t === '-' ? a - b : t === '*' ? a * b : a / b);
  }
  const r = st.pop();
  return (r === undefined || !isFinite(r)) ? 'Error' : String(r);
}

function buildCalc() {
  const wrap = el('div', 'ss-calc');
  wrap.tabIndex = 0;
  const disp = document.createElement('input');
  disp.className = 'ss-calc-disp';
  disp.readOnly = true;
  const grid = el('div', 'ss-calc-grid');
  const press = (k) => {
    if (k === 'C') { disp.value = ''; return; }
    if (k === '←') { disp.value = disp.value.slice(0, -1); return; }
    if (k === '=') { disp.value = calcEval(disp.value); return; }
    if (disp.value === 'Error') disp.value = '';
    disp.value += k;
  };
  ['C', '←', '(', ')', '7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '.', '=', '+']
    .forEach((k) => { const b = el('button', 'ss-calc-key', k); b.onclick = () => press(k); grid.appendChild(b); });
  wrap.addEventListener('keydown', (e) => {
    const k = e.key;
    if ('0123456789+-*/.()'.includes(k)) press(k);
    else if (k === 'Enter' || k === '=') press('=');
    else if (k === 'Backspace') press('←');
    else if (k === 'Escape') press('C');
  });
  wrap.append(disp, grid);
  return wrap;
}

// --- Stopwatch / Timer tools (renderer-only; self-cleaning when detached) ----
function buildStopwatch() {
  const wrap = el('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:12px;align-items:center;justify-content:center;height:100%;padding:16px;background:#f4f6f6;';
  const disp = el('div', null, '00:00.0');
  disp.style.cssText = 'font:600 40px/1 "Consolas",monospace;color:#14302f;letter-spacing:1px;';
  let start = 0, acc = 0, timer = null;
  const fmt = (ms) => { const t = Math.floor(ms / 100), cs = t % 10, sec = Math.floor(t / 10) % 60, min = Math.floor(t / 600) % 60, hr = Math.floor(t / 36000), p = (n) => String(n).padStart(2, '0'); return (hr ? p(hr) + ':' : '') + p(min) + ':' + p(sec) + '.' + cs; };
  const render = () => { disp.textContent = fmt(acc + (start ? Date.now() - start : 0)); };
  const tick = () => { if (!wrap.isConnected) { clearInterval(timer); timer = null; return; } render(); };
  const startBtn = el('button', 'ss-set-btn', L('開始'));
  const resetBtn = el('button', 'ss-set-btn', L('リセット'));
  startBtn.onclick = () => {
    if (timer) { acc += Date.now() - start; start = 0; clearInterval(timer); timer = null; startBtn.textContent = L('開始'); }
    else { start = Date.now(); timer = setInterval(tick, 100); startBtn.textContent = L('停止'); }
    render();
  };
  resetBtn.onclick = () => { clearInterval(timer); timer = null; start = 0; acc = 0; startBtn.textContent = L('開始'); render(); };
  const row = el('div'); row.style.cssText = 'display:flex;gap:8px;'; row.append(startBtn, resetBtn);
  wrap.append(disp, row); render();
  return wrap;
}

function buildTimer() {
  const wrap = el('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:12px;align-items:center;justify-content:center;height:100%;padding:16px;background:#f4f6f6;';
  const disp = el('div', null, '05:00');
  disp.style.cssText = 'font:600 40px/1 "Consolas",monospace;color:#14302f;';
  let remain = 5 * 60 * 1000, end = 0, timer = null;
  const fmt = (ms) => { const sec = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(sec / 60), s2 = sec % 60, p = (n) => String(n).padStart(2, '0'); return p(m) + ':' + p(s2); };
  const render = () => { const ms = end ? end - Date.now() : remain; disp.textContent = fmt(ms); disp.style.color = (end && ms <= 0) ? '#c0392b' : '#14302f'; };
  function beep() { try { const AC = window.AudioContext || window.webkitAudioContext; const ac = new AC(); const o = ac.createOscillator(), g = ac.createGain(); o.connect(g); g.connect(ac.destination); o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.15; o.start(); let n = 0; const iv = setInterval(() => { o.frequency.value = (n % 2 ? 660 : 990); if (++n > 7) { clearInterval(iv); o.stop(); ac.close(); } }, 170); } catch (_) { /* no audio */ } }
  const startBtn = el('button', 'ss-set-btn', L('開始'));
  const tick = () => {
    if (!wrap.isConnected) { clearInterval(timer); timer = null; return; }
    if (end && Date.now() >= end) { clearInterval(timer); timer = null; remain = 0; end = 0; render(); beep(); toast(L('タイマー終了')); startBtn.textContent = L('開始'); return; }
    render();
  };
  startBtn.onclick = () => {
    if (timer) { remain = Math.max(0, end - Date.now()); end = 0; clearInterval(timer); timer = null; startBtn.textContent = L('開始'); }
    else { if (remain <= 0) return; end = Date.now() + remain; timer = setInterval(tick, 200); startBtn.textContent = L('停止'); }
    render();
  };
  const resetBtn = el('button', 'ss-set-btn', L('リセット'));
  resetBtn.onclick = () => { clearInterval(timer); timer = null; end = 0; remain = 5 * 60 * 1000; startBtn.textContent = L('開始'); render(); };
  const adj = (secs) => () => { if (timer) return; remain = Math.min(99 * 60 * 1000, Math.max(0, remain + secs * 1000)); render(); };
  const adjRow = el('div'); adjRow.style.cssText = 'display:flex;gap:6px;';
  [['-1m', -60], ['-10s', -10], ['+10s', 10], ['+1m', 60]].forEach(([lbl, sec]) => { const b = el('button', 'ss-set-btn', lbl); b.onclick = adj(sec); adjRow.append(b); });
  const row = el('div'); row.style.cssText = 'display:flex;gap:8px;'; row.append(startBtn, resetBtn);
  wrap.append(disp, adjRow, row); render();
  return wrap;
}

function buildBookmarks() {
  const wrap = el('div', 'ss-bm');
  const search = document.createElement('input');
  search.className = 'ss-bm-search';
  search.placeholder = L('ブックマークを絞り込み…');
  const list = el('ul', 'ss-bm-list');
  wrap.append(search, list);
  let all = [];
  function render(q) {
    list.innerHTML = '';
    const ql = (q || '').toLowerCase();
    const f = all.filter((b) => !ql || (b.title + ' ' + b.url + ' ' + b.folder).toLowerCase().includes(ql));
    if (!f.length) { list.innerHTML = L('<li class="ss-bm-empty">（ブックマークが見つかりません）</li>'); return; }
    for (const b of f) {
      const li = el('li', 'ss-bm-item');
      li.title = b.url + '  [' + b.browser + '] ' + b.folder;
      li.append(el('span', 'ss-bm-title', b.title || b.url), el('span', 'ss-bm-folder', b.folder));
      li.onclick = () => window.system.external(b.url);
      list.appendChild(li);
    }
  }
  search.oninput = () => render(search.value);
  window.system.bookmarks().then((b) => { all = b || []; render(''); });
  return wrap;
}

function buildCamera(tab) {
  const wrap = el('div', 'ss-cam');
  const barEl = el('div', 'ss-cam-bar');
  const reload = el('button', 'ss-set-btn', L('再接続'));
  barEl.append(reload);
  const video = document.createElement('video');
  video.className = 'ss-cam-video';
  video.autoplay = true;
  video.playsInline = true;
  video.controls = true;
  video.muted = !!tab.muted;
  wrap.append(barEl, video);

  function msg(text) {
    const m = wrap.querySelector('.ss-cam-msg');
    if (m) m.remove();
    wrap.appendChild(el('div', 'ss-cam-msg', text));
  }
  async function start() {
    if (!tab.rtsp) { msg(L('設定で RTSP URL を入力してください')); return; }
    const r = await window.camera.url(tab.rtsp);
    if (r.error) {
      msg(r.error === 'no-ffmpeg' ? L('ffmpeg が見つかりません（npm install を実行）') : L('RTSP URL が不正です（rtsp://… 形式）'));
      return;
    }
    const m = wrap.querySelector('.ss-cam-msg'); if (m) m.remove();
    video.src = r.url;
    video.play().catch(() => {});
  }
  reload.onclick = start;
  start();
  return wrap;
}

// --- Clip (temporary holding) ----------------------------------------------
function addClip(item) {
  const clips = Store.getClips();
  item.id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  clips.push(item);
  Store.saveClips(clips);
  return item.id;
}

// Add real filesystem paths (from the native picker, or a drop) to the clip.
// Reliable everywhere — macOS transparent windows can't receive file drops, so
// the picker is the primary intake there.
async function addFilePaths(paths) {
  const ids = [];
  for (const p of (paths || [])) {
    if (!p) continue;
    const st = await window.files.stat(p);
    if (st.error) continue;
    if (st.isDir) ids.push(addClip({ kind: 'folder', path: p, label: st.name }));
    else ids.push(addClip({ kind: 'file', path: p, label: st.name, viewer: viewerForExt(st.ext) }));
  }
  if (ids.length) { refreshClipUI(); toast(L('クリップに追加しました') + ' (' + ids.length + ')'); }
  return ids;
}

async function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  const dt = e.dataTransfer;
  if ([...(dt.types || [])].includes('ss-tab')) return []; // internal reorder, not intake

  // ②: dropped directly onto a folder-type bar button -> straight into that folder.
  const btnEl = e.target && e.target.closest ? e.target.closest('.ss-btn[data-id]') : null;
  if (btnEl) {
    const t = tabs.find((x) => x.id === btnEl.dataset.id);
    if (t && t.type === 'folder' && t.path) { await dropIntoFolder(dt, t.path); return []; }
  }

  const ids = [];
  const uriList = (dt.getData('text/uri-list') || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const plain = (dt.getData('text/plain') || '').trim();
  const url = uriList.find((l) => /^https?:\/\//i.test(l)) || (/^https?:\/\//i.test(plain) ? plain : '');
  if (url && (!dt.files || !dt.files.length)) { ids.push(addClip({ kind: 'url', url, label: url })); }

  for (const f of (dt.files || [])) {
    const p = window.overlay.getPathForFile(f);
    if (!p) continue;
    const st = await window.files.stat(p);
    if (st.error) continue;
    if (st.isDir) ids.push(addClip({ kind: 'folder', path: p, label: st.name }));
    else ids.push(addClip({ kind: 'file', path: p, label: st.name, viewer: viewerForExt(st.ext) }));
  }

  // Plain selected text (not a URL, no files) -> a text snippet.
  if (!url && plain && (!dt.files || !dt.files.length)) {
    ids.push(addClip({ kind: 'text', text: plain, label: plain.replace(/\s+/g, ' ').slice(0, 40) }));
  }

  if (ids.length) { refreshClipUI(); toast(L('クリップに追加しました') + ' (' + ids.length + ')'); }
  else if ((dt.files && dt.files.length) || uriList.length || plain) { toast(L('ドロップを受け取れませんでした（パスを取得できませんでした）')); }
  return ids;
}

// --- Phase 2: drag-intake box picker (Windows) + folder-button drop ---------
// The transparent overlay only receives drag events where it's hit-testable, so
// while an external drag is in flight we flip the whole window to capture (see
// pushHit) and float a strip of "boxes" just under the bar. Dropping on a box
// files the item there; dropping anywhere else (or leaving) keeps it in Clip.
// macOS can't receive window drops at all -> Windows only.
const IS_WIN = (window.overlay && window.overlay.platform) === 'win32';
let dragIntake = false;
let pickerEl = null;
let pickerBoxes = [];
let pickerShown = false; // a picker was shown during the current drag

function isExternalDrag(dt) {
  const types = [...((dt && dt.types) || [])];
  if (types.includes('ss-tab')) return false;
  return types.includes('Files') || types.includes('text/uri-list') || types.includes('text/plain');
}

// Write dropped content into a folder (files copied; url/text saved as a note).
// All dataTransfer reads happen synchronously up front (it's neutered after an await).
async function dropIntoFolder(dt, dir) {
  const paths = [];
  for (const f of (dt.files || [])) { const p = window.overlay.getPathForFile(f); if (p) paths.push(p); }
  const uriList = (dt.getData('text/uri-list') || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const plain = (dt.getData('text/plain') || '').trim();
  const url = uriList.find((l) => /^https?:\/\//i.test(l)) || (/^https?:\/\//i.test(plain) ? plain : '');
  let n = 0;
  for (const p of paths) { const r = await window.files.copyTo(p, dir); if (!(r && r.error)) n++; }
  if (!paths.length && url) { await window.files.writePath(scrapJoin(dir, scrapSanit(url) + '.md'), '# ' + url + '\n\n' + url); n++; }
  else if (!paths.length && plain) { await window.files.writePath(scrapJoin(dir, scrapSanit(plain.split('\n')[0]) + '.md'), plain); n++; }
  if (n) toast(L('フォルダへ保存しました') + ' (' + n + ')');
  return n;
}

function makePickerChip(label, action) {
  const c = el('div', 'ss-picker-chip', label);
  c.addEventListener('dragover', (ev) => { ev.preventDefault(); ev.stopPropagation(); c.classList.add('over'); });
  c.addEventListener('dragleave', () => c.classList.remove('over'));
  c.addEventListener('drop', async (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    // Intake to Clip first (instant, never lost), then move if a box was targeted.
    const ids = await handleDrop(ev);
    if (action === 'drawer') {
      const clips = Store.getClips();
      ids.forEach((id) => { const it = clips.find((x) => x.id === id); if (it) promoteClip(it); });
    } else if (action.indexOf('box:') === 0) {
      const b = pickerBoxes[Number(action.slice(4))];
      if (b) { const clips = Store.getClips(); for (const id of ids) { const it = clips.find((x) => x.id === id); if (it) await moveClipToBox(it, b.path); } }
    }
    closePicker();
    pickerShown = false;
    clearDragFx();
  });
  return c;
}

function positionPicker() {
  if (!pickerEl) return;
  const w = pickerEl.offsetWidth || 200;
  pickerEl.style.left = Math.max(MARGIN, Math.min((window.innerWidth - w) / 2, window.innerWidth - w - MARGIN)) + 'px';
}

function openPicker() {
  return; // disabled (see drag listeners) — kept for a future, safer re-implementation
  /* eslint-disable no-unreachable */
  if (pickerEl) return;
  dragIntake = true;
  pickerShown = true;
  const p = el('div', 'ss-picker ss-interactive');
  pickerEl = p;
  p.appendChild(makePickerChip('📎 ' + L('クリップ'), 'clip'));
  p.appendChild(makePickerChip(L('➕ ドロワー'), 'drawer'));
  document.body.appendChild(p);
  positionPicker();
  reflowHeight();
  scrapBoxes().then((boxes) => {
    if (!pickerEl) return;
    pickerBoxes = boxes;
    boxes.forEach((b, i) => p.appendChild(makePickerChip('📁 ' + b.name, 'box:' + i)));
    positionPicker();
    reflowHeight();
  });
}

function closePicker() {
  if (!pickerEl) return;
  pickerEl.remove();
  pickerEl = null;
  dragIntake = false;
  pickerBoxes = [];
  reflowHeight();
}

// Post-drop native popup: file the just-added clips into a box. Used on macOS
// (tray intake has no in-flight picker) and as a Windows fallback when the
// drag-intake picker didn't show. Dismiss = keep in Clip.
async function offerBoxMenu(ids) {
  if (!ids || !ids.length) return;
  if (!Store.getDropMenu()) return;
  const boxes = await scrapBoxes();
  const items = boxes.map((b, i) => ({ id: 'box:' + i, label: '📁 ' + b.name }));
  if (boxes.length) items.push({ separator: true });
  items.push({ id: 'newbox', label: L('📁 フォルダを選んで保存…') });
  items.push({ id: 'drawer', label: L('➕ ドロワーとして追加') });
  // (dismiss the menu = keep it in Clip)
  const action = await window.system.menu(items);
  if (!action) return;
  const clips = Store.getClips();
  const picked = ids.map((id) => clips.find((x) => x.id === id)).filter(Boolean);
  if (!picked.length) return;
  if (action === 'drawer') { picked.forEach((it) => promoteClip(it)); return; }
  if (action === 'newbox') { const dir = await window.files.pickFolder(); if (dir) for (const it of picked) await moveClipToBox(it, dir); return; }
  if (action.indexOf('box:') === 0) { const b = boxes[Number(action.slice(4))]; if (b) for (const it of picked) await moveClipToBox(it, b.path); }
}

let clipListEl = null; // the currently-open clip list, if any
function refreshClipUI() { if (clipListEl) renderClipList(clipListEl); }

function renderClipList(list) {
  list.innerHTML = '';
  const clips = Store.getClips();
  if (!clips.length) { list.innerHTML = L('<li class="ss-clip-empty">（空です）ここやバーにドラッグ＆ドロップ</li>'); return; }
  clips.forEach((it, idx) => {
    const li = el('li', 'ss-clip-row' + (it.temp ? ' temp' : ''));

    let ico;
    if (it.kind === 'file' && it.viewer === 'image') {
      ico = document.createElement('img');
      ico.className = 'ss-clip-thumb';
      window.files.serve(it.path).then((u) => { ico.src = u; });
    } else {
      const emoji = it.kind === 'url' ? '🔗' : it.kind === 'folder' ? '📁' : it.kind === 'text' ? '✂' : (it.viewer ? viewerIcon(it.viewer) : '📦');
      ico = el('span', 'ss-clip-ico', emoji);
      if (it.kind === 'file') window.files.icon(it.path).then((u) => {
        if (!u) return;
        const img = document.createElement('img');
        img.className = 'ss-clip-iconimg';
        img.src = u;
        ico.replaceWith(img);
      });
    }
    const grip = el('span', 'ss-clip-grip', '⠿');
    grip.draggable = true; grip.title = L('ドラッグで箱へ移動');
    grip.addEventListener('dragstart', (ev) => { ev.dataTransfer.setData('ss-clip-move', it.id); ev.dataTransfer.effectAllowed = 'move'; });
    li.append(grip, ico, el('span', 'ss-clip-name', it.label));
    li.title = it.url || it.path || (it.text ? it.text.slice(0, 80) : '');
    li.addEventListener('click', () => openClipItem(it));
    if (it.kind === 'file') {
      li.draggable = true;
      li.addEventListener('dragstart', (ev) => { ev.preventDefault(); window.files.startDrag(it.path); });
    }

    const acts = el('span', 'ss-clip-actions');
    const mk = (label, title, fn, cls) => { const b = el('button', 'ss-clip-act' + (cls || ''), label); b.title = title; b.onclick = (ev) => { ev.stopPropagation(); fn(); }; return b; };
    acts.append(
      mk('▲', L('上へ'), () => moveClip(idx, -1, list)),
      mk('▼', L('下へ'), () => moveClip(idx, 1, list)),
      mk('⏱', L('一時的（再起動で消す）'), () => toggleTemp(it.id, list), it.temp ? ' on' : ''),
      mk('📂', L('箱へ移動'), () => openBoxMenu(it, li, list)),
      mk('📌', L('バーに固定'), () => promoteClip(it)),
      mk('×', L('削除'), () => { Store.saveClips(Store.getClips().filter((c) => c.id !== it.id)); renderClipList(list); }, ' ss-clip-x'),
    );
    li.append(acts);
    list.appendChild(li);
  });
}

function moveClip(idx, dir, list) {
  const clips = Store.getClips();
  const j = idx + dir;
  if (j < 0 || j >= clips.length) return;
  [clips[idx], clips[j]] = [clips[j], clips[idx]];
  Store.saveClips(clips);
  renderClipList(list);
}

function toggleTemp(id, list) {
  const clips = Store.getClips();
  const c = clips.find((x) => x.id === id);
  if (c) { c.temp = !c.temp; Store.saveClips(clips); renderClipList(list); }
}

function openClipItem(it) {
  const anchor = document.querySelector('.ss-clip-btn') || document.getElementById('bar');
  const id = 'clip-' + it.id;
  if (it.kind === 'url') openTab({ id, label: it.label.slice(0, 18), icon: '🔗', type: 'page', url: it.url, mobile: false, width: 540 }, anchor);
  else if (it.kind === 'folder') openTab({ id, label: it.label, icon: '📁', type: 'folder', path: it.path, width: 460 }, anchor);
  else if (it.kind === 'text') openTab({ id, label: it.label || L('テキスト'), icon: '✂', type: 'snippet', text: it.text, width: 420 }, anchor);
  else if (it.kind === 'file') {
    if (it.viewer) openTab({ id, label: it.label, icon: viewerIcon(it.viewer), type: 'viewer', viewer: it.viewer, path: it.path, width: 560 }, anchor);
    else window.files.open(it.path);
  }
}

// Promote a clip item to a permanent bar button (added to the saved tabs).
function promoteClip(it) {
  const id = 'p' + Date.now().toString(36);
  let tab = null;
  if (it.kind === 'url') tab = { id, label: it.label.slice(0, 16), icon: '🔗', type: 'page', url: it.url, mobile: false, width: 540 };
  else if (it.kind === 'folder') tab = { id, label: it.label, icon: '📁', type: 'folder', path: it.path, width: 460 };
  else if (it.kind === 'text') tab = { id, label: (it.label || L('メモ')).slice(0, 16), icon: '✂', type: 'snippet', text: it.text, width: 420 };
  else if (it.kind === 'file') {
    tab = it.viewer
      ? { id, label: it.label, icon: viewerIcon(it.viewer), type: 'viewer', viewer: it.viewer, path: it.path, width: 560 }
      : { id, label: it.label, icon: '📦', type: 'launch', path: it.path, width: 320 };
  }
  if (!tab) return;
  const cur = JSON.parse(JSON.stringify(tabs));
  cur.push(tab);
  Store.saveTabs(cur);
  tabs = cur;
  Store.saveClips(Store.getClips().filter((c) => c.id !== it.id)); // move out of the clip
  renderBar();
  refreshClipUI();
}

// --- Other monitors' drawers -----------------------------------------------
function readProfile(id) {
  try {
    let s = JSON.parse(localStorage.getItem('ss.tabs.' + id));
    if (!(Array.isArray(s) && s.length)) s = JSON.parse(localStorage.getItem('ss.tabs'));
    return Array.isArray(s) && s.length ? s : defaultTabs();
  } catch (_) { return defaultTabs(); }
}
function otherProfileIds(connectedIds) {
  const ids = [];
  for (let i = 0; i < localStorage.length; i++) {
    const m = (localStorage.key(i) || '').match(/^ss\.tabs\.(.+)$/);
    if (m && m[1] !== MY_DISPLAY && !connectedIds.includes(m[1])) ids.push(m[1]);
  }
  return ids;
}
function buildOthersPanel() {
  const wrap = el('div', 'ss-others');
  window.overlay.getDisplays().then((list) => {
    const connected = list || [];
    const connIds = connected.map((d) => String(d.id));
    const groups = [];
    connected.forEach((d) => { if (String(d.id) !== MY_DISPLAY) groups.push({ id: String(d.id), name: d.label, items: readProfile(d.id) }); });
    otherProfileIds(connIds).forEach((id) => groups.push({ id, name: L('モニタ（未接続）'), items: readProfile(id) }));

    wrap.innerHTML = '';
    if (!groups.length) { wrap.append(el('div', 'ss-others-empty', L('他のモニタはありません'))); return; }
    const anchor = () => document.querySelector('.ss-others-btn') || document.getElementById('bar');
    for (const g of groups) {
      wrap.append(el('div', 'ss-others-head', g.name));
      const listEl = el('div', 'ss-others-list');
      g.items.forEach((it) => {
        const b = el('button', 'ss-others-item');
        b.append(el('span', 'ss-ico', it.icon || '🔖'), el('span', null, it.label || ''));
        b.onclick = () => {
          if (it.type === 'launch') window.files.open(it.path);
          else openTab({ ...it, id: 'other-' + g.id + '-' + it.id }, anchor());
        };
        listEl.appendChild(b);
      });
      wrap.append(listEl);
    }
  });
  return wrap;
}

// --- Clip + Boxes (unified inbox / organizer) ------------------------------
// Clip = the default, zero-config, in-app box (localStorage). Folder "boxes"
// live under a user-chosen root (point it at a Drive sync folder for cloud
// backup) and store notes as .md files / copied files. Drop on the bar -> Clip;
// sort into boxes from this panel.
function scrapSanit(x) { return String(x || '').replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || 'note'; }
function scrapJoin(a, b) { const sep = a.indexOf('\\') >= 0 ? '\\' : '/'; return a.replace(/[\\/]+$/, '') + sep + b; }
async function scrapBoxes() {
  const root = Store.getScrapRoot();
  if (!root) return [];
  const res = await window.files.list(root);
  return ((res && res.entries) || []).filter((e) => e.isDir).map((e) => ({ name: e.name, path: e.path }));
}
async function ensureScrapRoot() {
  const root = Store.getScrapRoot();
  if (root) return root;
  const d = await window.files.pickFolder();
  if (d) { Store.setScrapRoot(d); return d; }
  return '';
}
async function moveClipToBox(it, boxPath) {
  try {
    if (it.kind === 'file') { const r = await window.files.copyTo(it.path, boxPath); if (r && r.error) throw new Error(r.error); }
    else if (it.kind === 'folder') { await window.files.writePath(scrapJoin(boxPath, scrapSanit(it.label) + '.txt'), it.path); }
    else {
      const text = it.kind === 'url' ? it.url : (it.text || '');
      const name = scrapSanit((it.label || text).split('\n')[0]) + '.md';
      await window.files.writePath(scrapJoin(boxPath, name), it.kind === 'url' ? ('# ' + (it.label || it.url) + '\n\n' + it.url) : text);
    }
    Store.saveClips(Store.getClips().filter((c) => c.id !== it.id));
    toast(L('箱へ移動しました'));
    refreshClipUI();
  } catch (_) { toast(L('移動できませんでした')); }
}
function openBoxMenu(it, row, list) {
  scrapBoxes().then((boxes) => {
    if (!boxes.length) { toast(L('先に📎パネルで箱を作成してください')); return; }
    const sel = document.createElement('select'); sel.className = 'ss-set-type';
    sel.appendChild(el('option', null, L('箱へ移動…')));
    boxes.forEach((b) => { const o = el('option', null, '📁 ' + b.name); o.value = b.path; sel.appendChild(o); });
    sel.onchange = () => { if (sel.value) moveClipToBox(it, sel.value); };
    sel.addEventListener('blur', () => setTimeout(() => { if (sel.parentNode) sel.remove(); }, 150));
    row.appendChild(sel); sel.focus();
  });
}

function buildClipPanel() {
  const wrap = el('div', 'ss-clip-bin');
  wrap.style.cssText = 'height:100%;display:flex;flex-direction:row;min-height:0';
  const rail = el('div'); rail.style.cssText = 'width:34%;max-width:180px;border-right:1px solid #e3eded;overflow:auto;padding:6px;background:#f6fafa';
  const content = el('div'); content.style.cssText = 'flex:1;display:flex;flex-direction:column;min-width:0;min-height:0';
  wrap.append(rail, content);
  let cur = 'clip';
  async function renderRail() {
    rail.innerHTML = '';
    const clipB = el('div', null, '📎 ' + L('クリップ'));
    clipB.style.cssText = 'padding:6px 8px;border-radius:6px;cursor:pointer' + (cur === 'clip' ? ';background:#d7ecec;font-weight:700' : '');
    clipB.onclick = () => { cur = 'clip'; renderRail(); renderContent(); };
    rail.appendChild(clipB);
    const boxes = await scrapBoxes();
    boxes.forEach((b) => {
      const d = el('div', null, '📁 ' + b.name);
      d.style.cssText = 'padding:6px 8px;border-radius:6px;cursor:pointer' + (cur === b.path ? ';background:#d7ecec;font-weight:700' : '');
      d.onclick = () => { cur = b.path; renderRail(); renderContent(); };
      d.addEventListener('dragover', (ev) => { if ([...(ev.dataTransfer.types || [])].includes('ss-clip-move')) { ev.preventDefault(); d.style.outline = '2px solid #1f9f9f'; } });
      d.addEventListener('dragleave', () => { d.style.outline = ''; });
      d.addEventListener('drop', async (ev) => { ev.preventDefault(); d.style.outline = ''; const id = ev.dataTransfer.getData('ss-clip-move'); if (!id) return; const it = Store.getClips().find((c) => c.id === id); if (it) { await moveClipToBox(it, b.path); renderRail(); renderContent(); } });
      rail.appendChild(d);
    });
    const row = el('div'); row.style.cssText = 'display:flex;gap:4px;margin-top:8px';
    const inp = document.createElement('input'); inp.placeholder = L('新しい箱'); inp.style.cssText = 'flex:1;min-width:0;border:1px solid #cfdede;border-radius:5px;padding:4px 6px';
    const ab = el('button', 'ss-set-btn', '＋');
    ab.onclick = async () => { if (!inp.value.trim()) return; const root = await ensureScrapRoot(); if (!root) return; const p = scrapJoin(root, scrapSanit(inp.value)); await window.files.mkdir(p); inp.value = ''; cur = p; await renderRail(); renderContent(); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ab.click(); });
    row.append(inp, ab); rail.appendChild(row);
    if (Store.getScrapRoot()) {
      const chg = el('button', 'ss-set-btn', L('保存先')); chg.style.cssText += ';margin-top:6px;width:100%;font-size:11px'; chg.title = Store.getScrapRoot();
      chg.onclick = async () => { const d = await window.files.pickFolder(); if (d) { Store.setScrapRoot(d); cur = 'clip'; renderRail(); renderContent(); } };
      rail.appendChild(chg);
    }
  }
  function renderContent() {
    content.innerHTML = '';
    content.appendChild(cur === 'clip' ? buildClipBox() : buildFolderBox(cur));
  }
  renderRail(); renderContent();
  return wrap;
}

function buildClipBox() {
  const box = el('div'); box.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:0';
  const list = el('ul', 'ss-clip-list');
  const head = el('div', 'ss-clip-head');
  const clear = el('button', 'ss-set-btn', L('全クリア'));
  clear.onclick = () => { if (Store.getClips().length) { Store.saveClips([]); renderClipList(list); } };
  const addFileBtn = el('button', 'ss-set-btn', L('＋ ファイル'));
  addFileBtn.onclick = async () => { await addFilePaths(await window.files.pickFiles()); };
  const addFolderBtn = el('button', 'ss-set-btn', L('＋ フォルダ'));
  addFolderBtn.onclick = async () => { const d = await window.files.pickFolder(); if (d) await addFilePaths([d]); };
  head.append(el('span', 'ss-clip-hint', L('＋で追加（D&D可：Win/常に表示）')), addFileBtn, addFolderBtn, clear);
  box.append(head, list);
  const stop = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
  ['dragenter', 'dragover'].forEach((ev) => box.addEventListener(ev, (e) => { stop(e); box.classList.add('over'); }));
  ['dragleave', 'dragend'].forEach((ev) => box.addEventListener(ev, (e) => { stop(e); box.classList.remove('over'); }));
  box.addEventListener('drop', (e) => { box.classList.remove('over'); handleDrop(e); });
  clipListEl = list;
  renderClipList(list);
  return box;
}

function buildFolderBox(boxPath) {
  const box = el('div'); box.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:0';
  const notes = el('div'); notes.style.cssText = 'max-height:42%;overflow:auto;border-bottom:1px solid #e3eded;padding:6px';
  const ed = document.createElement('textarea'); ed.style.cssText = 'flex:1;border:0;outline:none;resize:none;padding:10px;font:13px/1.6 Consolas,monospace;color:#23323a';
  ed.placeholder = L('ノートを選択、またはここにドラッグ＆ドロップ');
  box.append(notes, ed);
  let curNote = null, saveTimer = null;
  async function loadNotes() {
    notes.innerHTML = '';
    const nn = el('button', 'ss-set-btn', L('＋ ノート')); nn.style.cssText += ';margin-bottom:6px'; nn.onclick = () => newNote(''); notes.appendChild(nn);
    const res = await window.files.list(boxPath);
    const entries = ((res && res.entries) || []).filter((e) => e.isFile);
    if (!entries.length) { const m = el('div', null, L('（ノートなし）')); m.style.cssText = 'color:#9ab;padding:4px 8px'; notes.appendChild(m); }
    entries.forEach((fl) => {
      const isText = /\.(md|txt)$/i.test(fl.name);
      const r = el('div', null, (isText ? '📝 ' : '📎 ') + fl.name.replace(/\.(md|txt)$/i, ''));
      r.style.cssText = 'padding:5px 8px;border-radius:6px;cursor:pointer' + (fl.path === curNote ? ';background:#eef6f6;font-weight:700' : '');
      r.onclick = () => { if (isText) openNote(fl.path); else window.files.open(fl.path); };
      notes.appendChild(r);
    });
  }
  async function openNote(p) { curNote = p; const t = await window.files.readText(p); ed.value = typeof t === 'string' ? t : ''; loadNotes(); ed.focus(); }
  async function newNote(text) {
    const base = scrapSanit((text || '').split('\n')[0]);
    let name = base + '.md';
    const res = await window.files.list(boxPath);
    const names = ((res && res.entries) || []).map((e) => e.name.toLowerCase());
    if (names.includes(name.toLowerCase())) name = base + '-' + Date.now().toString(36) + '.md';
    const p = scrapJoin(boxPath, name);
    await window.files.writePath(p, text || '');
    curNote = p; await loadNotes(); ed.value = text || ''; ed.focus();
  }
  ed.addEventListener('input', () => { if (!curNote) return; clearTimeout(saveTimer); saveTimer = setTimeout(() => window.files.writePath(curNote, ed.value), 600); });
  ['dragenter', 'dragover'].forEach((ev) => box.addEventListener(ev, (e) => { e.preventDefault(); }));
  box.addEventListener('drop', async (e) => {
    e.preventDefault(); e.stopPropagation();
    const dt = e.dataTransfer;
    if ([...(dt.types || [])].includes('ss-tab')) return;
    if (dt.files && dt.files.length) { for (const fo of dt.files) { const p = window.overlay.getPathForFile(fo); if (p) await window.files.copyTo(p, boxPath); } await loadNotes(); toast(L('箱へ保存しました')); return; }
    const uri = (dt.getData('text/uri-list') || '').split('\n').map((x) => x.trim()).filter(Boolean);
    const plain = (dt.getData('text/plain') || '').trim();
    if (uri.length || /^https?:\/\//i.test(plain)) await newNote('# ' + (uri[0] || plain) + '\n\n' + (uri[0] || plain));
    else if (plain) await newNote(plain);
  });
  loadNotes();
  return box;
}

// --- File viewer drawer ----------------------------------------------------
function buildViewer(tab) {
  const wrap = el('div', 'ss-viewer');
  if (!tab.path) { wrap.append(el('div', 'ss-viewer-msg', L('ファイルがありません'))); return wrap; }
  if (tab.viewer === 'text') {
    const pre = document.createElement('pre');
    pre.className = 'ss-viewer-text';
    wrap.appendChild(pre);
    window.files.readText(tab.path).then((t) => { pre.textContent = t; });
    return wrap;
  }
  window.files.serve(tab.path).then((url) => {
    let node;
    if (tab.viewer === 'image') { node = document.createElement('img'); node.className = 'ss-viewer-img'; node.src = url; }
    else if (tab.viewer === 'video') { node = document.createElement('video'); node.className = 'ss-viewer-media'; node.src = url; node.controls = true; }
    else if (tab.viewer === 'audio') { node = document.createElement('audio'); node.className = 'ss-viewer-audio'; node.src = url; node.controls = true; }
    else if (tab.viewer === 'pdf') { node = document.createElement('iframe'); node.className = 'ss-viewer-frame'; node.src = url; }
    else if (tab.viewer === 'html') { node = makeWebview(url, false, 'persist:smartsuite'); }
    if (node) wrap.appendChild(node);
  });
  return wrap;
}

function buildSnippet(tab) {
  const wrap = el('div', 'ss-editor');
  const barEl = el('div', 'ss-editor-bar');
  const copy = el('button', 'ss-set-btn', L('コピー'));
  const ta = document.createElement('textarea');
  ta.className = 'ss-editor-area';
  ta.value = tab.text || '';
  copy.onclick = () => { ta.select(); try { document.execCommand('copy'); } catch (_) {} };
  barEl.append(copy);
  wrap.append(barEl, ta);
  return wrap;
}

function buildClipboard() {
  const wrap = el('div', 'ss-clip');
  const barEl = el('div', 'ss-clip-bar');
  const refresh = el('button', 'ss-set-btn', L('更新'));
  const content = el('div', 'ss-clip-content');
  async function load() {
    const data = await window.system.clipboard();
    content.innerHTML = '';
    if (data.image) {
      const img = document.createElement('img');
      img.className = 'ss-clip-img';
      img.src = data.image;
      content.appendChild(img);
    } else {
      const pre = document.createElement('pre');
      pre.className = 'ss-clip-text';
      pre.textContent = data.text || L('（クリップボードは空です）');
      content.appendChild(pre);
    }
  }
  refresh.onclick = load;
  barEl.append(refresh);
  wrap.append(barEl, content);
  load();
  return wrap;
}


// --- Demo mode: sample (fake) content so recordings show no personal data ----
function buildDemo(tab) {
  const t = tab.type;
  if (!['page', 'tabs', 'split', 'files', 'folder', 'clip'].includes(t)) return null; // tools etc. are safe as-is
  const wrap = el('div'); wrap.style.cssText = 'height:100%;display:flex;flex-direction:column;background:#fff';
  const hd = el('div'); hd.style.cssText = 'height:28px;display:flex;align-items:center;gap:8px;padding:0 12px;background:linear-gradient(#2e8b8b,#1f6f6f);color:#eafafa;font:700 12px "Segoe UI",sans-serif';
  hd.textContent = (tab.icon || '🌐') + ' ' + (tab.label || '');
  const tag = el('span', null, 'SAMPLE'); tag.style.cssText = 'margin-left:auto;font-size:10px;background:rgba(255,255,255,.25);padding:1px 6px;border-radius:8px';
  hd.appendChild(tag);
  const bd = el('div'); bd.style.cssText = 'flex:1;overflow:auto;padding:12px;font:13px "Segoe UI",sans-serif;color:#33484a';
  wrap.append(hd, bd);
  const id = (tab.id || '').toLowerCase();
  if (t === 'files' || t === 'folder') demoFiles(bd);
  else if (t === 'clip') demoClip(bd);
  else if (/mail/.test(id)) demoMail(bd);
  else if (/cal/.test(id)) demoCal(bd);
  else if (/web|article/.test(id)) demoArticle(bd);
  else if (/keep|memo|note/.test(id)) demoNotes(bd);
  else demoGeneric(bd, tab.icon || '🌐', tab.label || 'App');
  return wrap;
}
function demoMail(bd) {
  bd.style.cssText += ';padding:0;background:#fff';
  const rows = [
    ['G', '#d93025', 'Google', 'Security alert', 'New sign-in on Windows', '9:24', true],
    ['A', '#1a73e8', 'Acme Team', 'Weekly report', 'Here are this week numbers and the plan', '8:10', true],
    ['S', '#188038', 'Sara', 'Lunch plans?', 'Are we still on for 12:30 today', 'Wed', false],
    ['B', '#9334e6', 'Billing', 'Invoice #1042', 'Your receipt is attached', 'Tue', false],
    ['D', '#e37400', 'DeskHatch', 'Welcome aboard', 'Slam to the top to get started 🎉', 'Mon', false],
  ];
  bd.innerHTML = '<div style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-bottom:1px solid #eef2f2">'
    + '<span style="border:none;background:#c2e7ff;border-radius:16px;padding:8px 16px;font-weight:700;color:#001d35">✎ ' + L('作成') + '</span>'
    + '<div style="flex:1;background:#eef3f4;border-radius:18px;padding:7px 14px;color:#5f6368;font-size:13px">🔍 ' + L('メールを検索') + '</div></div>'
    + rows.map((r) => '<div style="display:flex;gap:10px;align-items:center;padding:9px 10px;border-bottom:1px solid #f1f3f4;background:' + (r[6] ? '#fff' : '#fafafa') + '">'
      + '<span style="color:#dadce0">☆</span>'
      + '<div style="width:30px;height:30px;border-radius:50%;background:' + r[1] + ';color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px">' + r[0] + '</div>'
      + '<div style="width:118px;font-weight:' + (r[6] ? '700' : '400') + ';color:#202124;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + r[2] + '</div>'
      + '<div style="flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis"><span style="font-weight:' + (r[6] ? '700' : '400') + ';color:#202124">' + r[3] + '</span> <span style="color:#5f6368">— ' + r[4] + '</span></div>'
      + '<div style="color:#5f6368;font-size:12px">' + r[5] + '</div></div>').join('');
}
function demoArticle(bd) {
  bd.style.cssText += ';padding:16px 22px;font:15px/1.9 Georgia,serif;color:#222;background:#fff';
  bd.innerHTML = '<h2 style="font-size:20px;margin:0 0 10px">Sample Article</h2>'
    + '<p>DeskHatch keeps your tools one slam to the top away.</p>'
    + '<p>You just added this page as a drawer — clicking the button shows the same page, right here.</p>'
    + '<p style="color:#1a7a5a">— a dummy web page —</p>';
}
function demoCal(bd) {
  bd.style.cssText += ';padding:10px;background:#fff';
  let g = '<div style="display:flex;align-items:center;margin-bottom:8px"><div style="font-weight:700;font-size:15px;color:#202124">June 2026</div><div style="margin-left:auto;color:#5f6368;font-size:16px">‹  ›</div></div>';
  g += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px">';
  ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach((d) => { g += '<div style="text-align:center;font-size:11px;color:#80868b;padding-bottom:2px">' + d + '</div>'; });
  const ev = { 5: ['#1a73e8', '10:00 MTG'], 11: ['#188038', 'Lunch'], 15: ['#e8710a', 'Trip'], 22: ['#9334e6', 'Demo'] };
  for (let c = 1; c <= 35; c++) { const day = c - 2; const today = day === 11; const e = ev[day];
    g += '<div style="min-height:46px;border:1px solid #eef1f1;border-radius:6px;padding:3px;font-size:11px;color:#3c4043;background:' + (today ? '#e8f0fe' : '#fff') + '">'
      + '<div style="text-align:right;' + (today ? 'color:#1a73e8;font-weight:700' : '') + '">' + (day > 0 && day <= 30 ? day : '') + '</div>'
      + (e ? '<div style="margin-top:2px;background:' + e[0] + ';color:#fff;border-radius:3px;padding:1px 4px;font-size:10px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">' + e[1] + '</div>' : '')
      + '</div>';
  }
  g += '</div>'; bd.innerHTML = g;
}
function demoNotes(bd) {
  const notes = [['Shopping', '#fff3bf'], ['Ideas', '#d3f9d8'], ['TODO', '#e7f5ff'], ['Trip', '#ffe8cc']];
  bd.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
    + notes.map((n) => '<div style="background:' + n[1] + ';border-radius:8px;padding:10px;min-height:74px"><div style="font-weight:700;margin-bottom:6px">' + n[0]
      + '</div><div style="height:6px;background:rgba(0,0,0,.08);border-radius:3px;margin:4px 0"></div><div style="height:6px;width:70%;background:rgba(0,0,0,.08);border-radius:3px"></div></div>').join('') + '</div>';
}
function demoFiles(bd) {
  const rows = [['📁', 'Documents'], ['📁', 'Pictures'], ['📁', 'Downloads'], ['📄', 'readme.txt'], ['📄', 'notes.md'], ['🖼', 'photo.png']];
  bd.innerHTML = rows.map((r) => '<div style="display:flex;gap:10px;align-items:center;padding:7px 4px;border-bottom:1px solid #f0f4f4"><span style="font-size:16px">' + r[0] + '</span><span>' + r[1] + '</span></div>').join('');
}
function demoClip(bd) {
  bd.style.padding = '0';
  bd.innerHTML = '<div style="display:flex;height:100%;min-height:180px;font-size:12px">'
    + '<div style="width:38%;border-right:1px solid #e3eded;padding:6px;background:#f6fafa">'
      + ['📎 Clip', '📁 Research', '📁 Recipes', '📁 Obsidian'].map((b, i) => '<div style="padding:6px 8px;border-radius:6px;margin-bottom:2px;' + (i === 0 ? 'background:#d7ecec;font-weight:700' : '') + '">' + b + '</div>').join('')
    + '</div>'
    + '<div style="flex:1;padding:8px">'
      + [['📄', 'report.pdf'], ['🔗', 'example.com/page'], ['✂', 'Meeting notes — sample']].map((r) => '<div style="display:flex;gap:10px;align-items:center;padding:6px 4px;border-bottom:1px solid #f0f4f4"><span style="font-size:14px">' + r[0] + '</span><span>' + r[1] + '</span></div>').join('')
      + '<div style="margin-top:10px;border:1.5px dashed #9cc6c6;border-radius:8px;padding:14px;text-align:center;color:#5c8c8c;background:#f1f8f8">Drop a file · URL · text → pick a box</div>'
    + '</div></div>';
}
function demoGeneric(bd, icon, label) {
  bd.innerHTML = '<div style="text-align:center;padding:18px 8px"><div style="font-size:40px">' + icon + '</div>'
    + '<div style="font-weight:800;font-size:16px;color:#1f6f6f;margin:6px 0 2px">' + label + '</div>'
    + '<div style="color:#8fa8a8;font-size:12px;margin-bottom:14px">Sample preview (demo mode)</div></div>'
    + [82, 64, 90, 70, 50].map((w) => '<div style="height:9px;width:' + w + '%;background:#e7efef;border-radius:4px;margin:9px auto"></div>').join('');
}

// Auto-play: cycle through a few drawers (+ the Clip) for the recording.
function autoDemo() {
  const tabs = window.SS_TABS || [];
  const find = (id) => tabs.find((t) => t.id === id);
  // Narrate what you can DO with it (not the under-the-hood plumbing).
  const steps = [
    { tab: find('mail'), cap: 'メールもカレンダーも、上端からさっと開ける' },
    { tab: find('cal-month'), cap: '予定もワンクリックで確認' },
    { tab: find('gemini') || find('wikipedia'), cap: '好きなWebページをボタンに登録できる' },
    { tab: find('desktop') || find('pc'), cap: 'フォルダも登録して、ここから開ける' },
    { tab: { id: 'demo-calc', label: L('電卓'), icon: '🧮', type: 'tool', tool: 'calc', width: 300 }, cap: '電卓・タイマー・クリップボードなどのアクセサリも' },
    { tab: '__clip', cap: 'スクラップブックでフォルダ分けして整理' },
  ].filter((s) => s.tab);
  const cap = el('div');
  cap.style.cssText = 'position:fixed;left:50%;bottom:26px;transform:translateX(-50%);background:rgba(15,36,35,.92);color:#eafafa;padding:10px 18px;border-radius:22px;font:600 14px "Segoe UI",sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3);z-index:2147483646;max-width:82vw;text-align:center;transition:opacity .3s;opacity:0';
  document.body.appendChild(cap);
  let i = 0, demoTimer = null, stop = false;
  function setCap(text) { cap.style.opacity = '0'; setTimeout(() => { cap.textContent = text; cap.style.opacity = '1'; }, 200); }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { stop = true; if (demoTimer) clearTimeout(demoTimer); cap.remove(); } });
  function step() {
    if (stop || !steps.length) return;
    const s = steps[i % steps.length]; i += 1;
    if (s.tab === '__clip') { const b = bar.querySelector('.ss-clip-btn'); if (b) openTab(CLIP_TAB, b); }
    else { const btn = bar.querySelector('.ss-btn[data-id="' + s.tab.id + '"]') || bar; openTab(s.tab, btn); }
    setCap(L(s.cap));
    demoTimer = setTimeout(step, 2800);
  }
  step();
}

// ===========================================================================
// Guided "stage" demo (DEMO mode): a scripted, fully-faked walkthrough that
// plays on a fullscreen fake desktop with a puppet cursor. It shows what you
// can DO — open mail/calendar, add a web page / folder as a drawer, add a timer
// accessory, and scrap selected text into a box. Nothing here touches real data
// or windows; Esc or the ✕ button ends it. Only runs when ss.demo is on.
// ===========================================================================
function demoBarTabs() {
  return [
    { id: 'd-mail', label: L('メール'), icon: '✉', type: 'page', url: '#', width: 680 },
    { id: 'd-cal', label: L('カレンダー'), icon: '📅', type: 'page', url: '#', width: 600 },
    { id: 'd-meet', label: 'Meet', icon: '🎥', type: 'page', url: '#', width: 460 },
    { id: 'd-todo', label: 'ToDo', icon: '✓', type: 'page', url: '#', width: 360 },
    { id: 'd-docs', label: L('マイドキュメント'), icon: '📁', type: 'folder', path: '@documents', width: 460 },
  ];
}
function stageDemo() {
  if (demoStage) return;
  demoStage = true;
  const origTabs = JSON.parse(JSON.stringify(tabs));
  const STAGE_H = Math.min(800, window.screen.availHeight - 30);
  demoStageH = STAGE_H;

  const stage = el('div', 'ss-stage'); stage.style.height = STAGE_H + 'px';
  const browser = el('div', 'ss-win'); browser.style.cssText += 'left:5%;top:92px;width:46%;height:300px';
  browser.innerHTML = '<div class="ss-win-tb"><span class="ss-win-dots"><i style="background:#e7675f"></i><i style="background:#f4be4f"></i><i style="background:#64c25a"></i></span>'
    + '<span id="ssd-url" style="flex:1;background:#fff;border:1px solid #dde;border-radius:12px;padding:3px 10px;color:#789;font-weight:400">https://example.com/article</span></div>'
    + '<div style="padding:18px 24px;font:15px/1.9 Georgia,serif;color:#222">'
    + '<h2 style="font-size:21px;margin:0 0 10px">Sample Article</h2>'
    + '<p id="ssd-text">DeskHatch keeps your tools one slam to the top away.</p>'
    + '<p style="color:#1a7a5a">— a dummy web page —</p></div>';
  stage.appendChild(browser);
  const folder = el('div', 'ss-win'); folder.style.cssText += 'right:5%;top:150px;width:300px;height:200px';
  folder.innerHTML = '<div class="ss-win-tb"><span class="ss-win-dots"><i style="background:#e7675f"></i><i style="background:#f4be4f"></i><i style="background:#64c25a"></i></span><span>📁 ' + L('マイドキュメント') + '</span></div>'
    + '<div style="padding:18px;display:flex;gap:26px">'
    + '<div id="ssd-folder" style="text-align:center;width:84px"><div style="font-size:48px">📁</div><div style="font-size:12px">Project</div></div>'
    + '<div style="text-align:center;width:84px"><div style="font-size:48px">📄</div><div style="font-size:12px">memo.txt</div></div></div>';
  stage.appendChild(folder);
  document.body.appendChild(stage);

  const layer = el('div', 'ss-demo-layer');
  const cur = el('div', 'ss-cursor');
  cur.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2l6 18 2.3-7.2L20 10.5z" fill="#fff" stroke="#1a1a1a" stroke-width="1.3" stroke-linejoin="round"/></svg>';
  cur.style.left = (window.innerWidth / 2) + 'px'; cur.style.top = '240px';
  const tip = el('div', 'ss-stage-tip');
  const exit = el('button', 'ss-demo-exit', '✕ ' + L('デモ終了'));
  layer.append(cur, tip, exit);
  document.body.appendChild(layer);
  reflowHeight();

  let stopped = false;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const center = (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const setTip = (t) => { tip.textContent = t; };
  async function moveTo(x, y) { cur.style.left = x + 'px'; cur.style.top = y + 'px'; await sleep(1000); }
  async function moveToEl(e) { if (!e) return; const c = center(e); await moveTo(c.x, c.y); }
  function ripple() { const c = center(cur); const r = el('div', 'ss-ripple'); r.style.left = (c.x - 16) + 'px'; r.style.top = (c.y - 16) + 'px'; layer.appendChild(r); setTimeout(() => r.remove(), 560); }
  const barBtn = (id) => bar.querySelector('.ss-btn[data-id="' + id + '"]');
  const clipBtn = () => bar.querySelector('.ss-clip-btn') || bar;
  async function ghostDrag(text, fromEl, toEl) {
    if (!fromEl || !toEl) return;
    const g = el('div', 'ss-ghost', text); const a = center(fromEl); g.style.left = a.x + 'px'; g.style.top = a.y + 'px'; layer.appendChild(g);
    await sleep(150); const b = center(toEl); g.style.left = b.x + 'px'; g.style.top = b.y + 'px'; cur.style.left = b.x + 'px'; cur.style.top = b.y + 'px';
    await sleep(1050); g.remove();
  }
  async function fakeMenu(items) {
    const cx = parseFloat(cur.style.left) || window.innerWidth / 2;
    const cy = parseFloat(cur.style.top) || 60;
    const m = el('div', 'ss-fmenu');
    m.style.left = Math.max(8, Math.min(cx + 4, window.innerWidth - 220)) + 'px';
    m.style.top = Math.max(48, Math.min(cy + 10, STAGE_H - 190)) + 'px';
    items.forEach((it) => { if (it.sep) { m.appendChild(document.createElement('hr')); return; } m.appendChild(el('div', it.hot ? 'hot' : null, it.label)); });
    layer.appendChild(m);
    const hot = m.querySelector('.hot');
    if (hot) { await sleep(750); const r = hot.getBoundingClientRect(); await moveTo(r.left + r.width / 2, r.top + r.height / 2); ripple(); }
    await sleep(650); m.remove();
  }
  function onKey(e) { if (e.key === 'Escape') endDemo(); }
  function endDemo() {
    if (!demoStage) return;
    stopped = true; demoStage = false;
    document.removeEventListener('keydown', onKey);
    stage.remove(); layer.remove();
    Object.keys(open).slice().forEach((id) => closeDrawer(id));
    tabs = origTabs; renderBar(); reflowHeight();
  }
  exit.onclick = endDemo;
  document.addEventListener('keydown', onKey);

  async function act() {
    Object.keys(open).slice().forEach((id) => closeDrawer(id));
    tabs = demoBarTabs(); renderBar(); await sleep(900);
    setTip(L('メールやカレンダーを上端からワンクリックで'));
    await moveToEl(barBtn('d-mail')); ripple(); openTab(tabs[0], barBtn('d-mail')); await sleep(2400); if (stopped) return;
    await moveToEl(barBtn('d-cal')); ripple(); openTab(tabs[1], barBtn('d-cal')); await sleep(2500); if (stopped) return;
    Object.keys(open).slice().forEach((id) => closeDrawer(id)); await sleep(600);
    setTip(L('ブラウザのURLをバーへドラッグ'));
    await moveToEl(stage.querySelector('#ssd-url')); ripple();
    await ghostDrag('🔗 example.com/article', stage.querySelector('#ssd-url'), bar);
    await fakeMenu([{ label: '📁 ' + L('箱を選んで保存') }, { sep: true }, { label: L('➕ ドロワーとして追加'), hot: true }]);
    if (stopped) return;
    tabs.push({ id: 'd-web', label: 'Article', icon: '🔗', type: 'page', url: '#', width: 460 }); renderBar(); await sleep(1000);
    setTip(L('登録したボタンを押すと、そのページがドロワーで開く'));
    await moveToEl(barBtn('d-web')); ripple(); openTab(tabs.find((t) => t.id === 'd-web'), barBtn('d-web')); await sleep(2600); if (stopped) return;
    Object.keys(open).slice().forEach((id) => closeDrawer(id)); await sleep(600);
    setTip(L('フォルダをバーへドラッグしてドロワー化'));
    await moveToEl(stage.querySelector('#ssd-folder')); ripple();
    await ghostDrag('📁 Project', stage.querySelector('#ssd-folder'), bar);
    await fakeMenu([{ label: L('➕ ドロワーとして追加'), hot: true }]);
    if (stopped) return;
    tabs.push({ id: 'd-proj', label: 'Project', icon: '📁', type: 'folder', path: '@documents', width: 460 }); renderBar(); await sleep(1500); if (stopped) return;
    setTip(L('右クリックからタイマーなどのアクセサリを追加'));
    await moveToEl(barBtn('d-todo')); ripple();
    await fakeMenu([{ label: L('新規項目を追加') }, { label: '⏱ ' + L('タイマー'), hot: true }, { sep: true }, { label: L('削除') }]);
    if (stopped) return;
    tabs.push({ id: 'd-timer', label: L('タイマー'), icon: '⏱', type: 'tool', tool: 'calc', width: 300 }); renderBar(); await sleep(1500); if (stopped) return;
    setTip(L('ボタンはドラッグで並べ替えできる'));
    await moveToEl(barBtn('d-timer')); ripple();
    await ghostDrag('⏱ ' + L('タイマー'), barBtn('d-timer'), barBtn('d-web') || bar);
    const ti = tabs.findIndex((t) => t.id === 'd-timer');
    if (ti >= 0) { const mv = tabs.splice(ti, 1)[0]; const wi = tabs.findIndex((t) => t.id === 'd-web'); tabs.splice(wi < 0 ? tabs.length : wi, 0, mv); renderBar(); }
    await sleep(1800); if (stopped) return;
    setTip(L('テキストを選択してバーへ → スクラップブックの箱を選ぶ'));
    const tEl = stage.querySelector('#ssd-text'); tEl.classList.add('ss-sel');
    await moveToEl(tEl); ripple();
    await ghostDrag('✂ DeskHatch keeps your tools…', tEl, clipBtn());
    tEl.classList.remove('ss-sel');
    await fakeMenu([{ label: '📁 ' + L('箱') + ' 1' }, { label: '📁 ' + L('箱') + ' 2', hot: true }, { label: '📁 ' + L('箱') + ' 3' }, { sep: true }, { label: L('➕ ドロワーとして追加') }]);
    if (stopped) return;
    setTip(L('スクラップブックに整理できました'));
    await sleep(2600);
  }
  (async function loop() { while (!stopped) { await act(); if (stopped) break; await sleep(1300); } })();
}

function buildBody(tab) {
  const body = document.createElement('div');
  body.className = 'ss-drawer-body';
  if (DEMO) { const d = buildDemo(tab); if (d) { body.appendChild(d); return body; } }
  const part = partitionFor(tab.account);
  if (tab.type === 'page') {
    body.appendChild(makeWebview(tab.url, tab.mobile, part));
  } else if (tab.type === 'split') {
    const split = el('div', 'ss-split');
    for (const pane of tab.panes || []) {
      const col = el('div', 'ss-split-col');
      if (pane.label) col.appendChild(el('div', 'ss-split-label', pane.label));
      col.appendChild(makeWebview(pane.url, pane.mobile, part));
      split.appendChild(col);
    }
    body.appendChild(split);
  } else if (tab.type === 'tabs') {
    body.appendChild(buildTabsPanel(tab));
  } else if (tab.type === 'files') {
    body.appendChild(buildFilesPanel(tab.path));
  } else if (tab.type === 'folder') {
    body.appendChild(buildFilesPanel(tab.path || '@pc'));
  } else if (tab.type === 'camera') {
    body.appendChild(buildCamera(tab));
  } else if (tab.type === 'viewer') {
    body.appendChild(buildViewer(tab));
  } else if (tab.type === 'clip') {
    body.appendChild(buildClipPanel());
  } else if (tab.type === 'scrap') {
    body.appendChild(buildClipPanel());
  } else if (tab.type === 'others') {
    body.appendChild(buildOthersPanel());
  } else if (tab.type === 'editbox') {
    body.appendChild(buildTabEditor(tab.target));
  } else if (tab.type === 'snippet') {
    body.appendChild(buildSnippet(tab));
  } else if (tab.type === 'tool') {
    if (tab.tool === 'editor') body.appendChild(buildEditor());
    else if (tab.tool === 'calc') body.appendChild(buildCalc());
    else if (tab.tool === 'clipboard') body.appendChild(buildClipboard());
    else if (tab.tool === 'bookmarks') body.appendChild(buildBookmarks());
    else if (tab.tool === 'stopwatch') body.appendChild(buildStopwatch());
    else if (tab.tool === 'timer') body.appendChild(buildTimer());
  } else if (tab.type === 'menu') {
    body.appendChild(buildMenuPanel());
  } else if (tab.type === 'browser') {
    body.appendChild(buildBrowser(tab, part));
  } else if (tab.type === 'help') {
    body.appendChild(buildHelpSlides());
  }
  return body;
}

function attachResize(handle, d, tab, ax, ay, aw) {
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    dragging = true;
    pushHit(); // capture the whole window while resizing (cursor may leave the rect)
    const sx = e.clientX, sy = e.clientY, sw = d.offsetWidth, sh = d.offsetHeight, sLeft = d.offsetLeft;

    const move = (ev) => {
      const bounds = {
        minW: 240, minH: 160,
        maxW: window.innerWidth - 2 * MARGIN,
        maxH: window.screen.availHeight - BAR_H - MARGIN,
      };
      const w = aw ? sw - (ev.clientX - sx) : ax ? sw + (ev.clientX - sx) : sw;
      const h = ay ? sh + (ev.clientY - sy) : sh;
      const s = window.SSLayout.clampSize(w, h, bounds);
      d.style.width = s.width + 'px';
      d.style.height = s.height + 'px';
      if (aw) { let left = (sLeft + sw) - s.width; if (left < MARGIN) left = MARGIN; d.style.left = left + 'px'; }
      else { d.style.left = window.SSLayout.computeLeft(d.offsetLeft, s.width, window.innerWidth, MARGIN) + 'px'; }
      reflowHeight();
    };
    const up = () => {
      handle.releasePointerCapture(e.pointerId);
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      dragging = false;
      Store.saveSize(tab.id, { width: d.offsetWidth, height: d.offsetHeight });
      reflowHeight(); // settle height + re-report the final drawer rect
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  });
}

function createDrawer(tab) {
  const d = document.createElement('div');
  d.className = 'ss-drawer ss-interactive';
  d.dataset.id = tab.id;
  const saved = Store.getSize(tab.id);
  d.style.width = ((saved && saved.width) || tab.width) + 'px';
  d.style.height = ((saved && saved.height) || drawerHeight()) + 'px';

  const head = document.createElement('div');
  head.className = 'ss-drawer-head';
  const title = document.createElement('span');
  title.className = 'ss-drawer-title';
  title.textContent = `${tab.icon} ${tab.label}`;
  const spacer = document.createElement('span');
  spacer.className = 'ss-spacer';
  const pin = document.createElement('button');
  pin.className = 'ss-head-btn ss-pin';
  pin.textContent = '📌';
  pin.title = L('ピン留め（開いたままにする）');
  const close = document.createElement('button');
  close.className = 'ss-head-btn ss-close';
  close.textContent = '✕';
  close.title = L('閉じる');
  head.append(title, spacer);
  if (tab.type === 'page' || tab.type === 'tabs' || tab.type === 'split') {
    const ext = document.createElement('button');
    ext.className = 'ss-head-btn';
    ext.textContent = '↗';
    ext.title = L('標準ブラウザで開く');
    ext.addEventListener('click', () => openExternalFor(tab, d));
    head.append(ext);
  }
  head.append(pin, close);

  const gripW = el('div', 'ss-resize-w');   // left edge: width (grow leftward)
  const gripE = el('div', 'ss-resize-e');   // right edge: width
  const gripS = el('div', 'ss-resize-s');   // bottom edge: height
  const gripSE = el('div', 'ss-resize-se'); // corner: both
  const gripSW = el('div', 'ss-resize-sw'); // corner: width(left) + height
  gripSE.title = L('ドラッグでサイズ変更');

  d.append(head, buildBody(tab), gripW, gripE, gripS, gripSE, gripSW);

  pin.addEventListener('click', () => togglePin(tab.id));
  close.addEventListener('click', () => closeDrawer(tab.id));
  d.addEventListener('mousedown', () => bringToFront(d));
  attachResize(gripW, d, tab, false, false, true);
  attachResize(gripE, d, tab, true, false);
  attachResize(gripS, d, tab, false, true);
  attachResize(gripSE, d, tab, true, true);
  attachResize(gripSW, d, tab, false, true, true);
  return d;
}

// ---------------------------------------------------------------------------
// Open / close / pin
// ---------------------------------------------------------------------------
function bringToFront(el) {
  el.style.zIndex = String(++zCounter);
}

function openExternalFor(tab, d) {
  // Prefer the webview's LIVE url (so the page you actually navigated to opens in
  // the browser — e.g. the specific Gmail thread), falling back to the config url.
  const liveUrl = (sel) => { const w = d.querySelector(sel); try { return (w && w.getURL && w.getURL()) || null; } catch (_) { return null; } };
  if (tab.type === 'page') window.system.external(liveUrl('.ss-webview') || tab.url);
  else if (tab.type === 'split') (tab.panes || []).forEach((p) => p.url && window.system.external(p.url));
  else if (tab.type === 'tabs') {
    const w = d.querySelector('.ss-tabs');
    const active = d.querySelector('.ss-tabs-view .ss-webview');
    const url = (active && active.getURL && active.getURL()) || (w && w.dataset.activeUrl);
    if (url) window.system.external(url);
  }
}

function anchorLeft(btn, width) {
  const rect = btn.getBoundingClientRect();
  return window.SSLayout.computeLeft(rect.left, width, window.innerWidth, MARGIN);
}

function snapshot() {
  const s = {};
  for (const id in open) s[id] = { pinned: open[id].pinned };
  return s;
}

function openTab(tab, btn) {
  const { action, toClose } = window.SSDrawers.resolveClick(snapshot(), tab.id);
  if (action === 'focus') { bringToFront(open[tab.id].el); return; }
  if (action === 'close') { closeDrawer(tab.id); return; }
  toClose.forEach(closeDrawer);

  // Revive a kept-alive drawer that was hidden in the background.
  if (bg[tab.id]) {
    const o = bg[tab.id];
    delete bg[tab.id];
    const d = o.el;
    d.classList.remove('ss-bg');
    d.style.left = anchorLeft(btn, d.offsetWidth) + 'px';
    bringToFront(d);
    open[tab.id] = { el: d, btn, pinned: false, keepAlive: !!tab.keepAlive, tab };
    btn.classList.add('active');
    reflowHeight();
    return;
  }

  const d = createDrawer(tab);
  document.body.appendChild(d);
  d.style.left = anchorLeft(btn, d.offsetWidth) + 'px';
  bringToFront(d);

  open[tab.id] = { el: d, btn, pinned: false, keepAlive: !!tab.keepAlive, tab };
  btn.classList.add('active');
  reflowHeight();
  requestAnimationFrame(() => d.classList.add('open'));
  // Once the slide finishes, drop the CSS transform. A lingering `transform` on
  // an ancestor of a <webview> breaks Chromium's input hit-testing inside it —
  // the embedded page (e.g. Gmail) couldn't be scrolled and clicks misfired.
  // Restored on close so the drawer still animates out.
  setTimeout(() => { const o = open[tab.id]; if (o && o.el === d) d.style.transform = 'none'; }, ANIM_MS + 20);
}

function closeDrawer(id) {
  const o = open[id];
  if (!o) return;
  o.btn.classList.remove('active');
  delete open[id];

  // Keep-alive: hide off-screen but keep the webview running (audio continues).
  if (o.keepAlive) {
    o.el.classList.add('ss-bg');
    bg[id] = { el: o.el, btn: o.btn, tab: o.tab };
    reflowHeight();
    return;
  }

  o.el.style.transform = '';      // hand the transform back to CSS so it can animate out
  o.el.classList.remove('open');
  const el = o.el;
  setTimeout(() => {
    el.remove();
    reflowHeight();
  }, ANIM_MS);
}

function togglePin(id) {
  const o = open[id];
  if (!o) return;
  o.pinned = !o.pinned;
  o.el.querySelector('.ss-pin').classList.toggle('pinned', o.pinned);
}

function closeAll() {
  Object.keys(open).forEach(closeDrawer);
}

// ---------------------------------------------------------------------------
// Settings / Help menu (left-end hamburger)
// ---------------------------------------------------------------------------
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function field(value, placeholder) {
  const i = el('input', 'ss-set-input');
  i.type = 'text';
  i.value = value || '';
  if (placeholder) i.placeholder = placeholder;
  return i;
}

function buildDisplaySettings() {
  const root = el('div', 'ss-disp');
  root.append(el('div', 'ss-disp-title', L('表示')));

  const mk = (val, label) => {
    const l = el('label', 'ss-set-check');
    const r = document.createElement('input');
    r.type = 'radio'; r.name = 'ss-mode'; r.checked = display.mode === val;
    r.onchange = () => { if (r.checked) { display = { ...display, mode: val }; applyDisplay(); } };
    l.append(r, document.createTextNode(' ' + label));
    return l;
  };
  root.append(mk('always', L('常に表示')), mk('autohide', L('自動で隠す')));

  const resL = el('label', 'ss-set-check');
  const res = document.createElement('input');
  res.type = 'checkbox'; res.checked = !!display.reserve;
  res.onchange = () => { display = { ...display, reserve: res.checked }; applyDisplay(); };
  resL.append(res, document.createTextNode(L(' 領域を予約（常に表示でも最大化ウィンドウと重ならない）')));
  root.append(resL);

  // Re-pin strategy (only relevant while reserving).
  const repinWrap = el('label', 'ss-set-check');
  const repinSel = el('select', 'ss-set-type');
  [['event', L('イベント駆動（推奨）')], ['poll', L('ポーリング（現行）')]].forEach(([v, lbl]) => {
    const op = el('option', null, lbl); op.value = v; repinSel.appendChild(op);
  });
  repinSel.value = display.repin || 'event';
  repinSel.onchange = () => { display = { ...display, repin: repinSel.value }; applyDisplay(); };
  repinWrap.append(document.createTextNode(L('予約の維持方式 ')), repinSel);
  root.append(repinWrap);

  // Target monitors (multi-display): check the displays that should show a bar.
  const monBox = el('div', 'ss-mon');
  monBox.append(el('span', 'ss-set-wlabel', L('表示モニタ')));
  window.overlay.getDisplays().then((list) => {
    (list || []).forEach((dp) => {
      const l = el('label', 'ss-set-check');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      const sel = display.monitors || [];
      cb.checked = sel.length ? sel.includes(dp.id) : !!dp.primary;
      cb.onchange = () => {
        let arr = (display.monitors && display.monitors.length)
          ? display.monitors.slice()
          : list.filter((x) => x.primary).map((x) => x.id);
        if (cb.checked) { if (!arr.includes(dp.id)) arr.push(dp.id); }
        else arr = arr.filter((x) => x !== dp.id);
        if (!arr.length) { arr = list.filter((x) => x.primary).map((x) => x.id); cb.checked = dp.primary; }
        display = { ...display, monitors: arr };
        applyDisplay();
      };
      l.append(cb, document.createTextNode(' ' + dp.label));
      monBox.appendChild(l);
    });
  });
  root.append(monBox);

  // Theme / colour
  const themeWrap = el('label', 'ss-set-check');
  const themeSel = el('select', 'ss-set-type');
  THEME_LABELS.forEach(([v, lbl]) => { const op = el('option', null, lbl); op.value = v; themeSel.appendChild(op); });
  themeSel.value = display.theme || 'teal';
  themeSel.onchange = () => { display = { ...display, theme: themeSel.value }; applyDisplay(); };
  themeWrap.append(document.createTextNode(L('テーマ ')), themeSel);
  root.append(themeWrap);

  // Language (auto = follow the OS; override persists in localStorage).
  const langWrap = el('label', 'ss-set-check');
  const langSel = el('select', 'ss-set-type');
  const addLangOpt = (v, lbl) => { const op = el('option', null, lbl); op.value = v; langSel.appendChild(op); };
  addLangOpt('auto', 'Auto');
  const locales = (window.i18n && window.i18n.list) ? window.i18n.list() : [{ code: 'en', name: 'English' }, { code: 'ja', name: '日本語' }];
  locales.forEach((lc) => addLangOpt(lc.code, lc.name));
  try { langSel.value = localStorage.getItem('ss-lang') || 'auto'; } catch (_) { langSel.value = 'auto'; }
  langSel.onchange = () => { try { if (langSel.value === 'auto') localStorage.removeItem('ss-lang'); else localStorage.setItem('ss-lang', langSel.value); } catch (_) {} window.overlay.relaunch(); };
  langWrap.append(document.createTextNode(L('言語') + ' '), langSel);
  root.append(langWrap);

  // Search engine for the right-end 🔍 box
  const engWrap = el('label', 'ss-set-check');
  const engSel = el('select', 'ss-set-type');
  SEARCH_ENGINES.forEach((e) => { const op = el('option', null, e.name); op.value = e.id; engSel.appendChild(op); });
  engSel.value = Store.getSearchEngine();
  engSel.onchange = () => Store.setSearchEngine(engSel.value);
  engWrap.append(document.createTextNode(L('🔍 検索エンジン ')), engSel);
  root.append(engWrap);

  // Rounded ends (classic-Mac look)
  const roundWrap = el('label', 'ss-set-check');
  const round = document.createElement('input');
  round.type = 'checkbox'; round.checked = !!display.roundEnds;
  round.onchange = () => { display = { ...display, roundEnds: round.checked }; applyDisplay(); };
  roundWrap.append(round, document.createTextNode(L(' 両端を丸める（クラシックMac風）')));
  root.append(roundWrap);

  // Close drawers when leaving the app / switching desktop (off by default).
  const colWrap = el('label', 'ss-set-check');
  const colChk = document.createElement('input');
  colChk.type = 'checkbox'; colChk.checked = Store.getCloseOnLeave();
  colChk.onchange = () => Store.setCloseOnLeave(colChk.checked);
  colWrap.append(colChk, document.createTextNode(L(' アプリ/デスクトップ切替時にドロワーを閉じる')));
  root.append(colWrap);

  // Post-drop box-picker popup (Mac intake / Windows fallback).
  const dmWrap = el('label', 'ss-set-check');
  const dmChk = document.createElement('input');
  dmChk.type = 'checkbox'; dmChk.checked = Store.getDropMenu();
  dmChk.onchange = () => Store.setDropMenu(dmChk.checked);
  dmWrap.append(dmChk, document.createTextNode(L(' ドロップ後に箱の振り分けメニューを出す')));
  root.append(dmWrap);

  // Launch at login
  const startWrap = el('label', 'ss-set-check');
  const startup = document.createElement('input');
  startup.type = 'checkbox';
  startup.onchange = () => window.overlay.setStartup(startup.checked);
  window.overlay.getStartup().then((on) => { startup.checked = !!on; });
  startWrap.append(startup, document.createTextNode(L(' Windows起動時に自動で開く')));
  root.append(startWrap);

  root.append(el('div', 'ss-disp-note', L('※「常に表示」で重なる場合は「領域を予約」をON。維持方式は通常「イベント駆動」でOK（うまく追従しない時だけ「ポーリング」へ）。')));
  return root;
}

// All editable fields for one tab object `t` (edits bound in place). `extras`
// are extra nodes appended to the top row (e.g. reorder/delete buttons).
// Shared by the settings list and the inline right-click editor.
function buildTabFields(t, extras) {
  const wrap = el('div', 'ss-fields');
  const top = el('div', 'ss-set-top');
  const icon = field(t.icon, L('絵文字')); icon.classList.add('ss-set-icon'); icon.oninput = () => { t.icon = icon.value; };
  const label = field(t.label, L('ラベル')); label.oninput = () => { t.label = label.value; };
  top.append(icon, label);
  (extras || []).forEach((n) => top.append(n));

  const width = document.createElement('input');
  width.type = 'number'; width.className = 'ss-set-w'; width.value = t.width || 420;
  width.oninput = () => { t.width = Number(width.value) || 420; };
  const wlabel = el('span', 'ss-set-wlabel', L('幅'));
  const row2 = el('div', 'ss-set-row');

  if (!['page', 'tabs', 'files', 'folder', 'tool', 'scrap', 'camera'].includes(t.type)) {
    row2.append(el('span', 'ss-set-note', L('特殊表示（編集不可）')), wlabel, width);
    wrap.append(top, row2);
    return wrap;
  }

  const type = el('select', 'ss-set-type');
  [['page', L('ページ')], ['browser', L('ブラウザ')], ['tabs', L('タブ')], ['files', L('PC全体')], ['folder', L('フォルダ')], ['tool', L('ツール')], ['camera', L('カメラ')]].forEach(([v, lbl]) => { const op = el('option', null, lbl); op.value = v; type.appendChild(op); });
  type.value = t.type;
  const mobileWrap = el('label', 'ss-set-check'); const mobile = document.createElement('input'); mobile.type = 'checkbox'; mobile.checked = !!t.mobile; mobile.onchange = () => { t.mobile = mobile.checked; }; mobileWrap.append(mobile, document.createTextNode(L(' スマホ表示')));
  const keepWrap = el('label', 'ss-set-check'); const keep = document.createElement('input'); keep.type = 'checkbox'; keep.checked = !!t.keepAlive; keep.onchange = () => { t.keepAlive = keep.checked; }; keepWrap.append(keep, document.createTextNode(L(' 閉じても止めない')));
  const toolWrap = el('label', 'ss-set-check'); const toolSel = el('select', 'ss-set-type'); [['editor', L('簡易エディタ')], ['calc', L('電卓')], ['clipboard', L('クリップボード')], ['bookmarks', L('ブックマーク')], ['stopwatch', L('ストップウォッチ')], ['timer', L('タイマー')]].forEach(([v, lbl]) => { const op = el('option', null, lbl); op.value = v; toolSel.appendChild(op); }); toolSel.value = t.tool || 'editor'; toolSel.onchange = () => { t.tool = toolSel.value; }; toolWrap.append(document.createTextNode(L('ツール ')), toolSel);
  const acctWrap = el('label', 'ss-set-check'); const acctSel = el('select', 'ss-set-type'); accountsFull().forEach((a) => { const op = el('option', null, a.name); op.value = a.id; acctSel.appendChild(op); }); acctSel.value = t.account || 'default'; acctSel.onchange = () => { t.account = acctSel.value === 'default' ? undefined : acctSel.value; }; acctWrap.append(document.createTextNode(L('アカウント ')), acctSel);
  row2.append(type, mobileWrap, acctWrap, toolWrap, keepWrap, wlabel, width);

  const url = field(t.url, 'https://…'); url.classList.add('ss-set-url'); url.oninput = () => { t.url = url.value; };
  const pathInput = field(t.path, L('フォルダ未選択')); pathInput.classList.add('ss-set-url'); pathInput.readOnly = true;
  const pickBtn = el('button', 'ss-set-mini', '📂'); pickBtn.title = L('フォルダを選択'); pickBtn.onclick = async () => { const dir = await window.files.pickFolder(); if (dir) { t.path = dir; pathInput.value = dir; } };
  const pathRow = el('div', 'ss-set-row'); pathRow.append(pickBtn, pathInput);
  const rtsp = field(t.rtsp, L('rtsp://ユーザー:パス@IP:554/stream1')); rtsp.classList.add('ss-set-url'); rtsp.oninput = () => { t.rtsp = rtsp.value; };
  const paneBox = el('div', 'ss-panes');
  function renderPanes() {
    paneBox.innerHTML = '';
    (t.panes || []).forEach((pane, pi) => {
      const r = el('div', 'ss-set-row');
      const lbl = field(pane.label, L('タブ名')); lbl.classList.add('ss-pane-label'); lbl.oninput = () => { pane.label = lbl.value; };
      const u = field(pane.url, 'https://…'); u.classList.add('ss-set-url'); u.oninput = () => { pane.url = u.value; };
      const del = el('button', 'ss-set-mini', '🗑'); del.onclick = () => { t.panes.splice(pi, 1); renderPanes(); };
      r.append(lbl, u, del); paneBox.appendChild(r);
    });
    const add = el('button', 'ss-set-btn', L('＋ タブ追加')); add.onclick = () => { if (!t.panes) t.panes = []; t.panes.push({ label: L('タブ') + (t.panes.length + 1), url: 'https://', mobile: true }); renderPanes(); };
    paneBox.appendChild(add);
  }
  renderPanes();
  const syncType = () => {
    t.type = type.value;
    const isPage = t.type === 'page', isFolder = t.type === 'folder', isTabs = t.type === 'tabs', isTool = t.type === 'tool', isCamera = t.type === 'camera', isBrowser = t.type === 'browser';
    url.style.display = (isPage || isBrowser) ? '' : 'none'; // browser: optional home page
    mobileWrap.style.display = isPage ? '' : 'none';
    acctWrap.style.display = (isPage || isTabs || isBrowser) ? '' : 'none';
    toolWrap.style.display = isTool ? '' : 'none';
    keepWrap.style.display = (isPage || isTabs || isCamera || isBrowser) ? '' : 'none';
    pathRow.style.display = isFolder ? '' : 'none';
    rtsp.style.display = isCamera ? '' : 'none';
    paneBox.style.display = isTabs ? '' : 'none';
  };
  type.onchange = syncType; syncType();
  wrap.append(top, row2, url, pathRow, rtsp, paneBox);
  return wrap;
}

// Inline editor (opened from a button's right-click L("編集")).
function buildTabEditor(target) {
  const t = JSON.parse(JSON.stringify(target));
  const wrap = el('div', 'ss-editbox');
  wrap.append(buildTabFields(t));
  const actions = el('div', 'ss-set-actions');
  const save = el('button', 'ss-set-btn ss-set-save', L('保存'));
  save.onclick = () => {
    const arr = JSON.parse(JSON.stringify(tabs));
    const i = arr.findIndex((x) => x.id === target.id);
    if (i >= 0) { t.id = target.id; if (!t.width) t.width = 420; arr[i] = t; }
    closeDrawer('__edit');
    closeDrawer(target.id); // force reload on next open
    commitTabs(arr);
  };
  actions.append(save);
  wrap.append(actions);
  return wrap;
}

function openEditor(tab, btn) {
  openTab({ id: '__edit', type: 'editbox', target: tab, label: L('編集'), icon: '✎', width: 460 }, btn);
}

function buildSettings() {
  const root = el('div', 'ss-settings');
  root.append(buildDisplaySettings());
  const listEl = el('div', 'ss-set-list');
  let working = JSON.parse(JSON.stringify(tabs)); // edit on a copy

  function render() {
    listEl.innerHTML = '';
    working.forEach((t, idx) => {
      const card = el('div', 'ss-set-card');
      const upBtn = el('button', 'ss-set-mini', '▲');
      const downBtn = el('button', 'ss-set-mini', '▼');
      const delBtn = el('button', 'ss-set-mini', '🗑');
      upBtn.onclick = () => { if (idx > 0) { [working[idx - 1], working[idx]] = [working[idx], working[idx - 1]]; render(); } };
      downBtn.onclick = () => { if (idx < working.length - 1) { [working[idx + 1], working[idx]] = [working[idx], working[idx + 1]]; render(); } };
      delBtn.onclick = () => { working.splice(idx, 1); render(); };
      card.append(buildTabFields(t, [upBtn, downBtn, delBtn]));
      listEl.appendChild(card);
    });
  }

  const actions = el('div', 'ss-set-actions');
  const addBtn = el('button', 'ss-set-btn', L('＋ 項目を追加'));
  addBtn.onclick = () => {
    working.push({ id: 'tab' + Date.now(), label: L('新規'), icon: '🔖', type: 'page', url: 'https://', mobile: true, width: 420 });
    render();
  };
  const saveBtn = el('button', 'ss-set-btn ss-set-save', L('保存'));
  saveBtn.onclick = () => {
    const used = new Set();
    for (const t of working) {
      if (!t.id || used.has(t.id)) t.id = 'tab' + Math.random().toString(36).slice(2, 8);
      used.add(t.id);
      if (!t.width) t.width = 420;
    }
    Store.saveTabs(working);
    tabs = loadTabs();
    closeAll();
    renderBar();
  };
  const resetBtn = el('button', 'ss-set-btn', L('既定に戻す'));
  resetBtn.onclick = () => {
    Store.clearTabs();
    localStorage.removeItem('ss.display'); // back to autohide + no reserve
    display = Store.getDisplay();
    applyDisplay();
    tabs = defaultTabs();
    working = JSON.parse(JSON.stringify(tabs));
    render();
  };
  const exportBtn = el('button', 'ss-set-btn', L('⬇ エクスポート'));
  exportBtn.onclick = exportSettings;
  const importBtn = el('button', 'ss-set-btn', L('⬆ インポート'));
  importBtn.onclick = importSettings;
  actions.append(addBtn, saveBtn, resetBtn, exportBtn, importBtn);

  render();
  root.append(el('div', 'ss-disp-title', L('バー項目（このモニタ）')), listEl, actions);
  return root;
}

// Open the slideshow guide as a drawer, anchored to the menu button.
function openHelp() {
  const anchor = document.querySelector('.ss-menu') || bar;
  openTab(HELP_TAB, anchor);
}

// Feature-overview slides shown in the guide (and on first run).
const HELP_SLIDES = [
  { icon: '👋', title: L('ようこそ DeskHatch へ'), lines: [
    L('画面の<b>上端</b>に細いバーが常駐します。'),
    L('ボタンを押すと、その<b>真下にドロワー</b>がスライドして開きます。'),
    L('マウスを画面の一番上へ勢いよく当てれば、狙わなくてもボタンを押せます（Mac風）。'),
  ] },
  { icon: '🔑', title: L('Google は1回ログインするだけ'), lines: [
    L('☰メニュー →「ログイン」で一度サインインすると、Gmail・カレンダー・Keep・Tasks などが<b>すべてログイン済み</b>になります。'),
    L('名前を入れて「＋追加」すれば<b>別アカウント</b>も。個人用と仕事用を同時に開けます。'),
    L('うまくいかない時は 🔄 でログイン履歴をリセットして再ログイン。'),
  ] },
  { icon: '🗄️', title: L('ドロワーの操作'), lines: [
    L('同時に開くのは<b>1枚</b>。別のボタンを押すと前のドロワーは閉じます。'),
    L('<b>📌 ピン</b>で開いたまま固定 → 複数を並べて使えます。'),
    L('右下の角を<b>ドラッグでリサイズ</b>。大きさは記憶されます。'),
  ] },
  { icon: '✏️', title: L('自分好みにカスタマイズ'), lines: [
    L('☰メニュー →「設定」で項目の<b>追加・削除・並べ替え・編集</b>。'),
    L('バー上のボタンを<b>ドラッグで並べ替え</b>。中央へ重ねると<b>タブにまとめ</b>られます。'),
    L('ボタンを<b>右クリック</b>で編集・複製・削除メニュー。'),
  ] },
  { icon: '🗂️', title: L('ファイルとフォルダ'), lines: [
    L('「My Computer」はファイルブラウザ。<b>右クリック</b>で操作メニュー。'),
    L('ファイルを<b>ドロワーの外へドラッグ</b>すると、他アプリへ渡せます。'),
    L('よく使うフォルダはショートカットとしてバーに置けます。'),
  ] },
  { icon: '📎', title: L('クリップ（伝票ばさみ）'), lines: (window.overlay.platform === 'darwin' ? [
    L('メニューバーの DeskHatch アイコンに<b>ファイルをドロップ</b>すると追加できます。'),
    L('📎ドロワーの<b>「＋ファイル / ＋フォルダ」</b>ボタンからも追加できます。'),
    L('<b>再起動しても消えません</b>。よく使う物は正式な項目へ昇格も。'),
  ] : [
    L('バーや📎へ<b>URL・ファイル・フォルダ・テキスト</b>をドロップ、または<b>＋ボタン</b>で追加。'),
    L('<b>再起動しても消えません</b>。よく使う物は正式な項目へ昇格も。'),
    L('居酒屋の伝票ばさみのように、サッと挟んで後で使えます。'),
  ]) },
  { icon: '🖥️', title: L('表示モードとマルチモニタ'), lines: [
    L('<b>常に表示＋領域を予約</b>：最大化ウィンドウがバーに重なりません。'),
    L('<b>自動で隠す</b>：普段は隠れ、上端にカーソルで出現。<b>▲</b>で一時的に隠すことも。'),
    L('複数モニタに表示でき、モニタごとに違うバーも作れます。'),
  ] },
  { icon: '🧰', title: L('ツールとテーマ'), lines: [
    L('「ツール」タブに<b>エディタ・電卓・クリップボード・ブックマーク</b>、Windows設定への近道。'),
    L('「設定」で<b>テーマ</b>（クラシックMac含む）や<b>両端の角丸</b>を変更。'),
    L('<b>スタートアップ登録</b>でPC起動時に自動起動。トレイから表示／非表示。'),
  ] },
];

// Animated SVG mock-ups (one per slide). Inline SVG + SMIL so they animate
// identically in the app and in any browser, scale crisply, and need no assets.
function dhFrame(inner, o) {
  o = o || {};
  const barFill = o.barFill || 'url(#dhb)';
  const barAnim = o.barAnim || '';
  const btns = o.noBtns ? '' :
    '<g fill="#eafafa" opacity=".92"><rect x="10" y="7" width="8" height="8" rx="2"/>' +
    '<rect x="26" y="9" width="22" height="5" rx="2.5"/><rect x="54" y="9" width="22" height="5" rx="2.5"/>' +
    '<rect x="82" y="9" width="22" height="5" rx="2.5"/><rect x="110" y="9" width="22" height="5" rx="2.5"/></g>';
  return '<svg class="dh-art" viewBox="0 0 300 170" xmlns="http://www.w3.org/2000/svg">' +
    '<defs><linearGradient id="dhb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2e8b8b"/>' +
    '<stop offset="1" stop-color="#1f6f6f"/></linearGradient>' +
    '<clipPath id="dhs"><rect x="2" y="2" width="296" height="166" rx="12"/></clipPath></defs>' +
    '<g clip-path="url(#dhs)"><rect x="2" y="2" width="296" height="166" fill="#e6edee"/>' +
    '<rect x="2" y="2" width="296" height="20" fill="' + barFill + '">' + barAnim + '</rect>' +
    btns + inner + '</g>' +
    '<rect x="2" y="2" width="296" height="166" rx="12" fill="none" stroke="#c3ced3" stroke-width="1.5"/></svg>';
}

function slideArt(i) {
  const cur = '<path d="M0,0 L0,15 L4.2,10.8 L7.4,16.8 L9.6,15.6 L6.4,9.6 L11.4,9.6 Z" fill="#1c1c1c" stroke="#fff" stroke-width="0.9">';
  if (i === 0) return dhFrame(
    '<rect x="26" y="22" width="118" height="84" rx="4" fill="#fff" stroke="#b9cccc"><animate attributeName="height" values="0;0;84;84;0" keyTimes="0;0.12;0.45;0.85;1" dur="3.4s" repeatCount="indefinite"/></rect>' +
    '<rect x="26" y="22" width="118" height="13" fill="#1f6f6f"><animate attributeName="height" values="0;0;13;13;0" keyTimes="0;0.12;0.45;0.85;1" dur="3.4s" repeatCount="indefinite"/></rect>' +
    '<g fill="#d7e2e2"><rect x="34" y="44" width="96" height="6" rx="3"/><rect x="34" y="56" width="74" height="6" rx="3"/><rect x="34" y="68" width="88" height="6" rx="3"/><rect x="34" y="80" width="60" height="6" rx="3"/><animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.25;0.5;0.85;1" dur="3.4s" repeatCount="indefinite"/></g>' +
    cur + '<animateTransform attributeName="transform" type="translate" values="150,86;150,86;33,7;33,7;150,86" keyTimes="0;0.1;0.34;0.85;1" dur="3.4s" repeatCount="indefinite"/></path>');
  if (i === 1) {
    let t = '';
    const xs = [38, 84, 130, 176, 222];
    const bg = ['0', '0.18', '0.36', '0.54', '0.72'];
    for (let k = 0; k < xs.length; k++) {
      const x = xs[k];
      const cx = x + 17;
      t += '<rect x="' + x + '" y="62" width="34" height="34" rx="7" fill="#cdd9d9"><animate attributeName="fill" values="#cdd9d9;#cdd9d9;#37a45f;#37a45f;#cdd9d9" keyTimes="0;0.15;0.4;0.85;1" dur="3.6s" begin="' + bg[k] + 's" repeatCount="indefinite"/></rect>';
      t += '<path d="M' + (cx - 7) + ',79 l5,5 l10,-12" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0"><animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.22;0.42;0.85;1" dur="3.6s" begin="' + bg[k] + 's" repeatCount="indefinite"/></path>';
    }
    return dhFrame('<rect x="44" y="36" width="40" height="9" rx="4" fill="#ffffff" opacity=".85"/>' + t);
  }
  if (i === 2) return dhFrame(
    '<rect x="40" y="26" width="140" height="96" rx="4" fill="#fff" stroke="#b9cccc"><animate attributeName="height" values="56;56;96;96;56" keyTimes="0;0.25;0.5;0.8;1" dur="3.4s" repeatCount="indefinite"/></rect>' +
    '<rect x="40" y="26" width="140" height="13" rx="4" fill="#1f6f6f"/>' +
    '<rect x="168" y="28" width="9" height="9" rx="2" fill="#c0392b"><animate attributeName="opacity" values="0.25;0.25;1;1;0.25" keyTimes="0;0.24;0.5;0.8;1" dur="3.4s" repeatCount="indefinite"/></rect>' +
    '<g fill="#d7e2e2"><rect x="48" y="48" width="120" height="6" rx="3"/><rect x="48" y="60" width="96" height="6" rx="3"/></g>' +
    '<path d="M0,0 l11,0 l0,11 z" fill="#1f6f6f"><animateTransform attributeName="transform" type="translate" values="169,71;169,71;169,111;169,111;169,71" keyTimes="0;0.25;0.5;0.8;1" dur="3.4s" repeatCount="indefinite"/></path>');
  if (i === 3) return dhFrame(
    '<rect x="54" y="6" width="24" height="11" rx="3" fill="#ffce4a"><animate attributeName="x" values="54;54;110;110;54" keyTimes="0;0.2;0.5;0.8;1" dur="3.2s" repeatCount="indefinite"/></rect>' +
    '<rect x="110" y="6" width="24" height="11" rx="3" fill="#7ad0c0"><animate attributeName="x" values="110;110;54;54;110" keyTimes="0;0.2;0.5;0.8;1" dur="3.2s" repeatCount="indefinite"/></rect>' +
    '<g fill="#cdd9d9"><rect x="40" y="60" width="220" height="8" rx="4"/><rect x="40" y="78" width="180" height="8" rx="4"/><rect x="40" y="96" width="205" height="8" rx="4"/></g>' +
    cur + '<animateTransform attributeName="transform" type="translate" values="70,13;70,13;126,13;126,13;70,13" keyTimes="0;0.2;0.5;0.8;1" dur="3.2s" repeatCount="indefinite"/></path>');
  if (i === 4) return dhFrame(
    '<rect x="24" y="24" width="120" height="118" rx="4" fill="#fff" stroke="#b9cccc"/>' +
    '<rect x="24" y="24" width="120" height="13" rx="4" fill="#1f6f6f"/>' +
    '<g fill="#e3ecec"><rect x="32" y="64" width="104" height="14" rx="3"/><rect x="32" y="82" width="104" height="14" rx="3"/><rect x="32" y="100" width="104" height="14" rx="3"/></g>' +
    '<g><rect x="32" y="46" width="104" height="14" rx="3" fill="#cfe3df"/><rect x="36" y="49" width="8" height="8" rx="2" fill="#5aa0c0"/>' +
    '<animateTransform attributeName="transform" type="translate" values="0,0;0,0;160,20;160,20;0,0" keyTimes="0;0.25;0.6;0.85;1" dur="3.4s" repeatCount="indefinite"/>' +
    '<animate attributeName="opacity" values="1;1;0;0;1" keyTimes="0;0.35;0.6;0.85;1" dur="3.4s" repeatCount="indefinite"/></g>');
  if (i === 5) {
    const bin = '<rect x="70" y="118" width="160" height="40" rx="7" fill="#eef6f6" stroke="#bcd2d2" stroke-width="1.5"/>';
    let chips = '';
    const cd = [['78', '#ffce4a', '0s'], ['122', '#7ad0c0', '0.5s'], ['166', '#9db8ff', '1s']];
    for (let j = 0; j < cd.length; j++) {
      const c = cd[j];
      chips += '<rect x="' + c[0] + '" y="128" width="36" height="16" rx="4" fill="' + c[1] + '"><animate attributeName="y" values="-20;-20;128;128;-20" keyTimes="0;0.1;0.4;0.9;1" dur="3.6s" begin="' + c[2] + '" repeatCount="indefinite"/><animate attributeName="opacity" values="0;1;1;1;0" keyTimes="0;0.1;0.4;0.9;1" dur="3.6s" begin="' + c[2] + '" repeatCount="indefinite"/></rect>';
    }
    return dhFrame(bin + chips);
  }
  if (i === 6) return dhFrame(
    '<rect x="14" y="26" width="272" height="130" rx="4" fill="#fff" stroke="#c3d0d4"><animate attributeName="y" values="170;170;26;26;26" keyTimes="0;0.12;0.5;0.95;1" dur="3.8s" repeatCount="indefinite"/><animate attributeName="height" values="0;0;130;130;130" keyTimes="0;0.12;0.5;0.95;1" dur="3.8s" repeatCount="indefinite"/></rect>' +
    '<rect x="14" y="26" width="272" height="14" rx="4" fill="#d8e0e2"><animate attributeName="y" values="170;170;26;26;26" keyTimes="0;0.12;0.5;0.95;1" dur="3.8s" repeatCount="indefinite"/></rect>' +
    '<rect x="2" y="22" width="296" height="2" fill="#1f6f6f" opacity="0.55"/>');
  if (i === 7) {
    const sw = [[70, '#1f6f6f'], [105, '#2c3038'], [140, '#1f63ad'], [175, '#2c7d44'], [210, '#6a3fa0'], [245, '#d4682f']];
    let circles = '';
    const vals = [];
    for (let m = 0; m < sw.length; m++) { circles += '<circle cx="' + sw[m][0] + '" cy="118" r="12" fill="' + sw[m][1] + '"/>'; vals.push(sw[m][0]); }
    vals.push(vals[0]);
    const ring = '<circle cx="70" cy="118" r="15" fill="none" stroke="#15201f" stroke-width="2.5"><animate attributeName="cx" values="' + vals.join(';') + '" dur="5.4s" calcMode="discrete" repeatCount="indefinite"/></circle>';
    const barCycle = '<animate attributeName="fill" values="#1f6f6f;#2c3038;#1f63ad;#2c7d44;#6a3fa0;#d4682f;#1f6f6f" dur="5.4s" calcMode="discrete" repeatCount="indefinite"/>';
    return dhFrame('<g fill="#cdd9d9"><rect x="40" y="54" width="220" height="7" rx="3.5"/><rect x="40" y="70" width="170" height="7" rx="3.5"/></g>' + circles + ring, { barFill: '#1f6f6f', barAnim: barCycle });
  }
  return dhFrame('');
}

function buildHelpSlides() {
  const root = el('div', 'ss-help-slides');
  let i = 0;
  const stage = el('div', 'ss-help-stage');
  const dots = el('div', 'ss-help-dots');
  const prev = el('button', 'ss-help-arrow', L('‹ 戻る'));
  const next = el('button', 'ss-help-arrow ss-help-next', L('次へ ›'));

  function render() {
    const s = HELP_SLIDES[i];
    stage.innerHTML =
      '<div class="ss-help-art">' + slideArt(i) + '</div>' +
      '<h3 class="ss-help-title">' + s.icon + ' ' + s.title + '</h3>' +
      '<ul class="ss-help-list">' + s.lines.map((l) => '<li>' + l + '</li>').join('') + '</ul>' +
      '<div class="ss-help-count">' + (i + 1) + ' / ' + HELP_SLIDES.length + '</div>';
    dots.innerHTML = '';
    HELP_SLIDES.forEach((_, n) => {
      const dot = el('button', 'ss-help-dot' + (n === i ? ' on' : ''));
      dot.title = String(n + 1);
      dot.onclick = () => { i = n; render(); };
      dots.appendChild(dot);
    });
    prev.disabled = i === 0;
    const last = i === HELP_SLIDES.length - 1;
    next.textContent = last ? L('✓ 完了') : L('次へ ›');
    next.classList.toggle('ss-help-done', last);
  }
  prev.onclick = () => { if (i > 0) { i -= 1; render(); } };
  next.onclick = () => { if (i < HELP_SLIDES.length - 1) { i += 1; render(); } else closeDrawer(HELP_TAB.id); };

  const nav = el('div', 'ss-help-nav');
  nav.append(prev, dots, next);

  const foot = el('div', 'ss-help-foot');
  const lbl = el('label', 'ss-help-skip');
  const chk = el('input');
  chk.type = 'checkbox';
  chk.checked = Store.getHelpSkip();
  chk.onchange = () => Store.setHelpSkip(chk.checked);
  lbl.append(chk, document.createTextNode(L(' 次回以降は表示しない')));
  foot.append(lbl);

  root.append(stage, nav, foot);
  root.tabIndex = 0;
  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') next.click();
    else if (e.key === 'ArrowLeft') prev.click();
  });
  render();
  requestAnimationFrame(() => { try { root.focus(); } catch (_) { /* ignore */ } });
  return root;
}

function buildHelp() {
  const root = el('div', 'ss-help');
  const openBtn = el('button', 'ss-set-btn ss-help-open', L('📖 使い方ガイド（スライド）を開く'));
  openBtn.onclick = () => openHelp();
  root.appendChild(openBtn);
  const quick = el('div');
  quick.innerHTML = L(`
    <ul>
      <li>上の<b>Google アカウント</b>で「ログイン」して1回サインインすると、Gmail・カレンダー・Tasks・Keep などが全てログイン済みになります。</li>
      <li><b>別アカウントも追加可能</b>：名前を入れて「＋追加」→そのアカウントで「ログイン」。設定で各項目に割り当てれば、個人用・仕事用を同時に開けます。</li>
      <li>上端のボタンを押すと、その真下にドロワーが開きます。</li>
      <li>同時に開くのは1枚。📌でピン留めすると複数並べられます。</li>
      <li>ドロワー右下の角を<b>ドラッグでサイズ変更</b>。サイズは記憶されます。</li>
      <li><b>設定</b>で項目（ボタン）の追加・削除・並べ替え・編集ができます。</li>
      <li>My Documents はファイルブラウザ。右クリックで操作メニュー。</li>
      <li><b>表示</b>（設定）：「常に表示＋領域を予約」にすると、最大化ウィンドウがバーの下に潜らず重なりません。「自動で隠す」も選べます。</li>
      <li>バー右端の <b>▲</b> で一時的に隠せます（画面上端にカーソルを当てると再表示）。</li>
      <li>項目が増えてバーが画面幅を超えたら、横スクロール（マウスホイール）で送れます。</li>
      <li>トレイ／メニューバーのアイコンでバーの表示／非表示。</li>
    </ul>`);
  root.appendChild(el('div', 'ss-help-quick-label', L('クイックリファレンス')));
  root.appendChild(quick);
  return root;
}

function buildTools() {
  const root = el('div', 'ss-tools');
  const anchor = () => document.querySelector('.ss-menu') || document.getElementById('bar');

  const sys = el('div', 'ss-tools-sec');
  sys.append(el('div', 'ss-tools-title', L('システム / デバイス')));
  [[L('Windows 設定'), 'settings'], [L('コントロールパネル'), 'control'], [L('デバイスマネージャー'), 'devmgr'],
    ['God Mode', 'godmode'], [L('プリンター'), 'printers'], [L('スキャナー'), 'scanners']]
    .forEach(([label, key]) => { const b = el('button', 'ss-set-btn', label); b.onclick = () => window.system.open(key); sys.appendChild(b); });

  const tools = el('div', 'ss-tools-sec');
  tools.append(el('div', 'ss-tools-title', L('ツール')));
  [[L('🌐 ブラウザ（検索／URL）'), { id: 'tool-browser', label: L('ブラウザ'), icon: '🌐', type: 'browser', width: 560, url: 'https://www.google.com/' }],
    [L('📝 簡易エディタ'), { id: 'tool-editor', label: L('エディタ'), icon: '📝', type: 'tool', tool: 'editor', width: 480 }],
    [L('🧮 電卓'), { id: 'tool-calc', label: L('電卓'), icon: '🧮', type: 'tool', tool: 'calc', width: 280 }],
    [L('⏱ ストップウォッチ'), { id: 'tool-stopwatch', label: L('ストップウォッチ'), icon: '⏱', type: 'tool', tool: 'stopwatch', width: 260 }],
    [L('⏲ タイマー'), { id: 'tool-timer', label: L('タイマー'), icon: '⏲', type: 'tool', tool: 'timer', width: 300 }],
    [L('📋 クリップボード'), { id: 'tool-clip', label: L('クリップボード'), icon: '📋', type: 'tool', tool: 'clipboard', width: 420 }],
    [L('🔖 ブックマーク'), { id: 'tool-bm', label: L('ブックマーク'), icon: '🔖', type: 'tool', tool: 'bookmarks', width: 440 }]]
    .forEach(([label, t]) => { const b = el('button', 'ss-set-btn', label); b.onclick = () => openTab(t, anchor()); tools.appendChild(b); });

  root.append(sys, tools);
  return root;
}

function buildMenuPanel() {
  const wrap = el('div', 'ss-menu-panel');

  const acct = el('div', 'ss-acct');
  function renderAccounts() {
    acct.innerHTML = '';
    acct.append(el('span', 'ss-acct-label', L('Google アカウント')));
    for (const a of accountsFull()) {
      const chip = el('div', 'ss-acct-chip');
      chip.append(el('span', 'ss-acct-name', a.name));
      const inBtn = el('button', 'ss-acct-mini', L('ログイン'));
      inBtn.onclick = () => window.auth.login(partitionFor(a.id));
      chip.append(inBtn);
      const reset = el('button', 'ss-acct-mini', '🔄');
      reset.title = L('履歴を消してログインし直す（「安全でない」ループの解除）');
      reset.onclick = async () => { await window.auth.logout(partitionFor(a.id)); window.auth.login(partitionFor(a.id)); };
      chip.append(reset);
      if (a.id !== 'default') {
        const del = el('button', 'ss-acct-mini', '✕');
        del.title = L('このアカウントを削除');
        del.onclick = () => { removeAccount(a.id); renderAccounts(); };
        chip.append(del);
      }
      acct.append(chip);
    }
    const addName = el('input', 'ss-set-input');
    addName.placeholder = L('追加するアカウント名');
    const addBtn = el('button', 'ss-set-btn', L('＋ 追加'));
    addBtn.onclick = () => {
      const name = addName.value.trim();
      if (!name) return;
      addAccount(name);
      renderAccounts();
    };
    acct.append(addName, addBtn);
  }
  renderAccounts();

  const tabsBar = el('div', 'ss-menu-tabs');
  const bSettings = el('button', 'ss-menu-tab', L('⚙ 設定'));
  const bTools = el('button', 'ss-menu-tab', L('🧰 ツール'));
  const bHelp = el('button', 'ss-menu-tab', L('❔ ヘルプ'));
  tabsBar.append(bSettings, bTools, bHelp);
  const view = el('div', 'ss-menu-view');

  const footer = el('div', 'ss-menu-foot');
  footer.style.display = 'flex'; footer.style.alignItems = 'center'; footer.style.gap = '8px';
  const ver = el('span', 'ss-menu-ver', 'DeskHatch');
  ver.style.cssText = 'font-size:11px;color:#6a8a8a;';
  if (window.overlay.version) window.overlay.version().then((v) => { ver.textContent = 'DeskHatch v' + v; }).catch(() => {});
  const verSp = el('span'); verSp.style.flex = '1';
  const updBtn = el('button', 'ss-set-btn', L('🔄 更新を確認'));
  updBtn.onclick = () => { if (window.overlay.checkUpdates) window.overlay.checkUpdates(); };
  const demoBtn = el('button', 'ss-set-btn', DEMO ? L('🎬 デモ終了') : L('🎬 デモ'));
  demoBtn.onclick = () => { try { if (localStorage.getItem('ss.demo') === '1') localStorage.removeItem('ss.demo'); else localStorage.setItem('ss.demo', '1'); } catch (_) {} window.overlay.relaunch(); };
  const quitBtn = el('button', 'ss-set-btn ss-quit', L('⏻ アプリを終了'));
  quitBtn.onclick = () => window.overlay.quit();
  footer.append(ver, verSp, updBtn, demoBtn, quitBtn);

  wrap.append(acct, tabsBar, view, footer);

  function show(which) {
    view.innerHTML = '';
    bSettings.classList.toggle('active', which === 's');
    bTools.classList.toggle('active', which === 't');
    bHelp.classList.toggle('active', which === 'h');
    view.appendChild(which === 's' ? buildSettings() : which === 't' ? buildTools() : buildHelp());
  }
  bSettings.onclick = () => show('s');
  bTools.onclick = () => show('t');
  bHelp.onclick = () => show('h');
  show('s');
  return wrap;
}

// ---------------------------------------------------------------------------
// Build the bar
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Direct bar editing: reorder (drag) + right-click menu (add/dup/move/delete)
// ---------------------------------------------------------------------------
let dragMergeTarget = null; // button id when hovering a button's center (merge)
let barNavUpdate = null;    // refresh the ‹ › overflow buttons

function commitTabs(arr) { Store.saveTabs(arr); tabs = arr; renderBar(); }

// Merge two bar items into a tabbed drawer (drop one button onto another).
function tabToPane(t) {
  const p = { label: t.label, type: t.type };
  ['url', 'mobile', 'account', 'path', 'tool', 'viewer', 'rtsp', 'text'].forEach((k) => { if (t[k] !== undefined) p[k] = t[k]; });
  return p;
}
const panesOf = (t) => (t.type === 'tabs' ? (t.panes || []) : [tabToPane(t)]);

function mergeTabs(draggedId, targetId) {
  if (draggedId === targetId) return;
  const arr = JSON.parse(JSON.stringify(tabs));
  const target = arr.find((t) => t.id === targetId);
  const dragged = arr.find((t) => t.id === draggedId);
  if (!target || !dragged) return;
  const panes = panesOf(target).concat(panesOf(dragged));
  target.type = 'tabs';
  target.panes = panes;
  target.icon = target.icon || '🗂';
  ['url', 'path', 'tool', 'viewer', 'rtsp', 'mobile', 'text'].forEach((k) => delete target[k]);
  arr.splice(arr.findIndex((t) => t.id === draggedId), 1);
  commitTabs(arr);
}

function paneIcon(p) {
  if (p.type === 'folder' || p.type === 'files') return '📁';
  if (p.type === 'viewer') return viewerIcon(p.viewer);
  if (p.type === 'tool') return '🧰';
  if (p.type === 'camera') return '🎥';
  if (p.type === 'browser') return '🌐';
  return '🔗';
}
function paneToTab(p, baseId, k) {
  const t = { id: baseId + '_' + k + Date.now().toString(36).slice(-3), label: p.label || L('タブ'), icon: paneIcon(p), width: 460 };
  ['type', 'url', 'mobile', 'account', 'path', 'tool', 'viewer', 'rtsp', 'text'].forEach((key) => { if (p[key] !== undefined) t[key] = p[key]; });
  if (!t.type) t.type = 'page';
  return t;
}
// Break a tab group back into individual buttons.
function ungroupTab(id) {
  const arr = JSON.parse(JSON.stringify(tabs));
  const i = arr.findIndex((t) => t.id === id);
  if (i < 0 || arr[i].type !== 'tabs') return;
  const newTabs = (arr[i].panes || []).map((p, k) => paneToTab(p, id, k));
  closeDrawer(id);
  arr.splice(i, 1, ...newTabs);
  commitTabs(arr);
}

// --- Import / export of all settings (localStorage ss.* keys) --------------
function exportSettings() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.indexOf('ss.') === 0) data[k] = localStorage.getItem(k);
  }
  window.files.saveText(JSON.stringify({ app: 'smartsuite.next', version: 1, data }, null, 2));
}
async function importSettings() {
  const text = await window.files.openText();
  if (!text) return;
  let obj;
  try { obj = JSON.parse(text); } catch (_) { toast(L('読み込めない形式です')); return; }
  const data = obj && obj.data ? obj.data : obj;
  if (!data || typeof data !== 'object') { toast(L('設定が見つかりません')); return; }
  Object.keys(data).forEach((k) => { if (k.indexOf('ss.') === 0) localStorage.setItem(k, data[k]); });
  window.overlay.relaunch();
}

function clearDragFx() {
  bar.classList.remove('drop');
  bar.querySelectorAll('.ss-btn.merge, .ss-btn.dragging').forEach((b) => b.classList.remove('merge', 'dragging'));
  dragMergeTarget = null;
}

function reorderTabs(id, beforeId) {
  const arr = JSON.parse(JSON.stringify(tabs));
  const i = arr.findIndex((t) => t.id === id);
  if (i < 0) return;
  const [item] = arr.splice(i, 1);
  let j = beforeId ? arr.findIndex((t) => t.id === beforeId) : arr.length;
  if (j < 0) j = arr.length;
  arr.splice(j, 0, item);
  commitTabs(arr);
}

function moveTab(id, dir) {
  const arr = JSON.parse(JSON.stringify(tabs));
  const i = arr.findIndex((t) => t.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  commitTabs(arr);
}

function duplicateTab(id) {
  const arr = JSON.parse(JSON.stringify(tabs));
  const i = arr.findIndex((t) => t.id === id);
  if (i < 0) return;
  const copy = JSON.parse(JSON.stringify(arr[i]));
  copy.id = 'tab' + Date.now().toString(36);
  arr.splice(i + 1, 0, copy);
  commitTabs(arr);
}

function deleteTab(id) {
  closeDrawer(id);
  commitTabs(tabs.filter((t) => t.id !== id));
}

function addNewTab() {
  const arr = JSON.parse(JSON.stringify(tabs));
  arr.push({ id: 'tab' + Date.now().toString(36), label: L('新規'), icon: '🔖', type: 'page', url: 'https://', mobile: true, width: 460 });
  commitTabs(arr);
}

async function tabContextMenu(tab, btn) {
  const items = [
    { id: 'edit', label: L('編集…') },
    { id: 'dup', label: L('この項目を複製') },
  ];
  if (tab.type === 'tabs') items.push({ id: 'ungroup', label: L('タブを分解') });
  items.push(
    { separator: true },
    { id: 'add', label: L('新規項目を追加') },
    { id: 'left', label: L('← 左へ移動') },
    { id: 'right', label: L('右へ移動 →') },
    { separator: true },
    { id: 'del', label: L('削除') },
  );
  const action = await window.system.menu(items);
  if (action === 'edit') openEditor(tab, btn);
  else if (action === 'dup') duplicateTab(tab.id);
  else if (action === 'ungroup') ungroupTab(tab.id);
  else if (action === 'add') addNewTab();
  else if (action === 'left') moveTab(tab.id, -1);
  else if (action === 'right') moveTab(tab.id, 1);
  else if (action === 'del') deleteTab(tab.id);
}

// Right-end 🔍 search box: a slim popover under the button; typing + Enter opens
// the system browser (search via the chosen engine, or the site for a URL).
function closeSearch() {
  if (!searchEl) return;
  searchEl.remove();
  searchEl = null;
  reflowHeight();
}
function openSearch(btn) {
  if (searchEl) { closeSearch(); return; }
  const box = el('div', 'ss-search ss-interactive');
  const input = el('input', 'ss-search-input');
  input.type = 'text';
  input.spellcheck = false;
  input.placeholder = searchEngine().name + L(' で検索、または URL を入力');
  const submit = () => {
    let u = '';
    try { u = searchOrUrl(input.value); } catch (err) { alert(L('検索URLの組み立てに失敗しました: ') + (err && err.message)); return; }
    if (!u) return;
    Promise.resolve(window.system.external(u)).catch((err) => alert(L('ブラウザを開けませんでした:\n') + u + '\n' + (err && err.message)));
    closeSearch();
  };
  input.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return; // ignore IME conversion/commit Enter
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    else if (e.key === 'Escape') { e.preventDefault(); closeSearch(); }
  });
  input.addEventListener('blur', () => setTimeout(() => { if (searchEl && document.activeElement !== input) closeSearch(); }, 120));
  box.appendChild(input);
  document.body.appendChild(box);
  searchEl = box;
  // anchor under the button, right-aligned, clamped on-screen
  const r = btn.getBoundingClientRect();
  const w = box.offsetWidth || 300;
  box.style.left = Math.max(MARGIN, Math.min(r.right - w, window.innerWidth - w - MARGIN)) + 'px';
  reflowHeight(); // grows the window + re-reports the popover rect (pushHit)
  requestAnimationFrame(() => { input.focus(); input.select(); });
}

function renderBar() {
  bar.innerHTML = '';

  // logo / menu button — stays fixed at the left, doesn't scroll away
  const menuBtn = el('button', 'ss-btn ss-menu');
  menuBtn.title = L('メニュー（設定・ヘルプ）');
  menuBtn.innerHTML = logoMark('currentColor');
  menuBtn.addEventListener('click', () => openTab(MENU_TAB, menuBtn));
  bar.appendChild(menuBtn);

  // scrollable tab area (horizontal scroll when items overflow)
  const scroll = el('div', 'ss-bar-scroll');
  for (const tab of tabs) {
    const btn = el('button', 'ss-btn');
    btn.dataset.id = tab.id;
    btn.append(el('span', 'ss-ico', tab.icon), el('span', null, tab.label));
    btn.addEventListener('click', () => {
      if (tab.type === 'launch') window.files.open(tab.path); // open with default app
      else openTab(tab, btn);
    });
    btn.addEventListener('contextmenu', (e) => { e.preventDefault(); tabContextMenu(tab, btn); });
    btn.draggable = true;
    btn.addEventListener('dragstart', (e) => { e.dataTransfer.setData('ss-tab', tab.id); e.dataTransfer.effectAllowed = 'move'; btn.classList.add('dragging'); });
    btn.addEventListener('dragend', clearDragFx);
    // hovering a button's center = merge into a tab group; edges = reorder
    btn.addEventListener('dragover', (e) => {
      if (![...e.dataTransfer.types].includes('ss-tab')) return;
      e.preventDefault();
      const r = btn.getBoundingClientRect();
      const frac = (e.clientX - r.left) / r.width;
      const merge = frac > 0.3 && frac < 0.7 && !btn.classList.contains('dragging');
      btn.classList.toggle('merge', merge);
      dragMergeTarget = merge ? tab.id : (dragMergeTarget === tab.id ? null : dragMergeTarget);
    });
    btn.addEventListener('dragleave', () => { btn.classList.remove('merge'); if (dragMergeTarget === tab.id) dragMergeTarget = null; });
    scroll.appendChild(btn);
  }
  scroll.addEventListener('wheel', (e) => {
    if (e.deltaY) { scroll.scrollLeft += e.deltaY; e.preventDefault(); }
  }, { passive: false });
  // drag-reorder within the bar
  scroll.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('ss-tab')) e.preventDefault(); });
  scroll.addEventListener('drop', (e) => {
    if (![...e.dataTransfer.types].includes('ss-tab')) return;
    e.preventDefault(); e.stopPropagation();
    const id = e.dataTransfer.getData('ss-tab');
    const mt = dragMergeTarget;
    clearDragFx();
    if (mt && mt !== id) { mergeTabs(id, mt); return; } // dropped on a button's center
    let beforeId = null;
    for (const b of scroll.querySelectorAll('.ss-btn')) {
      const r = b.getBoundingClientRect();
      if (e.clientX < r.left + r.width / 2) { beforeId = b.dataset.id; break; }
    }
    reorderTabs(id, beforeId);
  });
  // ‹ › overflow buttons — shown only when the tabs overflow the bar width.
  const navL = el('button', 'ss-btn ss-nav', '‹'); navL.title = L('左へスクロール');
  const navR = el('button', 'ss-btn ss-nav', '›'); navR.title = L('右へスクロール');
  navL.onclick = () => scroll.scrollBy({ left: -220, behavior: 'smooth' });
  navR.onclick = () => scroll.scrollBy({ left: 220, behavior: 'smooth' });
  function updateNav() {
    const overflow = scroll.scrollWidth > scroll.clientWidth + 1;
    navL.style.display = overflow ? '' : 'none';
    navR.style.display = overflow ? '' : 'none';
    navL.disabled = scroll.scrollLeft <= 0;
    navR.disabled = scroll.scrollLeft + scroll.clientWidth >= scroll.scrollWidth - 1;
  }
  scroll.addEventListener('scroll', updateNav);
  barNavUpdate = updateNav;

  bar.appendChild(navL);
  bar.appendChild(scroll);
  bar.appendChild(navR);

  // right-end 🔍 search box (opens the system browser)
  const searchBtn = el('button', 'ss-btn ss-search-btn');
  searchBtn.title = L('検索 / URL（標準ブラウザで開く）');
  searchBtn.append(el('span', 'ss-ico', '🔍'));
  searchBtn.addEventListener('click', () => openSearch(searchBtn));
  bar.appendChild(searchBtn);

  // "other monitors' drawers" — small icon-only button, shown only when relevant
  const othersBtn = el('button', 'ss-btn ss-others-btn');
  othersBtn.title = L('別モニタのドロワー');
  othersBtn.append(el('span', 'ss-ico', OTHERS_TAB.icon));
  othersBtn.style.display = 'none';
  othersBtn.addEventListener('click', () => openTab(OTHERS_TAB, othersBtn));
  bar.appendChild(othersBtn);
  window.overlay.getDisplays().then((list) => {
    const connIds = (list || []).map((d) => String(d.id));
    const hasOther = connIds.some((id) => id !== MY_DISPLAY) || otherProfileIds(connIds).length > 0;
    othersBtn.style.display = hasOther ? '' : 'none';
  });

  // clip (temporary holding) button — also the drop target
  const clipBtn = el('button', 'ss-btn ss-clip-btn');
  clipBtn.title = L('クリップ（一時置き）— ここにドロップ');
  clipBtn.append(el('span', 'ss-ico', CLIP_TAB.icon));
  clipBtn.addEventListener('click', () => openTab(CLIP_TAB, clipBtn));
  bar.appendChild(clipBtn);

  // temporary hide button — stays fixed at the right
  const hideBtn = el('button', 'ss-btn ss-hide', '▲');
  hideBtn.title = L('一時的に隠す（画面上端にカーソルを当てると再表示）');
  hideBtn.onclick = () => {
    tempHidden = !tempHidden;
    hideBtn.classList.toggle('on', tempHidden);
    if (tempHidden) { hovering = false; clearTimeout(hideTimer); } // hide right away
    reflowHeight();
  };
  bar.appendChild(hideBtn);

  // Re-link any open drawers to their freshly-created buttons.
  for (const id in open) {
    let b = bar.querySelector('.ss-btn[data-id="' + id + '"]');
    if (!b && id === '__menu') b = bar.querySelector('.ss-menu');
    if (!b && id === '__clip') b = bar.querySelector('.ss-clip-btn');
    if (b) { open[id].btn = b; b.classList.add('active'); }
  }

  requestAnimationFrame(() => { if (barNavUpdate) barNavUpdate(); });
}

// Drop last session's temporary clip items (the rest persist).
Store.saveClips(Store.getClips().filter((c) => !c.temp));

renderBar();

// Drag & drop intake. Prevent the window from navigating to dropped files, and
// let the bar (which captures while it's the only thing showing) receive drops.
// Drag-intake picker DISABLED: capturing the whole window during a drag froze
// all input when the drop landed on another app (drop/dragend never came back
// to us, so capture never released). Box filing now uses the safe post-drop
// native popup (offerBoxMenu) instead.
document.addEventListener('dragover', (e) => { e.preventDefault(); });
document.addEventListener('drop', async (e) => {
  e.preventDefault(); clearDragFx();
  const shown = pickerShown; pickerShown = false;
  if (pickerEl) closePicker();
  const ids = await handleDrop(e);
  if (!shown) offerBoxMenu(ids); // picker wasn't shown (Mac / Win fallback) -> post-drop menu
});
document.addEventListener('dragleave', (e) => { if (pickerEl && !e.relatedTarget) closePicker(); });
document.addEventListener('dragend', () => { clearDragFx(); pickerShown = false; if (pickerEl) closePicker(); });
bar.addEventListener('dragover', (e) => { e.preventDefault(); bar.classList.add('drop'); });
bar.addEventListener('dragleave', (e) => { if (e.target === bar) bar.classList.remove('drop'); });
bar.addEventListener('drop', async (e) => { bar.classList.remove('drop'); const ids = await handleDrop(e); offerBoxMenu(ids); });

// Reveal on hover at the top edge; hide again shortly after leaving.
const onEnter = () => { hovering = true; clearTimeout(hideTimer); reflowHeight(); };
const onLeave = () => { hovering = false; scheduleHide(); };
peek.addEventListener('mouseenter', onEnter);
bar.addEventListener('mouseenter', onEnter);
bar.addEventListener('mouseleave', onLeave);

function toast(msg) {
  const t = el('div', 'ss-toast', msg);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 5000);
}

// Reveal at the top edge (driven by the main process's global cursor watch),
// which works even when a maximized window covers the thin transparent strip.
window.overlay.onEdge((top) => {
  atEdge = top;
  if (top) { clearTimeout(hideTimer); window.overlay.raise(); reflowHeight(); }
  else { scheduleHide(); }
});

// Close transient (unpinned) drawers when focus leaves the overlay — e.g. the
// user switched virtual desktop / triggered Mission Control / Exposé, or moved
// to another app. Pinned drawers stay so deliberate layouts survive.
window.overlay.onBlur(() => {
  if (!Store.getCloseOnLeave()) return; // off by default — keep drawers open for screenshots / Alt-Tab
  if (searchEl) closeSearch();
  for (const id of Object.keys(open)) if (!open[id].pinned) closeDrawer(id);
});

// macOS: files / text dropped on the menu-bar icon arrive here -> add to Clip.
window.overlay.onAddFiles(async (files) => { const ids = await addFilePaths(files || []); offerBoxMenu(ids); });
if (window.overlay.onDemoToggle) window.overlay.onDemoToggle(() => { try { if (localStorage.getItem('ss.demo') === '1') localStorage.removeItem('ss.demo'); else localStorage.setItem('ss.demo', '1'); } catch (_) {} window.overlay.relaunch(); });
window.overlay.onAddText((text) => {
  const t = String(text || '').trim();
  if (!t) return;
  const id = /^https?:\/\//i.test(t) ? addClip({ kind: 'url', url: t, label: t }) : addClip({ kind: 'text', text: t, label: t.replace(/\s+/g, ' ').slice(0, 40) });
  refreshClipUI();
  toast(L('クリップに追加しました') + ' (1)');
  offerBoxMenu([id]);
});

// Surface why the top-edge reservation didn't take, if it was requested.
window.overlay.onReserveStatus((status, requested) => {
  if (!requested || status === 'ok') return;
  toast(status === 'no-koffi'
    ? L('「領域を予約」には koffi が必要です。PowerShell で「npm install」を実行してください。')
    : L('領域の予約に失敗しました（') + status + L('）。'));
});

applyDisplay(); // push the saved display mode to main and set initial visibility
if (DEMO) setTimeout(stageDemo, 700);

// First run: pop the guide once (until "don't show again" is ticked). Only on
// the primary monitor, so it doesn't appear on every screen in a multi-monitor
// setup. A short delay lets the bar settle first.
if (!DEMO && !Store.getHelpSkip()) {
  const showIntro = () => setTimeout(openHelp, 600);
  window.overlay.getDisplays().then((ds) => {
    const prim = (ds || []).find((d) => d.primary);
    if (prim && MY_DISPLAY && String(prim.id) !== MY_DISPLAY) return; // not the primary monitor
    showIntro();
  }).catch(showIntro);
}

// Re-clamp open drawers if the display size changes (keep user-set sizes).
window.addEventListener('resize', () => {
  for (const id in open) {
    const o = open[id];
    o.el.style.left = anchorLeft(o.btn, o.el.offsetWidth) + 'px';
  }
  reflowHeight();
  if (barNavUpdate) barNavUpdate();
});
