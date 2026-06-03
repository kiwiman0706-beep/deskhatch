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
    try { const d = JSON.parse(localStorage.getItem('ss.display')); return d && d.mode ? d : { mode: 'always', reserve: false }; } catch (_) { return { mode: 'always', reserve: false }; }
  },
  saveDisplay(d) { localStorage.setItem('ss.display', JSON.stringify(d)); },
  getAccounts() {
    try { const a = JSON.parse(localStorage.getItem('ss.accounts')); return Array.isArray(a) ? a : []; } catch (_) { return []; }
  },
  saveAccounts(a) { localStorage.setItem('ss.accounts', JSON.stringify(a)); },
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

const defaultTabs = () => JSON.parse(JSON.stringify(window.SS_TABS || []));
const loadTabs = () => Store.getTabs() || defaultTabs();

const bar = document.getElementById('bar');
const peek = document.getElementById('peek');
let tabs = loadTabs();

/** id -> { el, btn, pinned } */
const open = {};
let zCounter = 100;
let dragging = false; // true while a drawer is being resized

// Bar visibility state
const PEEK = 4;
let display = Store.getDisplay(); // { mode: 'always'|'autohide', reserve: bool }
let tempHidden = false;           // one-shot "get out of my way"
let hovering = false;             // pointer over bar/peek
let hideTimer = null;

// ---------------------------------------------------------------------------
// Mouse pass-through: capture only while the pointer is over the bar/drawers.
// ---------------------------------------------------------------------------
let ignoring = true;
window.overlay.setIgnoreMouse(true);

function setOverUI(over) {
  const want = !over; // want to ignore (pass through) when NOT over UI
  if (want === ignoring) return;
  ignoring = want;
  window.overlay.setIgnoreMouse(want);
}

document.addEventListener('mousemove', (e) => {
  if (dragging) return; // keep capturing while resizing
  const overUI = !!(e.target.closest && e.target.closest('.ss-interactive'));
  setOverUI(overUI);
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
  return hovering;                            // hidden mode: only while hovering
}

function reflowHeight() {
  const shown = barShouldShow();
  bar.classList.toggle('hidden', !shown);
  peek.classList.toggle('on', !shown);
  if (!shown) { window.overlay.setHeight(PEEK); return; }
  const heights = Object.keys(open).map((id) => open[id].el.offsetHeight);
  window.overlay.setHeight(window.SSLayout.computeHeight(BAR_H, heights));
}

function scheduleHide() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(reflowHeight, 350);
}

function applyDisplay() {
  Store.saveDisplay(display);
  window.overlay.setDisplay(display); // main toggles the AppBar reservation
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
  } else if (tab.type === 'files') {
    body.appendChild(buildFilesPanel(tab.path));
  } else if (tab.type === 'folder') {
    body.appendChild(buildFilesPanel(tab.path || '@pc'));
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
  head.append(title, spacer, pin, close);

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

  const d = createDrawer(tab);
  document.body.appendChild(d);
  d.style.left = anchorLeft(btn, d.offsetWidth) + 'px';
  bringToFront(d);

  open[tab.id] = { el: d, btn, pinned: false };
  btn.classList.add('active');
  reflowHeight();
  requestAnimationFrame(() => d.classList.add('open'));
}

