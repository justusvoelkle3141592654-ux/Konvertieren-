// Optionen: Grafik, Sound, Steuerung. Alle Werte wirken sofort und werden gespeichert.
import { RENDER_DISTANCE_MAX, RENDER_DISTANCE_MIN } from '../config.js';
import { DEFAULT_KEYBINDINGS, KEYBINDING_LABELS, settings } from '../systems/settings.js';
import { button, cycleButton, h, slider, toggleButton } from './ui-kit.js';

const KEY_NAMES = {
  Space: 'Leertaste',
  ShiftLeft: 'Linke Umschalt',
  ShiftRight: 'Rechte Umschalt',
  ControlLeft: 'Linke Strg',
  ControlRight: 'Rechte Strg',
  AltLeft: 'Linke Alt',
  AltRight: 'Rechte Alt',
  Enter: 'Eingabe',
  Escape: 'Esc',
  Tab: 'Tab',
  Backspace: 'Rücktaste',
  ArrowUp: 'Pfeil hoch',
  ArrowDown: 'Pfeil runter',
  ArrowLeft: 'Pfeil links',
  ArrowRight: 'Pfeil rechts',
};

/** Anzeigename einer Taste (KeyboardEvent.code). */
export function keyLabel(code) {
  if (!code) return '–';
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

/**
 * Baut die Optionsseite.
 * @param {object} app Spiel-Objekt mit applyDisplaySettings()
 */
export function buildOptionsScreen(app) {
  const apply = () => app.applyDisplaySettings?.();
  const s = settings.all;

  const general = h(
    'div',
    { class: 'stack', style: { width: '400px' } },
    slider({ label: 'Sichtweite', min: RENDER_DISTANCE_MIN, max: RENDER_DISTANCE_MAX, value: s.renderDistance, format: (v) => `${v} Chunks`, onChange: (v) => { settings.set('renderDistance', v); apply(); } }),
    slider({ label: 'Sichtfeld (FOV)', min: 30, max: 110, value: s.fov, format: (v) => `${v}°`, onChange: (v) => { settings.set('fov', v); apply(); } }),
    cycleButton({ label: 'GUI-Skalierung', values: ['auto', 1, 2, 3, 4], value: s.guiScale, format: (v) => (v === 'auto' ? 'Auto' : String(v)), width: 'wide', onChange: (v) => { settings.set('guiScale', v); apply(); } }),
    slider({ label: 'Mausempfindlichkeit', min: 0, max: 100, value: s.mouseSensitivity, format: (v) => `${v} %`, onChange: (v) => settings.set('mouseSensitivity', v) }),
    toggleButton({ label: 'Y-Achse invertieren', value: s.invertY, onChange: (v) => settings.set('invertY', v) })
  );

  const graphics = h(
    'div',
    { class: 'stack', style: { width: '400px' } },
    cycleButton({ label: 'Grafikqualität', values: ['schnell', 'normal', 'schön'], value: s.graphics, format: (v) => v.charAt(0).toUpperCase() + v.slice(1), width: 'wide', onChange: (v) => { settings.set('graphics', v); apply(); } }),
    cycleButton({ label: 'Partikel', values: ['alle', 'verringert', 'minimal'], value: s.particles, format: (v) => v.charAt(0).toUpperCase() + v.slice(1), width: 'wide', onChange: (v) => settings.set('particles', v) }),
    toggleButton({ label: 'Wolken', value: s.clouds, onChange: (v) => { settings.set('clouds', v); apply(); } }),
    toggleButton({ label: 'Schatten', value: s.shadows, onChange: (v) => { settings.set('shadows', v); apply(); } }),
    toggleButton({ label: 'Sanfte Beleuchtung', value: s.smoothLighting, onChange: (v) => { settings.set('smoothLighting', v); apply(); } }),
    slider({ label: 'Renderauflösung', min: 50, max: 100, step: 5, value: s.renderScale, format: (v) => `${v} %`, onChange: (v) => { settings.set('renderScale', v); apply(); } }),
    toggleButton({ label: 'FPS-Anzeige', value: s.showFps, onChange: (v) => settings.set('showFps', v) })
  );

  const sound = h(
    'div',
    { class: 'stack', style: { width: '400px' } },
    slider({ label: 'Musiklautstärke', min: 0, max: 100, value: s.musicVolume, format: (v) => `${v} %`, onChange: (v) => { settings.set('musicVolume', v); app.audio?.applyVolumes?.(); } }),
    slider({ label: 'Soundlautstärke', min: 0, max: 100, value: s.soundVolume, format: (v) => `${v} %`, onChange: (v) => { settings.set('soundVolume', v); app.audio?.applyVolumes?.(); } })
  );

  const tabs = { grafik: graphics, allgemein: general, ton: sound };
  let activeTab = 'allgemein';
  const tabBody = h('div', { class: 'panel', style: { width: '440px', maxHeight: '300px', overflowY: 'auto' } });
  const tabButtons = {};
  const showTab = (name) => {
    activeTab = name;
    tabBody.replaceChildren(tabs[name]);
    for (const [key, btn] of Object.entries(tabButtons)) btn.classList.toggle('selected', key === name);
  };
  for (const [key, label] of [['allgemein', 'Allgemein'], ['grafik', 'Grafik'], ['ton', 'Ton']]) {
    tabButtons[key] = button(label, () => showTab(key), { small: true });
  }
  showTab(activeTab);

  const controlsBtn = button('Steuerung anpassen...', () => app.screens.show('controls', { push: true }), { wide: true });
  const doneBtn = button('Fertig', () => app.screens.back('title'), { wide: true });

  const element = h(
    'div',
    { class: 'screen dirt-bg' },
    h('h1', { class: 'title', style: { marginTop: '14px', fontSize: '14px' } }, 'Optionen'),
    h('div', { class: 'btn-row' }, Object.values(tabButtons)),
    tabBody,
    h('div', { class: 'btn-row', style: { marginTop: '8px' } }, controlsBtn),
    h('div', { class: 'btn-row' }, doneBtn)
  );

  return {
    element,
    onShow() {
      showTab(activeTab);
    },
  };
}

/** Steuerungsseite: jede Aktion kann per Klick und Tastendruck neu belegt werden. */
export function buildControlsScreen(app) {
  let listeningAction = null;
  const hint = h('div', { class: 'label', style: { minHeight: '14px', textAlign: 'center' } });
  const rows = h('div', { class: 'panel', style: { width: '420px', maxHeight: '300px', overflowY: 'auto' } });

  function render() {
    rows.replaceChildren();
    const bindings = settings.get('keybindings');
    for (const [action, label] of Object.entries(KEYBINDING_LABELS)) {
      const listening = listeningAction === action;
      rows.append(
        h(
          'div',
          { class: 'row', style: { marginBottom: '4px' } },
          h('span', { class: 'label' }, label),
          button(listening ? 'Taste drücken …' : keyLabel(bindings[action]), () => {
            listeningAction = action;
            hint.textContent = 'Neue Taste drücken (Esc bricht ab).';
            render();
          }, { small: false, className: 'kbd', tooltip: 'Klicken, um die Taste zu ändern' })
        )
      );
    }
    rows.append(h('div', { class: 'btn-row', style: { marginTop: '6px' } }, button('Standard wiederherstellen', () => {
      settings.resetKeybindings();
      hint.textContent = 'Standardbelegung wiederhergestellt.';
      render();
    }, { wide: true })));
  }

  // Tastendruck während der Belegung abfangen (Capture-Phase, damit das Spiel nichts auslöst).
  window.addEventListener('keydown', (event) => {
    if (!listeningAction) return;
    if (app.screens.current !== 'controls') return;
    event.preventDefault();
    event.stopPropagation();
    if (event.code === 'Escape') {
      listeningAction = null;
      hint.textContent = 'Abgebrochen.';
    } else if (event.code && !event.repeat) {
      settings.setBinding(listeningAction, event.code);
      hint.textContent = `Belegt mit „${keyLabel(event.code)}“.`;
      listeningAction = null;
    }
    render();
  }, true);

  const element = h(
    'div',
    { class: 'screen dirt-bg' },
    h('h1', { class: 'title', style: { marginTop: '18px', fontSize: '14px' } }, 'Steuerung'),
    rows,
    hint,
    h('div', { class: 'btn-row', style: { marginTop: '8px' } }, button('Fertig', () => {
      listeningAction = null;
      app.screens.back('options');
    }, { wide: true }))
  );

  return {
    element,
    onShow() {
      listeningAction = null;
      hint.textContent = 'Auf eine Aktion klicken, um die Taste zu ändern.';
      render();
    },
    onHide() {
      listeningAction = null;
    },
  };
}

export { DEFAULT_KEYBINDINGS };
