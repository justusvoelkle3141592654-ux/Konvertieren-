/* Universal File Converter – Konverter-Engine & Format-Registry.
   Alles läuft offline im Browser/WebView, keine Server-Aufrufe. */
"use strict";

/* pdf.js: Worker läuft als normales Skript auf dem Hauptthread ("fake worker").
   Nötig, weil echte Web Worker aus file:///android_asset heraus blockiert sind. */
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "lib/pdf.worker.min.js";
}

/* ======================= Format-Registry ======================= */

const ALIAS = {
  jpeg: "jpg", tif: "tiff", yml: "yaml", htm: "html", xhtml: "html",
  markdown: "md", oga: "ogg", m4v: "mp4", ndjson: "jsonl",
  bash: "sh", zsh: "sh", cc: "cpp", cxx: "cpp", hpp: "h",
};

const IMG_DECODE = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "svg", "ico", "avif", "tiff", "tif"];
const IMG_TARGETS = ["png", "jpg", "webp", "bmp", "gif", "tiff", "ico", "pdf"];

const DATA_EXTS = ["csv", "tsv", "xlsx", "xls", "xlsb", "xlsm", "ods", "fods", "dif", "slk", "prn", "dbf"];
const DATA_TARGETS = ["xlsx", "xls", "ods", "csv", "tsv", "json", "html", "dif", "slk", "prn", "dbf", "rtf", "txt", "pdf"];

const AUDIO_EXTS = ["mp3", "wav", "ogg", "oga", "flac", "m4a", "aac", "opus", "weba"];
const VIDEO_EXTS = ["mp4", "m4v", "webm", "mov", "mkv"];

const DOC_EXTS = ["pdf", "docx", "pptx", "odt", "odp", "epub", "rtf"];

const STRUCTURED_TEXT = ["json", "jsonl", "ndjson", "yaml", "yml", "xml", "toml",
  "md", "markdown", "html", "htm", "xhtml", "srt", "vtt", "ipynb"];

/* Quellcode- und Klartext-Formate: werden als Text behandelt */
const CODE_EXTS = [
  "txt", "log", "ini", "cfg", "conf", "properties", "env", "tex", "bib", "rst", "adoc",
  "css", "scss", "sass", "less", "styl",
  "js", "mjs", "cjs", "jsx", "ts", "tsx", "vue", "svelte",
  "py", "java", "c", "h", "cpp", "cc", "cxx", "hpp", "cs", "go", "rs", "swift",
  "kt", "kts", "php", "rb", "pl", "pm", "lua", "r", "jl", "scala", "groovy", "dart",
  "sql", "sh", "bash", "zsh", "fish", "bat", "cmd", "ps1", "psm1", "vbs",
  "asm", "s", "hs", "ml", "erl", "ex", "exs", "clj", "cljs", "edn",
  "nim", "zig", "vala", "tcl", "awk", "diff", "patch", "proto", "graphql", "gql",
  "gradle", "cmake", "mk", "makefile", "dockerfile", "gitignore", "editorconfig",
  "htaccess", "csproj", "sln", "pom", "srt", "vtt",
];

const GENERIC_TEXT_TARGETS = ["txt", "pdf", "html", "docx", "epub", "md"];

const MIME = {
  png: "image/png", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif",
  bmp: "image/bmp", tiff: "image/tiff", ico: "image/x-icon", svg: "image/svg+xml",
  pdf: "application/pdf", txt: "text/plain", html: "text/html", md: "text/markdown",
  csv: "text/csv", tsv: "text/tab-separated-values", json: "application/json",
  yaml: "application/yaml", xml: "application/xml",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel", ods: "application/vnd.oasis.opendocument.spreadsheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  epub: "application/epub+zip", rtf: "application/rtf",
  mp3: "audio/mpeg", wav: "audio/wav", zip: "application/zip",
  py: "text/x-python", vtt: "text/vtt",
};

function extOf(name) {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() : parts[0];
}

function canonical(ext) {
  return ALIAS[ext] || ext;
}

function categoryOf(rawExt) {
  const ext = canonical(rawExt);
  if (IMG_DECODE.includes(rawExt) || IMG_DECODE.includes(ext)) return "image";
  if (AUDIO_EXTS.includes(rawExt) || AUDIO_EXTS.includes(ext)) return "audio";
  if (VIDEO_EXTS.includes(rawExt) || VIDEO_EXTS.includes(ext)) return "video";
  if (DATA_EXTS.includes(ext)) return "data";
  if (DOC_EXTS.includes(ext)) return "document";
  if (STRUCTURED_TEXT.includes(rawExt) || STRUCTURED_TEXT.includes(ext)) return "structured";
  if (CODE_EXTS.includes(ext)) return "text";
  return null;
}

function without(list, ext) {
  return list.filter(t => t !== ext);
}

