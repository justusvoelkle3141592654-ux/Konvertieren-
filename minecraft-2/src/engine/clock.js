// Fester Zeitschritt für die Spiellogik (20 Ticks pro Sekunde) mit begrenztem Nachholen.
import { TICK_SECONDS } from '../config.js';

export class FixedClock {
  constructor(maxCatchUp = 5) {
    this.accumulator = 0;
    this.maxCatchUp = maxCatchUp;
    this.last = null;
  }

  /** Gibt die Anzahl der auszuführenden Ticks für die verstrichene Zeit (in Sekunden) zurück. */
  advance(nowMs) {
    if (this.last === null) this.last = nowMs;
    const frame = Math.min(0.25, (nowMs - this.last) / 1000);
    this.last = nowMs;
    this.accumulator += frame;
    let ticks = 0;
    while (this.accumulator >= TICK_SECONDS && ticks < this.maxCatchUp) {
      this.accumulator -= TICK_SECONDS;
      ticks++;
    }
    if (ticks === this.maxCatchUp) this.accumulator = 0;
    return ticks;
  }

  reset() {
    this.accumulator = 0;
    this.last = null;
  }
}
