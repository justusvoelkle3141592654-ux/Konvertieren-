// Todesbildschirm: roter Überzug, Wiederbeleben oder Rückkehr zum Titelbildschirm.
import { button, h } from './ui-kit.js';

export function buildDeathScreen(app) {
  const element = h(
    'div',
    { class: 'screen death-screen' },
    h('div', { class: 'death-title', text: 'Du bist gestorben!' }),
    h('div', { class: 'stack' }, button('Wiederbeleben', () => app.respawn(), { wide: true }), button('Zum Titelbildschirm', () => app.exitToTitle(), { wide: true }))
  );
  return { element };
}
