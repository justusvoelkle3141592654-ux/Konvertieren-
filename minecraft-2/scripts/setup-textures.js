#!/usr/bin/env node
/**
 * setup-textures.js
 *
 * Liest Texturen, Animations-Metadaten (.mcmeta) und Sounds aus einer
 * Minecraft-Client-JAR, die du rechtmäßig auf deinem Rechner besitzt, und legt
 * sie unter local-assets/ ab. Die Verzeichnisstruktur bleibt erhalten
 * (local-assets/assets/minecraft/textures/block/stone.png usw.).
 *
 * Eigenschaften:
 *  - Die Original-JAR wird ausschließlich gelesen, nie verändert.
 *  - Vorhandene Dateien werden nicht überschrieben (außer mit --force).
 *  - local-assets/ ist in .gitignore eingetragen und darf nicht committet werden.
 *  - Es werden keine Dateien ins Repository geschrieben.
 *
 * Aufruf:
 *   node scripts/setup-textures.js <pfad/zur/VERSION.jar> [optionen]
 *   node scripts/setup-textures.js ~/.minecraft/versions/VERSION        (Ordner: nimmt VERSION.jar)
 *   node scripts/setup-textures.js "%APPDATA%\.minecraft\versions\VERSION\VERSION.jar"   (Windows)
 *
 * Optionen:
 *   --force        vorhandene Dateien überschreiben
 *   --no-sounds    keine Sounddateien (.ogg) extrahieren
 *   --no-music     Musikdateien (sounds/music/) auslassen
 *   --out=PFAD     Zielordner (Standard: <projekt>/local-assets)
 *   --help         Hilfe anzeigen
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.resolve(SCRIPT_DIR, '..');

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

const TEXTURE_RE = /^assets\/minecraft\/textures\/(block|item|entity|gui|environment|particle|font|effect|colormap|misc|painting|map)\/.+\.(png|png\.mcmeta)$/;
const SOUND_INDEX = 'assets/minecraft/sounds.json';
const SOUND_RE = /^assets\/minecraft\/sounds\/.+\.ogg$/;
const MUSIC_RE = /^assets\/minecraft\/sounds\/music\//;

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function printHelp() {
  console.log(`
Minecraft 2 – Texture-Setup

Aufruf:
  node scripts/setup-textures.js <pfad/zur/VERSION.jar> [optionen]

Optionen:
  --force        vorhandene Dateien überschreiben
  --no-sounds    keine Sounddateien extrahieren
  --no-music     Musikdateien auslassen
  --out=PFAD     Zielordner (Standard: local-assets/)
  --help         diese Hilfe

Hinweis: Die Texturen gehören Mojang/Microsoft. Sie bleiben lokal und werden
nicht ins Repository aufgenommen.
`);
}

/** Liest das Central Directory einer ZIP-Datei (ohne Abhängigkeiten). */
function readCentralDirectory(buf) {
  let eocd = -1;
  const lowest = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= lowest; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) fail('Keine gültige ZIP-Datei (End-of-Central-Directory fehlt).');

  const total = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (cdOffset === 0xffffffff) fail('ZIP64-Archive werden nicht unterstützt.');

  const entries = [];
  let p = cdOffset;
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(p) !== SIG_CENTRAL) fail('Beschädigtes Central Directory in der JAR.');
    const entry = {
      method: buf.readUInt16LE(p + 10),
      compSize: buf.readUInt32LE(p + 20),
      uncompSize: buf.readUInt32LE(p + 24),
      localOffset: buf.readUInt32LE(p + 42),
    };
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    entry.name = buf.toString('utf8', p + 46, p + 46 + nameLen).replace(/\\/g, '/');
    entries.push(entry);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Liefert die entpackten Bytes eines Eintrags. */
function readEntry(buf, entry) {
  const p = entry.localOffset;
  if (buf.readUInt32LE(p) !== SIG_LOCAL) fail(`Beschädigter lokaler Header bei ${entry.name}.`);
  const nameLen = buf.readUInt16LE(p + 26);
  const extraLen = buf.readUInt16LE(p + 28);
  const start = p + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + entry.compSize);
  if (entry.method === 0) return raw;
  if (entry.method === 8) return zlib.inflateRawSync(raw);
  fail(`Nicht unterstützte ZIP-Kompression (${entry.method}) bei ${entry.name}.`);
  return null;
}

function resolveJar(input) {
  if (!input) return null;
  const abs = path.resolve(input);
  if (!fs.existsSync(abs)) fail(`Pfad nicht gefunden: ${abs}`);
  const stat = fs.statSync(abs);
  if (stat.isFile()) return abs;
  if (stat.isDirectory()) {
    const sameName = path.join(abs, `${path.basename(abs)}.jar`);
    if (fs.existsSync(sameName)) return sameName;
    const jars = fs.readdirSync(abs).filter((f) => f.toLowerCase().endsWith('.jar'));
    if (jars.length === 1) return path.join(abs, jars[0]);
    fail('Im Ordner wurde keine eindeutige .jar-Datei gefunden. Bitte den Dateipfad direkt angeben.');
  }
  fail('Der Pfad ist weder Datei noch Ordner.');
  return null;
}

