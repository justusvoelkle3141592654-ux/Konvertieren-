// Web Worker: erzeugt Chunk-Daten außerhalb des Hauptthreads.
import { generateChunkData } from '../world/terrain-generator.js';

self.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || msg.type !== 'gen') return;
  try {
    const data = generateChunkData(msg);
    const transfer = [data.blocks.buffer, data.meta.buffer, data.light.buffer, data.heightmap.buffer, data.biomes.buffer];
    self.postMessage({ type: 'chunk', id: msg.id, cx: msg.cx, cz: msg.cz, ...data }, transfer);
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: String(err && err.message ? err.message : err) });
  }
});
