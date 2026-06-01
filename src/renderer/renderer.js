'use strict';

/* global SS_TABS */

const BAR_H = 44;
const MARGIN = 6;
const ANIM_MS = 200;
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
  'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const drawerHeight = () => Math.min(640, Math.floor(window.innerHeight * 0.8));

const bar = document.getElementById('bar');
const tabs = window.SS_TABS || [];

/** id -> { el, btn, pinned } */
const open = {};
let zCounter = 100;

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
  const overUI = !!(e.target.closest && e.target.closest('.ss-interactive'));
  setOverUI(overUI);
});
document.addEventListener('mouseleave', () => setOverUI(false));
window.addEventListener('blur', () => setOverUI(false));

// ---------------------------------------------------------------------------
// Window height: shrink to the bar when idle, grow to fit open drawers.
// ---------------------------------------------------------------------------
function reflowHeight() {
  const heights = Object.keys(open).map((id) => open[id].el.offsetHeight);
  window.overlay.setHeight(window.SSLayout.computeHeight(BAR_H, heights));
}

// ---------------------------------------------------------------------------
// Drawer construction
// ---------------------------------------------------------------------------
function buildFilesPanel() {
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
  load('::pc', false);
  return wrap;
}

function buildBody(tab) {
  const body = document.createElement('div');
  body.className = 'ss-drawer-body';
  if (tab.type === 'page') {
    const wv = document.createElement('webview');
    wv.className = 'ss-webview';
    wv.setAttribute('partition', 'persist:smartsuite'); // share login cookies
    wv.setAttribute('allowpopups', '');
    if (tab.mobile) wv.setAttribute('useragent', MOBILE_UA);
    wv.setAttribute('src', tab.url);
    body.appendChild(wv);
  } else if (tab.type === 'files') {
    body.appendChild(buildFilesPanel());
  }
  return body;
}

function createDrawer(tab) {
  const d = document.createElement('div');
  d.className = 'ss-drawer ss-interactive';
  d.dataset.id = tab.id;
  d.style.width = tab.width + 'px';
  d.style.height = drawerHeight() + 'px';

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

  d.append(head, buildBody(tab));

  pin.addEventListener('click', () => togglePin(tab.id));
  close.addEventListener('click', () => closeDrawer(tab.id));
  d.addEventListener('mousedown', () => bringToFront(d));
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
  d.style.left = anchorLeft(btn, tab.width) + 'px';
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

// ---------------------------------------------------------------------------
// Build the bar
// ---------------------------------------------------------------------------
for (const tab of tabs) {
  const btn = document.createElement('button');
  btn.className = 'ss-btn';
  btn.dataset.id = tab.id;
  const ico = document.createElement('span');
  ico.className = 'ss-ico';
  ico.textContent = tab.icon;
  const label = document.createElement('span');
  label.textContent = tab.label;
  btn.append(ico, label);
  btn.addEventListener('click', () => openTab(tab, btn));
  bar.appendChild(btn);
}

// Re-clamp open drawers if the display size changes.
window.addEventListener('resize', () => {
  for (const id in open) {
    const o = open[id];
    o.el.style.left = anchorLeft(o.btn, o.el.offsetWidth) + 'px';
    o.el.style.height = drawerHeight() + 'px';
  }
  reflowHeight();
});