function targetsFor(rawExt) {
  const ext = canonical(rawExt);

  // Dokumente
  if (ext === "pdf") return ["pptx", "jpg", "png", "txt", "html"];
  if (ext === "docx") return ["pdf", "txt", "html", "epub"];
  if (ext === "pptx") return ["pdf", "txt"];
  if (ext === "odt") return ["pdf", "txt", "html", "docx", "epub"];
  if (ext === "odp") return ["pdf", "txt"];
  if (ext === "epub") return ["txt", "pdf", "html"];
  if (ext === "rtf") return ["txt", "pdf", "html", "docx", "epub"];

  // Strukturierter Text
  if (ext === "md") return ["html", "pdf", "docx", "epub", "txt"];
  if (ext === "html") return ["md", "txt", "pdf", "docx", "epub"];
  if (ext === "json") return ["yaml", "xml", "csv", "xlsx", "ods", "txt", "pdf", "html"];
  if (ext === "jsonl") return ["json", "csv", "xlsx", "txt", "pdf"];
  if (ext === "yaml") return ["json", "txt", "pdf", "html"];
  if (ext === "xml") return ["json", "txt", "pdf", "html"];
  if (ext === "toml") return ["txt", "pdf", "html", "docx", "epub"];
  if (ext === "srt") return ["vtt", "txt", "pdf", "docx", "html"];
  if (ext === "vtt") return ["srt", "txt", "pdf", "docx", "html"];
  if (ext === "ipynb") return ["py", "md", "html", "txt", "pdf"];

  // Medien & Daten
  if (categoryOf(ext) === "image") return without(IMG_TARGETS, ext);
  if (categoryOf(ext) === "audio") return without(["mp3", "wav"], ext);
  if (categoryOf(ext) === "video") return ["png", "jpg", "mp3", "wav"];
  if (categoryOf(ext) === "data") return without(DATA_TARGETS, ext);

  // Quellcode & Klartext
  if (categoryOf(ext) === "text") return without(GENERIC_TEXT_TARGETS, ext);

  return [];
}

/** Alle bekannten Dateiendungen (inkl. Aliasse) für die Suche/Statistik. */
function allExtensions() {
  const set = new Set([
    ...IMG_DECODE, ...DATA_EXTS, ...AUDIO_EXTS, ...VIDEO_EXTS,
    ...DOC_EXTS, ...STRUCTURED_TEXT, ...CODE_EXTS,
  ]);
  return Array.from(set).sort();
}

/* ======================= Hilfsfunktionen ======================= */

class UserError extends Error {}

function fail(message) { throw new UserError(message); }

function escXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

async function readText(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  for (let i = 0; i < Math.min(buf.length, 8192); i++) {
    if (buf[i] === 0) fail("Diese Datei ist keine Textdatei (Binärdaten gefunden).");
  }
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  const bad = (utf8.slice(0, 20000).match(/�/g) || []).length;
  if (bad > 20) return new TextDecoder("windows-1252").decode(buf);
  return utf8;
}

/* ======================= Text-Ausgaben ======================= */

async function textToPdfBlob(text, mono) {
  const pdf = new jspdf.jsPDF({ unit: "mm", format: "a4" });
  pdf.setFont(mono ? "courier" : "helvetica");
  pdf.setFontSize(mono ? 9 : 11);
  const lines = pdf.splitTextToSize(text, 180);
  let y = 15;
  const step = mono ? 4.5 : 5.5;
  for (const line of lines) {
    if (y > 282) { pdf.addPage(); y = 15; }
    pdf.text(line, 15, y);
    y += step;
  }
  return pdf.output("blob");
}

function htmlDocument(title, bodyHtml) {
  return "<!DOCTYPE html>\n<html><head><meta charset=\"utf-8\">" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
    "<title>" + escXml(title) + "</title>" +
    "<style>body{font-family:system-ui,sans-serif;max-width:800px;margin:2em auto;" +
    "padding:0 1em;line-height:1.6}pre{background:#f4f4f8;padding:1em;overflow-x:auto;" +
    "border-radius:6px}table{border-collapse:collapse}td,th{border:1px solid #999;" +
    "padding:4px 8px}</style></head><body>\n" + bodyHtml + "\n</body></html>";
}

function textToHtmlBlob(title, text, asCode) {
  const body = asCode
    ? "<pre>" + escXml(text) + "</pre>"
    : text.split(/\n{2,}/).map(p => "<p>" + escXml(p).replace(/\n/g, "<br>") + "</p>").join("\n");
  return new Blob([htmlDocument(title, body)], { type: "text/html" });
}

/** Minimales, gültiges DOCX (OOXML) aus Klartext erzeugen. */
async function textToDocxBlob(text) {
  const paragraphs = text.split("\n").map(line =>
    '<w:p><w:r><w:t xml:space="preserve">' + escXml(line) + "</w:t></w:r></w:p>"
  ).join("");
  const documentXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    "<w:body>" + paragraphs + "<w:sectPr/></w:body></w:document>";
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    "</Types>";
  const rels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    "</Relationships>";
  const zip = new JSZip();
  zip.file("[Content_Types].xml", contentTypes);
  zip.file("_rels/.rels", rels);
  zip.file("word/document.xml", documentXml);
  return zip.generateAsync({ type: "blob", mimeType: MIME.docx });
}

/** Minimales, gültiges EPUB 3 aus Klartext erzeugen. */
async function textToEpubBlob(title, text) {
  const bodyXhtml = text.split(/\n{2,}/).map(p =>
    "<p>" + escXml(p).replace(/\n/g, "<br/>") + "</p>").join("\n");
  const chapter =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>' + escXml(title) +
    "</title></head><body>" + bodyXhtml + "</body></html>";
  const nav =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">' +
    '<head><title>Inhalt</title></head><body><nav epub:type="toc">' +
    '<ol><li><a href="chapter1.xhtml">' + escXml(title) + "</a></li></ol></nav></body></html>";
  const opf =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">' +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:identifier id="uid">urn:uuid:' + crypto.randomUUID() + "</dc:identifier>" +
    "<dc:title>" + escXml(title) + "</dc:title><dc:language>de</dc:language>" +
    '<meta property="dcterms:modified">' + new Date().toISOString().replace(/\.\d+Z/, "Z") + "</meta>" +
    "</metadata><manifest>" +
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' +
    '<item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>' +
    '</manifest><spine><itemref idref="ch1"/></spine></package>';
  const container =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
    '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>' +
    "</rootfiles></container>";
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", container);
  zip.file("OEBPS/content.opf", opf);
  zip.file("OEBPS/nav.xhtml", nav);
  zip.file("OEBPS/chapter1.xhtml", chapter);
  return zip.generateAsync({ type: "blob", mimeType: MIME.epub });
}

