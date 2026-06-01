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
  let h = BAR_H;
  for (const id in open) {
    const el = open[id].el;
    h = Math.max(h, BAR_H + el.offsetHeight);
  }
  window.overlay.setHeight(h);
}

// ---------------------------------------------------------------------------
// Drawer construction
// ---------------------------------------------------------------------------
function buildFilesPanel() {
  const wrap = document.createElement('div');
  wrap.className = 'ss-files';
  const drop = document.createElement('div');
  drop.className = 'ss-drop';
  drop.textContent = 'ここにファイルをドロップ';
  const list = document.createElement('ul');
  list.className = 'ss-filelist';
  const empty = document.createElement('div');
  empty.className = 'ss-empty';
  empty.textContent = '（まだ何もありません）';
  list.appendChild(empty);
  wrap.append(drop, list);

  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
  ['dragenter', 'dragover'].forEach((ev) =>
    wrap.addEventListener(ev, (e) => { stop(e); drop.classList.add('over'); }));
  ['dragleave', 'dragend'].forEach((ev) =>
    wrap.addEventListener(ev, (e) => { stop(e); drop.classList.remove('over'); }));

  wrap.addEventListener('drop', (e) => {
    stop(e);
    drop.classList.remove('over');
    if (empty.parentNode) empty.remove();
    for (const f of e.dataTransfer.files) {
      const li = document.createElement('li');
      li.textContent = f.name;
      li.title = window.overlay.getPathForFile(f) || f.name;
      list.appendChild(li);
    }
  });
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
  let left = rect.left; // align drawer's left edge with the button's left edge
  if (left + width > window.innerWidth - MARGIN) {
    left = window.innerWidth - width - MARGIN; // clamp into view (option 1)
  }
  return Math.max(MARGIN, left);
}

function openTab(tab, btn) {
  const existing = open[tab.id];
  if (existing) {
    if (existing.pinned) { bringToFront(existing.el); return; }
    closeDrawer(tab.id); // toggle off when clicking the active (unpinned) tab
    return;
  }

  // Default behaviour: only one drawer at a time. Pinned drawers stay.
  for (const id in open) {
    if (id !== tab.id && !open[id].pinned) closeDrawer(id);
  }

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
