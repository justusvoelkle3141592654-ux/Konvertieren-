/* ==========================================================================
   Nexus — News · Sport · Videos · Quiz · Aufgaben
   Vanilla JS, kein Build-Schritt. Alle Daten bleiben lokal (localStorage).
   ========================================================================== */
"use strict";

/* ==========================================================================
   Utilities
   ========================================================================== */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const nfDE = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });
const nfCompact = new Intl.NumberFormat("de-DE", { notation: "compact", maximumFractionDigits: 1 });

function fmtCurrency(v, currency = "EUR") {
  const digits = Math.abs(v) < 1 ? 4 : 2;
  return new Intl.NumberFormat("de-DE", {
    style: "currency", currency,
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(v);
}

function timeAgo(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d)) return "";
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "gerade eben";
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min.`;
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std.`;
  if (diff < 172800) return "gestern";
  return d.toLocaleDateString("de-DE", { day: "numeric", month: "short" });
}

function fmtClock(d = new Date()) {
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function fmtDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

function fetchWithTimeout(url, ms = 9000, options = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

/* CORS-Proxys als Fallback für Endpunkte ohne CORS-Header. */
const PROXIES = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
];

async function fetchText(url, { direct = true, timeout = 9000 } = {}) {
  const attempts = [...(direct ? [(u) => u] : []), ...PROXIES];
  let lastErr;
  for (const wrap of attempts) {
    try {
      const res = await fetchWithTimeout(wrap(url), timeout, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text) throw new Error("Leere Antwort");
      return text;
    } catch (err) { lastErr = err; }
  }
  throw lastErr || new Error("Netzwerkfehler");
}

async function fetchJson(url, opts) {
  return JSON.parse(await fetchText(url, opts));
}

function jsonp(url, timeout = 6000) {
  return new Promise((resolve, reject) => {
    const cb = `__nexus_jsonp_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const script = document.createElement("script");
    const timer = setTimeout(() => cleanup(new Error("JSONP-Timeout")), timeout);
    function cleanup(err, data) {
      clearTimeout(timer);
      delete window[cb];
      script.remove();
      err ? reject(err) : resolve(data);
    }
    window[cb] = (data) => cleanup(null, data);
    script.onerror = () => cleanup(new Error("JSONP-Fehler"));
    script.src = `${url}${url.includes("?") ? "&" : "?"}jsonp=${cb}`;
    document.head.appendChild(script);
  });
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

async function sha256(text) {
  if (crypto?.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Fallback für unsichere Kontexte (http://) — einfacher FNV-Hash.
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return "fnv_" + h.toString(16);
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ==========================================================================
   Store (localStorage)
   ========================================================================== */
const LS = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  },
  remove(key) { try { localStorage.removeItem(key); } catch {} },
};

const DEFAULT_SETTINGS = {
  theme: "dark",            // dark | light | system
  accent: "mono",           // mono | blue | green
  reduceMotion: false,
  sources: { tagesschau: true, zdf: true, zeit: true, welt: true },
  topics: [],
  showImages: true,
  compactNews: false,
  videoRegion: "DE",
  autoplay: true,
  autoRefresh: true,
  staleMinutes: 5,
  shakeUndo: true,
  shakeSensitivity: "normal", // low | normal | high
  weatherShow: true,
  weatherPlace: { name: "Berlin", lat: 52.52, lon: 13.41 },
  sportLeague: "bl1",
};

const state = {
  settings: { ...DEFAULT_SETTINGS, ...LS.get("nexus_settings", {}) },
  session: LS.get("nexus_session", null), // email des angemeldeten Nutzers
  todos: LS.get("nexus_todos", []),
  stats: LS.get("nexus_stats", { read: 0, videos: 0, done: 0 }),
  activeTab: "news",
  newsItems: [],
  newsFilter: "all",
  lastFetch: { news: 0, sport: 0, videos: 0 },
  undoStack: [],
  videoQuery: "",
};
state.settings.sources = { ...DEFAULT_SETTINGS.sources, ...state.settings.sources };

function saveSettings() {
  LS.set("nexus_settings", state.settings);
  // Angemeldete Nutzer behalten ihre Einstellungen auch nach Ab-/Anmelden.
  if (state.session) LS.set(`nexus_settings_${state.session}`, state.settings);
}
const saveTodos = () => LS.set("nexus_todos", state.todos);
const saveStats = () => LS.set("nexus_stats", state.stats);

function bumpStat(key) {
  state.stats[key] = (state.stats[key] || 0) + 1;
  saveStats();
  renderProfileStats();
}

/* ==========================================================================
   Toasts
   ========================================================================== */
function toast(msg, ms = 2600) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  $("#toast-wrap").appendChild(el);
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 300);
  }, ms);
}

/* ==========================================================================
   Theme & Darstellung
   ========================================================================== */
const systemDark = matchMedia("(prefers-color-scheme: dark)");

function applyAppearance() {
  const { theme, accent, reduceMotion } = state.settings;
  const dark = theme === "system" ? systemDark.matches : theme === "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.dataset.accent = accent;
  document.documentElement.dataset.motion = reduceMotion ? "reduce" : "";
  $('meta[name="theme-color"]').content = dark ? "#000000" : "#f2f2f7";
  if (typeof syncConverterTheme === "function") syncConverterTheme();
}
systemDark.addEventListener("change", () => {
  if (state.settings.theme === "system") applyAppearance();
});

/* ==========================================================================
   Navigation
   ========================================================================== */
function switchTab(tab) {
  state.activeTab = tab;
  $$(".view").forEach((v) => v.classList.toggle("active", v.dataset.view === tab));
  $$(".tabbar .tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  window.scrollTo({ top: 0 });
  const loaders = { news: loadNews, sport: loadSport, videos: loadVideos, convert: initConverterOnce };
  loaders[tab]?.();
}

$$(".tabbar .tab").forEach((btn) =>
  btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

$("#btn-profile").addEventListener("click", () => switchTab("profile"));

$("#btn-refresh").addEventListener("click", () => {
  refreshAll(true);
  toast("Wird aktualisiert …", 1500);
});

function refreshAll(force = false) {
  const btn = $("#btn-refresh");
  btn.classList.add("spinning");
  const jobs = [];
  if (force || state.activeTab === "news") jobs.push(loadNews(true));
  if (force || state.activeTab === "sport") jobs.push(loadSport(true));
  if (force || state.activeTab === "videos") jobs.push(loadVideos(true));
  Promise.allSettled(jobs).then(() => btn.classList.remove("spinning"));
}

function isStale(section) {
  return Date.now() - state.lastFetch[section] > state.settings.staleMinutes * 60 * 1000;
}

/* Beim Öffnen / Zurückkehren zur App immer aktualisieren. */
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !state.settings.autoRefresh) return;
  const section = ["news", "sport", "videos"].includes(state.activeTab) ? state.activeTab : "news";
  if (isStale(section)) refreshAll(false);
});

/* ==========================================================================
   Modals
   ========================================================================== */
/* Offene Modals werden in die Browser-History eingehängt, damit die
   Zurück-Taste (Android!) sie schließt, statt die App zu beenden. */
const openModals = [];

function openModal(id) {
  $(`#${id}-modal`).classList.remove("hidden");
  document.body.style.overflow = "hidden";
  openModals.push(id);
  history.pushState({ nexusModal: openModals.length }, "");
}

function hardCloseModal(id) {
  $(`#${id}-modal`).classList.add("hidden");
  if (!openModals.length) document.body.style.overflow = "";
  if (id === "player") $("#player-frame").innerHTML = "";
  if (id === "reader") readerItem = null;
}

function closeModal(id) {
  if (openModals[openModals.length - 1] === id) {
    history.back(); // popstate übernimmt das eigentliche Schließen
  } else {
    const idx = openModals.lastIndexOf(id);
    if (idx !== -1) openModals.splice(idx, 1);
    hardCloseModal(id);
  }
}

window.addEventListener("popstate", () => {
  const id = openModals.pop();
  if (id) hardCloseModal(id);
  if (!openModals.length) document.body.style.overflow = "";
});

$$("[data-close]").forEach((el) =>
  el.addEventListener("click", () => closeModal(el.dataset.close)));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && openModals.length) closeModal(openModals[openModals.length - 1]);
});

/* ==========================================================================
   WETTER — Open-Meteo (kostenlos, ohne Schlüssel)
   ========================================================================== */
