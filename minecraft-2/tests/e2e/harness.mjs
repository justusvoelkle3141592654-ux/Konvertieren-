// Gemeinsamer Rahmen für die End-to-End-Tests (Playwright-Core mit einem vorhandenen Chrome/Chromium).
// Umgebungsvariablen:
//   CHROME_PATH   Pfad zu einem Chrome/Chromium (Pflicht, sofern kein Standardbrowser gefunden wird)
//   E2E_BASE_URL  laufender Dev-Server (sonst startet der Runner selbst einen)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

export const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const OUTPUT_DIR = path.join(PROJECT_DIR, 'tests', 'e2e', 'output');

export async function launchBrowser() {
  const executablePath = process.env.CHROME_PATH || undefined;
  return chromium.launch({
    executablePath,
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
  });
}

/** Startet den Vite-Dev-Server, falls keine URL vorgegeben ist. Gibt { url, stop } zurück. */
export async function ensureServer(port = 5199) {
  if (process.env.E2E_BASE_URL) return { url: process.env.E2E_BASE_URL, stop() {} };
  const vite = path.join(PROJECT_DIR, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(process.execPath, [vite, '--port', String(port), '--strictPort'], { cwd: PROJECT_DIR, stdio: ['ignore', 'pipe', 'pipe'] });
  const url = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return { url, stop: () => child.kill() };
    } catch {
      // noch nicht bereit
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  child.kill();
  throw new Error('Dev-Server konnte nicht gestartet werden.');
}

export function createLog() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const lines = [];
  return {
    lines,
    step(message) {
      lines.push(`  ✓ ${message}`);
      console.log(`  ✓ ${message}`);
    },
    info(message) {
      lines.push(`    ${message}`);
      console.log(`    ${message}`);
    },
  };
}

export function assert(condition, message) {
  if (!condition) throw new Error(`Assertion fehlgeschlagen: ${message}`);
}

/** Sammelt Konsolenfehler; bekannte, erwartete Meldungen (fehlende optionale Assets) werden ausgeblendet. */
export function collectErrors(page) {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (text.includes('Failed to load resource') && text.includes('404')) return; // optionale lokale Assets
    errors.push(text);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

export async function shot(page, name) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(OUTPUT_DIR, `${name}.png`) });
}
