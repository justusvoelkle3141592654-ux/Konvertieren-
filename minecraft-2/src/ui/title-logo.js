// Selbst gezeichneter Pixel-Schriftzug "MINECRAFT 2" aus Steinblöcken.
// Die Glyphen (5×7) sind eigens für dieses Projekt entworfen; es wird kein Originallogo verwendet.
const GLYPHS = {
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Zeichnet den Schriftzug in ein Canvas und liefert es zurück. */
export function createTitleLogo(text = 'MINECRAFT 2', pixel = 8) {
  const glyphW = 5;
  const glyphH = 7;
  const gap = 1;
  const shadow = 2;
  const chars = [...text.toUpperCase()].filter((c) => GLYPHS[c]);
  const cols = chars.reduce((sum, c, i) => sum + glyphW + (i < chars.length - 1 ? gap : 0), 0);
  const width = cols * pixel + shadow * pixel;
  const height = glyphH * pixel + shadow * pixel;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const random = rng(20260917);

  // Schatten unter dem Logo (dunkel, versetzt)
  let cursor = 0;
  const cells = [];
  for (const c of chars) {
    GLYPHS[c].forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch === '#') cells.push([cursor + x, y]);
      });
    });
    cursor += glyphW + gap;
  }
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  for (const [x, y] of cells) ctx.fillRect(x * pixel + shadow * pixel, y * pixel + shadow * pixel, pixel, pixel);

  // Steinblöcke: grauer Grundton mit Rauschen, helle Oberkante, dunkle Unterkante
  for (const [x, y] of cells) {
    const px = x * pixel;
    const py = y * pixel;
    const base = 128 + (random() - 0.5) * 34;
    ctx.fillStyle = `rgb(${base},${base},${base})`;
    ctx.fillRect(px, py, pixel, pixel);
    // Risse und Sprenkel
    for (let i = 0; i < 3; i++) {
      const s = random() > 0.5 ? 26 : -26;
      const sx = px + Math.floor(random() * pixel);
      const sy = py + Math.floor(random() * pixel);
      ctx.fillStyle = `rgba(${base + s},${base + s},${base + s},0.6)`;
      ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(px, py, pixel, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(px, py + pixel - 2, pixel, 2);
  }

  // Gelber Glanz wie bei Minecraft-Logo-Blöcken entfällt bewusst; stattdessen eine dunkle Außenlinie.
  ctx.fillStyle = 'rgba(20,20,20,0.9)';
  for (const [x, y] of cells) {
    const px = x * pixel;
    const py = y * pixel;
    const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => !cells.some(([cx, cy]) => cx === x + dx && cy === y + dy));
    for (const [dx, dy] of neighbours) {
      if (dx === 1) ctx.fillRect(px + pixel - 1, py, 1, pixel);
      if (dx === -1) ctx.fillRect(px, py, 1, pixel);
      if (dy === 1) ctx.fillRect(px, py + pixel - 1, pixel, 1);
      if (dy === -1) ctx.fillRect(px, py, pixel, 1);
    }
  }
  return canvas;
}