const WMO = {
  0: ["☀️", "Klar"], 1: ["🌤️", "Überwiegend sonnig"], 2: ["⛅", "Teils bewölkt"], 3: ["☁️", "Bedeckt"],
  45: ["🌫️", "Nebel"], 48: ["🌫️", "Reifnebel"],
  51: ["🌦️", "Leichter Niesel"], 53: ["🌦️", "Niesel"], 55: ["🌧️", "Starker Niesel"],
  56: ["🌧️", "Gefr. Niesel"], 57: ["🌧️", "Gefr. Niesel"],
  61: ["🌧️", "Leichter Regen"], 63: ["🌧️", "Regen"], 65: ["🌧️", "Starker Regen"],
  66: ["🌧️", "Gefr. Regen"], 67: ["🌧️", "Gefr. Regen"],
  71: ["🌨️", "Leichter Schnee"], 73: ["🌨️", "Schnee"], 75: ["❄️", "Starker Schnee"], 77: ["🌨️", "Schneegriesel"],
  80: ["🌦️", "Leichte Schauer"], 81: ["🌦️", "Schauer"], 82: ["🌧️", "Starke Schauer"],
  85: ["🌨️", "Schneeschauer"], 86: ["🌨️", "Schneeschauer"],
  95: ["⛈️", "Gewitter"], 96: ["⛈️", "Gewitter mit Hagel"], 99: ["⛈️", "Schweres Gewitter"],
};
const wmo = (code) => WMO[code] || ["🌡️", "—"];

let weatherLoadedAt = 0;

async function loadWeather(force = false) {
  const wrap = $("#weather-wrap");
  if (!state.settings.weatherShow) { wrap.innerHTML = ""; return; }
  if (!force && weatherLoadedAt && Date.now() - weatherLoadedAt < state.settings.staleMinutes * 60000) return;

  const { name, lat, lon } = state.settings.weatherPlace;
  try {
    const data = await fetchJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m" +
      "&hourly=temperature_2m,weather_code" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min" +
      "&timezone=auto&forecast_days=7", { timeout: 10000 });
    weatherLoadedAt = Date.now();

    const cur = data.current;
    const [icon, desc] = wmo(cur.weather_code);

    // Nächste 12 Stunden ab jetzt
    const nowIdx = Math.max(0, data.hourly.time.findIndex((t) => new Date(t) >= new Date()) - 1);
    const hours = data.hourly.time.slice(nowIdx, nowIdx + 12).map((t, i) => {
      const [hIcon] = wmo(data.hourly.weather_code[nowIdx + i]);
      return `<div class="weather-hour">
        <span>${i === 0 ? "Jetzt" : new Date(t).getHours() + " Uhr"}</span>
        <span class="wi">${hIcon}</span>
        <strong>${Math.round(data.hourly.temperature_2m[nowIdx + i])}°</strong>
      </div>`;
    }).join("");

    const days = data.daily.time.map((t, i) => {
      const [dIcon, dDesc] = wmo(data.daily.weather_code[i]);
      const dayName = i === 0 ? "Heute"
        : new Date(t).toLocaleDateString("de-DE", { weekday: "short" });
      return `<div class="weather-day">
        <span class="wd-name">${dayName}</span>
        <span class="wi">${dIcon}</span>
        <span class="wd-desc">${dDesc}</span>
        <span class="wd-temp">${Math.round(data.daily.temperature_2m_max[i])}°
          <small>/ ${Math.round(data.daily.temperature_2m_min[i])}°</small></span>
      </div>`;
    }).join("");

    wrap.innerHTML = `
      <div class="weather-card glass">
        <div class="weather-now">
          <div class="weather-main">
            <span class="weather-temp">${Math.round(cur.temperature_2m)}°</span>
            <span class="weather-desc">${icon} ${desc}</span>
            <span class="weather-sub">Gefühlt ${Math.round(cur.apparent_temperature)}° ·
              Wind ${Math.round(cur.wind_speed_10m)} km/h · ${cur.relative_humidity_2m} %</span>
          </div>
          <button class="weather-city" id="weather-city">📍 ${escapeHtml(name)}</button>
        </div>
        <div class="weather-hours">${hours}</div>
        <div class="weather-days">${days}</div>
      </div>`;
    $("#weather-city").addEventListener("click", () => {
      openModal("settings");
      setTimeout(() => $("#set-weather-city").focus(), 350);
    });
  } catch {
    if (!wrap.innerHTML) wrap.innerHTML = "";
  }
}