/** Verteilt Klartext auf ein generisches Zielformat. */
async function textToTarget(text, dst, base, asCode) {
  if (dst === "txt" || dst === "md" || dst === "py") {
    return new Blob([text], { type: MIME[dst] || "text/plain" });
  }
  if (dst === "pdf") return textToPdfBlob(text, asCode);
  if (dst === "html") return textToHtmlBlob(base, text, asCode !== false);
  if (dst === "docx") return textToDocxBlob(text);
  if (dst === "epub") return textToEpubBlob(base, text);
  fail(`Umwandlung nach .${dst} wird nicht unterstützt.`);
}

/* ======================= Strukturierter Text ======================= */

function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style").forEach(n => n.remove());
  return (doc.body ? doc.body.innerText || doc.body.textContent : "").trim();
}

function parseJsonLoose(text) {
  try { return JSON.parse(text); }
  catch { fail("Die JSON-Datei konnte nicht gelesen werden. Ist sie gültig?"); }
}

function jsonToXml(value, tag) {
  tag = tag || "root";
  if (Array.isArray(value)) {
    return value.map(v => jsonToXml(v, "eintrag")).join("");
  }
  if (value !== null && typeof value === "object") {
    const inner = Object.entries(value).map(([k, v]) =>
      jsonToXml(v, k.replace(/[^\w.-]/g, "_"))).join("");
    return `<${tag}>${inner}</${tag}>`;
  }
  return `<${tag}>${escXml(String(value))}</${tag}>`;
}

function xmlToJson(node) {
  const children = Array.from(node.children || []);
  if (!children.length) return node.textContent;
  const obj = {};
  for (const c of children) {
    const val = xmlToJson(c);
    if (obj[c.tagName] === undefined) obj[c.tagName] = val;
    else {
      if (!Array.isArray(obj[c.tagName])) obj[c.tagName] = [obj[c.tagName]];
      obj[c.tagName].push(val);
    }
  }
  return obj;
}

function srtToVtt(text) {
  const body = text.replace(/\r/g, "")
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  return "WEBVTT\n\n" + body.trim() + "\n";
}

function vttToSrt(text) {
  let body = text.replace(/\r/g, "").replace(/^WEBVTT[^\n]*\n+/, "");
  body = body.split(/\n{2,}/).filter(b => /-->/.test(b)).map((block, i) => {
    const lines = block.split("\n").filter(l => !/^NOTE/.test(l));
    const tIdx = lines.findIndex(l => /-->/.test(l));
    const time = lines[tIdx]
      .replace(/(\d{2}:\d{2}:\d{2})\.(\d{3})/g, "$1,$2")
      .replace(/(^|\s)(\d{2}):(\d{2})\.(\d{3})/g, "$100:$2:$3,$4")
      .split(" ").slice(0, 3).join(" ");
    return (i + 1) + "\n" + time + "\n" + lines.slice(tIdx + 1).join("\n");
  }).join("\n\n");
  if (!body) fail("In der Untertitel-Datei wurden keine Einträge gefunden.");
  return body + "\n";
}

function subtitlesToText(text) {
  return text.replace(/\r/g, "").replace(/^WEBVTT[^\n]*\n+/, "")
    .split(/\n{2,}/)
    .map(b => b.split("\n").filter(l => !/-->/.test(l) && !/^\d+$/.test(l) && !/^NOTE/.test(l)).join(" "))
    .filter(Boolean).join("\n");
}

function rtfToText(rtf) {
  let t = rtf
    .replace(/\{\\\*[^{}]*\}/g, "")
    .replace(/\\'([0-9a-fA-F]{2})/g, (_, h) => {
      try { return new TextDecoder("windows-1252").decode(new Uint8Array([parseInt(h, 16)])); }
      catch { return ""; }
    })
    .replace(/\\par[d]?\b/g, "\n")
    .replace(/\\line\b/g, "\n")
    .replace(/\\tab\b/g, "\t")
    .replace(/\\[a-zA-Z]+-?\d*\s?/g, "")
    .replace(/[{}]/g, "")
    .replace(/\n{3,}/g, "\n\n");
  t = t.trim();
  if (!t) fail("Aus der RTF-Datei konnte kein Text gelesen werden.");
  return t;
}

function ipynbCells(text) {
  let nb;
  try { nb = JSON.parse(text); } catch { fail("Das Notebook ist kein gültiges JSON."); }
  const cells = (nb.cells || []).map(c => ({
    type: c.cell_type,
    src: Array.isArray(c.source) ? c.source.join("") : String(c.source || ""),
  }));
  if (!cells.length) fail("Das Notebook enthält keine Zellen.");
  return cells;
}

