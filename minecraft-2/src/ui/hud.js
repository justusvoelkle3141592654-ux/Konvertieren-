// Spiel-HUD: Fadenkreuz, Hinweise und Benachrichtigungen. Weitere Anzeigen (Herzen, Hotbar)
// folgen mit den jeweiligen Phasen.
import { h } from './ui-kit.js';

export function buildHud() {
  const hint = h('div', { class: 'hud-hint', text: '' });
  const crosshair = h('div', { class: 'crosshair' });
  const lockHint = h('div', { class: 'lock-hint hidden', text: 'Klicke, um weiterzuspielen.\nESC öffnet das Menü.' });
  const toasts = h('div', { class: 'toast-host' });
  const element = h('div', { class: 'screen hud-only' }, hint, crosshair, toasts, lockHint);
  return {
    element,
    setLockHint(visible) {
      lockHint.classList.toggle('hidden', !visible);
    },
    setHint(text) {
      hint.textContent = text;
    },
    showToast(title, text) {
      const node = h('div', { class: 'toast' }, h('b', {}, title), h('br'), text);
      toasts.append(node);
      setTimeout(() => node.remove(), 4500);
    },
  };
}
