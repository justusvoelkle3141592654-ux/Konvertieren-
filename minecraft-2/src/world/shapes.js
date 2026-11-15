// Geometrie der Nicht-Würfel-Blöcke als Liste von Boxen (Koordinaten 0–1 je Block).
// Verwendet für Rendering (mesher.js) und Kollision/Auswahl (physics, raycast).
// Rein, ohne Browser-APIs.
import { BLOCKS } from './blocks.js';

export const NORTH = 1;
export const EAST = 2;
export const SOUTH = 4;
export const WEST = 8;

// Richtung je Ausrichtungswert (0 Nord, 1 Ost, 2 Süd, 3 West): Schritt in x und z
const DIR_STEP = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/** Box-Liste für den Block mit der gegebenen Metadaten (Verbindungen nur für Zäune). */
export function shapeBoxes(def, meta, connections = 0) {
  switch (def.shape) {
    case 'cube':
    case 'cactus':
      return def.shape === 'cactus' ? [[0.0625, 0, 0.0625, 0.9375, 1, 0.9375]] : [[0, 0, 0, 1, 1, 1]];

    case 'slab':
      return meta & 8 ? [[0, 0.5, 0, 1, 1, 1]] : [[0, 0, 0, 1, 0.5, 1]];

    case 'stairs': {
      const facing = meta & 3;
      const lower = [0, 0, 0, 1, 0.5, 1];
      // Die erhöhte Hälfte liegt auf der Rückseite (gegenüber der Vorderkante)
      const upper = [
        [0, 0.5, 0.5, 1, 1, 1], // Vorderkante Nord → Stufe im Süden
        [0, 0.5, 0, 0.5, 1, 1], // Ost → Stufe im Westen
        [0, 0.5, 0, 1, 1, 0.5], // Süd → Stufe im Norden
        [0.5, 0.5, 0, 1, 1, 1], // West → Stufe im Osten
      ][facing];
      return [lower, upper];
    }

    case 'fence': {
      const boxes = [[0.375, 0, 0.375, 0.625, 1, 0.625]];
      if (connections & NORTH) boxes.push([0.4375, 0.375, 0, 0.5625, 0.9375, 0.4375]);
      if (connections & SOUTH) boxes.push([0.4375, 0.375, 0.5625, 0.5625, 0.9375, 1]);
      if (connections & WEST) boxes.push([0, 0.375, 0.4375, 0.4375, 0.9375, 0.5625]);
      if (connections & EAST) boxes.push([0.5625, 0.375, 0.4375, 1, 0.9375, 0.5625]);
      return boxes;
    }

    case 'door': {
      const open = (meta & 4) !== 0;
      const facing = meta & 3;
      const t = 0.1875;
      // Geschlossen: Platte an der Vorderseite; geöffnet: um 90° zur Seite geklappt.
      const closed = [
        [0, 0, 0, 1, 1, t],
        [1 - t, 0, 0, 1, 1, 1],
        [0, 0, 1 - t, 1, 1, 1],
        [0, 0, 0, t, 1, 1],
      ][facing];
      const openBox = [
        [1 - t, 0, 0, 1, 1, 1],
        [0, 0, 1 - t, 1, 1, 1],
        [0, 0, 0, t, 1, 1],
        [0, 0, 0, 1, 1, t],
      ][facing];
      return [open ? openBox : closed];
    }

    case 'ladder': {
      const facing = meta & 3;
      const t = 0.125;
      return [[
        [0, 0, 1 - t, 1, 1, 1],
        [0, 0, 0, t, 1, 1],
        [0, 0, 0, 1, 1, t],
        [1 - t, 0, 0, 1, 1, 1],
      ][facing]];
    }

    case 'torch': {
      const mode = meta & 7;
      if (mode === 0) return [[0.4375, 0, 0.4375, 0.5625, 0.625, 0.5625]];
      // Wandfackel: Stab nahe an der Wand, Richtung je Meta (1 Ost, 2 West, 3 Süd, 4 Nord)
      const [dx, dz] = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]][mode] ?? [0, 0];
      const cx = 0.5 + dx * 0.3;
      const cz = 0.5 + dz * 0.3;
      return [[cx - 0.0625, 0.2, cz - 0.0625, cx + 0.0625, 0.8, cz + 0.0625]];
    }

    case 'lever':
      return [[0.375, 0.25, 0.375, 0.625, 0.625, 0.625]];

    case 'button': {
      const f = (meta & 3) % 4;
      const [dx, dz] = DIR_STEP[f];
      const cx = 0.5 - dx * 0.4;
      const cz = 0.5 - dz * 0.4;
      return [[cx - 0.125, 0.375, cz - 0.125, cx + 0.125, 0.625, cz + 0.125]];
    }

    case 'plate':
      return [[0.0625, 0, 0.0625, 0.9375, 0.0625, 0.9375]];

    case 'rail':
      return [[0, 0, 0, 1, 0.0625, 1]];

    case 'carpet':
      return [[0, 0, 0, 1, 0.125, 1]];

    case 'farmland':
      return [[0, 0, 0, 1, 0.9375, 1]];

    case 'chest':
      return [[0.0625, 0, 0.0625, 0.9375, 0.875, 0.9375]];

    case 'bed':
      return [[0, 0, 0, 1, 0.5625, 1]];

    case 'anvil':
      return [
        [0.125, 0, 0.125, 0.875, 0.25, 0.875],
        [0.25, 0.25, 0.25, 0.75, 0.75, 0.75],
        [0, 0.75, 0, 1, 1, 1],
      ];

    case 'stand':
      return [
        [0.4375, 0, 0.4375, 0.5625, 0.875, 0.5625],
        [0.125, 0, 0.125, 0.875, 0.125, 0.875],
      ];

    case 'endframe': {
      const boxes = [[0, 0, 0, 1, 0.8125, 1]];
      if (meta & 4) boxes.push([0.25, 0.8125, 0.25, 0.75, 1, 0.75]);
      return boxes;
    }

    default:
      return [];
  }
}

