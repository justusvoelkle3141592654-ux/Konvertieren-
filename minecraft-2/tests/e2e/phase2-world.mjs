// Phase-2-Abnahme: Oberwelt, Chunk-Laden, Tageszeit, Speichern veränderter Chunks, Licht, Animation.
import { assert, collectErrors, createLog, shot } from './harness.mjs';

export const name = 'Phase 2 – Oberwelt, Speichern und Licht';

export async function run({ browser, baseUrl }) {
  const log = createLog();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = collectErrors(page);
  const visible = (screen) => page.locator(`[data-screen="${screen}"]:not(.hidden)`);
  const btn = (scope, label) => page.locator(`${scope} button:visible`, { hasText: label }).first();

  await page.goto(baseUrl, { waitUntil: 'load' });
  await visible('title').waitFor({ timeout: 20000 });
  await btn('[data-screen="title"]', 'Einzelspieler').click();
  await visible('worlds').waitFor();
  await btn('[data-screen="worlds"]', 'Neue Welt').click();
  await page.locator('.dialog-layer input').nth(0).fill('Phase2');
  await page.locator('.dialog-layer input').nth(1).fill('777');
  await page.locator('.dialog-layer button:visible', { hasText: 'Welt erstellen' }).click();
  await visible('hud').waitFor({ timeout: 240000 });
  await page.waitForFunction(() => {
    const s = window.minecraft2.session;
    return s && s.chunkManager.meshQueue.size === 0 && [...s.world.chunks.values()].every((c) => c.meshes);
  }, null, { timeout: 180000 });
  const loaded = await page.evaluate(() => window.minecraft2.session.world.chunks.size);
  assert(loaded >= 100, `geladene Chunks: ${loaded}`);
  log.step(`Oberwelt erzeugt ${loaded} Chunks, alle vermascht`);

  // Spawn liegt auf dem Boden, nicht unter der Oberfläche
  const spawn = await page.evaluate(() => {
    const s = window.minecraft2.session;
    return { y: s.position.y, block: s.world.getBlock(Math.floor(s.position.x), Math.floor(s.position.y) - 2, Math.floor(s.position.z)) };
  });
  assert(spawn.block !== 0, 'unter dem Spieler liegt fester Boden');
  log.step('Spieler startet auf festem Boden');

  // Tageszeit läuft (20 Ticks pro Sekunde)
  const t1 = await page.evaluate(() => window.minecraft2.session.time);
  await page.waitForTimeout(2000);
  const t2 = await page.evaluate(() => window.minecraft2.session.time);
  const ticks = t2 - t1;
  assert(ticks >= 25 && ticks <= 60, `Ticks in 2 s: ${ticks}`);
  log.step(`Spielzeit läuft (${ticks} Ticks in 2 Sekunden)`);

  // Änderung setzen, speichern, Welt neu laden und Änderung prüfen
  const target = await page.evaluate(async () => {
    const { B } = await import('/src/world/blocks.js');
    const s = window.minecraft2.session;
    const x = Math.floor(s.position.x) + 3;
    const z = Math.floor(s.position.z);
    const y = Math.floor(s.position.y) - 1;
    const before = s.world.getBlock(x, y, z);
    s.world.setBlock(x, y, z, B.glowstone, 0);
    return { x, y, z, before, glow: B.glowstone };
  });
  await page.keyboard.press('Escape');
  await visible('pause').waitFor();
  await btn('[data-screen="pause"]', 'Speichern und zum Titelbildschirm').click();
  await visible('title').waitFor({ timeout: 60000 });
  log.step('Blockänderung wird beim Verlassen gespeichert');

  await btn('[data-screen="title"]', 'Einzelspieler').click();
  await page.locator('[data-screen="worlds"] .world-entry', { hasText: 'Phase2' }).click();
  await btn('[data-screen="worlds"]', 'Welt laden').click();
  await visible('hud').waitFor({ timeout: 240000 });
  await page.waitForFunction(({ x, y, z }) => {
    const w = window.minecraft2.session?.world;
    return w && w.getChunk(Math.floor(x / 16), Math.floor(z / 16));
  }, target, { timeout: 120000 });
  const after = await page.evaluate(({ x, y, z }) => {
    const w = window.minecraft2.session.world;
    return { id: w.getBlock(x, y, z), light: w.getLightLevel(x, y, z) };
  }, target);
  assert(after.id === target.glow, `gespeicherter Block: ${after.id} statt ${target.glow}`);
  assert(after.light === 15, `Leuchtstärke des Glowstone: ${after.light}`);
  log.step('Gespeicherte Änderung ist nach dem Neuladen vorhanden (Glowstone leuchtet mit 15)');

  // Licht reicht seitlich: Stufe direkt neben dem Glowstone
  const neighbour = await page.evaluate(({ x, y, z }) => window.minecraft2.session.world.getLightLevel(x + 1, y, z), target);
  assert(neighbour >= 13 && neighbour <= 14, `Licht neben dem Glowstone: ${neighbour}`);
  log.step(`Blocklicht fällt zur Seite ab (Stufe ${neighbour} neben der Lichtquelle)`);

  // Atlas: animierte Texturen (Wasser, Lava, Feuer, Portal)
  const animated = await page.evaluate(() => window.minecraft2.atlas.stats.animated);
  assert(animated >= 4, `animierte Texturen im Atlas: ${animated}`);
  log.step(`Texture-Atlas enthält ${animated} animierte Texturen`);

  await shot(page, 'phase2-world');
  assert(errors.length === 0, `Konsolenfehler:\n${errors.join('\n')}`);
  log.step('Keine unerwarteten Konsolenfehler');
  await context.close();
  return log.lines;
}
