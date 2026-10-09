// Словник: пошук, фільтри, перехід до редагування.
import { h, icon, setTopbar, seg, wordRow, words } from '../ui.js';
import * as S from '../store.js';
import { fold } from '../check.js';

const state = { q: '', lv: 'all', kind: 'all' };
const PAGE = 80;

export function render(root) {
  setTopbar({
    title: 'Словник',
    right: h('a', { class: 'icon-btn', href: '#/edit/new', 'aria-label': 'Додати слово' }, icon('plus', 24)),
  });

  const search = h('input', {
    type: 'search', value: state.q, placeholder: 'Пошук німецькою або українською',
    autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false',
    oninput: () => { state.q = search.value; refresh(); },
  });
  const chipsEl = h('div', { class: 'chips' });
  const countEl = h('div', { class: 'small muted', style: { margin: '2px 4px 8px' } });
  const list = h('div', { class: 'wlist' });
  const more = h('div', { class: 'more' });

  function drawChips() {
    const all = S.allEntries();
    const opts = [['all', 'Усі', all.length], ...S.levelsPresent().map(l => [l, l, all.filter(e => e.lv === l).length])];
    const own = all.filter(e => e.own).length;
    if (own) opts.push(['MY', 'Мої', own]);
    const edited = all.filter(e => e.edited).length;
    if (edited) opts.push(['EDITED', 'Змінені', edited]);
    chipsEl.replaceChildren(...opts.map(([id, label, n]) => h('button', {
      class: 'chip' + (state.lv === id ? ' on' : ''), type: 'button',
      onclick: () => { state.lv = id; drawChips(); refresh(); },
    }, label, h('small', null, n))));
  }

  root.append(
    h('div', { class: 'dict-filters' }, search, chipsEl,
      seg([['all', 'Усе'], ['words', 'Слова'], ['phrases', 'Фрази']], state.kind, v => { state.kind = v; refresh(); })),
    countEl, list, more,
    h('a', { class: 'fab', href: '#/edit/new', 'aria-label': 'Додати слово' }, icon('plus', 28)));

  let items = [], shown = 0, lastTopic = null;

  function filtered() {
    const q = fold(state.q);
    const qua = state.q.trim().toLowerCase();
    return S.allEntries().filter(e => {
      if (state.lv === 'MY' ? !e.own : state.lv === 'EDITED' ? !e.edited : state.lv !== 'all' && e.lv !== state.lv) return false;
      if (state.kind === 'words' && e.p) return false;
      if (state.kind === 'phrases' && !e.p) return false;
      if (!q) return true;
      return fold(e.de).includes(q) || e.ua.toLowerCase().includes(qua) || (e.f && fold(e.f).includes(q));
    });
  }

  function refresh() {
    items = filtered();
    shown = 0;
    lastTopic = null;
    list.replaceChildren();
    countEl.textContent = items.length ? `Знайдено: ${words(items.length)}` : '';
    if (!items.length) list.append(h('div', { class: 'more' }, state.q ? 'Нічого не знайдено. Додайте це слово — кнопка «+».' : 'Тут поки порожньо.'));
    renderMore();
  }

  function renderMore() {
    const chunk = items.slice(shown, shown + PAGE);
    const frag = document.createDocumentFragment();
    const grouped = !state.q;
    for (const e of chunk) {
      const topic = `${e.lv} · ${e.t || 'Інше'}`;
      if (grouped && topic !== lastTopic) {
        frag.append(h('div', { class: 'group-h', style: { background: 'var(--bg)' } }, topic));
        lastTopic = topic;
      }
      frag.append(wordRow(e));
    }
    list.append(frag);
    shown += chunk.length;
    more.textContent = shown < items.length ? 'Завантаження…' : '';
  }

  const io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting) && shown < items.length) renderMore(); }, { rootMargin: '600px' });
  io.observe(more);

  drawChips();
  refresh();
  return () => io.disconnect();
}
