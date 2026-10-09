// Заучування: невеликий набір слів іде по колу (вікно з 7 слів),
// кожне слово треба кілька разів правильно впізнати (DE→UA, UA→DE, за бажанням — написати).
import { settings } from '../store.js';
import * as audio from '../audio.js';
import { setupPanel, mcQuestion, typeQuestion, summary, learningOrder } from './common.js';

const WINDOW = 7;

export function run(root, list, ctx) {
  let pool = [];
  let items, queue, waiting, done, total, mistakes, lastId;

  root.replaceChildren(setupPanel({
    mode: 'learn', count: list.length,
    options: [
      { key: 'dir', label: 'Напрямок', choices: [['mix', 'Обидва'], ['de-ua', 'DE → UA'], ['ua-de', 'UA → DE']] },
      { key: 'roundSize', label: 'Слів у раунді', choices: [[5, '5'], [10, '10'], [15, '15'], [20, '20'], [0, 'Усі']] },
      { key: 'learnTyping', label: 'Наприкінці написати слово', choices: [[false, 'Ні'], [true, 'Так']] },
    ],
    onStart: () => { pool = learningOrder(list); round(); },
  }));

  function round(explicit) {
    let batch;
    if (explicit) batch = explicit;
    else {
      if (!pool.length) pool = learningOrder(list);
      batch = pool.splice(0, settings.roundSize || pool.length);
    }
    const steps = settings.dir === 'mix' ? ['de', 'ua'] : settings.dir === 'de-ua' ? ['de', 'de'] : ['ua', 'ua'];
    if (settings.learnTyping) steps.push('type');
    items = batch.map(e => ({ e, steps, i: 0 }));
    total = items.length * steps.length;
    done = 0;
    mistakes = new Set();
    lastId = null;
    waiting = items.slice();
    queue = waiting.splice(0, WINDOW);
    ctx.progress(0, `0/${items.length}`);
    ask();
  }

  function ask() {
    if (!queue.length) return finish();
    if (queue.length > 1 && queue[0].e.id === lastId) queue.push(queue.shift());
    const it = queue.shift();
    lastId = it.e.id;
    if (queue[0]) audio.prefetch(queue[0].e);
    const step = it.steps[it.i];
    const cb = ok => {
      if (ok) {
        it.i++;
        done++;
        if (it.i >= it.steps.length) { if (waiting.length) queue.push(waiting.shift()); }
        else queue.push(it);
      } else {
        mistakes.add(it.e);
        queue.splice(Math.min(2, queue.length), 0, it);
      }
      const finishedN = items.filter(x => x.i >= x.steps.length).length;
      ctx.progress(done / total, `${finishedN}/${items.length}`);
      ask();
    };
    if (step === 'type') typeQuestion(root, it.e, ctx, cb);
    else mcQuestion(root, it.e, step, list, ctx, cb);
  }

  function finish() {
    const missed = [...mistakes];
    summary(root, {
      title: missed.length ? 'Раунд завершено!' : 'Бездоганно!',
      stats: [[items.length, 'слів у раунді'], [items.length - missed.length, 'без помилок']],
      missed,
      buttons: [
        pool.length ? ['Наступний раунд', () => round(), 'primary'] : ['Пройти все ще раз', () => { pool = learningOrder(list); round(); }, 'primary'],
        missed.length ? ['Повторити помилки', () => round(missed)] : null,
        ['На головну', () => ctx.exit()],
      ],
    });
  }
}