async function structuredConvert(file, src, dst, base) {
  const text = await readText(file);

  if (src === "md") {
    if (dst === "html") {
      return new Blob([htmlDocument(base, marked.parse(text))], { type: "text/html" });
    }
    const plain = htmlToText(marked.parse(text));
    if (dst === "txt") return new Blob([plain], { type: "text/plain" });
    return textToTarget(plain, dst, base, false);
  }

  if (src === "html") {
    if (dst === "md") {
      try {
        const md = new TurndownService({ headingStyle: "atx" }).turndown(text);
        return new Blob([md], { type: MIME.md });
      } catch { fail("Das HTML konnte nicht in Markdown umgewandelt werden."); }
    }
    const plain = htmlToText(text);
    if (!plain) fail("Im HTML wurde kein Text gefunden.");
    return textToTarget(plain, dst, base, false);
  }

  if (src === "json") {
    const value = parseJsonLoose(text);
    if (dst === "yaml") return new Blob([jsyaml.dump(value)], { type: MIME.yaml });
    if (dst === "xml") {
      return new Blob(['<?xml version="1.0" encoding="UTF-8"?>' + jsonToXml(value)], { type: MIME.xml });
    }
    if (["csv", "xlsx", "ods"].includes(dst)) {
      const rows = Array.isArray(value) ? value : [value];
      const sheet = XLSX.utils.json_to_sheet(rows.map(r =>
        (r !== null && typeof r === "object" && !Array.isArray(r)) ? r : { Wert: JSON.stringify(r) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, "Daten");
      return workbookTo(wb, dst);
    }
    return textToTarget(JSON.stringify(value, null, 2), dst, base, true);
  }

  if (src === "jsonl") {
    const rows = text.split("\n").filter(l => l.trim()).map(l => {
      try { return JSON.parse(l); } catch { fail("Eine Zeile ist kein gültiges JSON."); }
    });
    if (dst === "json") {
      return new Blob([JSON.stringify(rows, null, 2)], { type: MIME.json });
    }
    if (["csv", "xlsx"].includes(dst)) {
      const sheet = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, "Daten");
      return workbookTo(wb, dst);
    }
    return textToTarget(JSON.stringify(rows, null, 2), dst, base, true);
  }

  if (src === "yaml") {
    let value;
    try { value = jsyaml.load(text); }
    catch { fail("Die YAML-Datei konnte nicht gelesen werden. Ist sie gültig?"); }
    if (dst === "json") {
      return new Blob([JSON.stringify(value, null, 2)], { type: MIME.json });
    }
    return textToTarget(text, dst, base, true);
  }

  if (src === "xml") {
    if (dst === "json") {
      const doc = new DOMParser().parseFromString(text, "application/xml");
      if (doc.querySelector("parsererror")) fail("Die XML-Datei ist nicht wohlgeformt.");
      const obj = { [doc.documentElement.tagName]: xmlToJson(doc.documentElement) };
      return new Blob([JSON.stringify(obj, null, 2)], { type: MIME.json });
    }
    return textToTarget(text, dst, base, true);
  }

  if (src === "srt" || src === "vtt") {
    if (dst === "vtt") return new Blob([srtToVtt(text)], { type: MIME.vtt });
    if (dst === "srt") return new Blob([vttToSrt(text)], { type: "text/plain" });
    return textToTarget(subtitlesToText(text), dst, base, false);
  }

  if (src === "ipynb") {
    const cells = ipynbCells(text);
    if (dst === "py") {
      const py = cells.map(c => c.type === "code"
        ? "# %%\n" + c.src
        : "# %% [markdown]\n" + c.src.split("\n").map(l => "# " + l).join("\n")
      ).join("\n\n");
      return new Blob([py], { type: MIME.py });
    }
    if (dst === "md") {
      const md = cells.map(c => c.type === "code"
        ? "```python\n" + c.src + "\n```" : c.src).join("\n\n");
      return new Blob([md], { type: MIME.md });
    }
    const plain = cells.map(c => c.src).join("\n\n");
    return textToTarget(plain, dst, base, true);
  }

  if (src === "toml") return textToTarget(text, dst, base, true);

  fail(`Umwandlung .${src} → .${dst} wird nicht unterstützt.`);
}

/* ======================= Daten (SheetJS) ======================= */

const STRING_READ = ["csv", "tsv", "dif", "slk", "prn"];
const BOOKTYPE = { xlsx: "xlsx", xls: "biff8", ods: "ods", csv: "csv", dif: "dif",
                   slk: "sylk", prn: "prn", dbf: "dbf", html: "html", rtf: "rtf", txt: "txt" };

async function readWorkbook(file, src) {
  try {
    if (STRING_READ.includes(src)) {
      return XLSX.read(await readText(file), { type: "string", raw: false });
    }
    return XLSX.read(await file.arrayBuffer(), { type: "array", raw: false });
  } catch {
    fail(`Die .${src}-Datei konnte nicht gelesen werden. Ist sie beschädigt?`);
  }
}

async function workbookTo(wb, dst) {
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) fail("Die Datei enthält keine lesbaren Daten.");
  try {
    if (dst === "tsv") {
      return new Blob(["﻿" + XLSX.utils.sheet_to_csv(sheet, { FS: "\t" })], { type: MIME.tsv });
    }
    if (dst === "json") {
      return new Blob([JSON.stringify(XLSX.utils.sheet_to_json(sheet), null, 2)], { type: MIME.json });
    }
    if (dst === "csv") {
      return new Blob(["﻿" + XLSX.utils.sheet_to_csv(sheet)], { type: MIME.csv });
    }
    const bookType = BOOKTYPE[dst];
    if (!bookType) fail(`Unbekanntes Datenformat: .${dst}`);
    const out = XLSX.write(wb, { bookType, type: "array" });
    return new Blob([out], { type: MIME[dst] || "application/octet-stream" });
  } catch (e) {
    if (e instanceof UserError) throw e;
    fail(`Die Tabelle konnte nicht als .${dst} gespeichert werden` +
         (dst === "dbf" ? " (dBase unterstützt nicht jede Spaltenart)." : "."));
  }
}

async function dataConvert(file, src, dst, base) {
  const wb = await readWorkbook(file, src);
  if (dst === "txt" || dst === "pdf") {
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) fail("Die Datei enthält keine lesbaren Daten.");
    const text = XLSX.utils.sheet_to_csv(sheet, { FS: "\t" });
    return textToTarget(text, dst, base, true);
  }
  return workbookTo(wb, dst);
}

/* ======================= Bilder ======================= */

function loadImageElement(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("unlesbar")); };
    img.src = url;
  });
}

