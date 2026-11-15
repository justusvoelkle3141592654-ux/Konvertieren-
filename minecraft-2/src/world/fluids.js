// Flüssigkeiten (Wasser, Lava) und Fallblöcke (Sand, Kies).
// Meta einer Flüssigkeit: Bits 0–2 = Füllstand (0 = Quelle, 1–7 = Fließen), Bit 3 (8) = fällt.
import { BLOCKS, B } from './blocks.js';

const SIDES = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const REPLACEABLE = new Set();
for (const def of BLOCKS) {
  if (def.id === 0 || def.shape === 'cross' || def.shape === 'carpet' || def.shape === 'dust' || def.name === 'fire') REPLACEABLE.add(def.id);
}

const FLUIDS = {
  water: { id: B.water, delay: 5, spreadOverworld: 7, spreadNether: 7, otherId: B.lava },
  lava: { id: B.lava, delay: 30, spreadOverworld: 3, spreadNether: 7, otherId: B.water },
};

function fluidOf(id) {
  if (id === B.water) return FLUIDS.water;
  if (id === B.lava) return FLUIDS.lava;
  return null;
}

function maxSpread(world, fluid) {
  return world.dimension === 'nether' ? fluid.spreadNether : fluid.spreadOverworld;
}

function delayFor(world, fluid) {
  if (fluid.id === B.lava && world.dimension === 'nether') return 10;
  return fluid.delay;
}

/** Quelle (Füllstand 0 ohne Fallbit)? */
function isSource(meta) {
  return (meta & 7) === 0 && (meta & 8) === 0;
}

/** Verdrängt Blöcke wie Gras oder Blumen; volle Blöcke bleiben stehen. */
function canFlowInto(id) {
  return id === 0 || REPLACEABLE.has(id);
}

/** Aktualisiert eine Flüssigkeitszelle: Füllstand neu berechnen, weiterfließen, Quellen bilden. */
export function updateFluid(world, x, y, z) {
  const id = world.getBlock(x, y, z);
  const fluid = fluidOf(id);
  if (!fluid) return;
  let meta = world.getMeta(x, y, z);
  const spread = maxSpread(world, fluid);

  // Quellbildung: zwei Quellen nebeneinander über fester Fläche füllen die Lücke unendlich
  if (!isSource(meta)) {
    let sourcesAround = 0;
    for (const [dx, dz] of SIDES) {
      if (world.getBlock(x + dx, y, z + dz) === id && isSource(world.getMeta(x + dx, y, z + dz))) sourcesAround++;
    }
    const below = world.getBlock(x, y - 1, z);
    if (sourcesAround >= 2 && fluid === FLUIDS.water && BLOCKS[below]?.solid) {
      world.setBlock(x, y, z, id, 0, { notify: false });
      meta = 0;
    }
  }

  // Neuer Füllstand aus den Nachbarn: darüberliegende Flüssigkeit fällt, seitlich wird um 1 schwächer
  if (!isSource(meta)) {
    let best = 99;
    let fromAbove = false;
    if (world.getBlock(x, y + 1, z) === id) {
      fromAbove = true;
    }
    for (const [dx, dz] of SIDES) {
      if (world.getBlock(x + dx, y, z + dz) !== id) continue;
      const nMeta = world.getMeta(x + dx, y, z + dz);
      const nLevel = isSource(nMeta) ? 0 : nMeta & 7;
      if (nLevel + 1 < best) best = nLevel + 1;
    }
    let newMeta;
    if (fromAbove) {
      newMeta = 8 | 1;
    } else if (best <= spread) {
      newMeta = best;
    } else {
      newMeta = -1;
    }
    if (newMeta === -1) {
      world.setBlock(x, y, z, B.air, 0, { notify: false });
      wakeNeighbors(world, x, y, z, fluid);
      return;
    }
    if (newMeta !== meta) {
      world.setBlock(x, y, z, id, newMeta, { notify: false });
      meta = newMeta;
    }
  }

  // Lava und Wasser treffen aufeinander: Stein entsteht
  for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]]) {
    const nId = world.getBlock(x + dx, y + dy, z + dz);
    if (nId === fluid.otherId) {
      const otherSource = isSource(world.getMeta(x + dx, y + dy, z + dz));
      if (id === B.water) {
        // Wasser fließt in Lava: Quelle → Obsidian, Fließen → Bruchstein
        world.setBlock(x + dx, y + dy, z + dz, otherSource ? B.obsidian : B.cobblestone, 0);
      }
      return;
    }
  }

  // Weiterfließen: nach unten bevorzugt, sonst seitlich
  const belowX = x;
  const belowY = y - 1;
  const belowZ = z;
  if (y - 1 >= -64) {
    const belowId = world.getBlock(belowX, belowY, belowZ);
    if (canFlowInto(belowId) && !(belowId === id)) {
      world.setBlock(belowX, belowY, belowZ, id, 8 | 1, { notify: false });
      world.scheduleUpdate(belowX, belowY, belowZ, delayFor(world, fluid));
    } else if (!canFlowInto(belowId) || belowId === id) {
      const level = isSource(meta) ? 0 : meta & 7;
      const nextLevel = isSource(meta) ? 1 : level + 1;
      if (nextLevel <= spread) {
        for (const [dx, dz] of SIDES) {
          const nx = x + dx;
          const nz = z + dz;
          const nId = world.getBlock(nx, y, nz);
          if (!canFlowInto(nId)) continue;
          // Bereits gefüllte Flächen mit gleichem oder besserem Füllstand nicht überschreiben
          if (nId === id && (world.getMeta(nx, y, nz) & 7) <= nextLevel) continue;
          world.setBlock(nx, y, nz, id, nextLevel, { notify: false });
          world.scheduleUpdate(nx, y, nz, delayFor(world, fluid));
        }
      }
    }
  }
  if (fluid !== FLUIDS.water || id === B.water) {
    // Fließende Zellen prüfen sich bei Bedarf erneut
    if (!isSource(meta)) world.scheduleUpdate(x, y, z, delayFor(world, fluid));
  }
}

function wakeNeighbors(world, x, y, z, fluid) {
  for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
    const id = world.getBlock(x + dx, y + dy, z + dz);
    if (id === fluid.id) world.scheduleUpdate(x + dx, y + dy, z + dz, delayFor(world, fluid));
  }
}

/** Fallblock (Sand, Kies): fällt, bis er auf festem Grund liegt. */
export function updateFalling(world, x, y, z) {
  const id = world.getBlock(x, y, z);
  const def = BLOCKS[id];
  if (!def || !def.falls) return;
  let target = y;
  while (target - 1 >= -64 && canFlowInto(world.getBlock(x, target - 1, z))) {
    target--;
  }
  if (target === y) return;
  // Füllflüssigkeit wird verdrängt; danach Block verschieben
  const meta = world.getMeta(x, y, z);
  world.setBlock(x, y, z, B.air, 0, { notify: false });
  world.setBlock(x, target, z, id, meta, { notify: false });
  world.scheduleUpdate(x, y + 1, z, 1);
  world.scheduleUpdate(x, target, z, 1);
}

/** Gemeinsamer Handler für geplante Updates. */
export function handleScheduledUpdate(world, x, y, z) {
  const id = world.getBlock(x, y, z);
  if (fluidOf(id)) updateFluid(world, x, y, z);
  else if (BLOCKS[id]?.falls) updateFalling(world, x, y, z);
}
