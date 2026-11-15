// Lädt, entlädt und speichert Chunks rund um den Spieler und baut ihre Meshes im Zeitbudget.
//  - Gespeicherte Chunks kommen aus IndexedDB, neue werden im Worker erzeugt.
//  - Veränderte Chunks werden beim Entladen gesichert.
import * as THREE from 'three';
import { Chunk, chunkKey } from './chunk.js';
import { buildChunkGeometry, PaddedBuffers } from './mesher.js';

const UNLOAD_MARGIN = 2;

export class ChunkManager {
  /**
   * @param {{ world: import('./world.js').World, pool: import('./worker-chunks.js').ChunkWorkerPool,
   *           scene: THREE.Scene, atlas: object, materials: { opaque: THREE.Material, transparent: THREE.Material },
   *           options?: () => { smoothLighting: boolean, biomeTint?: boolean },
   *           persistence?: { load: (cx:number, cz:number) => Promise<object|null>, save: (records: object[]) => Promise<void> } }} deps
   */
  constructor({ world, pool, scene, atlas, materials, options, persistence = null }) {
    this.world = world;
    this.pool = pool;
    this.atlas = atlas;
    this.materials = materials;
    this.persistence = persistence;
    this.getOptions = options || (() => ({ smoothLighting: true }));
    this.group = new THREE.Group();
    this.group.name = 'chunks';
    scene.add(this.group);
    this.requested = new Set();
    this.pendingSaves = new Map();
    this.renderDistance = 6;
    this.centerCx = 0;
    this.centerCz = 0;
    this.buffers = new PaddedBuffers();
    this.meshQueue = new Set();
    this.inFlight = 0;
    this.maxInFlight = pool.size * 3 + 4;
    this.meshJobs = new Map();
    this.maxMeshJobs = pool.size * 2 + 2;
    this.generatorParams = { seed: world.seed, dimension: world.dimension, generator: 'default' };
    this.stats = { loaded: 0, meshes: 0, saved: 0 };
    this.errors = [];
  }

  /** Setzt den Erzeugungsmodus (Standard oder Flachwelt). */
  setGenerator(generator, structures = true) {
    this.generatorParams = { ...this.generatorParams, generator, structures };
  }

  isWanted(cx, cz) {
    const dx = cx - this.centerCx;
    const dz = cz - this.centerCz;
    return dx * dx + dz * dz <= (this.renderDistance + UNLOAD_MARGIN) ** 2;
  }