async function decodeToCanvas(file, srcExt) {
  const canvas = document.createElement("canvas");
  const ctx2 = () => canvas.getContext("2d");

  if (srcExt === "tiff") {
    let pages;
    try {
      const buf = await file.arrayBuffer();
      pages = UTIF.decode(buf);
      UTIF.decodeImage(buf, pages[0]);
      const rgba = UTIF.toRGBA8(pages[0]);
      canvas.width = pages[0].width; canvas.height = pages[0].height;
      ctx2().putImageData(new ImageData(new Uint8ClampedArray(rgba), pages[0].width, pages[0].height), 0, 0);
      return canvas;
    } catch {
      fail("Die TIFF-Datei konnte nicht gelesen werden. Ist sie beschädigt?");
    }
  }

  if (srcExt === "svg") {
    try {
      const svgText = await readText(file);
      const img = await loadImageElement(new Blob([svgText], { type: "image/svg+xml" }));
      const w = img.naturalWidth || 1024;
      const h = img.naturalHeight || Math.round(w * 0.75);
      canvas.width = w; canvas.height = h;
      ctx2().drawImage(img, 0, 0, w, h);
      return canvas;
    } catch {
      fail("Die SVG-Grafik konnte nicht gerendert werden. Ist sie gültig?");
    }
  }

  try {
    const bmp = await createImageBitmap(file);
    canvas.width = bmp.width; canvas.height = bmp.height;
    ctx2().drawImage(bmp, 0, 0);
    return canvas;
  } catch { /* Fallback unten */ }
  try {
    const img = await loadImageElement(file);
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    ctx2().drawImage(img, 0, 0);
    return canvas;
  } catch {
    fail("Die Datei konnte nicht als Bild gelesen werden. Ist sie beschädigt?");
  }
}

function whiteBackground(canvas) {
  const out = document.createElement("canvas");
  out.width = canvas.width; out.height = canvas.height;
  const c = out.getContext("2d");
  c.fillStyle = "#fff";
  c.fillRect(0, 0, out.width, out.height);
  c.drawImage(canvas, 0, 0);
  return out;
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise(res => canvas.toBlob(res, mime, quality));
}

/** 24-Bit-BMP (BITMAPINFOHEADER, bottom-up) aus Canvas-Pixeln. */
function canvasToBmpBlob(canvas) {
  const { width: w, height: h } = canvas;
  const data = canvas.getContext("2d").getImageData(0, 0, w, h).data;
  const rowSize = Math.ceil(w * 3 / 4) * 4;
  const dataSize = rowSize * h;
  const buf = new ArrayBuffer(54 + dataSize);
  const v = new DataView(buf);
  v.setUint8(0, 0x42); v.setUint8(1, 0x4D);
  v.setUint32(2, 54 + dataSize, true);
  v.setUint32(10, 54, true);
  v.setUint32(14, 40, true);
  v.setInt32(18, w, true); v.setInt32(22, h, true);
  v.setUint16(26, 1, true); v.setUint16(28, 24, true);
  v.setUint32(34, dataSize, true);
  v.setInt32(38, 2835, true); v.setInt32(42, 2835, true);
  const px = new Uint8Array(buf, 54);
  for (let y = 0; y < h; y++) {
    const srcRow = (h - 1 - y) * w * 4;
    let o = y * rowSize;
    for (let x = 0; x < w; x++) {
      const i = srcRow + x * 4;
      const a = data[i + 3] / 255;
      // Transparenz auf Weiß legen (BMP kennt kein Alpha)
      px[o++] = Math.round(data[i + 2] * a + 255 * (1 - a));
      px[o++] = Math.round(data[i + 1] * a + 255 * (1 - a));
      px[o++] = Math.round(data[i] * a + 255 * (1 - a));
    }
  }
  return new Blob([buf], { type: MIME.bmp });
}

/** ICO-Container mit eingebettetem PNG (max. 256 px Kantenlänge). */
async function canvasToIcoBlob(canvas) {
  let { width: w, height: h } = canvas;
  let src = canvas;
  if (w > 256 || h > 256) {
    const scale = 256 / Math.max(w, h);
    const small = document.createElement("canvas");
    small.width = Math.max(1, Math.round(w * scale));
    small.height = Math.max(1, Math.round(h * scale));
    small.getContext("2d").drawImage(canvas, 0, 0, small.width, small.height);
    src = small; w = small.width; h = small.height;
  }
  const png = new Uint8Array(await (await canvasToBlob(src, "image/png")).arrayBuffer());
  const buf = new ArrayBuffer(22 + png.length);
  const v = new DataView(buf);
  v.setUint16(0, 0, true); v.setUint16(2, 1, true); v.setUint16(4, 1, true);
  v.setUint8(6, w === 256 ? 0 : w); v.setUint8(7, h === 256 ? 0 : h);
  v.setUint16(10, 1, true); v.setUint16(12, 32, true);
  v.setUint32(14, png.length, true); v.setUint32(18, 22, true);
  new Uint8Array(buf, 22).set(png);
  return new Blob([buf], { type: MIME.ico });
}

function canvasToGifBlob(canvas) {
  const { width: w, height: h } = canvas;
  const rgba = whiteBackground(canvas).getContext("2d").getImageData(0, 0, w, h).data;
  const palette = quantize(rgba, 256);
  const indexed = applyPalette(rgba, palette);
  const gif = GIFEncoder();
  gif.writeFrame(indexed, w, h, { palette });
  gif.finish();
  return new Blob([gif.bytes()], { type: MIME.gif });
}

function canvasToTiffBlob(canvas) {
  const { width: w, height: h } = canvas;
  const rgba = canvas.getContext("2d").getImageData(0, 0, w, h).data;
  const tiff = UTIF.encodeImage(rgba.buffer, w, h);
  return new Blob([tiff], { type: MIME.tiff });
}

