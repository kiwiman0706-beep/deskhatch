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
const MENU_TAB = { id: '__menu', label: 'メニュー', icon: '☰', type: 'menu', width: 380 };

// The "clip" (temporary holding) pseudo-tab — a drop target / bin.
const CLIP_TAB = { id: '__clip', label: 'クリップ', icon: '📎', type: 'clip', width: 380 };

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
  `<rect x="3" y="4.2" width="18" height="3.2" rx="1.6" fill="${color}"/>` +
  `<rect x="6.5" y="9.4" width="11" height="9" rx="2" fill="${color}"/></svg>`;

// --- Persistence (localStorage) -------------------------------------------
const Store = {
  getTabs() {
    try {
      const s = JSON.parse(localStorage.getItem('ss.tabs'));
      return Array.isArray(s) && s.length ? s : null;
    } catch (_) { return null; }
  },
  saveTabs(t) { localStorage.setItem('ss.tabs', JSON.stringify(t)); },
  clearTabs() { localStorage.removeItem('ss.tabs'); },
  getSize(id) {
    try { return JSON.parse(localStorage.getItem('ss.size.' + id)) || null; } catch (_) { return null; }
  },
  saveSize(id, s) { localStorage.setItem('ss.size.' + id, JSON.stringify(s)); },
  getDisplay() {
    const def = { mode: 'autohide', reserve: false, repin: 'event', theme: 'teal' };
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
};

// Accounts: the built-in "default" (shared session) plus user-added ones, each
// with its own isolated session partition.
const partitionFor = (id) => (!id || id === 'default') ? 'persist:smartsuite' : 'persist:acct-' + id;
const accountsFull = () => [{ id: 'default', name: '既定' }].concat(Store.getAccounts());
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
};
const THEME_LABELS = [
  ['teal', 'Teal（既定）'], ['graphite', 'Graphite（ダーク）'], ['ocean', 'Ocean'],
  ['forest', 'Forest'], ['plum', 'Plum'], ['sunset', 'Sunset'], ['rose', 'Rose'], ['light', 'Light'],
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

// ---------------------------------------------------------------------------
// Mouse pass-through: capture over the bar/drawers, pass through elsewhere.
// When only the bar is showing, capture the whole (44px) window so it reliably
// receives clicks AND file drops; pass through when hidden; cursor-based when a
// drawer is open (transparent areas beside it must stay click-through).
// ---------------------------------------------------------------------------
let ignoring = true;
window.overlay.setIgnoreMouse(true);

function setIgnore(v) {
  if (v === ignoring) return;
  ignoring = v;
  window.overlay.setIgnoreMouse(v);
}

function wantIgnore(overUI) {
  if (!barShouldShow()) return true;      // hidden: pass through
  if (Object.keys(open).length === 0) return false; // bar only: capture all
  return !overUI;                         // drawer open: capture over UI only
}

function setOverUI(over) { setIgnore(wantIgnore(over)); }

document.addEventListener('mousemove', (e) => {
  if (dragging) return;
  setOverUI(!!(e.target.closest && e.target.closest('.ss-interactive')));
});
document.addEventListener('mouseleave', () => setOverUI(false));
window.addEventListener('blur', () => setOverUI(false));

// ---------------------------------------------------------------------------
// Bar visibility + window height. Shrinks to a 4px peek when hidden, to the bar
// when idle, and grows to fit open drawers when any are open.
// ---------------------------------------------------------------------------
const isHiddenMode = () => display.mode === 'autohide' || tempHidden;

function barShouldShow() {
  if (Object.keys(open).length) return true; // a drawer is open
  if (!isHiddenMode()) return true;           // always-show mode
  return hovering || atEdge;                  // hidden mode: reveal at top edge
}

function reflowHeight() {
  const shown = barShouldShow();
  bar.classList.toggle('hidden', !shown);
  peek.classList.toggle('on', !shown);
  if (!shown) { window.overlay.setHeight(PEEK); }
  else {
    const heights = Object.keys(open).map((id) => open[id].el.offsetHeight);
    window.overlay.setHeight(window.SSLayout.computeHeight(BAR_H, heights));
  }
  // keep the bar capturing when it's the only thing shown (reliable drop target)
  if (!shown || Object.keys(open).length === 0) setIgnore(wantIgnore(false));
}

function scheduleHide() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(reflowHeight, 350);
}

