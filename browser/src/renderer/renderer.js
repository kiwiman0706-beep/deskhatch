'use strict';

// DeskHatch Browser shell UI: quick links, an omnibox, and a tab strip. Each
// tab is a real Edge/Chrome app-mode window driven by the main process; this
// renderer only sends intents (open/activate/close) and draws the current list.

const QUICK = [
  { icon: '✉', label: 'Gmail', url: 'https://mail.google.com/' },
  { icon: '📅', label: 'Calendar', url: 'https://calendar.google.com/calendar/u/0/r' },
  { icon: '📝', label: 'Keep', url: 'https://keep.google.com/' },
  { icon: '🗂', label: 'Drive', url: 'https://drive.google.com/' },
  { icon: '✓', label: 'Tasks', url: 'https://tasks.google.com/embed/?fullWidth=1' },
];

const quickEl = document.getElementById('quick');
const tabsEl = document.getElementById('tabs');
const omni = document.getElementById('omni');
const omniform = document.getElementById('omniform');
const engineEl = document.getElementById('engine');

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

// Quick-launch buttons.
for (const q of QUICK) {
  const b = el('button', null, q.icon);
  b.title = q.label;
  b.addEventListener('click', () => window.browser.open(q.url));
  quickEl.append(b);
}

// Omnibox: Enter opens a new tab (URL or Google search).
omniform.addEventListener('submit', (e) => {
  e.preventDefault();
  const v = omni.value.trim();
  if (!v) return;
  window.browser.open(v);
  omni.value = '';
});

// Render the tab strip from the main process's list.
function renderTabs(tabs) {
  tabsEl.textContent = '';
  for (const t of tabs) {
    const tab = el('div', 'tab' + (t.active ? ' active' : ''));
    tab.append(el('span', 't-title', cleanTitle(t.title)));
    const x = el('span', 't-close', '✕');
    x.addEventListener('click', (e) => { e.stopPropagation(); window.browser.close(t.id); });
    tab.append(x);
    tab.addEventListener('click', () => window.browser.activate(t.id));
    tab.title = t.url;
    tabsEl.append(tab);
  }
}

// Browser windows append " - Google Chrome" / " - Microsoft​ Edge" etc; trim it.
function cleanTitle(s) {
  return String(s || '').replace(/\s+[-–]\s+(Google Chrome|Microsoft​? ?Edge|Chromium)\s*$/i, '').trim() || '新しいタブ';
}

window.browser.onTabs(renderTabs);
window.browser.list().then(renderTabs).catch(() => {});

// Show which real browser is backing us (helps confirm the engine resolved).
window.browser.engineInfo().then((info) => {
  if (!info || !info.exe) { engineEl.textContent = '⚠ ブラウザ未検出'; engineEl.title = 'Edge/Chrome が見つかりません'; return; }
  const name = /msedge/i.test(info.exe) ? 'Edge' : /chrome/i.test(info.exe) ? 'Chrome' : 'Chromium';
  engineEl.textContent = '⚙ ' + name;
  engineEl.title = info.exe + '\nprofile: ' + info.profile;
}).catch(() => {});
