// Ladebildschirm mit Erdblock-Hintergrund, Fortschrittsbalken und Prozentanzeige.
import { dirtTileCss, h } from './ui-kit.js';

export function buildLoadingScreen() {
  const bar = h('div', { style: { width: '0%' } });
  const percent = h('div', { class: 'label', text: '0 %' });
  const detail = h('div', { class: 'label', style: { color: '#d8d8d8', minHeight: '12px' } });
  const element = h(
    'div',
    { class: 'screen dirt-bg loading-screen' },
    h('div', { class: 'title', style: { fontSize: '12px', marginBottom: '6px' } }, 'Gelände wird gebaut...'),
    h('div', { class: 'progress' }, bar),
    percent,
    detail
  );
  element.style.setProperty('--dirt-tile', dirtTileCss());
  return {
    element,
    setProgress(fraction, text) {
      const clamped = Math.max(0, Math.min(1, fraction));
      bar.style.width = `${Math.round(clamped * 100)}%`;
      percent.textContent = `${Math.floor(clamped * 100)} %`;
      if (text !== undefined) detail.textContent = text;
    },
  };
}