async function setWeatherCity(query) {
  const data = await fetchJson(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=de`,
    { timeout: 10000 });
  const hit = data.results?.[0];
  if (!hit) throw new Error("Ort nicht gefunden");
  state.settings.weatherPlace = { name: hit.name, lat: hit.latitude, lon: hit.longitude };
  saveSettings();
  weatherLoadedAt = 0;
  await loadWeather(true);
  return hit;
}

/* ==========================================================================
   NEWS — ausschließlich geprüfte Redaktionen
   ========================================================================== */
const NEWS_SOURCES = {
  tagesschau: { name: "tagesschau", kind: "tagesschau", url: "https://www.tagesschau.de/api2u/news/" },
  zdf: { name: "ZDFheute", kind: "rss", url: "https://www.zdf.de/rss/zdf/nachrichten" },
  zeit: { name: "ZEIT ONLINE", kind: "rss", url: "https://newsfeed.zeit.de/index" },
  welt: { name: "WELT", kind: "rss", url: "https://www.welt.de/feeds/topnews.rss" },
};

async function fetchTagesschau(src, key, ressort = "") {
  const url = ressort ? `${src.url}?ressort=${ressort}` : src.url;
  const data = await fetchJson(url);
  return (data.news || [])
    .filter((n) => n.title && n.detailsweb)
    .map((n) => ({
      id: n.externalId || n.sophoraId || uid(),
      source: key,
      sourceName: src.name,
      title: n.title,
      desc: n.firstSentence || "",
      link: n.detailsweb,
      detailsUrl: n.details || null,
      date: new Date(n.date),
      image:
        n.teaserImage?.imageVariants?.["16x9-640"] ||
        n.teaserImage?.imageVariants?.["16x9-960"] ||
        null,
    }));
}

function extractRssImage(item) {
  for (const tag of ["content", "thumbnail"]) {
    const el = item.getElementsByTagNameNS("*", tag)[0];
    const url = el?.getAttribute("url");
    if (url) return url;
  }
  const enc = item.querySelector("enclosure[url]");
  if (enc && /image|jpg|jpeg|png|webp/i.test(enc.getAttribute("type") || enc.getAttribute("url")))
    return enc.getAttribute("url");
  const html = item.querySelector("description")?.textContent || "";
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

async function fetchRss(src, key) {
  const xml = await fetchText(src.url);
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (doc.querySelector("parsererror")) throw new Error("RSS nicht lesbar");
  return [...doc.querySelectorAll("item")].slice(0, 25).map((item) => {
    const get = (sel) => item.querySelector(sel)?.textContent?.trim() || "";
    const descHtml = get("description");
    const tmp = document.createElement("div");
    tmp.innerHTML = descHtml;
    return {
      id: get("guid") || get("link") || uid(),
      source: key,
      sourceName: src.name,
      title: get("title"),
      desc: (tmp.textContent || "").trim().slice(0, 300),
      link: get("link"),
      date: new Date(get("pubDate") || Date.now()),
      image: extractRssImage(item),
    };
  }).filter((n) => n.title && n.link);
}

async function loadNews(force = false) {
  loadWeather(force); // Wetterkarte parallel aktualisieren
  if (!force && state.newsItems.length && !isStale("news")) { renderNews(); return; }

  const loader = $("#news-loader");
  const errBox = $("#news-error");
  errBox.classList.add("hidden");
  if (!state.newsItems.length) loader.classList.remove("hidden");

  const active = Object.entries(NEWS_SOURCES)
    .filter(([key]) => state.settings.sources[key]);

  const results = await Promise.allSettled(
    active.map(([key, src]) =>
      src.kind === "tagesschau" ? fetchTagesschau(src, key) : fetchRss(src, key)));

  const items = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const failed = results.filter((r) => r.status === "rejected").length;

  loader.classList.add("hidden");

  if (!items.length) {
    if (!state.newsItems.length) errBox.classList.remove("hidden");
    else toast("Aktualisierung fehlgeschlagen — alte Meldungen werden angezeigt.");
    return;
  }

  // Duplikate (gleicher Link) entfernen, nach Datum sortieren
  const seen = new Set();
  state.newsItems = items
    .filter((n) => !seen.has(n.link) && seen.add(n.link))
    .sort((a, b) => b.date - a.date)
    .slice(0, 80);
  state.lastFetch.news = Date.now();

  $("#news-updated").textContent = `Stand ${fmtClock()}`;
  if (failed && force) toast(`${failed} Quelle${failed > 1 ? "n" : ""} nicht erreichbar.`);
  renderNews();
}

/* Alle gerenderten Artikel nach ID, damit Klicks den Reader öffnen können. */
const newsRegistry = new Map();

function newsCardHtml(n, { row = false } = {}) {
  newsRegistry.set(n.id, n);
  const showImg = state.settings.showImages && n.image;
  const compact = row || state.settings.compactNews;
  return `
    <article class="news-card glass ${compact ? "row" : ""}" data-news-id="${escapeHtml(n.id)}"
       role="button" tabindex="0" aria-label="${escapeHtml(n.title)}">
      ${showImg ? `<img class="news-img" src="${escapeHtml(n.image)}" alt="" loading="lazy"
          onerror="this.remove()">` : ""}
      <div class="news-body">
        <div class="news-meta">
          <span class="source-badge">${escapeHtml(n.sourceName)}</span>
          <span>${timeAgo(n.date)}</span>
        </div>
        <span class="news-title">${escapeHtml(n.title)}</span>
        ${n.desc && !compact ? `<span class="news-desc">${escapeHtml(n.desc)}</span>` : ""}
      </div>
    </article>`;
}

/* Ein Klick auf irgendeine News-Karte öffnet den Artikel-Reader in der App. */
document.addEventListener("click", (e) => {
  const card = e.target.closest(".news-card[data-news-id]");
  if (!card) return;
  const item = newsRegistry.get(card.dataset.newsId);
  if (item) openReader(item);
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const card = e.target.closest?.(".news-card[data-news-id]");
  if (!card) return;
  const item = newsRegistry.get(card.dataset.newsId);
  if (item) openReader(item);
});

function renderNewsChips() {
  const chips = [["all", "Alle"]];
  if (state.settings.topics.length) chips.push(["foryou", "✦ Für dich"]);
  chips.push(...Object.entries(NEWS_SOURCES)
    .filter(([key]) => state.settings.sources[key])
    .map(([key, s]) => [key, s.name]));
  $("#news-chips").innerHTML = chips.map(([key, label]) =>
    `<button class="chip ${state.newsFilter === key ? "active" : ""}" data-source="${key}">
       ${escapeHtml(label)}</button>`).join("");
  $$("#news-chips .chip").forEach((chip) =>
    chip.addEventListener("click", () => {
      state.newsFilter = chip.dataset.source;
      renderNews();
    }));
}

function matchesTopics(n) {
  const text = (n.title + " " + n.desc).toLowerCase();
  return state.settings.topics.some((t) => text.includes(t.toLowerCase()));
}

function renderNews() {
  const validFilters = ["all", "foryou", ...Object.keys(NEWS_SOURCES)];
  if (!validFilters.includes(state.newsFilter)) state.newsFilter = "all";
  if (state.newsFilter === "foryou" && !state.settings.topics.length) state.newsFilter = "all";
  renderNewsChips();

  const hasTopics = state.settings.topics.length > 0;
  const wrap = $("#news-foryou-wrap");

  // Eigener "Für dich"-Tab: nur Artikel zu den persönlichen Themen
  if (state.newsFilter === "foryou") {
    wrap.classList.add("hidden");
    const matched = state.newsItems.filter(matchesTopics);
    $("#news-list").innerHTML = matched.map((n) => newsCardHtml(n)).join("") ||
      `<div class="empty-state">
         <p>Zu deinen Themen (${escapeHtml(state.settings.topics.join(", "))})
            ist in den aktuellen Meldungen gerade nichts dabei.<br>
            Tipp: Allgemeinere Begriffe wie „Politik“ oder „Fußball“ treffen öfter.</p>
         <button class="btn btn-secondary" id="foryou-manage">Themen verwalten</button>
       </div>`;
    $("#foryou-manage")?.addEventListener("click", () => openModal("settings"));
    return;
  }

  const items = state.newsItems.filter(
    (n) => state.newsFilter === "all" || n.source === state.newsFilter);

  // Vorschau-Zeile "Für dich" oberhalb der Liste (bei Treffern)
  const forYou = hasTopics ? items.filter(matchesTopics).slice(0, 10) : [];
  wrap.classList.toggle("hidden", !forYou.length);
  $("#news-foryou").innerHTML = forYou.map((n) => newsCardHtml(n)).join("");

  const forYouIds = new Set(forYou.map((n) => n.id));
  $("#news-list").innerHTML = items
    .filter((n) => !forYouIds.has(n.id))
    .map((n) => newsCardHtml(n))
    .join("") || `<div class="empty-state"><p>Keine Meldungen für diese Auswahl.</p></div>`;
}

$("#news-retry").addEventListener("click", () => loadNews(true));

/* ==========================================================================
   ARTIKEL-READER — Volltext direkt in der App
   ========================================================================== */
let readerItem = null;

function stripTags(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return (tmp.textContent || "").replace(/\s+/g, " ").trim();
}

/* Liefert den Artikel als Liste von Blöcken: { t: "p" | "h", text } */
async function extractArticle(n) {
  // 1) tagesschau: strukturierte Inhalte über die offizielle API
  if (n.detailsUrl) {
    try {
      const d = await fetchJson(n.detailsUrl, { timeout: 12000 });
      const blocks = (d.content || [])
        .filter((c) => c.type === "text" || c.type === "headline")
        .map((c) => ({ t: c.type === "headline" ? "h" : "p", text: stripTags(c.value || "") }))
        .filter((b) => b.text && !/^(mehr|weniger)$/i.test(b.text));
      if (blocks.length) return blocks;
    } catch {}
  }

  const html = await fetchText(n.link, { timeout: 14000 });
  const doc = new DOMParser().parseFromString(html, "text/html");

  // 2) JSON-LD: viele Redaktionen liefern den kompletten Text als articleBody
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const objects = [];
      (function walk(x) {
        if (!x) return;
        if (Array.isArray(x)) { x.forEach(walk); return; }
        if (typeof x === "object") { objects.push(x); walk(x["@graph"]); }
      })(JSON.parse(script.textContent));
      const art = objects.find((o) => typeof o.articleBody === "string" && o.articleBody.length > 250);
      if (art) {
        return art.articleBody
          .split(/\n+/)
          .map((t) => t.trim())
          .filter((t) => t.length > 1)
          .map((text) => ({ t: "p", text }));
      }
    } catch {}
  }

  // 3) Fallback: Absätze aus dem Artikel-Container der Seite
  for (const sel of ['[itemprop="articleBody"]', "article", "main"]) {
    const el = doc.querySelector(sel);
    if (!el) continue;
    const paras = [...el.querySelectorAll("p")]
      .map((p) => p.textContent.replace(/\s+/g, " ").trim())
      .filter((t) => t.length > 60);
    if (paras.join(" ").length > 350) return paras.map((text) => ({ t: "p", text }));
  }

  throw new Error("Kein Artikeltext gefunden");
}

function renderReaderBody(blocks) {
  $("#reader-loader").classList.add("hidden");
  $("#reader-body").innerHTML = blocks
    .map((b) => (b.t === "h" ? `<h2>${escapeHtml(b.text)}</h2>` : `<p>${escapeHtml(b.text)}</p>`))
    .join("");
  const totalLen = blocks.reduce((sum, b) => sum + b.text.length, 0);
  if (totalLen < 350) {
    const note = $("#reader-note");
    note.textContent =
      "Der vollständige Text ist nur auf der Website verfügbar (möglicherweise ein Plus-Artikel).";
    note.classList.remove("hidden");
  }
}

async function openReader(n) {
  readerItem = n;
  $("#reader-source").textContent = n.sourceName;
  $("#reader-date").textContent = `${timeAgo(n.date)} · ${new Date(n.date).toLocaleDateString("de-DE",
    { day: "numeric", month: "long", year: "numeric" })}`;
  $("#reader-title").textContent = n.title;
  $("#reader-body").innerHTML = "";
  $("#reader-note").classList.add("hidden");
  $("#reader-browser").href = n.link;
  const img = $("#reader-img");
  if (state.settings.showImages && n.image) {
    img.src = n.image;
    img.classList.remove("hidden");
  } else {
    img.classList.add("hidden");
  }
  $("#reader-scroll").scrollTop = 0;
  updateReaderBookmarkBtn();
  openModal("reader");
  bumpStat("read");

  if (n.content) { renderReaderBody(n.content); return; }

  $("#reader-loader").classList.remove("hidden");
  try {
    const blocks = await extractArticle(n);
    if (readerItem !== n) return; // Reader wurde inzwischen geschlossen
    n.content = blocks;
    syncBookmarkContent(n);
    renderReaderBody(blocks);
  } catch {
    if (readerItem !== n) return;
    $("#reader-loader").classList.add("hidden");
    if (n.desc) $("#reader-body").innerHTML = `<p>${escapeHtml(n.desc)}</p>`;
    const note = $("#reader-note");
    note.textContent = "Der Artikel konnte nicht vollständig geladen werden — unten geht's zum Original.";
    note.classList.remove("hidden");
  }
}

$("#reader-share").addEventListener("click", async () => {
  if (!readerItem) return;
  const data = { title: readerItem.title, url: readerItem.link };
  if (navigator.share) {
    try { await navigator.share(data); } catch {}
  } else {
    try {
      await navigator.clipboard.writeText(readerItem.link);
      toast("Link kopiert.");
    } catch { toast("Teilen wird hier nicht unterstützt."); }
  }
});

/* ==========================================================================
   MERKLISTE — Artikel & Videos speichern (Artikel offline lesbar)
   ========================================================================== */
state.bookmarks = LS.get("nexus_bookmarks", []);
const saveBookmarks = () => LS.set("nexus_bookmarks", state.bookmarks);

const isBookmarked = (key) => state.bookmarks.some((b) => b.key === key);

function toggleBookmark(entry) {
  const idx = state.bookmarks.findIndex((b) => b.key === entry.key);
  if (idx !== -1) {
    state.bookmarks.splice(idx, 1);
    toast("Aus der Merkliste entfernt.");
  } else {
    state.bookmarks.unshift({ ...entry, savedAt: Date.now() });
    if (state.bookmarks.length > 100) state.bookmarks.pop();
    toast("Zur Merkliste hinzugefügt.");
  }
  saveBookmarks();
  renderBookmarks();
}

/* Artikeltext nachträglich in ein bestehendes Lesezeichen übernehmen. */
function syncBookmarkContent(n) {
  const bm = state.bookmarks.find((b) => b.key === n.link);
  if (bm && n.content) { bm.item = { ...bm.item, content: n.content }; saveBookmarks(); }
}

function updateReaderBookmarkBtn() {
  $("#reader-bookmark").classList.toggle(
    "bookmarked", !!readerItem && isBookmarked(readerItem.link));
}

$("#reader-bookmark").addEventListener("click", () => {
  if (!readerItem) return;
  const n = readerItem;
  toggleBookmark({
    type: "article", key: n.link,
    title: n.title, sub: n.sourceName, image: n.image,
    item: { ...n, date: +new Date(n.date) },
  });
  updateReaderBookmarkBtn();
});

function renderBookmarks() {
  const box = $("#bookmark-list");
  if (!state.bookmarks.length) {
    box.innerHTML = `<div class="glass card"><p class="footnote" style="margin:0">
      Noch nichts gemerkt. Tippe im Artikel oder Videoplayer auf das Lesezeichen-Symbol.</p></div>`;
    return;
  }
  box.innerHTML = state.bookmarks.map((b, i) => `
    <div class="bookmark-row glass" data-bm-index="${i}" role="button" tabindex="0">
      ${b.image ? `<img class="bookmark-thumb" src="${escapeHtml(b.image)}" alt="" loading="lazy">`
        : `<span class="bookmark-thumb"></span>`}
      <div class="bookmark-info">
        <strong>${escapeHtml(b.title)}</strong>
        <span class="bookmark-kind">${b.type === "video" ? "▶ Video" : "📰"} · ${escapeHtml(b.sub || "")}
          · ${timeAgo(b.savedAt)}</span>
      </div>
      <button class="icon-btn small bm-remove" data-bm-remove="${i}" aria-label="Entfernen">
        <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>`).join("");

  $$("[data-bm-remove]", box).forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      state.bookmarks.splice(Number(btn.dataset.bmRemove), 1);
      saveBookmarks();
      renderBookmarks();
    }));

  $$("[data-bm-index]", box).forEach((row) =>
    row.addEventListener("click", () => {
      const b = state.bookmarks[Number(row.dataset.bmIndex)];
      if (!b) return;
      if (b.type === "video") openPlayer(b.key, b.title, b.sub);
      else openReader({ ...b.item, date: new Date(b.item.date) });
    }));
}

/* ==========================================================================
   SPORT — Live-Fußball über OpenLigaDB (kostenlos, ohne Schlüssel)
   ========================================================================== */
const SPORT_LEAGUES = [
  { id: "bl1", name: "Bundesliga", table: true },
  { id: "bl2", name: "2. Bundesliga", table: true },
  { id: "bl3", name: "3. Liga", table: true },
  { id: "wm", name: "WM", table: false }, // Weltmeisterschaft — Shortcut wird aufgelöst
];

function currentSeason() {
  const now = new Date();
  // Saison startet im Sommer; Juli = Monat 6
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

function fmtMatchTime(d) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const diff = Math.round((day - today) / 86400e3);
  const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  if (diff === 0) return "Heute " + time;
  if (diff === 1) return "Morgen " + time;
  if (diff === -1) return "Gestern " + time;
  return d.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" }) + " · " + time;
}

function matchScore(m) {
  if (m.matchResults && m.matchResults.length) {
    const r = m.matchResults.reduce((a, b) => (b.resultTypeID > a.resultTypeID ? b : a));
    return { s1: r.pointsTeam1, s2: r.pointsTeam2 };
  }
  if (m.goals && m.goals.length) {
    const g = m.goals[m.goals.length - 1];
    return { s1: g.scoreTeam1, s2: g.scoreTeam2 };
  }
  return null;
}

function teamBlock(team) {
  const icon = team.teamIconUrl
    ? `<img src="${escapeHtml(team.teamIconUrl)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
    : `<img alt="" style="visibility:hidden">`;
  return `<span>${escapeHtml(team.shortName || team.teamName)}</span>${icon}`;
}

function renderSportLeagues() {
  $("#sport-leagues").innerHTML = SPORT_LEAGUES.map((l) =>
    `<button class="chip ${l.id === state.settings.sportLeague ? "active" : ""}" data-league="${l.id}">
       ${escapeHtml(l.name)}</button>`).join("");
  $$("#sport-leagues .chip").forEach((chip) =>
    chip.addEventListener("click", () => {
      if (chip.dataset.league === state.settings.sportLeague) return;
      state.settings.sportLeague = chip.dataset.league;
      saveSettings();
      state.lastFetch.sport = 0;
      $("#sport-matches").innerHTML = `<div class="loader"><div class="spinner"></div><span>Spiele werden geladen …</span></div>`;
      $("#sport-table").innerHTML = "";
      loadSport(true);
    }));
}

function renderMatches(matches, leagueId) {
  const box = $("#sport-matches");
  if (!matches || !matches.length) {
    box.innerHTML = `<div class="empty-state"><p>Keine Spiele gefunden.</p></div>`;
    return;
  }
  // Bei der WM chronologisch nach Anstoß sortieren (nächste Spiele zuerst)
  if (leagueId === "wm") {
    matches = [...matches].sort((a, b) =>
      new Date(a.matchDateTimeUTC || a.matchDateTime) - new Date(b.matchDateTimeUTC || b.matchDateTime));
  }
  $("#sport-matchday-label").textContent = matches[0]?.group?.groupName || (leagueId === "wm" ? "Weltmeisterschaft" : "Spieltag");
  const now = Date.now();
  box.innerHTML = matches.map((m) => {
    const kickoff = new Date(m.matchDateTimeUTC || m.matchDateTime);
    const score = matchScore(m);
    const live = !m.matchIsFinished && kickoff.getTime() <= now && now - kickoff.getTime() < 3 * 3600e3;
    const scoreStr = score ? `${score.s1}:${score.s2}` : "–:–";
    let center;
    if (live) {
      center = `<span class="match-score live">${scoreStr}</span><span class="match-live-tag">Live</span>`;
    } else if (m.matchIsFinished) {
      center = `<span class="match-score">${scoreStr}</span><span class="match-time">Beendet</span>`;
    } else {
      center = `<span class="match-score">–:–</span><span class="match-time">${fmtMatchTime(kickoff)}</span>`;
    }
    return `<div class="match-card glass">
      <div class="match-team home">${teamBlock(m.team1)}</div>
      <div class="match-center">${center}</div>
      <div class="match-team away">${teamBlock(m.team2)}</div>
    </div>`;
  }).join("");
}

function sportZone(league, pos, total) {
  if (league === "bl1") {
    if (pos <= 4) return "zone-cl";
    if (pos <= 6) return "zone-el";
    if (pos >= total - 2) return "zone-rel";
    return "";
  }
  const promo = league === "bl3" ? 2 : 3;
  const rel = league === "bl3" ? 3 : 2;
  if (pos <= promo) return "zone-cl";
  if (pos >= total - rel + 1) return "zone-rel";
  return "";
}

function updateSportLegend(league) {
  const el = $("#sport-legend");
  if (!el) return;
  el.innerHTML = league === "bl1"
    ? `<span class="zone-dot" style="background:var(--up)"></span>Champions League ·
       <span class="zone-dot" style="background:#0a84ff"></span>Europa League ·
       <span class="zone-dot" style="background:var(--down)"></span>Abstieg`
    : `<span class="zone-dot" style="background:var(--up)"></span>Aufstieg ·
       <span class="zone-dot" style="background:var(--down)"></span>Abstieg`;
}

function renderTable(table, league) {
  const box = $("#sport-table");
  if (!table || !table.length) {
    box.innerHTML = `<div class="empty-state"><p>Tabelle noch nicht verfügbar.</p></div>`;
    return;
  }
  const total = table.length;
  const head = `<div class="table-row head">
    <span class="pos">#</span><span></span><span class="team">Team</span>
    <span class="num">Sp</span><span class="num">Diff</span><span class="pts">Pkt</span></div>`;
  const rows = table.map((t, i) => {
    const pos = i + 1;
    const diff = t.goalDiff ?? (t.goals - t.opponentGoals);
    const icon = t.teamIconUrl
      ? `<img src="${escapeHtml(t.teamIconUrl)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
      : `<img alt="" style="visibility:hidden">`;
    return `<div class="table-row ${sportZone(league, pos, total)}">
      <span class="pos">${pos}</span>
      ${icon}
      <span class="team">${escapeHtml(t.shortName || t.teamName)}</span>
      <span class="num">${t.matches}</span>
      <span class="num">${diff > 0 ? "+" : ""}${diff}</span>
      <span class="pts">${t.points}</span>
    </div>`;
  }).join("");
  box.innerHTML = head + rows;
  updateSportLegend(league);
}

/* WM-Shortcut auflösen: OpenLigaDB ändert den Bezeichner je Turnier
   (z. B. wm2026). Wir probieren Kandidaten und merken uns den Treffer. */
let wmResolved = null;
async function resolveWmShortcut() {
  if (wmResolved) return wmResolved;
  const year = new Date().getFullYear();
  const candidates = [];
  for (const y of [year, year - 1, year + 1, 2026, 2022]) {
    candidates.push([`wm${y}`, y], [`wc${y}`, y]);
  }
  for (const [shortcut, season] of candidates) {
    try {
      const data = await fetchJson(
        `https://api.openligadb.de/getmatchdata/${shortcut}/${season}`, { timeout: 8000 });
      if (Array.isArray(data) && data.length) {
        wmResolved = { shortcut, season };
        return wmResolved;
      }
    } catch {}
  }
  // Fallback: passende Liga über die Liste finden
  try {
    const leagues = await fetchJson("https://api.openligadb.de/getavailableleagues", { timeout: 9000 });
    const wm = leagues
      .filter((l) => /wm|world\s?cup|weltmeister/i.test(`${l.leagueName} ${l.leagueShortcut}`))
      .sort((a, b) => (b.leagueSeason || 0) - (a.leagueSeason || 0))[0];
    if (wm) {
      wmResolved = { shortcut: wm.leagueShortcut, season: wm.leagueSeason };
      return wmResolved;
    }
  } catch {}
  throw new Error("WM nicht gefunden");
}

async function loadSport(force = false) {
  renderSportLeagues();
  if (!force && state.lastFetch.sport && !isStale("sport")) return;

  const errBox = $("#sport-error");
  errBox.classList.add("hidden");
  const leagueId = state.settings.sportLeague;
  const meta = SPORT_LEAGUES.find((l) => l.id === leagueId) || SPORT_LEAGUES[0];
  const hasTable = meta.table;
  const matchesBox = $("#sport-matches");

  // Tabellenbereich nur für Ligen mit Tabelle zeigen
  $("#sport-table-label").classList.toggle("hidden", !hasTable);
  $("#sport-table").classList.toggle("hidden", !hasTable);

  try {
    let matchUrl, tableUrl;
    if (leagueId === "wm") {
      const { shortcut, season } = await resolveWmShortcut();
      matchUrl = `https://api.openligadb.de/getmatchdata/${shortcut}/${season}`;
    } else {
      const season = currentSeason();
      matchUrl = `https://api.openligadb.de/getmatchdata/${leagueId}`;
      tableUrl = `https://api.openligadb.de/getbltable/${leagueId}/${season}`;
    }

    const [matches, table] = await Promise.all([
      fetchJson(matchUrl, { timeout: 11000 }),
      hasTable ? fetchJson(tableUrl, { timeout: 11000 }) : Promise.resolve(null),
    ]);
    state.lastFetch.sport = Date.now();
    $("#sport-updated").textContent = `Stand ${fmtClock()}`;
    renderMatches(matches, leagueId);
    if (hasTable) renderTable(table, leagueId);
  } catch {
    if (!matchesBox.querySelector(".match-card")) {
      matchesBox.innerHTML = leagueId === "wm"
        ? `<div class="empty-state"><p>Aktuell sind keine WM-Spiele verfügbar.<br>
             Während eines Turniers erscheinen hier die Partien.</p></div>`
        : "";
      if (leagueId !== "wm") errBox.classList.remove("hidden");
    } else {
      toast("Sport konnte nicht aktualisiert werden.");
    }
  }
}

$("#sport-retry").addEventListener("click", () => loadSport(true));

/* ==========================================================================
   VIDEOS — YouTube-Suche & In-App-Player
   ========================================================================== */
const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.private.coffee",
  "https://pipedapi.reallyaweso.me",
];
const INVIDIOUS_INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://iv.melmac.space",
];

