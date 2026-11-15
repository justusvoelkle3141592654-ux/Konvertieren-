// Eingabe: Tasten (per KeyboardEvent.code), Maustasten, Mausbewegung bei gesperrtem Zeiger.
// Der Zustand wird pro Frame gesammelt; "pressed" gilt nur für den Frame des Drückens.
import { settings } from '../systems/settings.js';

export class Input {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    this.mouseDown = new Set();
    this.mousePressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.blockBrowserKeys = false;

    window.addEventListener('keydown', (event) => this.onKeyDown(event));
    window.addEventListener('keyup', (event) => this.down.delete(event.code));
    window.addEventListener('mousedown', (event) => {
      this.mouseDown.add(event.button);
      this.mousePressed.add(event.button);
    });
    window.addEventListener('mouseup', (event) => this.mouseDown.delete(event.button));
    window.addEventListener('mousemove', (event) => {
      if (document.pointerLockElement) {
        this.mouseDX += event.movementX;
        this.mouseDY += event.movementY;
      }
    });
    window.addEventListener('wheel', (event) => {
      this.wheel += Math.sign(event.deltaY);
    }, { passive: true });
    window.addEventListener('blur', () => this.reset());
    window.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  onKeyDown(event) {
    if (event.target instanceof HTMLInputElement) return;
    if (this.blockBrowserKeys && ['F2', 'F3', 'F5'].includes(event.code)) event.preventDefault();
    if (!event.repeat) this.pressed.add(event.code);
    this.down.add(event.code);
  }

  /** Ist die Aktion (z. B. "forward") gerade gehalten? */
  isDown(action) {
    return this.down.has(settings.get('keybindings')[action]);
  }

  /** Wurde die Aktion in diesem Frame gedrückt? */
  wasPressed(action) {
    return this.pressed.has(settings.get('keybindings')[action]);
  }

  /** Taste direkt per Code abfragen (z. B. feste Tasten wie F3). */
  isCodeDown(code) {
    return this.down.has(code);
  }

  wasCodePressed(code) {
    return this.pressed.has(code);
  }

  /** Mit der Taste gedrückt? (Maustasten: 0 links, 1 Mitte, 2 rechts) */
  isMouseDown(button) {
    return this.mouseDown.has(button);
  }

  wasMousePressed(button) {
    return this.mousePressed.has(button);
  }

  /** Liefert die gesammelten Mausbewegungen und setzt sie zurück. */
  takeMouseDelta() {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  takeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  /** Am Ende jedes Frames aufrufen. */
  endFrame() {
    this.pressed.clear();
    this.mousePressed.clear();
  }

  reset() {
    this.down.clear();
    this.pressed.clear();
    this.mouseDown.clear();
    this.mousePressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
