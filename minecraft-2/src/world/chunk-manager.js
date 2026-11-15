// Lädt und entlädt Chunks rund um den Spieler und baut ihre Meshes innerhalb eines Zeitbudgets.
import * as THREE from 'three';
import { CHUNK_SIZE } from '../config.js';
import { Chunk, chunkKey } from './chunk.js';
import { buildChunkGeometry, PaddedBuffers } from './mesher.js';

const UNLOAD_MARGIN = 2;

export class ChunkManager {
  /**
   * @param {{ world: import('./world.js').World, pool: import('./worker-chunks.js').ChunkWorkerPool,
   *           scene: THREE.Scene, atlas: import('../assets/texture-atlas.js').TextureAtlas,
   *           materials: { opaque: THREE.Material, transparent: THREE.Material },
   *           options?: () => { smoothLighting: boolean } }} deps
   */
  constructor({ world, pool, scene, atlas, materials, options }) {
    this.world = world;
    this.pool = pool;
    this.atlas = atlas;
    this.materials = materials;
    this.getOptions = options || (() => ({ smoothLighting: true }));
    this.group = new THREE.Group();
    this.group.name = 'chunks';
    scene.add(this.group);
    this.requested = new Set();
    this.renderDistance = 6;
    this.centerCx = 0;
    this.centerCz = 0;
    this.buffers = new PaddedBuffers();
    this.meshQueue = new Set();
    this.maxInFlight = Math.max(2, pool.size * 2);
    this.generatorParams = { seed: world.seed, dimension: world.dimension, generator: 'flat' };
    this.stats = { loaded: 0, meshes: 0 };
    this.onLoaded = null;
    this.errors = [];
  }

  /** Verteilung der Chunks um die Spielerposition (Chunk-Koordinaten). */
  update(cx, cz) {
    this.centerCx = cx;
    this.centerCz = cz;
    const r = this.renderDistance;
    const wanted = [];
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > r * r + r) continue; // runder Ladebereich
        wanted.push({ cx: cx + dx, cz: cz + dz, d: dx * dx + dz * dz });
      }
    }
    wanted.sort((a, b) => a.d - b.d);

    // Nicht mehr benötigte Chunks entladen
    const limit = (r + UNLOAD_MARGIN) * (r + UNLOAD_MARGIN);
    for (const chunk of [...this.world.chunks.values()]) {
      const dx = chunk.cx - cx;
      const dz = chunk.cz - cz;
      if (dx * dx + dz * dz > limit) this.unloadChunk(chunk);
    }

    // Fehlende Chunks anfordern (nahe zuerst)
    for (const want of wanted) {
      if (this.pool.busy >= this.maxInFlight) break;
      const key = chunkKey(want.cx, want.cz);
      if (this.world.chunks.has(key) || this.requested.has(key)) continue;
      this.requestChunk(want.cx, want.cz);
    }
  }

  requestChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    this.requested.add(key);
    this.pool
      .request({ cx, cz, ...this.generatorParams })
      .then((msg) => {
        this.requested.delete(key);
        const dx = cx - this.centerCx;
        const dz = cz - this.centerCz;
        if (dx * dx + dz * dz > (this.renderDistance + UNLOAD_MARGIN) ** 2) return; // nicht mehr gebraucht
        if (this.world.chunks.has(key)) return;
        const chunk = new Chunk(cx, cz, msg);
        this.world.addChunk(chunk);
        this.stats.loaded++;
        this.markNeighborsDirty(chunk);
        if (this.onLoaded) this.onLoaded(chunk);
      })
      .catch((err) => {
        this.requested.delete(key);
        this.errors.push(err.message);
      });
  }

  markNeighborsDirty(chunk) {
    chunk.dirty = true;
    this.meshQueue.add(chunk.key);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = this.world.getChunk(chunk.cx + dx, chunk.cz + dz);
      if (n) {
        n.dirty = true;
        this.meshQueue.add(n.key);
      }
    }
  }

  unloadChunk(chunk) {
    this.disposeMeshes(chunk);
    this.world.removeChunk(chunk.cx, chunk.cz);
    this.meshQueue.delete(chunk.key);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = this.world.getChunk(chunk.cx + dx, chunk.cz + dz);
      if (n) {
        n.dirty = true;
        this.meshQueue.add(n.key);
      }
    }
    if (this.onUnloaded) this.onUnloaded(chunk);
  }

  /** Baut Meshes für veränderte Chunks, nahe Chunks zuerst, bis das Zeitbudget aufgebraucht ist. */
  rebuildMeshes(budgetMs = 6) {
    if (!this.meshQueue.size) return 0;
    const start = performance.now();
    const pending = [...this.meshQueue]
      .map((key) => this.world.chunks.get(key))
      .filter(Boolean)
      .sort((a, b) => {
        const da = (a.cx - this.centerCx) ** 2 + (a.cz - this.centerCz) ** 2;
        const db = (b.cx - this.centerCx) ** 2 + (b.cz - this.centerCz) ** 2;
        return da - db;
      });
    let built = 0;
    for (const chunk of pending) {
      if (built > 0 && performance.now() - start > budgetMs) break;
      this.meshQueue.delete(chunk.key);
      this.buildMesh(chunk);
      built++;
    }
    return built;
  }

  buildMesh(chunk) {
    const { smoothLighting } = this.getOptions();
    this.buffers.fill(chunk, (cx, cz) => this.world.getChunk(cx, cz));
    const geo = buildChunkGeometry(this.buffers, chunk, this.atlas, { smoothLighting });
    this.disposeMeshes(chunk);
    chunk.meshes = [];
    for (const [data, material, order] of [[geo.opaque, this.materials.opaque, 0], [geo.transparent, this.materials.transparent, 1]]) {
      if (!data) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
      geometry.setAttribute('aUv', new THREE.BufferAttribute(data.uvs, 2));
      geometry.setAttribute('aLight', new THREE.BufferAttribute(data.lights, 4));
      geometry.setAttribute('aTint', new THREE.BufferAttribute(data.tints, 4));
      geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(chunk.originX, 0, chunk.originZ);
      mesh.renderOrder = order;
      mesh.matrixAutoUpdate = true;
      this.group.add(mesh);
      chunk.meshes.push(mesh);
    }
    chunk.dirty = false;
    this.stats.meshes++;
  }

  disposeMeshes(chunk) {
    if (!chunk.meshes) return;
    for (const mesh of chunk.meshes) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
    }
    chunk.meshes = null;
  }

  get loadedCount() {
    return this.world.chunks.size;
  }

  dispose() {
    for (const chunk of [...this.world.chunks.values()]) this.disposeMeshes(chunk);
    this.world.chunks.clear();
    this.meshQueue.clear();
    this.requested.clear();
    this.group.removeFromParent();
  }
}

export { CHUNK_SIZE };
