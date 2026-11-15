// Startet den Dev-Server (falls nötig), öffnet einen Browser und führt alle End-to-End-Tests aus.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ensureServer, launchBrowser, PROJECT_DIR } from './harness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const files = fs.readdirSync(here).filter((f) => /^phase\d+-.*\.mjs$/.test(f)).sort();
const only = process.argv[2];

const server = await ensureServer();
const browser = await launchBrowser();
let failed = 0;
try {
  for (const file of files) {
    if (only && !file.includes(only)) continue;
    const mod = await import(pathToFileURL(path.join(here, file)).href);
    console.log(`\n▶ ${mod.name} (${file})`);
    try {
      await mod.run({ browser, baseUrl: server.url });
      console.log(`✅ ${mod.name}`);
    } catch (err) {
      failed++;
      console.log(`❌ ${mod.name}: ${err.message}`);
    }
  }
} finally {
  await browser.close();
  server.stop();
}
console.log(`\n${failed === 0 ? 'Alle Tests bestanden.' : `${failed} Test(s) fehlgeschlagen.`} (Projekt: ${PROJECT_DIR})`);
process.exit(failed === 0 ? 0 : 1);