function closeDrawer(id) {
  const o = open[id];
  if (!o) return;
  o.el.classList.remove('open');
  o.btn.classList.remove('active');
  delete open[id];
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
  resL.append(res, document.createTextNode(' 最大化ウィンドウと重ならない（領域を予約）'));
  root.append(resL);
  return root;
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

      const top = el('div', 'ss-set-top');
      const icon = field(t.icon, '絵文字');
      icon.classList.add('ss-set-icon');
      icon.oninput = () => { t.icon = icon.value; };
      const label = field(t.label, 'ラベル');
      label.oninput = () => { t.label = label.value; };
      const upBtn = el('button', 'ss-set-mini', '▲');
      const downBtn = el('button', 'ss-set-mini', '▼');
      const delBtn = el('button', 'ss-set-mini', '🗑');
      upBtn.onclick = () => { if (idx > 0) { [working[idx - 1], working[idx]] = [working[idx], working[idx - 1]]; render(); } };
      downBtn.onclick = () => { if (idx < working.length - 1) { [working[idx + 1], working[idx]] = [working[idx], working[idx + 1]]; render(); } };
      delBtn.onclick = () => { working.splice(idx, 1); render(); };
      top.append(icon, label, upBtn, downBtn, delBtn);

      const editable = t.type === 'page' || t.type === 'files' || t.type === 'folder';

      const width = document.createElement('input');
      width.type = 'number';
      width.className = 'ss-set-w';
      width.value = t.width || 420;
      width.oninput = () => { t.width = Number(width.value) || 420; };
      const wlabel = el('span', 'ss-set-wlabel', '幅');

      const row2 = el('div', 'ss-set-row');

      if (editable) {
        const type = el('select', 'ss-set-type');
        [['page', 'ページ'], ['files', 'PC全体'], ['folder', 'フォルダ']].forEach(([v, lbl]) => {
          const op = el('option', null, lbl); op.value = v; type.appendChild(op);
        });
        type.value = t.type;
        const mobileWrap = el('label', 'ss-set-check');
        const mobile = document.createElement('input');
        mobile.type = 'checkbox';
        mobile.checked = !!t.mobile;
        mobile.onchange = () => { t.mobile = mobile.checked; };
        mobileWrap.append(mobile, document.createTextNode(' スマホ表示'));

        const acctWrap = el('label', 'ss-set-check');
        const acctSel = el('select', 'ss-set-type');
        accountsFull().forEach((a) => { const op = el('option', null, a.name); op.value = a.id; acctSel.appendChild(op); });
        acctSel.value = t.account || 'default';
        acctSel.onchange = () => { t.account = acctSel.value === 'default' ? undefined : acctSel.value; };
        acctWrap.append(document.createTextNode('アカウント '), acctSel);

        row2.append(type, mobileWrap, acctWrap, wlabel, width);

        const url = field(t.url, 'https://…');
        url.classList.add('ss-set-url');
        url.oninput = () => { t.url = url.value; };

        const pathInput = field(t.path, 'フォルダ未選択');
        pathInput.classList.add('ss-set-url');
        pathInput.readOnly = true;
        const pickBtn = el('button', 'ss-set-mini', '📂');
        pickBtn.title = 'フォルダを選択';
        pickBtn.onclick = async () => {
          const dir = await window.files.pickFolder();
          if (dir) { t.path = dir; pathInput.value = dir; }
        };
        const pathRow = el('div', 'ss-set-row');
        pathRow.append(pickBtn, pathInput);

        const syncType = () => {
          t.type = type.value;
          const isPage = t.type === 'page';
          const isFolder = t.type === 'folder';
          url.style.display = isPage ? '' : 'none';
          mobileWrap.style.display = isPage ? '' : 'none';
          acctWrap.style.display = isPage ? '' : 'none';
          pathRow.style.display = isFolder ? '' : 'none';
        };
        type.onchange = syncType;
        syncType();

        card.append(top, row2, url, pathRow);
      } else {
        row2.append(el('span', 'ss-set-note', '特殊表示（編集不可）'), wlabel, width);
        card.append(top, row2);
      }
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
    tabs = defaultTabs();
    working = JSON.parse(JSON.stringify(tabs));
    render();
  };
  actions.append(addBtn, saveBtn, resetBtn);

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
  const bHelp = el('button', 'ss-menu-tab', '❔ ヘルプ');
  tabsBar.append(bSettings, bHelp);
  const view = el('div', 'ss-menu-view');

  const footer = el('div', 'ss-menu-foot');
  const quitBtn = el('button', 'ss-set-btn ss-quit', '⏻ アプリを終了');
  quitBtn.onclick = () => window.overlay.quit();
  footer.append(quitBtn);

  wrap.append(acct, tabsBar, view, footer);

  function show(which) {
    view.innerHTML = '';
    bSettings.classList.toggle('active', which === 's');
    bHelp.classList.toggle('active', which === 'h');
    view.appendChild(which === 's' ? buildSettings() : buildHelp());
  }
  bSettings.onclick = () => show('s');
  bHelp.onclick = () => show('h');
  show('s');
  return wrap;
}

// ---------------------------------------------------------------------------
// Build the bar
// ---------------------------------------------------------------------------
function renderBar() {
  bar.innerHTML = '';

  // logo / menu button — stays fixed at the left, doesn't scroll away
  const menuBtn = el('button', 'ss-btn ss-menu');
  menuBtn.title = 'メニュー（設定・ヘルプ）';
  menuBtn.innerHTML = logoMark('#eafafa');
  menuBtn.addEventListener('click', () => openTab(MENU_TAB, menuBtn));
  bar.appendChild(menuBtn);

  // scrollable tab area (horizontal scroll when items overflow)
  const scroll = el('div', 'ss-bar-scroll');
  for (const tab of tabs) {
    const btn = el('button', 'ss-btn');
    btn.dataset.id = tab.id;
    btn.append(el('span', 'ss-ico', tab.icon), el('span', null, tab.label));
    btn.addEventListener('click', () => openTab(tab, btn));
    scroll.appendChild(btn);
  }
  scroll.addEventListener('wheel', (e) => {
    if (e.deltaY) { scroll.scrollLeft += e.deltaY; e.preventDefault(); }
  }, { passive: false });
  bar.appendChild(scroll);

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
}

renderBar();

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