const VIDEO_CATEGORIES = [
  ["__trending", "Trends"],
  ["tagesschau nachrichten heute", "Nachrichten"],
  ["musik 2026", "Musik"],
  ["wissenschaft doku deutsch", "Wissen"],
  ["fußball highlights", "Sport"],
  ["technik review deutsch", "Technik"],
];

function videoIdFromUrl(url) {
  const m = String(url || "").match(/[?&]v=([\w-]{6,})/) || String(url || "").match(/\/watch\/([\w-]{6,})/);
  return m ? m[1] : null;
}

const normalizePiped = (v) => ({
  id: videoIdFromUrl(v.url),
  title: v.title,
  thumb: v.thumbnail,
  channel: v.uploaderName || v.uploader || "",
  views: v.views,
  duration: v.duration,
  published: v.uploadedDate || "",
});

const normalizeInvidious = (v) => ({
  id: v.videoId,
  title: v.title,
  thumb: v.videoThumbnails?.find((t) => t.quality === "medium")?.url || v.videoThumbnails?.[0]?.url,
  channel: v.author || "",
  views: v.viewCount,
  duration: v.lengthSeconds,
  published: v.publishedText || "",
});

function firstFulfilled(promises) {
  // Promise.any mit besserer Fehlermeldung
  return new Promise((resolve, reject) => {
    let pending = promises.length;
    if (!pending) return reject(new Error("Keine Instanzen"));
    promises.forEach((p) =>
      p.then(resolve, () => { if (--pending === 0) reject(new Error("Alle Instanzen fehlgeschlagen")); }));
  });
}

