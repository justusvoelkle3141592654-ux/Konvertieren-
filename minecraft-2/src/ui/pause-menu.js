// Pausemenü (ESC), Fortschritte und Statistiken. Die Spielwelt bleibt im Hintergrund sichtbar.
import { GAME_MODE_LABELS, DIFFICULTY_LABELS } from '../config.js';
import { button, formatDuration, h } from './ui-kit.js';

export function buildPauseMenu(app) {
  const status = h('div', { class: 'label', style: { minHeight: '14px', textAlign: 'center' } });

  const saveBtn = button('Speichern', async () => {
    status.textContent = 'Speichere …';
    try {
      await app.saveGame();
      status.textContent = 'Welt gespeichert.';
    } catch (err) {
      status.textContent = `Speichern fehlgeschlagen: ${err.message}`;
    }
  });

  const element = h(
    'div',
    { class: 'screen overlay' },
    h('h1', { class: 'title', style: { marginTop: '60px', fontSize: '12px' } }, 'Spiel pausiert'),
    h(
      'div',
      { class: 'stack' },
      button('Zurück zum Spiel', () => app.resume(), { wide: true }),
      button('Fortschritte', () => app.screens.show('achievements', { push: true }), { wide: true }),
      button('Statistiken', () => app.screens.show('stats', { push: true }), { wide: true }),
      button('Optionen...', () => app.screens.show('options', { push: true }), { wide: true }),
      saveBtn,
      button('Speichern und zum Titelbildschirm', () => app.exitToTitle(), { wide: true })
    ),
    status
  );

  return {
    element,
    onShow() {
      status.textContent = '';
    },
  };
}

/** Fortschrittsübersicht. Die Liste kommt aus dem Achievement-System (app.getAchievements). */
export function buildAchievementScreen(app) {
  const list = h('div', { class: 'panel', style: { width: '420px', maxHeight: '260px', overflowY: 'auto' } });
  const summary = h('div', { class: 'label', style: { textAlign: 'center' } });

  function render() {
    const items = app.getAchievements?.() ?? [];
    const unlocked = items.filter((a) => a.unlocked).length;
    summary.textContent = `${unlocked} von ${items.length} freigeschaltet`;
    list.replaceChildren();
    if (!items.length) {
      list.append(h('div', { class: 'empty-hint' }, 'Keine Fortschritte verfügbar.'));
      return;
    }
    for (const item of items) {
      list.append(
        h(
          'div',
          { class: 'row', style: { marginBottom: '6px', opacity: item.unlocked ? '1' : '0.45' } },
          h('div', { style: { minWidth: 0 } }, h('div', { class: 'label', style: { color: item.unlocked ? '#ffff55' : '#c0c0c0' } }, item.title), h('div', { class: 'label', style: { fontSize: '7px', color: '#bdbdbd', lineHeight: '1.6' } }, item.description))
        )
      );
    }
  }

  const element = h(
    'div',
    { class: 'screen dirt-bg' },
    h('h1', { class: 'title', style: { marginTop: '18px', fontSize: '14px' } }, 'Fortschritte'),
    summary,
    list,
    h('div', { class: 'btn-row', style: { marginTop: '8px' } }, button('Zurück', () => app.screens.back('pause'), { wide: true }))
  );

  return { element, onShow: render };
}

/** Statistiken der aktuellen Welt. */
export function buildStatsScreen(app) {
  const body = h('div', { class: 'panel', style: { width: '420px', maxHeight: '260px', overflowY: 'auto' } });

  function render() {
    const info = app.getWorldStats?.();
    body.replaceChildren();
    if (!info) {
      body.append(h('div', { class: 'empty-hint' }, 'Keine Welt geladen.'));
      return;
    }
    const rows = [
      ['Weltname', info.name],
      ['Seed', info.seedText],
      ['Spielmodus', GAME_MODE_LABELS[info.mode] ?? info.mode],
      ['Schwierigkeit', DIFFICULTY_LABELS[info.difficulty] ?? info.difficulty],
      ['Spielzeit', formatDuration(info.playTime)],
      ['Dimension', info.dimensionLabel],
      ['Position', info.position],
      ['Besiegte Gegner', String(info.kills ?? 0)],
      ['Gefundene Diamanten', String(info.diamonds ?? 0)],
    ];
    for (const [label, value] of rows) {
      body.append(h('div', { class: 'row', style: { marginBottom: '5px' } }, h('span', { class: 'label' }, label), h('span', { class: 'label', style: { color: '#ffffff' } }, value)));
    }
  }

  const element = h(
    'div',
    { class: 'screen dirt-bg' },
    h('h1', { class: 'title', style: { marginTop: '18px', fontSize: '14px' } }, 'Statistiken'),
    body,
    h('div', { class: 'btn-row', style: { marginTop: '8px' } }, button('Zurück', () => app.screens.back('pause'), { wide: true }))
  );

  return { element, onShow: render };
}
