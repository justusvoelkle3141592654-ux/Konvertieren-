// Einstellungen pro Browser (localStorage). Alle Zugriffe sind abgesichert,
// weil localStorage in privaten Fenstern oder bei blockierten Daten fehlen kann.
import { RENDER_DISTANCE_MAX, RENDER_DISTANCE_MIN } from '../config.js';

const STORAGE_KEY = 'minecraft2.settings.v1';

export const DEFAULT_KEYBINDINGS = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  sneak: 'ShiftLeft',
  sprint: 'ControlLeft',
  inventory: 'KeyE',
  drop: 'KeyQ',
  chat: 'KeyT',
  swapHands: 'KeyF',
  perspective: 'F5',
  debug: 'F3',
  screenshot: 'F2',
};

export const KEYBINDING_LABELS = {
  forward: 'Vorwärts',
  back: 'Rückwärts',
  left: 'Links',
  right: 'Rechts',
  jump: 'Springen',
  sneak: 'Schleichen',
  sprint: 'Sprinten',
  inventory: 'Inventar',
  drop: 'Item fallen lassen',
  chat: 'Chat',
  swapHands: 'Items tauschen',
  perspective: 'Perspektive',
  debug: 'Debug-Overlay',
  screenshot: 'Screenshot',
};

export const DEFAULT_SETTINGS = {
  renderDistance: 6,
  fov: 70,
  guiScale: 'auto', // 'auto' | 1 | 2 | 3 | 4
  particles: 'alle', // 'alle' | 'verringert' | 'minimal'
  clouds: true,
  shadows: true,
  smoothLighting: true,
  graphics: 'normal', // 'schnell' | 'normal' | 'schön'
  renderScale: 100, // Renderauflösung in Prozent (50–100)
  musicVolume: 50,
  soundVolume: 80,
  mouseSensitivity: 50,
  invertY: false,
  showFps: false,
  keybindings: { ...DEFAULT_KEYBINDINGS },
};

function clamp(n, min, max, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

function sanitize(raw) {
  const s = { ...DEFAULT_SETTINGS, ...(raw && typeof raw === 'object' ? raw : {}) };
  s.keybindings = { ...DEFAULT_KEYBINDINGS, ...(s.keybindings || {}) };
  s.renderDistance = clamp(s.renderDistance, RENDER_DISTANCE_MIN, RENDER_DISTANCE_MAX, 6);
  s.fov = clamp(s.fov, 30, 110, 70);
  s.renderScale = clamp(s.renderScale, 50, 100, 100);
  s.musicVolume = clamp(s.musicVolume, 0, 100, 50);
  s.soundVolume = clamp(s.soundVolume, 0, 100, 80);
  s.mouseSensitivity = clamp(s.mouseSensitivity, 0, 100, 50);
  if (!['auto', 1, 2, 3, 4].includes(s.guiScale)) s.guiScale = 'auto';
  if (!['alle', 'verringert', 'minimal'].includes(s.particles)) s.particles = 'alle';
  if (!['schnell', 'normal', 'schön'].includes(s.graphics)) s.graphics = 'normal';
  return s;
}

function load() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return sanitize(raw ? JSON.parse(raw) : null);
  } catch {
    return sanitize(null);
  }
}

const listeners = new Set();
let current = load();

function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Speicher nicht verfügbar – Einstellungen gelten dann nur für diese Sitzung.
  }
}

export const settings = {
  get all() {
    return current;
  },
  get(key) {
    return current[key];
  },
  set(key, value) {
    current = sanitize({ ...current, [key]: value });
    persist();
    for (const fn of listeners) fn(current, key);
  },
  setBinding(action, code) {
    const bindings = { ...current.keybindings };
    // Eine Taste darf nur einer Aktion zugeordnet sein.
    for (const other of Object.keys(bindings)) {
      if (other !== action && bindings[other] === code) bindings[other] = bindings[action];
    }
    bindings[action] = code;
    this.set('keybindings', bindings);
  },
  resetKeybindings() {
    this.set('keybindings', { ...DEFAULT_KEYBINDINGS });
  },
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
