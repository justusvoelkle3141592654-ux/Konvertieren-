// Zufällige gelbe Sprüche unter dem Titel.
export const SPLASHES = [
  'Fast wie das Original!',
  'Eine Welt voller Möglichkeiten!',
  'Block für Block!',
  'Willkommen zurück!',
  'Kein Creeper in Sicht!',
  'Grabe tiefer!',
  'Bitte nicht in die Lava!',
  'Holz ist das neue Gold!',
  'Hol dir ein Schwert!',
  'Jetzt mit Nether!',
  'Der Drache wartet!',
  'Lass dich nicht fressen!',
];

export function randomSplash(random = Math.random) {
  return SPLASHES[Math.floor(random() * SPLASHES.length)];
}