/* Instanz des Ersatz-Players; wird auf die zuletzt nachweislich
   erreichbare Invidious-Instanz gesetzt. */
let altEmbedBase = INVIDIOUS_INSTANCES[0];

async function searchVideos(query) {
  const region = state.settings.videoRegion;
  const attempts = [];

  for (const base of PIPED_INSTANCES) {
    const url = query === "__trending"
      ? `${base}/trending?region=${region}`
      : `${base}/search?q=${encodeURIComponent(query)}&filter=videos`;
    attempts.push(fetchWithTimeout(url, 7000).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const list = (Array.isArray(data) ? data : data.items || [])
        .filter((v) => (v.type ? v.type === "stream" : true))
        .map(normalizePiped).filter((v) => v.id);
      if (!list.length) throw new Error("leer");
      return { list, embedBase: null };
    }));
  }

  for (const base of INVIDIOUS_INSTANCES) {
    const url = query === "__trending"
      ? `${base}/api/v1/trending?region=${region}`
      : `${base}/api/v1/search?q=${encodeURIComponent(query)}&type=video&region=${region}`;
    attempts.push(fetchWithTimeout(url, 7000).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const list = (await r.json()).map(normalizeInvidious).filter((v) => v.id);
      if (!list.length) throw new Error("leer");
      return { list, embedBase: base };
    }));
  }

  const { list, embedBase } = await firstFulfilled(attempts);
  if (embedBase) altEmbedBase = embedBase;
  return list;
}

