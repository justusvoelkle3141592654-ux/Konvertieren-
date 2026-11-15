// Tageszeit, Himmelsfarben, Sonne, Mond, Sterne und Wolken.
// Ein voller Tag dauert 24 000 Ticks (20 Minuten). 0 = Sonnenaufgang, 6000 = Mittag,
// 12 000 = Sonnenuntergang, 18 000 = Mitternacht.
import * as THREE from 'three';
import { DAY_LENGTH_TICKS } from '../config.js';
import { smoothstep } from '../world/noise.js';

const DAY_COLOR = new THREE.Color('#78a7ff');
const NIGHT_COLOR = new THREE.Color('#070a1c');
const SUNSET_COLOR = new THREE.Color('#ff8a4c');
const GREY = new THREE.Color('#9aa3b0');

/** Sonnenstand als Werte für Helligkeit und Richtung. */
export function sunState(time) {
  const angle = ((time % DAY_LENGTH_TICKS) / DAY_LENGTH_TICKS) * Math.PI * 2;
  const sunY = Math.sin(angle);
  const sunX = Math.cos(angle);
  // Himmelslicht-Faktor: volle Helligkeit am Tag, schwaches Mondlicht in der Nacht
  const daylight = 0.12 + 0.88 * smoothstep(-0.14, 0.14, sunY);
  return { angle, sunX, sunY, daylight };
}

function radialTexture(size, inner, outer, edge) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(edge, outer);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function moonTexture() {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e8efff';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(120,135,170,0.6)';
  for (const [x, y, r] of [[10, 11, 3], [19, 18, 4], [13, 21, 2], [21, 9, 2]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

function cloudTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  let seed = 9176;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  // Grobe Blöcke mit zufälligen Lücken, ergibt Pixel-Wolken
  const cells = 16;
  const grid = Array.from({ length: cells * cells }, () => (rnd() > 0.45 ? 1 : 0));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = Math.floor((x / size) * cells);
      const cy = Math.floor((y / size) * cells);
      const on = grid[cy * cells + cx];
      const i = (y * size + x) * 4;
      image.data[i] = 255;
      image.data[i + 1] = 255;
      image.data[i + 2] = 255;
      image.data[i + 3] = on ? 235 : 0;
    }
  }
  ctx.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(40, 40);
  return tex;
}

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'sky';
    scene.add(this.group);

    this.sun = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshBasicMaterial({ map: radialTexture(64, '#fffbe0', '#ffd34d', 0.35), transparent: true, depthWrite: false, fog: false })
    );
    this.moon = new THREE.Mesh(
      new THREE.PlaneGeometry(36, 36),
      new THREE.MeshBasicMaterial({ map: moonTexture(), transparent: true, depthWrite: false, fog: false })
    );
    this.group.add(this.sun, this.moon);

    const starCount = 900;
    const positions = new Float32Array(starCount * 3);
    let seed = 4242;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < starCount; i++) {
      const u = rnd() * 2 - 1;
      const theta = rnd() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const r = 480;
      positions[i * 3] = s * Math.cos(theta) * r;
      positions[i * 3 + 1] = Math.abs(u) * r; // nur über dem Horizont
      positions[i * 3 + 2] = s * Math.sin(theta) * r;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false }));
    this.group.add(this.stars);

    this.cloudTex = cloudTexture();
    this.clouds = new THREE.Mesh(
      new THREE.PlaneGeometry(2400, 2400),
      new THREE.MeshBasicMaterial({ map: this.cloudTex, transparent: true, opacity: 0.9, depthWrite: false, fog: false })
    );
    this.clouds.rotation.x = -Math.PI / 2;
    this.group.add(this.clouds);

    this.color = new THREE.Color();
    this.fogColor = new THREE.Color();
    this.daylight = 1;
  }

  /**
   * Aktualisiert Himmel für die aktuelle Tageszeit.
   * @returns {{ daylight: number, skyColor: THREE.Color }}
   */
  update(time, camera, { rain = 0, thunder = 0, cloudsVisible = true, cloudTime = 0 } = {}) {
    const { sunX, sunY, daylight } = sunState(time);
    this.daylight = daylight;

    // Himmelsfarbe: Tag → Nacht, mit Abendrot am Horizont und grauem Wetter
    const dayFactor = smoothstep(-0.1, 0.25, sunY);
    this.color.copy(NIGHT_COLOR).lerp(DAY_COLOR, dayFactor);
    const sunset = Math.exp(-sunY * sunY * 45) * 0.65 * (1 - rain * 0.7);
    this.color.lerp(SUNSET_COLOR, sunset);
    const greyness = Math.min(1, rain * 0.6 + thunder * 0.25);
    this.color.lerp(GREY, greyness * 0.55).multiplyScalar(1 - thunder * 0.25);
    this.fogColor.copy(this.color);

    // Himmelskörper folgen der Kamera
    const cam = camera.position;
    const dist = 380;
    this.sun.position.set(cam.x + sunX * dist, cam.y + sunY * dist, cam.z + 60);
    this.moon.position.set(cam.x - sunX * dist, cam.y - sunY * dist, cam.z - 60);
    this.sun.lookAt(cam);
    this.moon.lookAt(cam);
    this.sun.material.opacity = smoothstep(-0.2, 0.05, sunY) * (1 - rain * 0.8);
    this.moon.material.opacity = smoothstep(0.1, -0.1, sunY) * (1 - rain * 0.8);
    this.stars.position.set(cam.x, cam.y, cam.z);
    this.stars.material.opacity = (1 - dayFactor) * 0.9 * (1 - rain * 0.7);
    this.stars.visible = this.stars.material.opacity > 0.01;

    this.clouds.visible = cloudsVisible;
    this.clouds.position.set(cam.x, 192, cam.z);
    this.cloudTex.offset.set(cloudTime * 0.00035, cloudTime * 0.00012);
    this.clouds.material.opacity = 0.55 + 0.35 * dayFactor;
    return { daylight, skyColor: this.color };
  }

  dispose() {
    this.sun.geometry.dispose();
    this.sun.material.map?.dispose();
    this.sun.material.dispose();
    this.moon.geometry.dispose();
    this.moon.material.map?.dispose();
    this.moon.material.dispose();
    this.stars.geometry.dispose();
    this.stars.material.dispose();
    this.clouds.geometry.dispose();
    this.clouds.material.dispose();
    this.cloudTex.dispose();
    this.group.removeFromParent();
  }
}
