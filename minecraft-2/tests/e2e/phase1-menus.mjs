// Phase-1-Abnahme: Menüs, Weltverwaltung, Optionen, Steuerung, Pause, Speichern.
import { assert, collectErrors, createLog, shot } from './harness.mjs';

export const name = 'Phase 1 – Menüs und Weltverwaltung';

export async function run({ browser, baseUrl }) {
  const log = createLog();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = collectErrors(page);

  const visible = (screen) => page.locator(`[data-screen="${screen}"]:not(.hidden)`);
  const btn = (scope, label) => page.locator(`${scope} button:visible`, { hasText: label }).first();

  await page.goto(baseUrl, { waitUntil: 'load' });
  await visible('title').waitFor({ timeout: 20000 });
  log.step('Startmenü wird angezeigt');

  await btn('[data-screen="title"]', 'Einzelspieler').click();
  await visible('worlds').waitFor();
  log.step('Einzelspieler öffnet die Weltauswahl');

  // Neue Welt mit Namen und Seed erstellen
  await btn('[data-screen="worlds"]', 'Neue Welt').click();
  await page.locator('.dialog-layer .dialog').waitFor();
  await page.locator('.dialog-layer input').nth(0).fill('Testwelt A');
  await page.locator('.dialog-layer input').nth(1).fill('42');
  await page.locator('.dialog-layer button:visible', { hasText: 'Welt erstellen' }).click();
  await visible('hud').waitFor({ timeout: 180000 });
  log.step('Neue Welt wird erstellt und geladen (HUD sichtbar)');

  // Pausemenü öffnen, fortsetzen
  await page.keyboard.press('Escape');
  await visible('pause').waitFor();
  log.step('ESC öffnet das Pausemenü');
  await btn('[data-screen="pause"]', 'Zurück zum Spiel').click();
  await visible('hud').waitFor();
  log.step('„Zurück zum Spiel“ setzt das Spiel fort');

  // Speichern über das Pausemenü und zurück zum Titel
  await page.keyboard.press('Escape');
  await visible('pause').waitFor();
  await btn('[data-screen="pause"]', 'Speichern und zum Titelbildschirm').click();
  await visible('title').waitFor({ timeout: 30000 });
  log.step('„Speichern und zum Titelbildschirm“ speichert und kehrt zurück');

  // Welt wieder laden (Persistenz über IndexedDB)
  await btn('[data-screen="title"]', 'Einzelspieler').click();
  await visible('worlds').waitFor();
  const entry = page.locator('[data-screen="worlds"] .world-entry', { hasText: 'Testwelt A' });
  await entry.waitFor();
  log.step('Welt „Testwelt A“ ist in der Weltauswahl gespeichert');
  await entry.click();
  await btn('[data-screen="worlds"]', 'Welt laden').click();
  await visible('hud').waitFor({ timeout: 180000 });
  const chunks = await page.evaluate(() => window.minecraft2.session?.world.chunks.size ?? 0);
  assert(chunks > 50, `geladene Chunks nach dem Laden: ${chunks}`);
  log.step(`Gespeicherte Welt lädt erneut (${chunks} Chunks geladen)`);
  await page.keyboard.press('Escape');
  await visible('pause').waitFor();
  await btn('[data-screen="pause"]', 'Speichern und zum Titelbildschirm').click();
  await visible('title').waitFor({ timeout: 30000 });

  // Umbenennen
  await btn('[data-screen="title"]', 'Einzelspieler').click();
  await visible('worlds').waitFor();
  await page.locator('[data-screen="worlds"] .world-entry', { hasText: 'Testwelt A' }).click();
  await btn('[data-screen="worlds"]', 'Umbenennen').click();
  await page.locator('.dialog-layer input').fill('Umbenannt');
  await page.locator('.dialog-layer button:visible', { hasText: 'Fertig' }).click();
  await page.locator('[data-screen="worlds"] .world-entry', { hasText: 'Umbenannt' }).waitFor();
  log.step('Welt kann umbenannt werden');

  // Spielmodus und Schwierigkeit wechseln
  await page.locator('[data-screen="worlds"] .world-entry', { hasText: 'Umbenannt' }).click();
  await btn('[data-screen="worlds"]', 'Spielmodus').click();
  await page.locator('[data-screen="worlds"] button', { hasText: 'Spielmodus: Kreativ' }).waitFor();
  log.step('Spielmodus lässt sich auf Kreativ umstellen');
  await btn('[data-screen="worlds"]', 'Schwierigkeit').click();
  await page.locator('[data-screen="worlds"] button', { hasText: 'Schwierigkeit: Schwer' }).waitFor();
  log.step('Schwierigkeit lässt sich ändern (Normal → Schwer)');

  // Löschen mit Bestätigung
  await page.locator('[data-screen="worlds"] .world-entry', { hasText: 'Umbenannt' }).click();
  await btn('[data-screen="worlds"]', 'Löschen').click();
  await page.locator('.dialog-layer button:visible', { hasText: 'Endgültig löschen' }).click();
  await page.locator('[data-screen="worlds"]', { hasText: 'Noch keine Welten vorhanden' }).waitFor();
  log.step('Welt kann nach Bestätigung gelöscht werden');
  await shot(page, 'phase1-worlds-empty');

  // Optionen: Sichtweite und Steuerung
  await btn('[data-screen="worlds"]', 'Zurück').click();
  await visible('title').waitFor();
  await btn('[data-screen="title"]', 'Optionen').click();
  await visible('options').waitFor();
  await page.evaluate(() => {
    const range = document.querySelector('[data-screen="options"] input[type=range]');
    range.value = '9';
    range.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const distance = await page.evaluate(() => JSON.parse(localStorage.getItem('minecraft2.settings.v1')).renderDistance);
  assert(distance === 9, `Sichtweite gespeichert: ${distance}`);
  log.step('Optionen: Sichtweite wird gespeichert');

  await btn('[data-screen="options"]', 'Steuerung anpassen').click();
  await visible('controls').waitFor();
  await page.locator('[data-screen="controls"] .row', { hasText: 'Vorwärts' }).locator('button').click();
  await page.keyboard.press('KeyU');
  const forward = await page.evaluate(() => JSON.parse(localStorage.getItem('minecraft2.settings.v1')).keybindings.forward);
  assert(forward === 'KeyU', `Taste für Vorwärts: ${forward}`);
  log.step('Steuerung: Taste für „Vorwärts“ wird neu belegt');
  await btn('[data-screen="controls"]', 'Standard wiederherstellen').click();
  await page.evaluate(() => localStorage.removeItem('minecraft2.settings.v1'));
  await page.reload({ waitUntil: 'load' });
  await visible('title').waitFor();
  log.step('Einstellungen bleiben nach dem Neuladen erhalten (localStorage)');

  await shot(page, 'phase1-title');
  assert(errors.length === 0, `Konsolenfehler:\n${errors.join('\n')}`);
  log.step('Keine unerwarteten Konsolenfehler');
  await context.close();
  return log.lines;
}