async function loadVideos(force = false) {
  const grid = $("#video-grid");
  if (!force && grid.children.length && !isStale("videos")) return;

  const query = state.videoQuery || "__trending";
  const loader = $("#videos-loader");
  const errBox = $("#videos-error");
  errBox.classList.add("hidden");
  loader.classList.remove("hidden");
  if (force) grid.innerHTML = "";

  try {
    const videos = await searchVideos(query);
    state.lastFetch.videos = Date.now();
    $("#videos-meta").textContent = query === "__trending"
      ? `Trends · ${state.settings.videoRegion}` : `${videos.length} Treffer`;
    grid.innerHTML = videos.slice(0, 24).map((v) => `
      <button class="video-card glass" data-video-id="${escapeHtml(v.id)}"
              data-video-title="${escapeHtml(v.title)}" data-video-channel="${escapeHtml(v.channel)}">
        <span class="thumb-wrap">
          <img class="video-thumb" src="${escapeHtml(v.thumb || "")}" alt="" loading="lazy"
               onerror="this.src='https://i.ytimg.com/vi/${escapeHtml(v.id)}/mqdefault.jpg'">
          ${v.duration > 0 ? `<span class="video-duration">${fmtDuration(v.duration)}</span>` : ""}
        </span>
        <span class="video-body">
          <span class="video-title">${escapeHtml(v.title)}</span>
          <span class="video-channel">${escapeHtml(v.channel)}</span>
          <span class="video-stats">
            ${Number.isFinite(v.views) && v.views >= 0 ? `${nfCompact.format(v.views)} Aufrufe` : ""}
            ${v.published ? ` · ${escapeHtml(v.published)}` : ""}
          </span>
        </span>
      </button>`).join("");

    $$("[data-video-id]", grid).forEach((card) =>
      card.addEventListener("click", () =>
        openPlayer(card.dataset.videoId, card.dataset.videoTitle, card.dataset.videoChannel)));
  } catch {
    $("#videos-error-text").textContent = query === "__trending"
      ? "Trends konnten nicht geladen werden."
      : "Die Suche ist gerade nicht erreichbar. Bitte erneut versuchen.";
    if (!grid.children.length) errBox.classList.remove("hidden");
  } finally {
    loader.classList.add("hidden");
  }
}

let currentVideo = null;

function playerEmbedUrl() {
  const { id, alt } = currentVideo;
  const autoplay = state.settings.autoplay ? 1 : 0;
  // Ersatz-Player (Invidious) für Videos, deren Einbettung YouTube blockiert
  return alt
    ? `${altEmbedBase}/embed/${encodeURIComponent(id)}?autoplay=${autoplay}`
    : `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=${autoplay}&rel=0&playsinline=1`;
}

function mountPlayerFrame() {
  // referrerpolicy="origin": YouTube verlangt einen Referer, sonst Fehler 153.
  $("#player-frame").innerHTML = `
    <iframe src="${playerEmbedUrl()}" referrerpolicy="origin"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
      allowfullscreen title="${escapeHtml(currentVideo.title)}"></iframe>`;
}

function updatePlayerBookmarkBtn() {
  const active = currentVideo && isBookmarked(currentVideo.id);
  const btn = $("#player-bookmark");
  btn.querySelector("span").textContent = active ? "Gemerkt ✓" : "Merken";
  btn.querySelector("span").classList.toggle("bm-active", !!active);
}

function openPlayer(id, title, channel) {
  currentVideo = { id, title, channel, alt: false };
  mountPlayerFrame();
  $("#player-alt").textContent = "Anderer Player";
  $("#player-title").textContent = title;
  $("#player-channel").textContent = channel;
  updatePlayerBookmarkBtn();
  openModal("player");
  bumpStat("videos");
}

$("#player-alt").addEventListener("click", () => {
  if (!currentVideo) return;
  currentVideo.alt = !currentVideo.alt;
  mountPlayerFrame();
  $("#player-alt").textContent = currentVideo.alt ? "Standard-Player" : "Anderer Player";
  toast(currentVideo.alt ? "Ersatz-Player aktiv." : "Standard-Player aktiv.");
});

$("#player-bookmark").addEventListener("click", () => {
  if (!currentVideo) return;
  toggleBookmark({
    type: "video", key: currentVideo.id,
    title: currentVideo.title, sub: currentVideo.channel,
    image: `https://i.ytimg.com/vi/${currentVideo.id}/mqdefault.jpg`,
  });
  updatePlayerBookmarkBtn();
});

/* --- Suche mit Vorschlägen --- */
const searchInput = $("#video-search");
const suggestionsBox = $("#video-suggestions");
let suggestTimer = null;
let suggestFocus = -1;

async function fetchSuggestions(q) {
  // 1) JSONP direkt bei Google (kein CORS nötig)
  try {
    const data = await jsonp(
      `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&hl=de&q=${encodeURIComponent(q)}`);
    if (Array.isArray(data?.[1])) return data[1].map((s) => (Array.isArray(s) ? s[0] : s)).slice(0, 8);
  } catch {}
  // 2) Fallback über Proxy (JSON-Variante)
  try {
    const text = await fetchText(
      `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl=de&q=${encodeURIComponent(q)}`,
      { direct: false, timeout: 5000 });
    const data = JSON.parse(text);
    if (Array.isArray(data?.[1])) return data[1].slice(0, 8);
  } catch {}
  return [];
}

function hideSuggestions() {
  suggestionsBox.classList.add("hidden");
  suggestionsBox.innerHTML = "";
  suggestFocus = -1;
}

function renderSuggestions(list, q) {
  if (!list.length) { hideSuggestions(); return; }
  suggestionsBox.innerHTML = list.map((s) => `
    <button class="suggestion" role="option" data-q="${escapeHtml(s)}">
      <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <span>${escapeHtml(s)}</span>
    </button>`).join("");
  suggestionsBox.classList.remove("hidden");
  suggestFocus = -1;
  $$(".suggestion", suggestionsBox).forEach((btn) =>
    btn.addEventListener("click", () => runVideoSearch(btn.dataset.q)));
  void q;
}

function runVideoSearch(q) {
  hideSuggestions();
  searchInput.value = q;
  state.videoQuery = q.trim();
  $$("#video-chips .chip").forEach((c) => c.classList.remove("active"));
  $("#video-search-clear").classList.toggle("hidden", !state.videoQuery);
  loadVideos(true);
  searchInput.blur();
}

searchInput.addEventListener("input", () => {
  const q = searchInput.value.trim();
  $("#video-search-clear").classList.toggle("hidden", !q);
  clearTimeout(suggestTimer);
  if (q.length < 2) { hideSuggestions(); return; }
  suggestTimer = setTimeout(async () => {
    const list = await fetchSuggestions(q);
    if (searchInput.value.trim() === q) renderSuggestions(list, q);
  }, 220);
});

searchInput.addEventListener("keydown", (e) => {
  const items = $$(".suggestion", suggestionsBox);
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    if (!items.length) return;
    e.preventDefault();
    suggestFocus = (suggestFocus + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items.forEach((el, i) => el.classList.toggle("focused", i === suggestFocus));
  } else if (e.key === "Enter") {
    e.preventDefault();
    const chosen = suggestFocus >= 0 ? items[suggestFocus]?.dataset.q : searchInput.value.trim();
    if (chosen) runVideoSearch(chosen);
  } else if (e.key === "Escape") {
    hideSuggestions();
  }
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-wrap")) hideSuggestions();
});

$("#video-search-clear").addEventListener("click", () => {
  searchInput.value = "";
  state.videoQuery = "";
  hideSuggestions();
  $("#video-search-clear").classList.add("hidden");
  renderVideoChips("__trending");
  loadVideos(true);
});

function renderVideoChips(activeQuery = "__trending") {
  $("#video-chips").innerHTML = VIDEO_CATEGORIES.map(([q, label]) =>
    `<button class="chip ${q === activeQuery ? "active" : ""}" data-q="${escapeHtml(q)}">${label}</button>`).join("");
  $$("#video-chips .chip").forEach((chip) =>
    chip.addEventListener("click", () => {
      state.videoQuery = chip.dataset.q === "__trending" ? "" : chip.dataset.q;
      searchInput.value = "";
      $("#video-search-clear").classList.add("hidden");
      renderVideoChips(chip.dataset.q);
      loadVideos(true);
    }));
}

$("#videos-retry").addEventListener("click", () => loadVideos(true));

/* ==========================================================================
   KONVERTER — eingebetteter Datei-Konverter (isolierter iframe, lazy)
   ========================================================================== */
let converterLoaded = false;

function converterTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function initConverterOnce() {
  if (converterLoaded) return;
  converterLoaded = true;
  const frame = $("#converter-frame");
  frame.addEventListener("load", () => {
    frame.classList.add("ready");
    $("#converter-loader").classList.add("hidden");
    // aktuelles Theme an den Konverter melden
    try { frame.contentWindow.postMessage({ nexusTheme: converterTheme() }, "*"); } catch {}
  });
  frame.src = `converter/converter.html?theme=${converterTheme()}`;
}

