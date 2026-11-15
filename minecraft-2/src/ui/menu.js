// Titelbildschirm (Hauptmenü) mit Logo, zufälligem Splash-Text und Schaltflächen.
import { APP_NAME, APP_VERSION } from '../config.js';
import { randomSplash } from './splash.js';
import { createTitleLogo } from './title-logo.js';
import { button, h } from './ui-kit.js';

export function buildTitleScreen(app) {
  const splash = h('div', { class: 'splash', text: randomSplash() });
  const logoWrap = h('div', { class: 'logo-wrap' }, createTitleLogo(), splash);

  const menu = h(
    'div',
    { class: 'stack title-menu' },
    button('Einzelspieler', () => app.screens.show('worlds', { push: true })),
    button('Mehrspieler', null, { disabled: true, tooltip: 'Mehrspieler ist für eine spätere Version vorgesehen.' }),
    button('Optionen...', () => app.screens.show('options', { push: true })),
    button('Spiel beenden', () => app.quit())
  );

  const root = h(
    'div',
    { class: 'screen title-screen' },
    logoWrap,
    menu,
    h('div', { class: 'title-footer', text: `${APP_NAME} ${APP_VERSION}` }),
    h('div', { class: 'title-footer right', text: 'Inoffiziell – nicht mit Mojang oder Microsoft verbunden.' })
  );

  return {
    element: root,
    onShow() {
      splash.textContent = randomSplash();
    },
  };
}
