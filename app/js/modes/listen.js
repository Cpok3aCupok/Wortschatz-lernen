// Аудіювання: вибір перекладу на слух або диктант.
import { settings } from '../store.js';
import * as audio from '../audio.js';
import { setupPanel, mcQuestion, typeQuestion, summary, learningOrder } from './common.js';

export function run(root, list, ctx) {
  root.replaceChildren(setupPanel({
    mode: 'listen', count: list.length,
    options: [
      { key: 'listenMode', label: 'Відповідь', choices: [['choice', 'Вибір перекладу'], ['dictation', 'Диктант']] },
      { key: 'roundSize', label: 'Слів за раз', choices: [[5, '5'], [10, '10'], [15, '15'], [20, '20'], [0, 'Усі']] },
    ],
    onStart: () => start(learningOrder(list).slice(0, settings.roundSize || list.length)),
  }));

  function start(batch) {
    const queue = batch.slice();
    const mistakes = new Set();
    let correct = 0;
    const ask = () => {
      if (!queue.length) return finish(batch, mistakes);
      const e = queue.shift();
      if (queue[0]) audio.prefetch(queue[0]);
      ctx.progress(correct / batch.length, `${correct}/${batch.length}`);
      const cb = ok => {
        if (ok) correct++;
        else { mistakes.add(e); queue.push(e); }
        ask();
      };
      if (settings.listenMode === 'dictation') typeQuestion(root, e, ctx, cb, { listen: true });
      else mcQuestion(root, e, 'listen', list, ctx, cb);
    };
    ask();
  }

  function finish(batch, mistakes) {
    ctx.progress(1, `${batch.length}/${batch.length}`);
    const missed = [...mistakes];
    summary(root, {
      title: missed.length ? 'Готово!' : 'Чудовий слух!',
      stats: [[batch.length, 'слів'], [batch.length - missed.length, 'з першої спроби']],
      missed,
      buttons: [
        ['Ще раз', () => start(learningOrder(list).slice(0, settings.roundSize || list.length)), 'primary'],
        missed.length ? ['Повторити помилки', () => start(missed)] : null,
        ['На головну', () => ctx.exit()],
      ],
    });
  }
}