  /** Verteilt Chunks um die Spielerposition (Chunk-Koordinaten). */
  update(cx, cz) {
    this.centerCx = cx;
    this.centerCz = cz;
    const r = this.renderDistance;
    const wanted = [];
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > r * r + r) continue;
        wanted.push({ cx: cx + dx, cz: cz + dz, d: dx * dx + dz * dz });
      }
    }
    wanted.sort((a, b) => a.d - b.d);

    for (const chunk of [...this.world.chunks.values()]) {
      if (!this.isWanted(chunk.cx, chunk.cz)) this.unloadChunk(chunk);
    }

    for (const want of wanted) {
      if (this.inFlight >= this.maxInFlight) break;
      const key = chunkKey(want.cx, want.cz);
      if (this.world.chunks.has(key) || this.requested.has(key)) continue;
      this.requestChunk(want.cx, want.cz);
    }
  }

  async requestChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    this.requested.add(key);
    this.inFlight++;
    try {
      let data = null;
      if (this.persistence) data = await this.persistence.load(cx, cz).catch(() => null);
      if (!data) data = await this.pool.generate({ cx, cz, ...this.generatorParams });
      if (!this.isWanted(cx, cz) || this.world.chunks.has(key)) return;
      const chunk = new Chunk(cx, cz, data);
      this.world.addChunk(chunk);
      this.stats.loaded++;
      this.markNeighborsDirty(chunk);
      this.onLoaded?.(chunk);
    } catch (err) {
      this.errors.push(err.message || String(err));
    } finally {
      this.requested.delete(key);
      this.inFlight--;
    }
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
    if (chunk.modified && this.persistence) {
      this.pendingSaves.set(chunk.key, chunk.serialize(this.world.worldId, this.world.dimension));
      chunk.modified = false;
    }
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
  }

  /**
   * Speichert alle veränderten Chunks (geladene und zuletzt entladene).
   * @returns {Promise<number>} Anzahl gespeicherter Chunks
   */
  async saveModified() {
    if (!this.persistence) return 0;
    const records = [...this.pendingSaves.values()];
    const loaded = [];
    for (const chunk of this.world.chunks.values()) {
      if (chunk.modified) {
        records.push(chunk.serialize(this.world.worldId, this.world.dimension));
        loaded.push(chunk);
      }
    }
    if (!records.length) return 0;
    try {
      await this.persistence.save(records);
    } catch (err) {
      // Bei Fehlern bleiben die Chunks als verändert markiert
      for (const [key, record] of this.pendingSaves) this.pendingSaves.set(key, record);
      throw err;
    }
    this.pendingSaves.clear();
    for (const chunk of loaded) chunk.modified = false;
    this.stats.saved += records.length;
    return records.length;
  }

  /**
   * Startet Mesh-Aufträge für veränderte Chunks (nahe zuerst) und übernimmt fertige Ergebnisse.
   * Das Zeitbudget begrenzt die Arbeit des Hauptthreads pro Frame.
   */
  rebuildMeshes(budgetMs = 6) {
    const start = performance.now();
    if (this.meshQueue.size && this.meshJobs.size < this.maxMeshJobs) {
      const pending = [...this.meshQueue]
        .map((key) => this.world.chunks.get(key))
        .filter((chunk) => chunk && !this.meshJobs.has(chunk.key))
        .sort((a, b) => {
          const da = (a.cx - this.centerCx) ** 2 + (a.cz - this.centerCz) ** 2;
          const db = (b.cx - this.centerCx) ** 2 + (b.cz - this.centerCz) ** 2;
          return da - db;
        });
      for (const chunk of pending) {
        if (this.meshJobs.size >= this.maxMeshJobs) break;
        if (performance.now() - start > budgetMs) break;
        this.meshQueue.delete(chunk.key);
        this.startMeshJob(chunk);
      }
    }
    for (const key of [...this.meshQueue]) {
      if (!this.world.chunks.has(key)) this.meshQueue.delete(key);
    }
    return this.meshJobs.size;
  }

  /** Füllt die Randpuffer und schickt den Chunk an einen Worker. */
  startMeshJob(chunk) {
    const { smoothLighting } = this.getOptions();
    const buffers = new PaddedBuffers();
    buffers.fill(chunk, (cx, cz) => this.world.getChunk(cx, cz));
    const version = chunk.version;
    this.meshJobs.set(chunk.key, version);
    const transfer = [buffers.blocks.buffer, buffers.meta.buffer, buffers.light.buffer];
    const biomes = chunk.biomes.slice();
    this.pool
      .mesh({ cx: chunk.cx, cz: chunk.cz, version, smoothLighting, biomes, buffers: { blocks: buffers.blocks, meta: buffers.meta, light: buffers.light } }, transfer)
      .then((msg) => this.applyMesh(chunk, msg))
      .catch((err) => {
        this.errors.push(err.message || String(err));
        if (this.world.chunks.get(chunk.key) === chunk) this.meshQueue.add(chunk.key);
      })
      .finally(() => {
        this.meshJobs.delete(chunk.key);
      });
  }

  /** Übernimmt eine fertige Geometrie, sofern der Chunk seit dem Auftrag unverändert ist. */
  applyMesh(chunk, msg) {
    if (this.world.chunks.get(chunk.key) !== chunk) return;
    if (msg.version !== chunk.version) {
      // Inzwischen verändert: erneut einreihen
      this.meshQueue.add(chunk.key);
      return;
    }
    this.buildMeshObjects(chunk, { opaque: msg.opaque, transparent: msg.transparent });
    chunk.dirty = false;
    this.stats.meshes++;
  }

  /** Erzeugt Three.js-Meshes aus Geometrie-Arrays. */
  buildMeshObjects(chunk, geo) {
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
      this.group.add(mesh);
      chunk.meshes.push(mesh);
    }
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
    this.pendingSaves.clear();
    this.meshJobs.clear();
    this.group.removeFromParent();
  }
}