async function canvasToPdfBlob(canvas) {
  const flat = whiteBackground(canvas);
  const dataUrl = flat.toDataURL("image/jpeg", 0.92);
  const landscape = flat.width > flat.height;
  const pdf = new jspdf.jsPDF({ orientation: landscape ? "l" : "p", unit: "mm", format: "a4" });
  const pw = pdf.internal.pageSize.getWidth() - 20;
  const ph = pdf.internal.pageSize.getHeight() - 20;
  const scale = Math.min(pw / flat.width, ph / flat.height);
  const w = flat.width * scale, h = flat.height * scale;
  pdf.addImage(dataUrl, "JPEG", (pw + 20 - w) / 2, (ph + 20 - h) / 2, w, h);
  return pdf.output("blob");
}

async function imageConvert(file, src, dst) {
  const canvas = await decodeToCanvas(file, src);
  if (dst === "pdf") return canvasToPdfBlob(canvas);
  if (dst === "bmp") return canvasToBmpBlob(whiteBackground(canvas));
  if (dst === "ico") return canvasToIcoBlob(canvas);
  if (dst === "gif") return canvasToGifBlob(canvas);
  if (dst === "tiff") return canvasToTiffBlob(canvas);
  const source = dst === "jpg" ? whiteBackground(canvas) : canvas;
  const blob = await canvasToBlob(source, MIME[dst], dst === "png" ? undefined : 0.92);
  if (!blob) fail(`Das Gerät unterstützt die Ausgabe als .${dst} nicht.`);
  return blob;
}

/* ======================= Audio & Video ======================= */

async function decodeAudio(file) {
  const ctx = new OfflineAudioContext(1, 1, 44100);
  try {
    return await ctx.decodeAudioData(await file.arrayBuffer());
  } catch {
    fail("Die Tonspur konnte nicht dekodiert werden. Das Format wird von " +
         "diesem Gerät nicht unterstützt oder die Datei ist beschädigt.");
  }
}

function audioBufferToWavBlob(ab) {
  const ch = Math.min(2, ab.numberOfChannels);
  const len = ab.length, rate = ab.sampleRate;
  const dataSize = len * ch * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const wr = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  wr(0, "RIFF"); v.setUint32(4, 36 + dataSize, true); wr(8, "WAVE");
  wr(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, ch, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * ch * 2, true); v.setUint16(32, ch * 2, true);
  v.setUint16(34, 16, true); wr(36, "data"); v.setUint32(40, dataSize, true);
  const chans = [];
  for (let c = 0; c < ch; c++) chans.push(ab.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      o += 2;
    }
  }
  return new Blob([buf], { type: MIME.wav });
}

function audioBufferToMp3Blob(ab) {
  const ch = Math.min(2, ab.numberOfChannels);
  const rate = ab.sampleRate, len = ab.length;
  const enc = new lamejs.Mp3Encoder(ch, rate, 128);
  const toInt16 = f32 => {
    const out = new Int16Array(f32.length);
    for (let i = 0; i < f32.length; i++) {
      const s = Math.max(-1, Math.min(1, f32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return out;
  };
  const left = toInt16(ab.getChannelData(0));
  const right = ch === 2 ? toInt16(ab.getChannelData(1)) : null;
  const chunks = [];
  const BLOCK = 1152;
  for (let i = 0; i < len; i += BLOCK) {
    const l = left.subarray(i, i + BLOCK);
    const r = right ? right.subarray(i, i + BLOCK) : undefined;
    const out = ch === 2 ? enc.encodeBuffer(l, r) : enc.encodeBuffer(l);
    if (out.length) chunks.push(new Uint8Array(out));
  }
  const end = enc.flush();
  if (end.length) chunks.push(new Uint8Array(end));
  return new Blob(chunks, { type: MIME.mp3 });
}

async function audioConvert(file, dst) {
  const ab = await decodeAudio(file);
  if (dst === "wav") return audioBufferToWavBlob(ab);
  if (dst === "mp3") return audioBufferToMp3Blob(ab);
  fail(`Unbekanntes Audio-Zielformat: .${dst}`);
}

function videoFrameCanvas(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let done = false;
    const finish = (err, canvas) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      if (err) reject(err); else resolve(canvas);
    };
    const timer = setTimeout(() => finish(new Error(
      "Das Video konnte nicht gelesen werden (Zeitüberschreitung). " +
      "Möglicherweise wird der Codec nicht unterstützt.")), 30000);
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.onerror = () => { clearTimeout(timer); finish(new Error(
      "Das Video konnte nicht gelesen werden. Der Codec wird von diesem " +
      "Gerät nicht unterstützt oder die Datei ist beschädigt.")); };
    video.onloadeddata = () => {
      const t = Number.isFinite(video.duration) ? Math.min(1, video.duration / 2) : 0;
      if (Math.abs(video.currentTime - t) < 0.01) video.onseeked();
      else video.currentTime = t;
    };
    video.onseeked = () => {
      clearTimeout(timer);
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      if (!canvas.width) { finish(new Error("Das Video enthält keine Bildspur.")); return; }
      canvas.getContext("2d").drawImage(video, 0, 0);
      finish(null, canvas);
    };
    video.src = url;
  });
}

async function videoConvert(file, dst) {
  if (dst === "mp3" || dst === "wav") return audioConvert(file, dst);
  const canvas = await videoFrameCanvas(file);
  const blob = await canvasToBlob(canvas, MIME[dst], dst === "png" ? undefined : 0.92);
  if (!blob) fail(`Das Standbild konnte nicht als .${dst} gespeichert werden.`);
  return blob;
}

/* ======================= Dokumente ======================= */

