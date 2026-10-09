// Картки: перевертання, «знаю» / «ще вчу», свайпи.
import { h, icon, deWord, ipaEl, speakBtn, setKeys, shuffle } from '../ui.js';
import { settings, record } from '../store.js';
import * as audio from '../audio.js';
import { setupPanel, summary } from './common.js';

export function run(root, list, ctx) {
  let deck, idx, known, unknown;

  root.replaceChildren(setupPanel({
    mode: 'cards', count: list.length,
    options: [
      { key: 'cardsDir', label: 'Лицьова сторона', choices: [['de-ua', 'Німецька'], ['ua-de', 'Українська']] },
      { key: 'cardsOrder', label: 'Порядок', choices: [['shuffle', 'Випадковий'], ['list', 'Як у словнику']] },
    ],
    onStart: () => start(list),
  }));

  function start(cards) {
    deck = settings.cardsOrder === 'shuffle' ? shuffle(cards) : cards.slice();
    idx = 0; known = []; unknown = [];
    show();
  }

  function deSide(e, small = false) {
    return [
      h('div', { class: small ? '' : 'big' + (e.p ? ' phrase' : '') }, deWord(e)),
      ipaEl(e),
      !small && e.f && !e.p ? h('div', { class: 'forms' }, e.f) : null,
      speakBtn(e),
    ];
  }

  function show() {
    if (idx >= deck.length) return finish();
    const e = deck[idx];
    ctx.progress(idx / deck.length, `${idx + 1}/${deck.length}`);
    if (deck[idx + 1]) audio.prefetch(deck[idx + 1]);
    const frontDe = settings.cardsDir === 'de-ua';
    const uaBig = h('div', { class: 'big ua' + (e.p ? ' phrase' : '') }, e.ua);
    const example = e.ex ? h('div', { class: 'forms' }, h('i', null, e.ex), e.exu ? ' — ' + e.exu : '') : null;
    const front = h('div', { class: 'face front' },
      h('div', { class: 'corner' }, e.t || ''),
      frontDe ? deSide(e) : uaBig,
      h('div', { class: 'tap' }, 'Торкніться, щоб перевернути'));
    const back = h('div', { class: 'face back' },
      h('div', { class: 'corner' }, e.lv),
      frontDe ? [uaBig, h('div', { class: 'forms' }, deWord(e)), example] : [deSide(e), example]);
    const flash = h('div', { class: 'flash' }, front, back);
    const move = h('div', { class: 'flash-move' }, flash);
    const tagYes = h('div', { class: 'swipe-tag yes' }, 'ЗНАЮ');
    const tagNo = h('div', { class: 'swipe-tag no' }, 'ЩЕ ВЧУ');
    const zone = h('div', { class: 'flash-zone' }, tagYes, tagNo, move);
    root.replaceChildren(zone,
      h('div', { class: 'card-btns' },
        h('button', { class: 'btn bad', type: 'button', onclick: () => fly(false) }, icon('close'), 'Ще вчу'),
        h('button', { class: 'btn ok', type: 'button', onclick: () => fly(true) }, icon('check'), 'Знаю')),
      h('p', { class: 'center small muted' }, 'Свайп вправо — знаю, вліво — ще вчу'));
    if (frontDe && settings.autoplay) audio.play(e);

    let flipped = false, busy = false;
    function flip() {
      flipped = !flipped;
      flash.classList.toggle('flipped', flipped);
      if (flipped && !frontDe && settings.autoplay) audio.play(e);
    }

    // Свайп
    let sx = 0, sy = 0, dx = 0, dragging = false, pid = null;
    zone.addEventListener('pointerdown', ev => {
      if (busy || ev.button > 0) return;
      sx = ev.clientX; sy = ev.clientY; dx = 0; dragging = true; pid = ev.pointerId;
      move.classList.add('dragging');
    });
    zone.addEventListener('pointermove', ev => {
      if (!dragging || ev.pointerId !== pid) return;
      dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) { try { zone.setPointerCapture(pid); } catch { /* */ } }
      move.style.transform = `translateX(${dx}px) rotate(${dx / 22}deg)`;
      tagYes.style.opacity = Math.max(0, Math.min(1, dx / 100));
      tagNo.style.opacity = Math.max(0, Math.min(1, -dx / 100));
    });
    const end = ev => {
      if (!dragging) return;
      dragging = false;
      move.classList.remove('dragging');
      if (Math.abs(dx) > 90) { fly(dx > 0); return; }
      move.style.transform = '';
      tagYes.style.opacity = tagNo.style.opacity = 0;
      if (Math.abs(dx) < 8 && ev.type === 'pointerup') flip();
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);

    function fly(yes) {
      if (busy) return;
      busy = true;
      (yes ? tagYes : tagNo).style.opacity = 1;
      move.style.transform = `translateX(${yes ? 130 : -130}vw) rotate(${yes ? 25 : -25}deg)`;
      record(e.id, yes);
      (yes ? known : unknown).push(e);
      ctx.later(() => { idx++; show(); }, 220);
    }

    setKeys(ev => {
      if (ev.key === ' ' || ev.key === 'Enter' || ev.key === 'ArrowUp' || ev.key === 'ArrowDown') { ev.preventDefault(); flip(); }
      else if (ev.key === 'ArrowRight') fly(true);
      else if (ev.key === 'ArrowLeft') fly(false);
      else if (ev.key === 'p' || ev.key === 'з') audio.play(e);
    });
  }

  function finish() {
    ctx.progress(1, `${deck.length}/${deck.length}`);
    summary(root, {
      title: unknown.length ? 'Колоду пройдено' : 'Усе знаєте!',
      stats: [[known.length, 'знаю'], [unknown.length, 'ще вчу']],
      missed: unknown,
      buttons: [
        unknown.length ? [`Повторити «ще вчу» (${unknown.length})`, () => start(unknown), 'primary'] : null,
        ['Почати знову', () => start(list), unknown.length ? '' : 'primary'],
        ['На головну', () => ctx.exit()],
      ],
    });
  }
}
