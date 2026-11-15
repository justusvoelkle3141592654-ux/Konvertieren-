// Liste aller Texturen, die das Spiel benötigt. Wird vom Setup-Script genutzt,
// um fehlende Originaldateien zu melden, und vom Atlas zum Aufbau verwendet.
import { BLOCKS } from '../world/blocks.js';

const names = new Set();

for (const block of BLOCKS) {
  if (block.shape === 'none') continue;
  for (const tex of Object.values(block.tex)) {
    if (tex) names.add(tex);
  }
}

/** Sortierte Liste der benötigten Texturnamen (z. B. "block/stone"). */
export const REQUIRED_TEXTURES = [...names].sort();