async function openPdf(file) {
  if (!window.pdfjsLib) fail("Die PDF-Engine konnte nicht geladen werden.");
  try {
    const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    if (doc.numPages < 1) throw new Error("leer");
    return doc;
  } catch (e) {
    if (e && e.name === "PasswordException") {
      fail("Dieses PDF ist passwortgeschützt und kann nicht umgewandelt werden.");
    }
    fail("Das PDF konnte nicht gelesen werden. Ist die Datei beschädigt?");
  }
}

async function renderPdfPage(doc, pageNum, maxWidth) {
  const page = await doc.getPage(pageNum);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(2.5, Math.max(1, maxWidth / base.width));
  const vp = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(vp.width);
  canvas.height = Math.round(vp.height);
  await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
  return canvas;
}

async function pdfToPptx(file) {
  const doc = await openPdf(file);
  if (doc.numPages > 200) fail(`Das PDF hat ${doc.numPages} Seiten – bitte maximal 200.`);
  const first = await doc.getPage(1);
  const vp1 = first.getViewport({ scale: 1 });
  const wIn = 10;
  const hIn = Math.max(3, Math.min(20, wIn * vp1.height / vp1.width));
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "PDFSEITE", width: wIn, height: hIn });
  pptx.layout = "PDFSEITE";
  for (let i = 1; i <= doc.numPages; i++) {
    const canvas = await renderPdfPage(doc, i, 1600);
    pptx.addSlide().addImage({
      data: canvas.toDataURL("image/jpeg", 0.9), x: 0, y: 0, w: wIn, h: hIn,
    });
  }
  return await pptx.write("blob");
}

async function pdfText(file) {
  const doc = await openPdf(file);
  const parts = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    parts.push(content.items.map(it => it.str).join(" "));
  }
  const text = parts.join("\n\n").trim();
  if (!text) {
    fail("In diesem PDF wurde kein Text gefunden. " +
         "Gescannte PDFs (nur Bilder) benötigen eine OCR-Software.");
  }
  return text;
}

async function pdfToImages(file, dst, base) {
  const doc = await openPdf(file);
  if (doc.numPages > 200) fail(`Das PDF hat ${doc.numPages} Seiten – bitte maximal 200.`);
  const blobs = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const canvas = await renderPdfPage(doc, i, 2000);
    const blob = await canvasToBlob(canvas, MIME[dst], dst === "png" ? undefined : 0.92);
    if (!blob) fail(`Seite ${i} konnte nicht als .${dst} gespeichert werden.`);
    blobs.push(blob);
  }
  if (blobs.length === 1) return { blob: blobs[0], name: `${base}.${dst}` };
  const zip = new JSZip();
  blobs.forEach((b, i) =>
    zip.file(`${base}_Seite_${String(i + 1).padStart(3, "0")}.${dst}`, b));
  return { blob: await zip.generateAsync({ type: "blob" }), name: `${base}_Seiten.zip` };
}

async function openZip(file, what) {
  try {
    return await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    fail(`Die ${what}-Datei konnte nicht gelesen werden. Ist sie beschädigt?`);
  }
}

async function docxText(file) {
  const zip = await openZip(file, "DOCX");
  const docFile = zip.file("word/document.xml");
  if (!docFile) fail("Kein Word-Dokument gefunden. Ist es wirklich eine DOCX?");
  const xml = new DOMParser().parseFromString(await docFile.async("text"), "application/xml");
  const lines = [];
  for (const p of xml.getElementsByTagName("w:p")) {
    lines.push(Array.from(p.getElementsByTagName("w:t")).map(t => t.textContent).join(""));
  }
  const text = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) fail("Das Dokument enthält keinen Text.");
  return text;
}

async function odfText(file, what) {
  const zip = await openZip(file, what);
  const content = zip.file("content.xml");
  if (!content) fail(`Kein Inhalt gefunden. Ist es wirklich eine ${what}-Datei?`);
  const xml = new DOMParser().parseFromString(await content.async("text"), "application/xml");
  const lines = [];
  for (const p of xml.getElementsByTagName("text:p")) {
    lines.push(p.textContent);
  }
  for (const p of xml.getElementsByTagName("text:h")) {
    lines.unshift(p.textContent);
  }
  const text = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) fail("Das Dokument enthält keinen Text.");
  return text;
}

async function epubText(file) {
  const zip = await openZip(file, "EPUB");
  const chapters = Object.keys(zip.files)
    .filter(n => /\.x?html?$/i.test(n) && !/nav\.xhtml$/i.test(n))
    .sort();
  if (!chapters.length) fail("Im E-Book wurden keine Kapitel gefunden.");
  const parts = [];
  for (const name of chapters) {
    const t = htmlToText(await zip.file(name).async("text"));
    if (t) parts.push(t);
  }
  const text = parts.join("\n\n").trim();
  if (!text) fail("Aus dem E-Book konnte kein Text gelesen werden.");
  return text;
}

/* --- PPTX lesen (Texte + Bilder) --- */

async function openPptx(file) {
  const zip = await openZip(file, "PPTX");
  const slideNames = Object.keys(zip.files)
    .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => parseInt(a.match(/\d+/g).pop()) - parseInt(b.match(/\d+/g).pop()));
  if (!slideNames.length) fail("In der Datei wurden keine Folien gefunden. Ist es wirklich eine PPTX?");
  return { zip, slideNames };
}

function slideParagraphs(xmlText) {
  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  const paragraphs = [];
  for (const p of xml.getElementsByTagName("a:p")) {
    const line = Array.from(p.getElementsByTagName("a:t")).map(t => t.textContent).join("");
    if (line.trim()) paragraphs.push(line.trim());
  }
  return paragraphs;
}

