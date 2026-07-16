/* Universal File Converter – UI: Dateiauswahl, Zielformat-Suche, Format-Suche. */
"use strict";

const R = window.Registry;
const C = window.Converter;

const dropzone = document.getElementById("dropzone");
const fileinput = document.getElementById("fileinput");
const fileinfo = document.getElementById("fileinfo");
const fnameEl = document.getElementById("fname");
const fmetaEl = document.getElementById("fmeta");
const targetFilter = document.getElementById("targetfilter");
const targetList = document.getElementById("targetlist");
const convertBtn = document.getElementById("convertbtn");
const msgEl = document.getElementById("msg");
const spinner = document.getElementById("spinner");
const searchInput = document.getElementById("formatsearch");
const searchResults = document.getElementById("searchresults");
const statsEl = document.getElementById("stats");

let currentFile = null;
let currentTargets = [];
let selectedTarget = null;

const CATEGORY_LABELS = {
  image: "🖼️ Bild", data: "📊 Tabelle/Daten", audio: "🎵 Audio",
  video: "🎬 Video", document: "📄 Dokument", structured: "📝 Text/Daten",
  text: "📝 Text/Code",
};

/* ---------- Statistik im Kopfbereich ---------- */
(function showStats() {
  const exts = R.allExtensions();
  let pairs = 0;
  for (const e of exts) pairs += R.targetsFor(e).length;
  statsEl.textContent = `${exts.length} Dateitypen · ${pairs} Umwandlungswege · 100 % offline`;
})();

/* ---------- Meldungen ---------- */
function showMsg(text, type) {
  msgEl.textContent = text;
  msgEl.className = "msg show " + type;
}
function clearMsg() { msgEl.className = "msg"; }

function fmtSize(n) {
  if (n >= 1048576) return (n / 1048576).toFixed(1) + " MB";
  if (n >= 1024) return (n / 1024).toFixed(1) + " KB";
  return n + " Bytes";
}

