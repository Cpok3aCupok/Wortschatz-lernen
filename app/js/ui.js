// Дрібні помічники інтерфейсу: створення елементів, іконки, тости, модальні вікна.
import { settings, statusOf } from './store.js';
import * as audio from './audio.js';

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  let value;
  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'value') value = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'checked' || k === 'disabled' || k === 'readOnly') el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, kids);
  if (value !== undefined) el.value = value;
  return el;
}
// Як el.append() / el.replaceChildren(), але пропускають null/false і розгортають масиви.
export const add = (el, ...kids) => append(el, kids);
export const fill = (el, ...kids) => { el.replaceChildren(); append(el, kids); return el; };
function append(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.append(k instanceof Node ? k : String(k));
  }
}

const P = {
  speaker: '<path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>',
  learn: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 4v5h-5"/>',
  cards: '<rect x="3" y="7" width="13" height="14" rx="2"/><path d="M8 3h11a2 2 0 0 1 2 2v12"/>',
  write: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  match: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  listen: '<path d="M3 14v-2a9 9 0 0 1 18 0v2"/><path d="M21 15a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2zM3 15a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2z"/>',
  articles: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  cap: '<path d="m22 10-10-5-10 5 10 5 10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  play: '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',
  flame: '<path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 2-5 0 2 1 3 2 3 0-4 1-7 2-10z"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  upload: '<path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M5 3h14"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-2"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
};
export function icon(name, size = 22) {
  return h('span', {
    class: 'ico',
    html: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`,
  });
}

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}
export const words = n => `${n} ${plural(n, 'слово', 'слова', 'слів')}`;

export function shuffle(a) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

// ---------- Верхня панель ----------
export function setTopbar({ title = '', left = null, right = null, center = null } = {}) {
  document.getElementById('topbar').replaceChildren(
    h('div', { class: 'tb-left' }, left),
    center ? h('div', { class: 'tb-center' }, center) : h('div', { class: 'tb-title' }, title),
    h('div', { class: 'tb-right' }, right),
  );
}
export const backBtn = (href = '#/') => h('a', { class: 'icon-btn', href, 'aria-label': 'Назад' }, icon('back', 24));

// ---------- Клавіатура (для ПК) ----------
let keyHandler = null;
export const setKeys = fn => { keyHandler = fn; };
document.addEventListener('keydown', e => {
  if (!keyHandler || e.metaKey || e.ctrlKey || e.altKey) return;
  keyHandler(e);
});
export const typingInField = () => /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '');

// ---------- Слово ----------
export function deWord(e, cls = '') {
  if (e.art || e.plOnly) {
    const g = e.art || 'pl';
    return h('span', { class: `de g-${g} ${cls}` }, h('span', { class: 'art' }, e.art || 'die'), ' ', e.bare);
  }
  return h('span', { class: 'de ' + cls }, e.de);
}
export function ipaEl(e, force = false) {
  return (settings.showIpa || force) && e.ipa ? h('span', { class: 'ipa' }, `[${e.ipa}]`) : null;
}
export function speakBtn(e, size = '', opts = {}) {
  return h('button', {
    class: 'speak ' + size, type: 'button', 'aria-label': 'Озвучити',
    onpointerdown: ev => ev.stopPropagation(),
    onclick: ev => { ev.stopPropagation(); audio.play(e, opts); },
  }, icon('speaker', size === 'sm' ? 18 : 22));
}

export function wordRow(e, onClick) {
  return h('div', { class: 'wrow', onclick: onClick || (() => { location.hash = '#/edit/' + encodeURIComponent(e.id); }) },
    h('span', { class: 'dot ' + statusOf(e) }),
    h('div', { class: 'main' },
      h('div', { class: 'l1' }, deWord(e), e.f && !e.p ? h('span', { class: 'forms' }, e.f) : null),
      ipaEl(e),
      h('div', { class: 'ua' }, e.ua)),
    h('span', { class: 'badge' + (e.own ? ' own' : '') }, e.own ? 'моє' : e.lv),
    speakBtn(e, 'sm'));
}

// Картка з повною інформацією про слово (після відповіді).
export function revealCard(e) {
  return h('div', { class: 'reveal pop' },
    h('div', { class: 'grow' },
      h('div', null, deWord(e)),
      ipaEl(e, true),
      h('div', { class: 'ua' }, e.ua),
      e.f && !e.p ? h('div', { class: 'forms' }, e.f) : null,
      e.ex ? h('div', { class: 'forms' }, h('i', null, e.ex), e.exu ? ' — ' + e.exu : '') : null),
    speakBtn(e));
}

export function seg(choices, value, onChange) {
  const wrap = h('div', { class: 'seg' });
  for (const [v, label] of choices) {
    const b = h('button', {
      type: 'button', class: v === value ? 'on' : '',
      onclick: () => { [...wrap.children].forEach(c => c.classList.remove('on')); b.classList.add('on'); onChange(v); },
    }, label);
    wrap.append(b);
  }
  return wrap;
}
export function switchRow(label, sub, checked, onChange) {
  const input = h('input', { type: 'checkbox', checked, onchange: () => onChange(input.checked) });
  return h('label', { class: 'switch-row' },
    h('div', { class: 'txt' }, label, sub ? h('small', null, sub) : null),
    h('span', { class: 'switch' }, input, h('span')));
}

// ---------- Тост ----------
let toastTimer = 0;
export function toast(msg, { action, onAction, ms = 2600 } = {}) {
  const t = document.getElementById('toast');
  fill(t, h('span', null, msg), action ? h('button', { onclick: () => { t.classList.remove('show'); onAction && onAction(); } }, action) : null);
  t.classList.add('show');
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------- Модальні вікна ----------
export function openSheet(title, body, { onClose } = {}) {
  const ov = h('div', { class: 'overlay', onclick: ev => { if (ev.target === ov) close(); } },
    h('div', { class: 'sheet', role: 'dialog' },
      h('div', { class: 'sheet-h' }, h('b', null, title), h('button', { class: 'icon-btn', type: 'button', onclick: () => close(), 'aria-label': 'Закрити' }, icon('close'))),
      body));
  document.body.append(ov);
  let closed = false;
  function close() { if (closed) return; closed = true; ov.remove(); onClose && onClose(); }
  return close;
}
export function confirmBox(message, { ok = 'Так', cancel = 'Скасувати', danger = false } = {}) {
  return new Promise(resolve => {
    let result = false;
    const close = openSheet('Підтвердження', h('div', null,
      h('p', null, message),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', onclick: () => close() }, cancel),
        h('button', { class: 'btn ' + (danger ? 'bad' : 'primary'), onclick: () => { result = true; close(); } }, ok))),
    { onClose: () => resolve(result) });
  });
}

export function empty(text, linkText, href) {
  return h('div', { class: 'empty' }, h('p', null, text), linkText ? h('a', { class: 'btn primary', href }, linkText) : null);
}

// ---------- Файли ----------
// Усередині нативної обгортки для iOS (ios/) є міст для збереження файлів.
const nativeSave = () => window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.saveFile;
export const isNativeApp = () => !!nativeSave();

export async function saveFile(name, text, type) {
  if (nativeSave()) { nativeSave().postMessage({ name, text }); return true; }
  const blob = new Blob([text], { type });
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare) {
    try {
      const file = new File([blob], name, { type });
      if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return true; }
    } catch (e) { if (e && e.name === 'AbortError') return false; }
  }
  try {
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    return true;
  } catch { return false; }
}
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* немає доступу — запасний спосіб */ }
  const ta = h('textarea', { value: text, readonly: true, style: { position: 'fixed', top: '-1000px' } });
  document.body.append(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* */ }
  ta.remove();
  return ok;
}

export function pickFile(accept) {
  return new Promise(resolve => {
    const input = h('input', { type: 'file', accept, style: { display: 'none' } });
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      input.remove();
      resolve(f ? await f.text() : null);
    });
    document.body.append(input);
    input.click();
  });
}

export function applyTheme() {
  const t = settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
