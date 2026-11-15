// Eine geladene Welt: Szene, Kamera, Chunks und Spielerzustand.
import * as THREE from 'three';
import { CHUNK_SIZE } from './config.js';
import { FlyController } from './player/fly-controller.js';
import { settings } from './systems/settings.js';
import { ChunkManager } from './world/chunk-manager.js';
import { createBlockMaterials } from './world/block-material.js';
import { World, worldToChunk } from './world/world.js';

const SPAWN_RADIUS_CHUNKS = 2;

export class GameSession {
  /**
   * @param {{ meta: object, atlas: import('./assets/texture-atlas.js').TextureAtlas,
   *           pool: import('./world/worker-chunks.js').ChunkWorkerPool }} deps
   */
  constructor({ meta, atlas, pool }) {
    this.meta = meta;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#9fc4ff');
    this.camera = new THREE.PerspectiveCamera(settings.get('fov'), 1, 0.05, 700);
    this.camera.rotation.order = 'YXZ';

    this.world = new World({ dimension: meta.dimension || 'overworld', seed: meta.seed });
    this.materials = createBlockMaterials(atlas.texture);
    this.chunkManager = new ChunkManager({
      world: this.world,
      pool,
      scene: this.scene,
      atlas,
      materials: this.materials,
      options: () => ({ smoothLighting: settings.get('smoothLighting') }),
    });
    this.chunkManager.renderDistance = settings.get('renderDistance');
    this.world.onChunkChanged = (chunk) => this.chunkManager.meshQueue.add(chunk.key);

    const p = meta.player?.pos ?? [0.5, 1, 0.5];
    this.controller = new FlyController({ x: p[0], y: p[1] + 1.6, z: p[2] });
    if (meta.player?.rot) {
      this.controller.yaw = meta.player.rot[0];
      this.controller.pitch = meta.player.rot[1];
    }
    this.disposed = false;
  }

  get position() {
    return { x: this.controller.x, y: this.controller.y, z: this.controller.z };
  }

  /** Eine Frame-Aktualisierung: Eingabe, Chunks, Kamera. */
  update(dt, input, locked) {
    this.controller.update(dt, input, locked);
    this.chunkManager.renderDistance = settings.get('renderDistance');
    this.chunkManager.update(worldToChunk(Math.floor(this.controller.x)), worldToChunk(Math.floor(this.controller.z)));
    this.chunkManager.rebuildMeshes(6);
    this.syncCamera();
  }

  syncCamera() {
    this.camera.position.set(this.controller.x, this.controller.y, this.controller.z);
    this.camera.rotation.set(this.controller.pitch, this.controller.yaw, 0);
    const fov = settings.get('fov');
    if (this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Wartet, bis der Bereich um den Spawn geladen und vermascht ist. */
  async waitForSpawnArea(onProgress, timeoutMs = 90000) {
    const started = performance.now();
    const cx = worldToChunk(Math.floor(this.controller.x));
    const cz = worldToChunk(Math.floor(this.controller.z));
    const needed = [];
    for (let dz = -SPAWN_RADIUS_CHUNKS; dz <= SPAWN_RADIUS_CHUNKS; dz++) {
      for (let dx = -SPAWN_RADIUS_CHUNKS; dx <= SPAWN_RADIUS_CHUNKS; dx++) {
        if (dx * dx + dz * dz <= SPAWN_RADIUS_CHUNKS * SPAWN_RADIUS_CHUNKS) needed.push([cx + dx, cz + dz]);
      }
    }
    for (;;) {
      this.chunkManager.update(cx, cz);
      this.chunkManager.rebuildMeshes(12);
      let ready = 0;
      for (const [x, z] of needed) {
        const chunk = this.world.getChunk(x, z);
        if (chunk && chunk.meshes && !chunk.dirty) ready++;
      }
      const fraction = ready / needed.length;
      onProgress?.(fraction * 0.95 + 0.05, `Chunks: ${ready} / ${needed.length}`);
      if (ready === needed.length) break;
      if (this.chunkManager.errors.length) throw new Error(this.chunkManager.errors[0]);
      if (performance.now() - started > timeoutMs) throw new Error('Zeitüberschreitung beim Erzeugen der Welt.');
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
    this.syncCamera();
    onProgress?.(1, 'Fertig');
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.chunkManager.dispose();
    this.materials.opaque.dispose();
    this.materials.transparent.dispose();
    this.scene.clear();
  }
}

export { CHUNK_SIZE };