function applyDisplay() {
  Store.saveDisplay(display);
  applyTheme(display.theme);
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
  back.className = 'ss-fb-btn'; back.textContent = '←'; back.title = '戻る';
  const up = document.createElement('button');
  up.className = 'ss-fb-btn'; up.textContent = '↑'; up.title = '上のフォルダへ';
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
      list.innerHTML = `<li class="ss-fb-err">開けません: ${res.error}</li>`;
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
      list.innerHTML = '<li class="ss-fb-empty">（空のフォルダ）</li>';
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
        if (ent.isDir) load(ent.path);
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
    add.textContent = '＋';
    add.title = 'フォルダを追加';
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
    const b = el('button', 'ss-tabs-tab', p.label || ('タブ' + (i + 1)));
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
  const save = el('button', 'ss-set-btn', 'ファイルに保存');
  save.onclick = () => window.files.saveText(ta.value);
  const clear = el('button', 'ss-set-btn', 'クリア');
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

function buildBookmarks() {
  const wrap = el('div', 'ss-bm');
  const search = document.createElement('input');
  search.className = 'ss-bm-search';
  search.placeholder = 'ブックマークを絞り込み…';
  const list = el('ul', 'ss-bm-list');
  wrap.append(search, list);
  let all = [];
  function render(q) {
    list.innerHTML = '';
    const ql = (q || '').toLowerCase();
    const f = all.filter((b) => !ql || (b.title + ' ' + b.url + ' ' + b.folder).toLowerCase().includes(ql));
    if (!f.length) { list.innerHTML = '<li class="ss-bm-empty">（ブックマークが見つかりません）</li>'; return; }
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
  const reload = el('button', 'ss-set-btn', '再接続');
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
    if (!tab.rtsp) { msg('設定で RTSP URL を入力してください'); return; }
    const r = await window.camera.url(tab.rtsp);
    if (r.error) {
      msg(r.error === 'no-ffmpeg' ? 'ffmpeg が見つかりません（npm install を実行）' : 'RTSP URL が不正です（rtsp://… 形式）');
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
}

async function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  const dt = e.dataTransfer;
  if ([...(dt.types || [])].includes('ss-tab')) return; // internal reorder, not intake
  let added = 0;

  const uriList = (dt.getData('text/uri-list') || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const plain = (dt.getData('text/plain') || '').trim();
  const url = uriList.find((l) => /^https?:\/\//i.test(l)) || (/^https?:\/\//i.test(plain) ? plain : '');
  if (url && (!dt.files || !dt.files.length)) { addClip({ kind: 'url', url, label: url }); added++; }

  for (const f of (dt.files || [])) {
    const p = window.overlay.getPathForFile(f);
    if (!p) continue;
    const st = await window.files.stat(p);
    if (st.error) continue;
    if (st.isDir) addClip({ kind: 'folder', path: p, label: st.name });
    else addClip({ kind: 'file', path: p, label: st.name, viewer: viewerForExt(st.ext) });
    added++;
  }

  // Plain selected text (not a URL, no files) -> a text snippet.
  if (!url && plain && (!dt.files || !dt.files.length)) {
    addClip({ kind: 'text', text: plain, label: plain.replace(/\s+/g, ' ').slice(0, 40) });
    added++;
  }

  if (added) refreshClipUI();
}

let clipListEl = null; // the currently-open clip list, if any
function refreshClipUI() { if (clipListEl) renderClipList(clipListEl); }

function renderClipList(list) {
  list.innerHTML = '';
  const clips = Store.getClips();
  if (!clips.length) { list.innerHTML = '<li class="ss-clip-empty">（空です）ここやバーにドラッグ＆ドロップ</li>'; return; }
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
    li.append(ico, el('span', 'ss-clip-name', it.label));
    li.title = it.url || it.path || (it.text ? it.text.slice(0, 80) : '');
    li.addEventListener('click', () => openClipItem(it));
    if (it.kind === 'file') {
      li.draggable = true;
      li.addEventListener('dragstart', (ev) => { ev.preventDefault(); window.files.startDrag(it.path); });
    }

    const acts = el('span', 'ss-clip-actions');
    const mk = (label, title, fn, cls) => { const b = el('button', 'ss-clip-act' + (cls || ''), label); b.title = title; b.onclick = (ev) => { ev.stopPropagation(); fn(); }; return b; };
    acts.append(
      mk('▲', '上へ', () => moveClip(idx, -1, list)),
      mk('▼', '下へ', () => moveClip(idx, 1, list)),
      mk('⏱', '一時的（再起動で消す）', () => toggleTemp(it.id, list), it.temp ? ' on' : ''),
      mk('📌', 'バーに固定', () => promoteClip(it)),
      mk('×', '削除', () => { Store.saveClips(Store.getClips().filter((c) => c.id !== it.id)); renderClipList(list); }, ' ss-clip-x'),
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
  else if (it.kind === 'text') openTab({ id, label: it.label || 'テキスト', icon: '✂', type: 'snippet', text: it.text, width: 420 }, anchor);
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
  else if (it.kind === 'text') tab = { id, label: (it.label || 'メモ').slice(0, 16), icon: '✂', type: 'snippet', text: it.text, width: 420 };
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

function buildClipPanel() {
  const wrap = el('div', 'ss-clip-bin');
  const list = el('ul', 'ss-clip-list');
  const head = el('div', 'ss-clip-head');
  const clear = el('button', 'ss-set-btn', '全クリア');
  clear.onclick = () => { if (Store.getClips().length) { Store.saveClips([]); renderClipList(list); } };
  head.append(el('span', 'ss-clip-hint', 'ドラッグ＆ドロップで追加'), clear);
  wrap.append(head, list);
  const stop = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
  ['dragenter', 'dragover'].forEach((ev) => wrap.addEventListener(ev, (e) => { stop(e); wrap.classList.add('over'); }));
  ['dragleave', 'dragend'].forEach((ev) => wrap.addEventListener(ev, (e) => { stop(e); wrap.classList.remove('over'); }));
  wrap.addEventListener('drop', (e) => { wrap.classList.remove('over'); handleDrop(e); });
  clipListEl = list;
  renderClipList(list);
  return wrap;
}

// --- File viewer drawer ----------------------------------------------------
function buildViewer(tab) {
  const wrap = el('div', 'ss-viewer');
  if (!tab.path) { wrap.append(el('div', 'ss-viewer-msg', 'ファイルがありません')); return wrap; }
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
  const copy = el('button', 'ss-set-btn', 'コピー');
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
  const refresh = el('button', 'ss-set-btn', '更新');
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
      pre.textContent = data.text || '（クリップボードは空です）';
      content.appendChild(pre);
    }
  }
  refresh.onclick = load;
  barEl.append(refresh);
  wrap.append(barEl, content);
  load();
  return wrap;
}

function buildBody(tab) {
  const body = document.createElement('div');
  body.className = 'ss-drawer-body';
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
  } else if (tab.type === 'editbox') {
    body.appendChild(buildTabEditor(tab.target));
  } else if (tab.type === 'snippet') {
    body.appendChild(buildSnippet(tab));
  } else if (tab.type === 'tool') {
    if (tab.tool === 'editor') body.appendChild(buildEditor());
    else if (tab.tool === 'calc') body.appendChild(buildCalc());
    else if (tab.tool === 'clipboard') body.appendChild(buildClipboard());
    else if (tab.tool === 'bookmarks') body.appendChild(buildBookmarks());
  } else if (tab.type === 'menu') {
    body.appendChild(buildMenuPanel());
  }
  return body;
}

function attachResize(handle, d, tab, ax, ay) {
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    dragging = true;
    setOverUI(true);
    const sx = e.clientX, sy = e.clientY, sw = d.offsetWidth, sh = d.offsetHeight;

    const move = (ev) => {
      const bounds = {
        minW: 240, minH: 160,
        maxW: window.innerWidth - 2 * MARGIN,
        maxH: window.screen.availHeight - BAR_H - MARGIN,
      };
      const w = ax ? sw + (ev.clientX - sx) : sw;
      const h = ay ? sh + (ev.clientY - sy) : sh;
      const s = window.SSLayout.clampSize(w, h, bounds);
      d.style.width = s.width + 'px';
      d.style.height = s.height + 'px';
      d.style.left = window.SSLayout.computeLeft(d.offsetLeft, s.width, window.innerWidth, MARGIN) + 'px';
      reflowHeight();
    };
    const up = () => {
      handle.releasePointerCapture(e.pointerId);
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      dragging = false;
      Store.saveSize(tab.id, { width: d.offsetWidth, height: d.offsetHeight });
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
  pin.title = 'ピン留め（開いたままにする）';
  const close = document.createElement('button');
  close.className = 'ss-head-btn ss-close';
  close.textContent = '✕';
  close.title = '閉じる';
  head.append(title, spacer);
  if (tab.type === 'page' || tab.type === 'tabs' || tab.type === 'split') {
    const ext = document.createElement('button');
    ext.className = 'ss-head-btn';
    ext.textContent = '↗';
    ext.title = '標準ブラウザで開く';
    ext.addEventListener('click', () => openExternalFor(tab, d));
    head.append(ext);
  }
  head.append(pin, close);

  const gripE = el('div', 'ss-resize-e');   // right edge: width
  const gripS = el('div', 'ss-resize-s');   // bottom edge: height
  const gripSE = el('div', 'ss-resize-se'); // corner: both
  gripSE.title = 'ドラッグでサイズ変更';

  d.append(head, buildBody(tab), gripE, gripS, gripSE);

  pin.addEventListener('click', () => togglePin(tab.id));
  close.addEventListener('click', () => closeDrawer(tab.id));
  d.addEventListener('mousedown', () => bringToFront(d));
  attachResize(gripE, d, tab, true, false);
  attachResize(gripS, d, tab, false, true);
  attachResize(gripSE, d, tab, true, true);
  return d;
}

// ---------------------------------------------------------------------------
// Open / close / pin
// ---------------------------------------------------------------------------
function bringToFront(el) {
  el.style.zIndex = String(++zCounter);
}

function openExternalFor(tab, d) {
  if (tab.type === 'page' && tab.url) window.system.external(tab.url);
  else if (tab.type === 'split') (tab.panes || []).forEach((p) => p.url && window.system.external(p.url));
  else if (tab.type === 'tabs') {
    const w = d.querySelector('.ss-tabs');
    if (w && w.dataset.activeUrl) window.system.external(w.dataset.activeUrl);
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
  root.append(el('div', 'ss-disp-title', '表示'));

  const mk = (val, label) => {
    const l = el('label', 'ss-set-check');
    const r = document.createElement('input');
    r.type = 'radio'; r.name = 'ss-mode'; r.checked = display.mode === val;
    r.onchange = () => { if (r.checked) { display = { ...display, mode: val }; applyDisplay(); } };
    l.append(r, document.createTextNode(' ' + label));
    return l;
  };
  root.append(mk('always', '常に表示'), mk('autohide', '自動で隠す'));

  const resL = el('label', 'ss-set-check');
  const res = document.createElement('input');
  res.type = 'checkbox'; res.checked = !!display.reserve;
  res.onchange = () => { display = { ...display, reserve: res.checked }; applyDisplay(); };
  resL.append(res, document.createTextNode(' 領域を予約（常に表示でも最大化ウィンドウと重ならない）'));
  root.append(resL);

  // Re-pin strategy (only relevant while reserving).
  const repinWrap = el('label', 'ss-set-check');
  const repinSel = el('select', 'ss-set-type');
  [['event', 'イベント駆動（推奨）'], ['poll', 'ポーリング（現行）']].forEach(([v, lbl]) => {
    const op = el('option', null, lbl); op.value = v; repinSel.appendChild(op);
  });
  repinSel.value = display.repin || 'event';
  repinSel.onchange = () => { display = { ...display, repin: repinSel.value }; applyDisplay(); };
  repinWrap.append(document.createTextNode('予約の維持方式 '), repinSel);
  root.append(repinWrap);

  // Target monitors (multi-display): check the displays that should show a bar.
  const monBox = el('div', 'ss-mon');
  monBox.append(el('span', 'ss-set-wlabel', '表示モニタ'));
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
  themeWrap.append(document.createTextNode('テーマ '), themeSel);
  root.append(themeWrap);

  root.append(el('div', 'ss-disp-note', '※「常に表示」で重なる場合は「領域を予約」をON。維持方式は通常「イベント駆動」でOK（うまく追従しない時だけ「ポーリング」へ）。'));
  return root;
}

// All editable fields for one tab object `t` (edits bound in place). `extras`
// are extra nodes appended to the top row (e.g. reorder/delete buttons).
// Shared by the settings list and the inline right-click editor.
function buildTabFields(t, extras) {
  const wrap = el('div', 'ss-fields');
  const top = el('div', 'ss-set-top');
  const icon = field(t.icon, '絵文字'); icon.classList.add('ss-set-icon'); icon.oninput = () => { t.icon = icon.value; };
  const label = field(t.label, 'ラベル'); label.oninput = () => { t.label = label.value; };
  top.append(icon, label);
  (extras || []).forEach((n) => top.append(n));

  const width = document.createElement('input');
  width.type = 'number'; width.className = 'ss-set-w'; width.value = t.width || 420;
  width.oninput = () => { t.width = Number(width.value) || 420; };
  const wlabel = el('span', 'ss-set-wlabel', '幅');
  const row2 = el('div', 'ss-set-row');

  if (!['page', 'tabs', 'files', 'folder', 'tool', 'camera'].includes(t.type)) {
    row2.append(el('span', 'ss-set-note', '特殊表示（編集不可）'), wlabel, width);
    wrap.append(top, row2);
    return wrap;
  }

  const type = el('select', 'ss-set-type');
  [['page', 'ページ'], ['tabs', 'タブ'], ['files', 'PC全体'], ['folder', 'フォルダ'], ['tool', 'ツール'], ['camera', 'カメラ']].forEach(([v, lbl]) => { const op = el('option', null, lbl); op.value = v; type.appendChild(op); });
  type.value = t.type;
  const mobileWrap = el('label', 'ss-set-check'); const mobile = document.createElement('input'); mobile.type = 'checkbox'; mobile.checked = !!t.mobile; mobile.onchange = () => { t.mobile = mobile.checked; }; mobileWrap.append(mobile, document.createTextNode(' スマホ表示'));
  const keepWrap = el('label', 'ss-set-check'); const keep = document.createElement('input'); keep.type = 'checkbox'; keep.checked = !!t.keepAlive; keep.onchange = () => { t.keepAlive = keep.checked; }; keepWrap.append(keep, document.createTextNode(' 閉じても止めない'));
  const toolWrap = el('label', 'ss-set-check'); const toolSel = el('select', 'ss-set-type'); [['editor', '簡易エディタ'], ['calc', '電卓'], ['clipboard', 'クリップボード'], ['bookmarks', 'ブックマーク']].forEach(([v, lbl]) => { const op = el('option', null, lbl); op.value = v; toolSel.appendChild(op); }); toolSel.value = t.tool || 'editor'; toolSel.onchange = () => { t.tool = toolSel.value; }; toolWrap.append(document.createTextNode('ツール '), toolSel);
  const acctWrap = el('label', 'ss-set-check'); const acctSel = el('select', 'ss-set-type'); accountsFull().forEach((a) => { const op = el('option', null, a.name); op.value = a.id; acctSel.appendChild(op); }); acctSel.value = t.account || 'default'; acctSel.onchange = () => { t.account = acctSel.value === 'default' ? undefined : acctSel.value; }; acctWrap.append(document.createTextNode('アカウント '), acctSel);
  row2.append(type, mobileWrap, acctWrap, toolWrap, keepWrap, wlabel, width);

  const url = field(t.url, 'https://…'); url.classList.add('ss-set-url'); url.oninput = () => { t.url = url.value; };
  const pathInput = field(t.path, 'フォルダ未選択'); pathInput.classList.add('ss-set-url'); pathInput.readOnly = true;
  const pickBtn = el('button', 'ss-set-mini', '📂'); pickBtn.title = 'フォルダを選択'; pickBtn.onclick = async () => { const dir = await window.files.pickFolder(); if (dir) { t.path = dir; pathInput.value = dir; } };
  const pathRow = el('div', 'ss-set-row'); pathRow.append(pickBtn, pathInput);
  const rtsp = field(t.rtsp, 'rtsp://ユーザー:パス@IP:554/stream1'); rtsp.classList.add('ss-set-url'); rtsp.oninput = () => { t.rtsp = rtsp.value; };
  const paneBox = el('div', 'ss-panes');
  function renderPanes() {
    paneBox.innerHTML = '';
    (t.panes || []).forEach((pane, pi) => {
      const r = el('div', 'ss-set-row');
      const lbl = field(pane.label, 'タブ名'); lbl.classList.add('ss-pane-label'); lbl.oninput = () => { pane.label = lbl.value; };
      const u = field(pane.url, 'https://…'); u.classList.add('ss-set-url'); u.oninput = () => { pane.url = u.value; };
      const del = el('button', 'ss-set-mini', '🗑'); del.onclick = () => { t.panes.splice(pi, 1); renderPanes(); };
      r.append(lbl, u, del); paneBox.appendChild(r);
    });
    const add = el('button', 'ss-set-btn', '＋ タブ追加'); add.onclick = () => { if (!t.panes) t.panes = []; t.panes.push({ label: 'タブ' + (t.panes.length + 1), url: 'https://', mobile: true }); renderPanes(); };
    paneBox.appendChild(add);
  }
  renderPanes();
  const syncType = () => {
    t.type = type.value;
    const isPage = t.type === 'page', isFolder = t.type === 'folder', isTabs = t.type === 'tabs', isTool = t.type === 'tool', isCamera = t.type === 'camera';
    url.style.display = isPage ? '' : 'none';
    mobileWrap.style.display = isPage ? '' : 'none';
    acctWrap.style.display = (isPage || isTabs) ? '' : 'none';
    toolWrap.style.display = isTool ? '' : 'none';
    keepWrap.style.display = (isPage || isTabs || isCamera) ? '' : 'none';
    pathRow.style.display = isFolder ? '' : 'none';
    rtsp.style.display = isCamera ? '' : 'none';
    paneBox.style.display = isTabs ? '' : 'none';
  };
  type.onchange = syncType; syncType();
  wrap.append(top, row2, url, pathRow, rtsp, paneBox);
  return wrap;
}

// Inline editor (opened from a button's right-click "編集").
function buildTabEditor(target) {
  const t = JSON.parse(JSON.stringify(target));
  const wrap = el('div', 'ss-editbox');
  wrap.append(buildTabFields(t));
  const actions = el('div', 'ss-set-actions');
  const save = el('button', 'ss-set-btn ss-set-save', '保存');
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
  openTab({ id: '__edit', type: 'editbox', target: tab, label: '編集', icon: '✎', width: 460 }, btn);
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
  const addBtn = el('button', 'ss-set-btn', '＋ 項目を追加');
  addBtn.onclick = () => {
    working.push({ id: 'tab' + Date.now(), label: '新規', icon: '🔖', type: 'page', url: 'https://', mobile: true, width: 420 });
    render();
  };
  const saveBtn = el('button', 'ss-set-btn ss-set-save', '保存');
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
  const resetBtn = el('button', 'ss-set-btn', '既定に戻す');
  resetBtn.onclick = () => {
    Store.clearTabs();
    localStorage.removeItem('ss.display'); // back to autohide + no reserve
    display = Store.getDisplay();
    applyDisplay();
    tabs = defaultTabs();
    working = JSON.parse(JSON.stringify(tabs));
    render();
  };
  const exportBtn = el('button', 'ss-set-btn', '⬇ エクスポート');
  exportBtn.onclick = exportSettings;
  const importBtn = el('button', 'ss-set-btn', '⬆ インポート');
  importBtn.onclick = importSettings;
  actions.append(addBtn, saveBtn, resetBtn, exportBtn, importBtn);

  render();
  root.append(listEl, actions);
  return root;
}

function buildHelp() {
  const root = el('div', 'ss-help');
  root.innerHTML = `
    <h3>SmartSuite.next</h3>
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
    </ul>`;
  return root;
}

function buildTools() {
  const root = el('div', 'ss-tools');
  const anchor = () => document.querySelector('.ss-menu') || document.getElementById('bar');

  const sys = el('div', 'ss-tools-sec');
  sys.append(el('div', 'ss-tools-title', 'システム / デバイス'));
  [['Windows 設定', 'settings'], ['コントロールパネル', 'control'], ['デバイスマネージャー', 'devmgr'],
    ['God Mode', 'godmode'], ['プリンター', 'printers'], ['スキャナー', 'scanners']]
    .forEach(([label, key]) => { const b = el('button', 'ss-set-btn', label); b.onclick = () => window.system.open(key); sys.appendChild(b); });

  const tools = el('div', 'ss-tools-sec');
  tools.append(el('div', 'ss-tools-title', 'ツール'));
  [['📝 簡易エディタ', { id: 'tool-editor', label: 'エディタ', icon: '📝', type: 'tool', tool: 'editor', width: 480 }],
    ['🧮 電卓', { id: 'tool-calc', label: '電卓', icon: '🧮', type: 'tool', tool: 'calc', width: 280 }],
    ['📋 クリップボード', { id: 'tool-clip', label: 'クリップボード', icon: '📋', type: 'tool', tool: 'clipboard', width: 420 }],
    ['🔖 ブックマーク', { id: 'tool-bm', label: 'ブックマーク', icon: '🔖', type: 'tool', tool: 'bookmarks', width: 440 }]]
    .forEach(([label, t]) => { const b = el('button', 'ss-set-btn', label); b.onclick = () => openTab(t, anchor()); tools.appendChild(b); });

  root.append(sys, tools);
  return root;
}

function buildMenuPanel() {
  const wrap = el('div', 'ss-menu-panel');

  const acct = el('div', 'ss-acct');
  function renderAccounts() {
    acct.innerHTML = '';
    acct.append(el('span', 'ss-acct-label', 'Google アカウント'));
    for (const a of accountsFull()) {
      const chip = el('div', 'ss-acct-chip');
      chip.append(el('span', 'ss-acct-name', a.name));
      const inBtn = el('button', 'ss-acct-mini', 'ログイン');
      inBtn.onclick = () => window.auth.login(partitionFor(a.id));
      chip.append(inBtn);
      if (a.id !== 'default') {
        const del = el('button', 'ss-acct-mini', '✕');
        del.title = 'このアカウントを削除';
        del.onclick = () => { removeAccount(a.id); renderAccounts(); };
        chip.append(del);
      }
      acct.append(chip);
    }
    const addName = el('input', 'ss-set-input');
    addName.placeholder = '追加するアカウント名';
    const addBtn = el('button', 'ss-set-btn', '＋ 追加');
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
  const bSettings = el('button', 'ss-menu-tab', '⚙ 設定');
  const bTools = el('button', 'ss-menu-tab', '🧰 ツール');
  const bHelp = el('button', 'ss-menu-tab', '❔ ヘルプ');
  tabsBar.append(bSettings, bTools, bHelp);
  const view = el('div', 'ss-menu-view');

  const footer = el('div', 'ss-menu-foot');
  const quitBtn = el('button', 'ss-set-btn ss-quit', '⏻ アプリを終了');
  quitBtn.onclick = () => window.overlay.quit();
  footer.append(quitBtn);

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
  return '🔗';
}
function paneToTab(p, baseId, k) {
  const t = { id: baseId + '_' + k + Date.now().toString(36).slice(-3), label: p.label || 'タブ', icon: paneIcon(p), width: 460 };
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
  try { obj = JSON.parse(text); } catch (_) { toast('読み込めない形式です'); return; }
  const data = obj && obj.data ? obj.data : obj;
  if (!data || typeof data !== 'object') { toast('設定が見つかりません'); return; }
  Object.keys(data).forEach((k) => { if (k.indexOf('ss.') === 0) localStorage.setItem(k, data[k]); });
  location.reload();
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
  arr.push({ id: 'tab' + Date.now().toString(36), label: '新規', icon: '🔖', type: 'page', url: 'https://', mobile: true, width: 460 });
  commitTabs(arr);
}

async function tabContextMenu(tab, btn) {
  const items = [
    { id: 'edit', label: '編集…' },
    { id: 'dup', label: 'この項目を複製' },
  ];
  if (tab.type === 'tabs') items.push({ id: 'ungroup', label: 'タブを分解' });
  items.push(
    { separator: true },
    { id: 'add', label: '新規項目を追加' },
    { id: 'left', label: '← 左へ移動' },
    { id: 'right', label: '右へ移動 →' },
    { separator: true },
    { id: 'del', label: '削除' },
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

function renderBar() {
  bar.innerHTML = '';

  // logo / menu button — stays fixed at the left, doesn't scroll away
  const menuBtn = el('button', 'ss-btn ss-menu');
  menuBtn.title = 'メニュー（設定・ヘルプ）';
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
  bar.appendChild(scroll);

  // clip (temporary holding) button — also the drop target
  const clipBtn = el('button', 'ss-btn ss-clip-btn');
  clipBtn.title = 'クリップ（一時置き）— ここにドロップ';
  clipBtn.append(el('span', 'ss-ico', CLIP_TAB.icon));
  clipBtn.addEventListener('click', () => openTab(CLIP_TAB, clipBtn));
  bar.appendChild(clipBtn);

  // temporary hide button — stays fixed at the right
  const hideBtn = el('button', 'ss-btn ss-hide', '▲');
  hideBtn.title = '一時的に隠す（画面上端にカーソルを当てると再表示）';
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
}

// Drop last session's temporary clip items (the rest persist).
Store.saveClips(Store.getClips().filter((c) => !c.temp));

renderBar();

// Drag & drop intake. Prevent the window from navigating to dropped files, and
// let the bar (which captures while it's the only thing showing) receive drops.
document.addEventListener('dragover', (e) => { e.preventDefault(); });
document.addEventListener('drop', (e) => { e.preventDefault(); clearDragFx(); });
document.addEventListener('dragend', clearDragFx);
bar.addEventListener('dragover', (e) => { e.preventDefault(); bar.classList.add('drop'); });
bar.addEventListener('dragleave', (e) => { if (e.target === bar) bar.classList.remove('drop'); });
bar.addEventListener('drop', (e) => { bar.classList.remove('drop'); handleDrop(e); });

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

// Surface why the top-edge reservation didn't take, if it was requested.
window.overlay.onReserveStatus((status, requested) => {
  if (!requested || status === 'ok') return;
  toast(status === 'no-koffi'
    ? '「領域を予約」には koffi が必要です。PowerShell で「npm install」を実行してください。'
    : '領域の予約に失敗しました（' + status + '）。');
});

applyDisplay(); // push the saved display mode to main and set initial visibility

// Re-clamp open drawers if the display size changes (keep user-set sizes).
window.addEventListener('resize', () => {
  for (const id in open) {
    const o = open[id];
    o.el.style.left = anchorLeft(o.btn, o.el.offsetWidth) + 'px';
  }
  reflowHeight();
});