async function slideImages(zip, slideName) {
  const relsFile = zip.file(slideName.replace("slides/", "slides/_rels/") + ".rels");
  if (!relsFile) return [];
  const xml = new DOMParser().parseFromString(await relsFile.async("text"), "application/xml");
  const images = [];
  for (const rel of xml.getElementsByTagName("Relationship")) {
    if (!(rel.getAttribute("Type") || "").endsWith("/image")) continue;
    const target = (rel.getAttribute("Target") || "").replace("../", "ppt/");
    if (!/\.(png|jpe?g)$/i.test(target)) continue;
    const f = zip.file(target);
    if (f) images.push({ data: await f.async("blob") });
  }
  return images;
}

async function pptxToPdf(file) {
  const { zip, slideNames } = await openPptx(file);
  const pdf = new jspdf.jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const pageW = 297, pageH = 210, margin = 16, maxW = pageW - 2 * margin;

  for (let s = 0; s < slideNames.length; s++) {
    if (s > 0) pdf.addPage();
    let y = margin;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(150);
    pdf.text(`Folie ${s + 1}`, pageW - margin, 10, { align: "right" });
    pdf.setTextColor(0);

    const paragraphs = slideParagraphs(await zip.file(slideNames[s]).async("text"));
    for (let i = 0; i < paragraphs.length; i++) {
      pdf.setFont("helvetica", i === 0 ? "bold" : "normal");
      pdf.setFontSize(i === 0 ? 20 : 13);
      const lines = pdf.splitTextToSize((i === 0 ? "" : "• ") + paragraphs[i], maxW);
      for (const line of lines) {
        if (y > pageH - margin) { pdf.addPage(); y = margin; }
        pdf.text(line, margin, y);
        y += i === 0 ? 9 : 6.5;
      }
      if (i === 0) y += 3;
    }

    for (const im of await slideImages(zip, slideNames[s])) {
      let img;
      try { img = await loadImageElement(im.data); } catch { continue; }
      const scale = Math.min(maxW / img.naturalWidth, 110 / img.naturalHeight, 0.35);
      const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
      if (y + h > pageH - margin) { pdf.addPage(); y = margin; }
      try {
        // Über Canvas zu JPEG: jsPDF kommt mit rohen <img>-Elementen nicht
        // zuverlässig klar (u.a. bei PNG mit Transparenz)
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        const c = canvas.getContext("2d");
        c.fillStyle = "#fff";
        c.fillRect(0, 0, canvas.width, canvas.height);
        c.drawImage(img, 0, 0);
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.9), "JPEG", margin, y, w, h);
        y += h + 6;
      } catch { /* einzelnes defektes Bild überspringen */ }
    }
  }
  return pdf.output("blob");
}

async function pptxText(file) {
  const { zip, slideNames } = await openPptx(file);
  const parts = [];
  for (let s = 0; s < slideNames.length; s++) {
    const paragraphs = slideParagraphs(await zip.file(slideNames[s]).async("text"));
    parts.push(`=== Folie ${s + 1} ===\n` + paragraphs.join("\n"));
  }
  return parts.join("\n\n");
}

async function documentConvert(file, src, dst, base) {
  if (src === "pdf") {
    if (dst === "pptx") return { blob: await pdfToPptx(file) };
    if (dst === "jpg" || dst === "png") return pdfToImages(file, dst, base);
    const text = await pdfText(file);
    return { blob: await textToTarget(text, dst, base, false) };
  }
  if (src === "pptx") {
    if (dst === "pdf") return { blob: await pptxToPdf(file) };
    return { blob: await textToTarget(await pptxText(file), dst, base, false) };
  }
  if (src === "docx") {
    return { blob: await textToTarget(await docxText(file), dst, base, false) };
  }
  if (src === "odt" || src === "odp") {
    return { blob: await textToTarget(await odfText(file, src.toUpperCase()), dst, base, false) };
  }
  if (src === "epub") {
    return { blob: await textToTarget(await epubText(file), dst, base, false) };
  }
  if (src === "rtf") {
    return { blob: await textToTarget(rtfToText(await readText(file)), dst, base, false) };
  }
  fail(`Umwandlung .${src} → .${dst} wird nicht unterstützt.`);
}

/* ======================= Haupt-Dispatch ======================= */

/** Prüft, ob eine unbekannte Datei wie Text aussieht (für den Fallback). */
async function looksLikeText(file) {
  const buf = new Uint8Array(await file.slice(0, 8192).arrayBuffer());
  if (!buf.length) return false;
  let printable = 0;
  for (const b of buf) {
    if (b === 0) return false;
    if (b === 9 || b === 10 || b === 13 || (b >= 32 && b !== 127)) printable++;
  }
  return printable / buf.length > 0.9;
}

async function convertFile(file, rawSrc, dst, base) {
  const src = canonical(rawSrc);
  dst = canonical(dst);
  const def = { name: base + "." + dst };
  const category = categoryOf(src) || "text";

  if (category === "document") {
    const r = await documentConvert(file, src, dst, base);
    return { name: r.name || def.name, blob: r.blob };
  }
  if (category === "structured") {
    return { ...def, blob: await structuredConvert(file, src, dst, base) };
  }
  if (category === "data") {
    return { ...def, blob: await dataConvert(file, src, dst, base) };
  }
  if (category === "image") {
    return { ...def, blob: await imageConvert(file, src, dst) };
  }
  if (category === "audio") {
    return { ...def, blob: await audioConvert(file, dst) };
  }
  if (category === "video") {
    return { ...def, blob: await videoConvert(file, dst) };
  }
  // Klartext / Quellcode / unbekannter Text
  const text = await readText(file);
  return { ...def, blob: await textToTarget(text, dst, base, true) };
}

window.Registry = {
  extOf, canonical, categoryOf, targetsFor, allExtensions,
  looksLikeText, MIME, GENERIC_TEXT_TARGETS,
};
window.Converter = { convertFile, UserError };