/** Texturen, die das Spiel benötigt (fehlende werden nur gemeldet). */
async function loadRequiredTextures() {
  try {
    const mod = await import(pathToFileURL(path.join(PROJECT_DIR, 'src/assets/texture-names.js')).href);
    return mod.REQUIRED_TEXTURES ?? [];
  } catch (err) {
    console.warn(`(Hinweis) Liste der benötigten Texturen konnte nicht geladen werden: ${err.message}`);
    return [];
  }
}

function parseArgs(argv) {
  const opts = { force: false, sounds: true, music: true, out: path.join(PROJECT_DIR, 'local-assets'), positional: [] };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--force') opts.force = true;
    else if (arg === '--no-sounds') opts.sounds = false;
    else if (arg === '--no-music') opts.music = false;
    else if (arg.startsWith('--out=')) opts.out = path.resolve(arg.slice('--out='.length));
    else if (arg.startsWith('--')) fail(`Unbekannte Option: ${arg}`);
    else opts.positional.push(arg);
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || opts.positional.length === 0) {
    printHelp();
    process.exit(opts.help ? 0 : 1);
  }

  const jarPath = resolveJar(opts.positional[0]);
  const jarBytes = fs.readFileSync(jarPath);
  if (jarBytes.readUInt32LE(0) !== SIG_LOCAL) fail('Die Datei ist keine JAR/ZIP-Datei.');

  console.log(`Lese ${path.basename(jarPath)} (${(jarBytes.length / 1048576).toFixed(1)} MB) …`);
  const entries = readCentralDirectory(jarBytes);
  const entryNames = new Set(entries.map((e) => e.name));
  if (![...entryNames].some((n) => n.startsWith('assets/minecraft/'))) {
    fail('Keine Minecraft-Ressourcen (assets/minecraft/) in dieser JAR gefunden.');
  }

  const wanted = entries.filter((e) => {
    if (TEXTURE_RE.test(e.name)) return true;
    if (opts.sounds && e.name === SOUND_INDEX) return true;
    if (opts.sounds && SOUND_RE.test(e.name)) {
      return opts.music || !MUSIC_RE.test(e.name);
    }
    return false;
  });

  const stats = { written: 0, skipped: 0, bytes: 0, perCategory: {}, sounds: 0, mcmeta: 0 };
  fs.mkdirSync(opts.out, { recursive: true });

  for (const entry of wanted) {
    if (entry.name.includes('..') || path.isAbsolute(entry.name)) continue; // Pfad-Traversal ausschließen
    const outPath = path.join(opts.out, ...entry.name.split('/'));
    if (!outPath.startsWith(opts.out + path.sep)) continue;

    if (fs.existsSync(outPath) && !opts.force) {
      stats.skipped++;
      continue;
    }
    const data = readEntry(jarBytes, entry);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, data);
    stats.written++;
    stats.bytes += data.length;

    const cat = /^assets\/minecraft\/textures\/([^/]+)\//.exec(entry.name)?.[1];
    if (cat) stats.perCategory[cat] = (stats.perCategory[cat] ?? 0) + 1;
    if (entry.name.endsWith('.mcmeta')) stats.mcmeta++;
    if (entry.name.endsWith('.ogg')) stats.sounds++;
  }

  const required = await loadRequiredTextures();
  const missing = required.filter((tex) => !entryNames.has(`assets/minecraft/textures/${tex}.png`));

  const jarSha = crypto.createHash('sha256').update(jarBytes).digest('hex');
  const manifest = {
    createdAt: new Date().toISOString(),
    sourceFile: path.basename(jarPath),
    sourceSha256: jarSha,
    options: { sounds: opts.sounds, music: opts.music },
    written: stats.written,
    skippedExisting: stats.skipped,
    perCategory: stats.perCategory,
    missingRequiredTextures: missing,
  };
  fs.writeFileSync(path.join(opts.out, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log('');
  console.log(`✅ Zielordner: ${opts.out}`);
  console.log(`   neu geschrieben:      ${stats.written} Dateien (${(stats.bytes / 1048576).toFixed(1)} MB)`);
  console.log(`   bereits vorhanden:    ${stats.skipped} (nicht überschrieben, --force zum Ersetzen)`);
  console.log(`   .mcmeta (Animation):  ${stats.mcmeta}`);
  console.log(`   Sounds (.ogg):        ${stats.sounds}`);
  for (const [cat, count] of Object.entries(stats.perCategory).sort()) {
    console.log(`   textures/${cat.padEnd(12)} ${count}`);
  }
  if (missing.length) {
    console.log('');
    console.log(`⚠️  ${missing.length} benötigte Textur(en) fehlen in dieser JAR. Für sie werden Platzhalter verwendet:`);
    for (const tex of missing) console.log(`   - ${tex}`);
  } else if (required.length) {
    console.log(`   alle ${required.length} benötigten Texturen sind vorhanden.`);
  }
  console.log('');
  console.log('Starte danach das Spiel mit: npm run dev');
}

main().catch((err) => fail(err.message));
