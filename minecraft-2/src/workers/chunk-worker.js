// Web Worker: erzeugt Chunk-Daten (Gelände, Vegetation, Licht) und Meshes außerhalb des Hauptthreads.
import { generateChunkData } from '../world/terrain-generator.js';
import { computeChunkLight } from '../world/light.js';
import { buildChunkGeometry } from '../world/mesher.js';

let atlasUv = {};

function transferList(data) {
  return [data.blocks.buffer, data.meta.buffer, data.light.buffer, data.heightmap.buffer, data.biomes.buffer];
}

function geometryTransfer(geo) {
  const list = [];
  for (const part of [geo.opaque, geo.transparent]) {
    if (!part) continue;
    list.push(part.positions.buffer, part.uvs.buffer, part.lights.buffer, part.tints.buffer, part.indices.buffer);
  }
  return list;
}

self.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg) return;
  try {
    if (msg.type === 'atlas') {
      atlasUv = msg.uv;
      return;
    }
    if (msg.type === 'gen') {
      const data = generateChunkData(msg);
      data.light = computeChunkLight({ blocks: data.blocks, meta: data.meta, light: data.light, cx: msg.cx, cz: msg.cz });
      self.postMessage({ type: 'chunk', id: msg.id, cx: msg.cx, cz: msg.cz, ...data }, transferList(data));
      return;
    }
    if (msg.type === 'mesh') {
      const buf = msg.buffers;
      const atlas = { uv: (name) => atlasUv[name] ?? atlasUv.missing };
      const geo = buildChunkGeometry(buf, { biomes: msg.biomes }, atlas, { smoothLighting: msg.smoothLighting });
      self.postMessage(
        { type: 'mesh-result', id: msg.id, cx: msg.cx, cz: msg.cz, version: msg.version, opaque: geo.opaque, transparent: geo.transparent },
        geometryTransfer(geo)
      );
      return;
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: String(err && err.message ? err.message : err) });
  }
});
