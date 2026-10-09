// Артиклі: der, die чи das?
import { h, ipaEl, revealCard, setKeys, shuffle } from '../ui.js';
import { settings } from '../store.js';
import * as audio from '../audio.js';
import { setupPanel, summary } from './common.js';

export const filter = e => !!e.art;

export function run(root, list, ctx) {
  root.replaceChildren(setupPanel({
    mode: 'articles', count: list.length,
    countLabel: `Іменників у наборі: ${list.length}`,
    options: [
      { key: 'writeSize', label: 'Слів за раз', choices: [[10, '10'], [15, '15'], [25, '25'], [0, 'Усі']] },
    ],
    onStart: () => start(shuffle(list).slice(0, settings.writeSize || list.length)),
  }));

  function start(batch) {
    const queue = batch.slice();
    const mistakes = new Set();
    let correct = 0;
    const ask = () => {
      if (!queue.length) return finish(batch, mistakes);
      const e = queue.shift();
      ctx.progress(correct / batch.length, `${correct}/${batch.length}`);
      question(e, ok => {
        if (ok) correct++;
        else { mistakes.add(e); queue.push(e); }
        ask();
      });
    };
    ask();
  }

  function question(e, done) {
    let answered = false, ok = false, finished = false, timer = 0;
    const btns = ['der', 'die', 'das'].map(a => h('button', { class: 'art-btn ' + a, type: 'button', onclick: () => choose(a) }, a));
    const after = h('div');
    const actions = h('div', { class: 'actions' });
    root.replaceChildren(h('div', { class: 'question' },
      h('div', { class: 'prompt pop' },
        h('div', { class: 'hint' }, 'Який артикль?'),
        h('div', { class: 'big' }, e.bare),
        ipaEl(e),
        h('div', { class: 'muted' }, e.ua)),
      h('div', { class: 'art-btns' }, btns),
      after, actions));
    setKeys(ev => {
      const k = { 1: 'der', 2: 'die', 3: 'das', d: 'der', i: 'die', s: 'das' }[ev.key];
      if (!answered && k) choose(k);
      else if (answered && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); next(); }
    });

    function choose(a) {
      if (answered) return;
      answered = true;
      ok = a === e.art;
      btns.forEach(b => {
        b.disabled = true;
        const v = b.textContent;
        if (v === e.art) b.classList.add('correct');
        else if (v === a) b.classList.add('wrong', 'dim');
        else b.classList.add('dim');
      });
      after.replaceChildren(revealCard(e));
      // Синтез вимовляє слово разом з артиклем — так рід легше запам'ятати.
      if (settings.autoplay) audio.play(e, { tts: true });
      actions.replaceChildren(h('button', { class: 'btn primary block', type: 'button', onclick: next }, 'Далі'));
      if (ok) timer = ctx.later(next, 1100);
    }
    function next() {
      if (finished) return;
      finished = true;
      ctx.clear(timer);
      done(ok);
    }
  }

  function finish(batch, mistakes) {
    ctx.progress(1, `${batch.length}/${batch.length}`);
    const missed = [...mistakes];
    summary(root, {
      title: missed.length ? 'Готово!' : 'Усі артиклі правильно!',
      stats: [[batch.length, 'іменників'], [batch.length - missed.length, 'з першої спроби']],
      missed,
      buttons: [
        ['Ще раз', () => start(shuffle(list).slice(0, settings.writeSize || list.length)), 'primary'],
        missed.length ? ['Повторити помилки', () => start(missed)] : null,
        ['На головну', () => ctx.exit()],
      ],
    });
  }
}