/** Kollisionsboxen: nur für solide Formen; Tür geöffnet bzw. Fackel ohne Kollision. */
export function collisionBoxes(def, meta, connections = 0) {
  if (!def.solid) return [];
  return shapeBoxes(def, meta, connections);
}

/** Boxen für die Blockauswahl (Raycast): Formen ohne Kollision werden als Vollwürfel gewählt. */
export function selectionBoxes(def, meta, connections = 0) {
  if (def.shape === 'none' || def.shape === 'fluid' || def.shape === 'portal') return [];
  const boxes = shapeBoxes(def, meta, connections);
  if (boxes.length) return boxes;
  return [[0, 0, 0, 1, 1, 1]];
}

/**
 * Verbindungen eines Zauns zu seinen Nachbarn: Zäune und volle Würfel verbinden sich.
 * @param {object} def Blockdefinition des Zauns
 * @param {(dx:number, dz:number) => number} sample liefert die Block-ID des Nachbarn
 */
export function connectionsFor(def, sample) {
  const connectable = (id) => {
    const d = BLOCKS[id];
    return Boolean(d) && (d.shape === 'fence' || (d.shape === 'cube' && d.opaque));
  };
  let mask = 0;
  if (connectable(sample(0, -1))) mask |= NORTH;
  if (connectable(sample(1, 0))) mask |= EAST;
  if (connectable(sample(0, 1))) mask |= SOUTH;
  if (connectable(sample(-1, 0))) mask |= WEST;
  return mask;
}

/** Richtungsschritt für eine horizontale Ausrichtung (0–3). */
export function facingStep(facing) {
  return DIR_STEP[facing & 3];
}

export const SHAPE_NAMES = [...new Set(BLOCKS.map((b) => b.shape))];