/* Theme-Wechsel an den geladenen Konverter weiterreichen */
function syncConverterTheme() {
  if (!converterLoaded) return;
  const frame = $("#converter-frame");
  try { frame.contentWindow?.postMessage({ nexusTheme: converterTheme() }, "*"); } catch {}
}

/* ==========================================================================
   AUFGABEN — mit Schütteln-zum-Rückgängigmachen
   ========================================================================== */
let todoFilter = "all";

function pushUndo(action) {
  state.undoStack.push(action);
  if (state.undoStack.length > 30) state.undoStack.shift();
}

function renderTodos() {
  const list = $("#todo-list");
  const todos = state.todos.filter((t) =>
    todoFilter === "all" ? true : todoFilter === "done" ? t.done : !t.done);

  list.innerHTML = todos.map((t) => `
    <li class="todo-item glass ${t.done ? "done" : ""}" data-id="${t.id}">
      <button class="todo-check" aria-label="${t.done ? "Als offen markieren" : "Als erledigt markieren"}">
        <svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>
      </button>
      <span class="todo-label">${escapeHtml(t.text)}</span>
      <span class="todo-date">${timeAgo(t.created)}</span>
      <button class="icon-btn small todo-del" aria-label="Löschen">
        <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
      </button>
    </li>`).join("") ||
    `<li class="empty-state">${todoFilter === "all"
      ? "Noch keine Aufgaben. Leg los!" : "Nichts in dieser Ansicht."}</li>`;

  $$(".todo-item", list).forEach((li) => {
    const id = li.dataset.id;
    $(".todo-check", li).addEventListener("click", () => toggleTodo(id));
    $(".todo-del", li).addEventListener("click", () => deleteTodo(id));
  });

  // Fortschritt
  const total = state.todos.length;
  const done = state.todos.filter((t) => t.done).length;
  const pct = total ? done / total : 0;
  $("#todo-ring").style.strokeDashoffset = String(119.4 * (1 - pct));
  $("#todo-progress-label").textContent = total
    ? `${done} von ${total} erledigt` : "Keine Aufgaben";
  $("#todo-progress-sub").textContent = total
    ? (done === total ? "Alles geschafft — stark! 🎉" : `${total - done} noch offen`)
    : "Füge deine erste Aufgabe hinzu";
  $("#todos-meta").textContent = total ? `${total} gesamt` : "";
}

$("#todo-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("#todo-text");
  const text = input.value.trim();
  if (!text) return;
  const todo = { id: uid(), text, done: false, created: Date.now() };
  state.todos.unshift(todo);
  pushUndo({ type: "add", id: todo.id });
  saveTodos();
  input.value = "";
  renderTodos();
});

function toggleTodo(id) {
  const t = state.todos.find((t) => t.id === id);
  if (!t) return;
  t.done = !t.done;
  if (t.done) bumpStat("done");
  pushUndo({ type: "toggle", id });
  saveTodos();
  renderTodos();
}

function deleteTodo(id) {
  const index = state.todos.findIndex((t) => t.id === id);
  if (index === -1) return;
  const [todo] = state.todos.splice(index, 1);
  pushUndo({ type: "delete", todo, index });
  saveTodos();
  renderTodos();
}

$("#todo-clear-done").addEventListener("click", () => {
  const removed = state.todos.filter((t) => t.done);
  if (!removed.length) { toast("Keine erledigten Aufgaben."); return; }
  state.todos = state.todos.filter((t) => !t.done);
  pushUndo({ type: "clearDone", todos: removed });
  saveTodos();
  renderTodos();
  toast(`${removed.length} erledigte Aufgabe${removed.length > 1 ? "n" : ""} gelöscht — schütteln für Rückgängig.`);
});

$$("#todo-filters .chip[data-filter]").forEach((chip) =>
  chip.addEventListener("click", () => {
    todoFilter = chip.dataset.filter;
    $$("#todo-filters .chip[data-filter]").forEach((c) =>
      c.classList.toggle("active", c === chip));
    renderTodos();
  }));

function undoLastTodoAction() {
  const action = state.undoStack.pop();
  if (!action) { toast("Nichts zum Rückgängigmachen."); return; }
  switch (action.type) {
    case "add":
      state.todos = state.todos.filter((t) => t.id !== action.id);
      break;
    case "toggle": {
      const t = state.todos.find((t) => t.id === action.id);
      if (t) t.done = !t.done;
      break;
    }
    case "delete":
      state.todos.splice(Math.min(action.index, state.todos.length), 0, action.todo);
      break;
    case "clearDone":
      state.todos = [...action.todos, ...state.todos];
      break;
  }
  saveTodos();
  renderTodos();
  if (navigator.vibrate) navigator.vibrate(60);
  toast("↩︎ Rückgängig gemacht");
}

/* --- Shake-Erkennung --- */
let lastShakeAt = 0;
let lastAccel = null;

function shakeThreshold() {
  return { low: 25, normal: 17, high: 12 }[state.settings.shakeSensitivity] || 17;
}

function onDeviceMotion(e) {
  if (!state.settings.shakeUndo) return;
  const a = e.accelerationIncludingGravity;
  if (!a || a.x == null) return;
  if (lastAccel) {
    const delta = Math.abs(a.x - lastAccel.x) + Math.abs(a.y - lastAccel.y) + Math.abs(a.z - lastAccel.z);
    const now = Date.now();
    if (delta > shakeThreshold() && now - lastShakeAt > 1200) {
      lastShakeAt = now;
      undoLastTodoAction();
    }
  }
  lastAccel = { x: a.x, y: a.y, z: a.z };
}

function initShake() {
  const needsPermission = typeof DeviceMotionEvent !== "undefined" &&
    typeof DeviceMotionEvent.requestPermission === "function";
  if (needsPermission) {
    // iOS: Bewegungssensor erst nach Nutzer-Geste erlaubt
    const btn = $("#btn-enable-motion");
    btn.classList.remove("hidden");
    $("#shake-hint-sub").textContent =
      "Tippe auf „Aktivieren“, um Schütteln-zum-Rückgängigmachen zu erlauben.";
    btn.addEventListener("click", async () => {
      try {
        const res = await DeviceMotionEvent.requestPermission();
        if (res === "granted") {
          window.addEventListener("devicemotion", onDeviceMotion);
          btn.classList.add("hidden");
          $("#shake-hint-sub").textContent = "Schüttle dein Gerät, um die letzte Aktion rückgängig zu machen.";
          toast("Schütteln aktiviert!");
        } else {
          toast("Zugriff auf Bewegungssensor abgelehnt.");
        }
      } catch { toast("Bewegungssensor nicht verfügbar."); }
    });
  } else if ("DeviceMotionEvent" in window) {
    window.addEventListener("devicemotion", onDeviceMotion);
  }
}

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" &&
      state.activeTab === "todos" && !e.target.closest("input, textarea")) {
    e.preventDefault();
    undoLastTodoAction();
  }
});

/* ==========================================================================
   PROFIL & KONTO (lokal)
   ========================================================================== */
let authMode = "login";

const getUsers = () => LS.get("nexus_users", {});
const currentUser = () => (state.session ? getUsers()[state.session] : null);

$$(".auth-tab").forEach((tab) =>
  tab.addEventListener("click", () => {
    authMode = tab.dataset.authtab;
    $$(".auth-tab").forEach((t) => t.classList.toggle("active", t === tab));
    $("#field-name").classList.toggle("hidden", authMode === "login");
    $("#auth-submit").textContent = authMode === "login" ? "Anmelden" : "Konto erstellen";
    $("#auth-password").autocomplete = authMode === "login" ? "current-password" : "new-password";
    $("#auth-error").classList.add("hidden");
  }));

function showAuthError(msg) {
  const el = $("#auth-error");
  el.textContent = msg;
  el.classList.remove("hidden");
}