/* ---------- Dateiauswahl ---------- */
dropzone.addEventListener("click", () => fileinput.click());
dropzone.addEventListener("dragover", e => { e.preventDefault(); dropzone.classList.add("drag"); });
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag"));
dropzone.addEventListener("drop", e => {
  e.preventDefault(); dropzone.classList.remove("drag");
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileinput.addEventListener("change", () => {
  if (fileinput.files.length) handleFile(fileinput.files[0]);
});

async function handleFile(file) {
  clearMsg();
  const ext = R.extOf(file.name);
  let targets = R.targetsFor(ext);

  if (!targets.length) {
    // Unbekannte Endung: Wenn der Inhalt wie Text aussieht, Text-Ziele anbieten
    if (await R.looksLikeText(file)) {
      targets = R.GENERIC_TEXT_TARGETS.filter(t => t !== ext);
      showMsg(`.${ext} ist unbekannt, sieht aber wie eine Textdatei aus – ` +
              "Text-Umwandlungen sind möglich.", "info");
    } else {
      fileinfo.classList.remove("show");
      showMsg(`Das Format .${ext} wird nicht unterstützt. ` +
              "Tippe oben ins Suchfeld, um alle unterstützten Formate zu sehen.", "error");
      return;
    }
  }

  currentFile = file;
  currentTargets = targets;
  fnameEl.textContent = file.name;
  const cat = R.categoryOf(ext);
  fmetaEl.textContent = `.${ext} · ${fmtSize(file.size)}` +
    (cat ? ` · ${CATEGORY_LABELS[cat]}` : "");
  targetFilter.value = "";
  renderTargets("");
  fileinfo.classList.add("show");
}

/* ---------- Zielformat-Auswahl mit Filter ---------- */
function renderTargets(filter) {
  targetList.innerHTML = "";
  const visible = currentTargets.filter(t => t.includes(filter.toLowerCase()));
  if (!visible.includes(selectedTarget)) selectedTarget = visible[0] || null;
  for (const t of visible) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (t === selectedTarget ? " active" : "");
    b.textContent = "." + t;
    b.onclick = () => { selectedTarget = t; renderTargets(targetFilter.value); };
    targetList.appendChild(b);
  }
  if (!visible.length) {
    const d = document.createElement("div");
    d.className = "nohit";
    d.textContent = "Kein Zielformat passt zu deiner Suche.";
    targetList.appendChild(d);
  }
  convertBtn.disabled = !selectedTarget;
}
targetFilter.addEventListener("input", () => renderTargets(targetFilter.value));

/* ---------- Konvertieren ---------- */
convertBtn.addEventListener("click", async () => {
  if (!currentFile || !selectedTarget) return;
  clearMsg();
  convertBtn.disabled = true;
  spinner.classList.add("show");
  const src = R.extOf(currentFile.name);
  const base = currentFile.name.replace(/\.[^.]+$/, "") || currentFile.name;
  try {
    const result = await C.convertFile(currentFile, src, selectedTarget, base);
    await deliver(result.blob, result.name,
      R.MIME[R.extOf(result.name)] || "application/octet-stream");
    showMsg(`✅ Fertig! ${result.name} (${fmtSize(result.blob.size)}) wurde gespeichert.`, "success");
  } catch (err) {
    const m = err && err.message ? err.message : "Konvertierung fehlgeschlagen.";
    showMsg("❌ " + m, "error");
  } finally {
    convertBtn.disabled = false;
    spinner.classList.remove("show");
  }
});

/* ---------- Format-Suche ---------- */
function renderSearch(query) {
  searchResults.innerHTML = "";
  const q = query.trim().toLowerCase().replace(/^\./, "");
  if (!q) { searchResults.innerHTML = ""; return; }

  const exts = R.allExtensions();
  const asSource = exts.filter(e => e.includes(q)).slice(0, 12);
  const asTarget = exts.filter(e => R.targetsFor(e).includes(R.canonical(q))).slice(0, 40);

  const frag = document.createDocumentFragment();
  if (!asSource.length && !asTarget.length) {
    const d = document.createElement("div");
    d.className = "nohit";
    d.textContent = `Kein unterstütztes Format passt zu "${query}".`;
    frag.appendChild(d);
  }
  for (const e of asSource) {
    const targets = R.targetsFor(e);
    if (!targets.length) continue;
    const d = document.createElement("div");
    d.className = "hit";
    const cat = CATEGORY_LABELS[R.categoryOf(e)] || "";
    d.innerHTML = `<b>.${e}</b> <span class="cat">${cat}</span> → ` +
      targets.map(t => "." + t).join(", ");
    frag.appendChild(d);
  }
  if (asTarget.length && R.canonical(q) && exts.some(e => R.targetsFor(e).includes(R.canonical(q)))) {
    const d = document.createElement("div");
    d.className = "hit";
    d.innerHTML = `<b>Nach .${R.canonical(q)}</b> können umgewandelt werden: ` +
      asTarget.map(t => "." + t).join(", ") + (asTarget.length >= 40 ? " …" : "");
    frag.appendChild(d);
  }
  searchResults.appendChild(frag);
}
searchInput.addEventListener("input", () => renderSearch(searchInput.value));

/* ---------- Speichern: Android-Bridge oder Browser-Download ---------- */
function nativeBridge() {
  // Bridge steckt im Haupt-Fenster (Nexus-WebView); der Konverter läuft im iframe.
  try { if (window.Android && window.Android.saveFile) return window.Android; } catch (e) {}
  try { if (window.parent && window.parent.Android && window.parent.Android.saveFile) return window.parent.Android; } catch (e) {}
  try { if (window.top && window.top.Android && window.top.Android.saveFile) return window.top.Android; } catch (e) {}
  return null;
}

async function deliver(blob, name, mime) {
  const bridge = nativeBridge();
  if (bridge) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    const CHUNK = 32768;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    bridge.saveFile(btoa(bin), name, mime);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
