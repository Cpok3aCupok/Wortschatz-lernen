// Точка входу: маршрутизація між екранами, service worker, ініціалізація.
import * as S from './store.js';
import * as audio from './audio.js';
import { h, setKeys, toast, applyTheme, typingInField } from './ui.js';
import * as home from './views/home.js';
import * as play from './views/play.js';
import * as dict from './views/dict.js';
import * as edit from './views/edit.js';
import * as settingsView from './views/settings.js';

const ROUTES = { home, play, dict, edit, settings: settingsView };
const TAB_OF = { home: 'home', play: 'home', dict: 'dict', edit: 'dict', settings: 'settings' };
let cleanup = null;

function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [path, query] = hash.split('?');
  const parts = path.split('/').filter(Boolean);
  const name = ROUTES[parts[0]] ? parts[0] : 'home';
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } }
  cleanup = null;
  setKeys(null);
  audio.stop();
  document.body.dataset.view = name;
  document.querySelectorAll('#tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === TAB_OF[name]));
  const view = document.getElementById('view');
  view.replaceChildren();
  view.scrollTop = 0;
  try {
    cleanup = ROUTES[name].render(view, parts.slice(1), new URLSearchParams(query || '')) || null;
  } catch (e) {
    console.error(e);
    view.replaceChildren(h('div', { class: 'empty' }, h('p', null, 'Щось пішло не так: ' + e.message), h('a', { class: 'btn primary', href: '#/' }, 'На головну')));
  }
}

function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    const offer = () => toast('Доступна нова версія', {
      action: 'Оновити', ms: 0,
      onAction: () => { if (reg.waiting) reg.waiting.postMessage('skipWaiting'); },
    });
    if (reg.waiting && navigator.serviceWorker.controller) offer();
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (w) w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(); });
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(err => console.warn('SW:', err));
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}

async function start() {
  applyTheme();
  document.addEventListener('pointerdown', audio.unlock, { once: true, capture: true });
  window.addEventListener('ws-storage-error', () => toast('Не вдалося зберегти дані: пам’ять браузера переповнена'));
  try {
    await S.init();
  } catch (e) {
    document.getElementById('view').replaceChildren(h('div', { class: 'empty' },
      h('p', null, 'Не вдалося завантажити словник.'), h('p', { class: 'small' }, e.message),
      h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Спробувати ще раз')));
    return;
  }
  window.addEventListener('hashchange', route);
  // Повторний дотик до активної вкладки — прокрутити на початок.
  document.getElementById('tabbar').addEventListener('click', ev => {
    const a = ev.target.closest('a');
    if (a && a.getAttribute('href') === location.hash) document.getElementById('view').scrollTo({ top: 0, behavior: 'smooth' });
  });
  // iOS після закриття клавіатури інколи лишає весь екран зсунутим угору.
  document.addEventListener('focusout', () => setTimeout(() => { if (!typingInField()) window.scrollTo(0, 0); }, 60));
  route();
  registerSW();
}

start();
