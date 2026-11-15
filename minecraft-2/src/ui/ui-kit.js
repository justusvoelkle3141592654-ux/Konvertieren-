// Gemeinsame UI-Bausteine: DOM-Helfer, Buttons, Regler, Dialoge und die Bildschirmverwaltung.

/**
 * Kleiner DOM-Builder. Attribute: class, text, style, dataset, on<Event>, sonst als Attribut.
 * Kinder dürfen Elemente, Strings, Zahlen, Arrays oder null/false sein.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = String(value);
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

/** Wird bei jedem Klick auf einen Knopf aufgerufen (z. B. für ein Klick-Geräusch). */
export const uiHooks = { onClick: null };

/** Grauer Minecraft-Button. */
export function button(label, onClick, options = {}) {
  return h(
    'button',
    {
      class: ['mc-btn', options.wide && 'wide', options.small && 'small', options.tiny && 'tiny', options.danger && 'danger', options.selected && 'selected', options.className]
        .filter(Boolean)
        .join(' '),
      type: 'button',
      disabled: options.disabled,
      title: options.tooltip,
      'data-action': options.action,
      onclick: (event) => {
        if (uiHooks.onClick) uiHooks.onClick();
        if (onClick) onClick(event);
      },
    },
    label
  );
}

/** Schieberegler mit Beschriftung. onChange erhält den neuen Zahlenwert. */
export function slider({ label, min, max, step = 1, value, format = (v) => String(v), onChange }) {
  const input = h('input', { type: 'range', class: 'mc-slider', min, max, step, value });
  const text = h('span', { class: 'label', style: { minWidth: '90px', textAlign: 'right' } }, format(value));
  input.addEventListener('input', () => {
    const v = Number(input.value);
    text.textContent = format(v);
    if (onChange) onChange(v);
  });
  return h('div', { class: 'row' }, h('span', { class: 'label' }, label), h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, input, text));
}

/** Knopf, der bei jedem Klick zum nächsten Wert wechselt (wie in Minecraft). */
export function cycleButton({ label, values, value, format = (v) => String(v), onChange, width }) {
  let index = Math.max(0, values.indexOf(value));
  const btn = button(`${label}: ${format(values[index])}`, null, { wide: width === 'wide' });
  btn.onclick = () => {
    if (uiHooks.onClick) uiHooks.onClick();
    index = (index + 1) % values.length;
    btn.textContent = `${label}: ${format(values[index])}`;
    if (onChange) onChange(values[index]);
  };
  return btn;
}

/** An-/Aus-Schalter als Cycle-Button. */
export function toggleButton({ label, value, onChange }) {
  return cycleButton({
    label,
    values: [true, false],
    value: Boolean(value),
    format: (v) => (v ? 'AN' : 'AUS'),
    onChange,
  });
}

/** Bildschirmverwaltung: registriert Bildschirme und führt einen Verlauf für „Zurück“. */
export class ScreenManager {
  constructor(root) {
    this.root = root;
    this.screens = new Map();
    this.history = [];
    this.current = null;
  }

  register(name, element, { overlay = false, onShow = null, onHide = null } = {}) {
    element.classList.add('screen');
    if (overlay) element.classList.add('overlay');
    element.classList.add('hidden');
    element.dataset.screen = name;
    this.root.append(element);
    this.screens.set(name, { element, overlay, onShow, onHide });
    return element;
  }

  /** Zeigt einen Bildschirm. Mit push=true wird der aktuelle zum Zurückkehren gemerkt. */
  show(name, { push = false, replace = false, data } = {}) {
    const next = this.screens.get(name);
    if (!next) throw new Error(`Unbekannter Bildschirm: ${name}`);
    if (this.current && this.current !== name) {
      const prev = this.screens.get(this.current);
      if (push) {
        this.history.push(this.current);
      } else if (!replace && !prev.overlay) {
        this.history = [];
      }
      if (!next.overlay || replace) {
        prev.element.classList.add('hidden');
        prev.onHide?.();
      }
    }
    if (replace) this.history = [];
    this.current = name;
    next.element.classList.remove('hidden');
    next.onShow?.(data);
    return next.element;
  }

  /** Kehrt zum vorherigen Bildschirm zurück (oder schließt ein Overlay). */
  back(fallback = 'title') {
    const cur = this.screens.get(this.current);
    if (cur) {
      cur.element.classList.add('hidden');
      cur.onHide?.();
    }
    const prev = this.history.pop() ?? fallback;
    this.current = prev;
    const target = this.screens.get(prev);
    if (target) {
      target.element.classList.remove('hidden');
      target.onShow?.();
    }
    return prev;
  }

  /** Versteckt alle Bildschirme. */
  hideAll() {
    for (const [, screen] of this.screens) {
      if (!screen.element.classList.contains('hidden')) {
        screen.element.classList.add('hidden');
        screen.onHide?.();
      }
    }
    this.current = null;
    this.history = [];
  }

  isVisible(name) {
    const screen = this.screens.get(name);
    return Boolean(screen && !screen.element.classList.contains('hidden'));
  }
}

/** Modaler Dialog über dem aktuellen Bildschirm. Gibt eine Funktion zum Schließen zurück. */
export function openDialog(root, { title, body = [], buttons = [], width } = {}) {
  const panel = h('div', { class: 'dialog', style: width ? { width: `${width}px` } : undefined },
    title ? h('h2', { text: title }) : null,
    body,
    h('div', { class: 'btn-row' }, buttons.map((b) => b))
  );
  const overlay = h('div', { class: 'screen overlay dialog-layer', style: { zIndex: 50, background: 'rgba(0,0,0,0.6)', justifyContent: 'center' } }, panel);
  root.append(overlay);
  const close = () => overlay.remove();
  // Schließen durch Escape ist gewünscht: der Dialog wird im Eventhandler des Spiels beendet.
  overlay.dataset.dialog = 'true';
  return { overlay, panel, close };
}

/** Bestehende Dialoge schließen (z. B. beim Verlassen eines Menüs). */
export function closeAllDialogs(root) {
  root.querySelectorAll('.dialog-layer').forEach((el) => el.remove());
}

let dirtTileUrl = null;

/** Erzeugt einmalig ein Erdblock-Muster als CSS-Hintergrund. */
export function dirtTileCss() {
  if (dirtTileUrl) return dirtTileUrl;
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  let seed = 1234567;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const v = 120 + (rnd() - 0.5) * 40;
      ctx.fillStyle = `rgb(${v * 1.1},${v * 0.78},${v * 0.55})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  dirtTileUrl = `url(${canvas.toDataURL('image/png')})`;
  return dirtTileUrl;
}

/** Formatiert Sekunden als "1 Std. 02 Min." bzw. "45 Sek.". */
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (hours > 0) return `${hours} Std. ${String(minutes).padStart(2, '0')} Min.`;
  if (minutes > 0) return `${minutes} Min. ${String(s % 60).padStart(2, '0')} Sek.`;
  return `${s} Sek.`;
}

/** Datum im deutschen Format. */
export function formatDate(ms) {
  if (!ms) return '–';
  return new Date(ms).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
