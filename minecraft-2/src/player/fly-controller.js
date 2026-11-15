// Vorläufige Flugsteuerung (Phase 1, Flachwelt). Wird in Phase 3 durch die Spielerphysik ersetzt.
import { settings } from '../systems/settings.js';

const FLY_SPEED = 9;
const SPRINT_FACTOR = 2.2;

export class FlyController {
  constructor(position = { x: 0.5, y: 4, z: 0.5 }) {
    this.x = position.x;
    this.y = position.y;
    this.z = position.z;
    this.yaw = 0;
    this.pitch = -0.25;
  }

  /** Verarbeitet Eingaben für einen Frame. */
  update(dt, input, locked) {
    if (locked) {
      const d = input.takeMouseDelta();
      const sens = 0.0022 * (0.2 + (settings.get('mouseSensitivity') / 100) * 1.6);
      this.yaw -= d.x * sens;
      this.pitch -= d.y * sens * (settings.get('invertY') ? -1 : 1);
      this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
    } else {
      input.takeMouseDelta();
    }

    let fx = 0;
    let fz = 0;
    let fy = 0;
    if (input.isDown('forward')) { fx -= Math.sin(this.yaw); fz -= Math.cos(this.yaw); }
    if (input.isDown('back')) { fx += Math.sin(this.yaw); fz += Math.cos(this.yaw); }
    if (input.isDown('left')) { fx -= Math.cos(this.yaw); fz += Math.sin(this.yaw); }
    if (input.isDown('right')) { fx += Math.cos(this.yaw); fz -= Math.sin(this.yaw); }
    if (input.isDown('jump')) fy += 1;
    if (input.isDown('sneak')) fy -= 1;
    const speed = FLY_SPEED * (input.isDown('sprint') ? SPRINT_FACTOR : 1);
    const len = Math.hypot(fx, fy, fz) || 1;
    this.x += (fx / len) * speed * dt;
    this.y += (fy / len) * speed * dt;
    this.z += (fz / len) * speed * dt;
  }
}
