// Wetter: Regen, Gewitter und Blitze. Der Zustand wird mit der Welt gespeichert.
import * as THREE from 'three';

const RAIN_DROPS = 900;
const RAIN_RADIUS = 14;
const RAIN_HEIGHT = 22;

export class Weather {
  /** @param {{ raining?: boolean, thundering?: boolean, timer?: number }} state */
  constructor(state = {}) {
    this.raining = Boolean(state.raining);
    this.thundering = Boolean(state.thundering);
    this.timer = state.timer ?? 12000 + Math.floor(Math.random() * 12000);
    this.rain = this.raining ? 1 : 0;
    this.thunder = this.thundering ? 1 : 0;
    this.flash = 0;
    this.lightningCooldown = 0;
    this.lastStrike = null;
  }

  /** Ein Spiel-Tick: Zeitgeber und Zustandswechsel. */
  tick() {
    this.timer--;
    if (this.timer <= 0) {
      if (this.raining) {
        // Regen endet; Gewitter enden mit ihm
        this.raining = false;
        this.thundering = false;
        this.timer = 60000 + Math.floor(Math.random() * 60000);
      } else {
        this.raining = true;
        this.thundering = Math.random() < 0.3;
        this.timer = 12000 + Math.floor(Math.random() * 12000);
      }
    }
    if (this.thundering) {
      this.lightningCooldown--;
      if (this.lightningCooldown <= 0 && Math.random() < 0.02) {
        this.flash = 1;
        this.lastStrike = Math.random() * Math.PI * 2;
        this.lightningCooldown = 60 + Math.floor(Math.random() * 200);
      }
    }
  }

  /** Weiche Übergänge und Blitzabklingen pro Frame. */
  update(dt) {
    const target = this.raining ? 1 : 0;
    this.rain += (target - this.rain) * Math.min(1, dt * 0.8);
    const thunderTarget = this.raining && this.thundering ? 1 : 0;
    this.thunder += (thunderTarget - this.thunder) * Math.min(1, dt * 0.6);
    this.flash = Math.max(0, this.flash - dt * 2.5);
  }

  snapshot() {
    return { raining: this.raining, thundering: this.thundering, timer: this.timer };
  }

  dispose() {}
}

/** Regentropfen als Linien um die Kamera. */
export class RainEffect {
  constructor(scene) {
    const positions = new Float32Array(RAIN_DROPS * 6);
    this.speeds = new Float32Array(RAIN_DROPS);
    this.offsets = new Float32Array(RAIN_DROPS * 3);
    for (let i = 0; i < RAIN_DROPS; i++) {
      this.resetDrop(i, true);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.positions = positions;
    this.mesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#b8d4ff', transparent: true, opacity: 0.32, depthWrite: false, fog: false }));
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  resetDrop(i, initial = false) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * RAIN_RADIUS;
    this.offsets[i * 3] = Math.cos(a) * r;
    this.offsets[i * 3 + 1] = initial ? Math.random() * RAIN_HEIGHT : RAIN_HEIGHT;
    this.offsets[i * 3 + 2] = Math.sin(a) * r;
    this.speeds[i] = 18 + Math.random() * 8;
  }

  /** Aktualisiert die Tropfen relativ zur Kamera; intensity 0–1. */
  update(dt, camera, intensity) {
    this.mesh.visible = intensity > 0.02;
    if (!this.mesh.visible) return;
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    for (let i = 0; i < RAIN_DROPS; i++) {
      this.offsets[i * 3 + 1] -= this.speeds[i] * dt;
      if (this.offsets[i * 3 + 1] < -2) this.resetDrop(i);
      const ox = this.offsets[i * 3];
      const oy = this.offsets[i * 3 + 1];
      const oz = this.offsets[i * 3 + 2];
      const x = cx + ox;
      const y = cy - 6 + oy;
      const z = cz + oz;
      // Kurze Linie in Fallrichtung
      this.positions[i * 6] = x;
      this.positions[i * 6 + 1] = y;
      this.positions[i * 6 + 2] = z;
      this.positions[i * 6 + 3] = x;
      this.positions[i * 6 + 4] = y + 0.6;
      this.positions[i * 6 + 5] = z;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.material.opacity = 0.12 + 0.3 * intensity;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.removeFromParent();
  }
}
