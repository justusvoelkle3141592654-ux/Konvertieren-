// Animierter Panorama-Hintergrund für das Startmenü: eine Landschaft aus Blöcken,
// die langsam von einer Kamera umkreist wird. Gerendert auf demselben Canvas wie das Spiel.
import * as THREE from 'three';

const SIZE = 40;

function hash(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0);
  const b = hash(x0 + 1, y0);
  const c = hash(x0, y0 + 1);
  const d = hash(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

export function createPanorama() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#78a7ff');
  scene.fog = new THREE.Fog('#a7c7ff', 45, 110);

  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 300);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.translate(0, 0.5, 0); // Würfel liegt auf dem Boden (y = 0) und wächst nach oben
  const material = new THREE.MeshLambertMaterial();
  const count = SIZE * SIZE;
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  let i = 0;
  for (let z = 0; z < SIZE; z++) {
    for (let x = 0; x < SIZE; x++) {
      const nx = (x - SIZE / 2) * 0.13;
      const nz = (z - SIZE / 2) * 0.13;
      const n = valueNoise(nx * 1.2, nz * 1.2) * 0.65 + valueNoise(nx * 3.1 + 7, nz * 3.1 + 3) * 0.35;
      const height = Math.max(1, Math.round(2 + n * 14));
      dummy.position.set((x - SIZE / 2) * 1.0, 0, (z - SIZE / 2) * 1.0);
      dummy.scale.set(1, height, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (height >= 13) color.set('#eef3f8');
      else if (height >= 10) color.set('#7d7d7d');
      else if (height <= 3) color.set('#dbcf8f');
      else color.set('#6bb147');
      mesh.setColorAt(i, color);
      i++;
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);

  const sun = new THREE.DirectionalLight('#ffffff', 2.2);
  sun.position.set(-30, 60, 20);
  scene.add(sun);
  scene.add(new THREE.AmbientLight('#b8c8e8', 1.1));

  let angle = 0.6;
  const target = new THREE.Vector3(0, 7, 0);

  return {
    scene,
    camera,
    /** Dreht die Kamera langsam weiter. */
    update(dt) {
      angle += dt * 0.05;
      const radius = 44;
      camera.position.set(Math.cos(angle) * radius, 17, Math.sin(angle) * radius);
      camera.lookAt(target);
    },
    resize(width, height) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}
