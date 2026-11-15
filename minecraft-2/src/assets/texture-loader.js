// Lädt lokal extrahierte Originaltexturen (local-assets/, siehe scripts/setup-textures.js).
// Fehlende Dateien werden still als null gemeldet; der Atlas verwendet dann Platzhalter.

const ASSET_BASE = `${import.meta.env.BASE_URL}local-assets/assets/minecraft/textures/`;

let localAvailability = null;

/** Prüft einmalig, ob die lokalen Assets vorhanden sind (manifest.json entsteht beim Setup). */
export function hasLocalAssets() {
  if (!localAvailability) {
    localAvailability = fetch(`${import.meta.env.BASE_URL}local-assets/manifest.json`)
      .then((response) => response.ok)
      .catch(() => false);
  }
  return localAvailability;
}

/** Lädt eine Textur wie "block/stone" als ImageBitmap oder null. */
export async function fetchLocalImage(name) {
  if (!(await hasLocalAssets())) return null;
  try {
    const response = await fetch(`${ASSET_BASE}${name}.png`);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

/** Lädt die zugehörige .mcmeta-Datei (Animationsinfos) oder null. */
export async function fetchMcmeta(name) {
  try {
    const response = await fetch(`${ASSET_BASE}${name}.png.mcmeta`);
    if (!response.ok) return null;
    const json = await response.json();
    return json && typeof json === 'object' ? json : null;
  } catch {
    return null;
  }
}
