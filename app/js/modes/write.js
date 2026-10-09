// Письмо: бачите переклад — пишете німецькою. Помилки повертаються в кінець черги.
import { settings } from '../store.js';
import * as audio from '../audio.js';
import { setupPanel, typeQuestion, summary, learningOrder } from './common.js';

export function run(root, list, ctx) {
  root.replaceChildren(setupPanel({
    mode: 'write', count: list.length,
    options: [
      { key: 'requireArticle', label: 'Артикль для іменників', choices: [[true, 'Обов’язковий'], [false, 'Не потрібен']] },
      { key: 'writeSize', label: 'Слів за раз', choices: [[10, '10'], [15, '15'], [25, '25'], [0, 'Усі']] },
    ],
    onStart: () => start(learningOrder(list).slice(0, settings.writeSize || list.length)),
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
      typeQuestion(root, e, ctx, ok => {
        if (ok) correct++;
        else { mistakes.add(e); queue.push(e); }
        ctx.progress(correct / batch.length, `${correct}/${batch.length}`);
        ask();
      });
    };
    ask();
  }

  function finish(batch, mistakes) {
    const missed = [...mistakes];
    summary(root, {
      title: missed.length ? 'Готово!' : 'Без жодної помилки!',
      stats: [[batch.length, 'слів'], [batch.length - missed.length, 'з першої спроби']],
      missed,
      buttons: [
        ['Ще раз', () => start(learningOrder(list).slice(0, settings.writeSize || list.length)), 'primary'],
        missed.length ? ['Повторити помилки', () => start(missed)] : null,
        ['На головну', () => ctx.exit()],
      ],
    });
  }
}