$("#auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#auth-email").value.trim().toLowerCase();
  const password = $("#auth-password").value;
  const name = $("#auth-name").value.trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showAuthError("Bitte gib eine gültige E-Mail-Adresse ein.");
  if (password.length < 6) return showAuthError("Das Passwort braucht mindestens 6 Zeichen.");

  const users = getUsers();
  const hash = await sha256(`nexus:${email}:${password}`);

  if (authMode === "register") {
    if (users[email]) return showAuthError("Für diese E-Mail existiert bereits ein Konto.");
    if (!name) return showAuthError("Bitte gib deinen Namen ein.");
    users[email] = { name, email, hash, created: Date.now() };
    LS.set("nexus_users", users);
    toast(`Willkommen, ${name}!`);
  } else {
    const user = users[email];
    if (!user || user.hash !== hash) return showAuthError("E-Mail oder Passwort ist falsch.");
    toast(`Schön, dass du wieder da bist, ${user.name}!`);
  }

  state.session = email;
  LS.set("nexus_session", email);

  // Gespeicherte Einstellungen des Nutzers übernehmen
  const userSettings = LS.get(`nexus_settings_${email}`, null);
  if (userSettings) {
    state.settings = { ...DEFAULT_SETTINGS, ...userSettings };
    state.settings.sources = { ...DEFAULT_SETTINGS.sources, ...state.settings.sources };
    LS.set("nexus_settings", state.settings);
    applyAppearance();
    syncSettingsUi();
    renderNews();
  } else {
    saveSettings();
  }

  $("#auth-form").reset();
  $("#auth-error").classList.add("hidden");
  renderProfile();
});

$("#profile-logout").addEventListener("click", () => {
  state.session = null;
  LS.remove("nexus_session");
  toast("Abgemeldet.");
  renderProfile();
});

$("#profile-open-settings").addEventListener("click", () => openModal("settings"));

function exportAllData() {
  downloadJson("nexus-daten.json", {
    exportiert: new Date().toISOString(),
    profil: currentUser() ? { name: currentUser().name, email: currentUser().email } : null,
    einstellungen: state.settings,
    aufgaben: state.todos,
    merkliste: state.bookmarks,
    statistiken: state.stats,
  });
  toast("Export gestartet.");
}
$("#profile-export").addEventListener("click", exportAllData);
$("#settings-export").addEventListener("click", exportAllData);

function renderProfileStats() {
  $("#stat-read").textContent = state.stats.read || 0;
  $("#stat-videos").textContent = state.stats.videos || 0;
  $("#stat-done").textContent = state.stats.done || 0;
}

function renderProfile() {
  const user = currentUser();
  $("#auth-box").classList.toggle("hidden", !!user);
  $("#profile-box").classList.toggle("hidden", !user);

  const initial = user ? user.name.trim().charAt(0).toUpperCase() : "?";
  $("#avatar-label").textContent = initial;

  if (user) {
    $("#profile-avatar").textContent = initial;
    $("#profile-name").textContent = user.name;
    $("#profile-email").textContent = user.email;
    $("#profile-since").textContent =
      `Dabei seit ${new Date(user.created).toLocaleDateString("de-DE", { month: "long", year: "numeric" })}`;
    $("#header-sub").textContent = `Hallo, ${user.name.split(" ")[0]}`;
  } else {
    $("#header-sub").textContent = "News · Sport · Videos";
  }
  renderProfileStats();
}

/* ==========================================================================
   EINSTELLUNGEN
   ========================================================================== */
$("#btn-settings").addEventListener("click", () => openModal("settings"));

function bindSegmented(id, get, set) {
  const seg = $(id);
  seg.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-value]");
    if (!btn) return;
    set(btn.dataset.value);
    $$("button", seg).forEach((b) => b.classList.toggle("active", b === btn));
  });
  return () => $$("button", seg).forEach((b) =>
    b.classList.toggle("active", b.dataset.value === String(get())));
}

const segSyncs = [];

segSyncs.push(bindSegmented("#seg-theme",
  () => state.settings.theme,
  (v) => { state.settings.theme = v; saveSettings(); applyAppearance(); }));

segSyncs.push(bindSegmented("#seg-region",
  () => state.settings.videoRegion,
  (v) => { state.settings.videoRegion = v; saveSettings(); state.lastFetch.videos = 0; }));

segSyncs.push(bindSegmented("#seg-stale",
  () => state.settings.staleMinutes,
  (v) => { state.settings.staleMinutes = Number(v); saveSettings(); }));

segSyncs.push(bindSegmented("#seg-shake-sens",
  () => state.settings.shakeSensitivity,
  (v) => { state.settings.shakeSensitivity = v; saveSettings(); }));

$("#accent-row").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-accent]");
  if (!btn) return;
  state.settings.accent = btn.dataset.accent;
  saveSettings();
  applyAppearance();
  $$("#accent-row .accent-dot").forEach((d) => d.classList.toggle("active", d === btn));
});

function bindSwitch(id, key, onChange) {
  const input = $(id);
  input.addEventListener("change", () => {
    state.settings[key] = input.checked;
    saveSettings();
    onChange?.();
  });
  return () => { input.checked = !!state.settings[key]; };
}

const switchSyncs = [
  bindSwitch("#set-reduce-motion", "reduceMotion", applyAppearance),
  bindSwitch("#set-images", "showImages", renderNews),
  bindSwitch("#set-compact", "compactNews", renderNews),
  bindSwitch("#set-autoplay", "autoplay"),
  bindSwitch("#set-autorefresh", "autoRefresh"),
  bindSwitch("#set-shake", "shakeUndo"),
  bindSwitch("#set-weather-show", "weatherShow", () => { weatherLoadedAt = 0; loadWeather(true); }),
];

/* Wetter-Ort ändern (mit Geocoding-Suche) */
$("#set-weather-city").addEventListener("change", async () => {
  const q = $("#set-weather-city").value.trim();
  if (!q) return;
  try {
    const hit = await setWeatherCity(q);
    $("#set-weather-city").value = hit.name;
    toast(`Wetter-Ort: ${hit.name}${hit.country ? ", " + hit.country : ""}`);
  } catch {
    toast("Ort nicht gefunden — bitte anders schreiben.");
  }
});

function renderSourceToggles() {
  const box = $("#settings-sources");
  box.innerHTML = Object.entries(NEWS_SOURCES).map(([key, src]) => `
    <label class="list-row">
      <span>${escapeHtml(src.name)}</span>
      <input type="checkbox" class="switch" data-source-key="${key}"
        ${state.settings.sources[key] ? "checked" : ""}>
    </label>`).join("");
  $$("[data-source-key]", box).forEach((input) =>
    input.addEventListener("change", () => {
      const next = { ...state.settings.sources, [input.dataset.sourceKey]: input.checked };
      if (!Object.values(next).some(Boolean)) {
        input.checked = true;
        toast("Mindestens eine Quelle muss aktiv bleiben.");
        return;
      }
      state.settings.sources = next;
      saveSettings();
      state.newsFilter = "all";
      loadNews(true);
    }));
}

function renderTopics() {
  $("#topic-chips").innerHTML = state.settings.topics.map((t, i) => `
    <span class="topic-chip">${escapeHtml(t)}
      <button data-topic-index="${i}" aria-label="Entfernen">✕</button>
    </span>`).join("");
  $$("[data-topic-index]").forEach((btn) =>
    btn.addEventListener("click", () => {
      state.settings.topics.splice(Number(btn.dataset.topicIndex), 1);
      saveSettings();
      renderTopics();
      renderNews();
    }));
}

$("#topic-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("#topic-input");
  const topic = input.value.trim();
  if (!topic) return;
  if (state.settings.topics.some((t) => t.toLowerCase() === topic.toLowerCase())) {
    toast("Dieses Thema hast du schon."); return;
  }
  if (state.settings.topics.length >= 12) { toast("Maximal 12 Themen."); return; }
  state.settings.topics.push(topic);
  saveSettings();
  input.value = "";
  renderTopics();
  renderNews();
  toast(`Thema „${topic}“ hinzugefügt.`);
});

$("#settings-reset").addEventListener("click", () => {
  if (!confirm("Wirklich alles zurücksetzen? Konten, Aufgaben und Einstellungen werden gelöscht.")) return;
  ["nexus_settings", "nexus_session", "nexus_todos", "nexus_stats", "nexus_users",
    "nexus_bookmarks", "nexus_chat", "nexus_quiz"]
    .forEach((k) => LS.remove(k));
  Object.keys(localStorage)
    .filter((k) => k.startsWith("nexus_settings_"))
    .forEach((k) => LS.remove(k));
  location.reload();
});

function syncSettingsUi() {
  segSyncs.forEach((fn) => fn());
  switchSyncs.forEach((fn) => fn());
  $$("#accent-row .accent-dot").forEach((d) =>
    d.classList.toggle("active", d.dataset.accent === state.settings.accent));
  $("#set-weather-city").value = state.settings.weatherPlace?.name || "";
  renderSourceToggles();
  renderTopics();
}

/* ==========================================================================
   Boot
   ========================================================================== */
function boot() {
  applyAppearance();
  syncSettingsUi();
  renderProfile();
  renderTodos();
  renderBookmarks();
  renderVideoChips();
  initShake();
  loadNews(true);           // beim Öffnen immer frisch laden
  loadSport(true);
  loadVideos(true);
}

boot();
