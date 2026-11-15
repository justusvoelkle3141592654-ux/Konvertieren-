// Zentrale, reine Konstanten (keine Browser-APIs), damit sie auch im Worker
// und in Node-Tests verwendbar sind.

export const APP_NAME = 'Minecraft 2';
export const APP_VERSION = '0.1.0';

export const CHUNK_SIZE = 16;
export const WORLD_MIN_Y = -64;
export const WORLD_MAX_Y = 319;
export const WORLD_HEIGHT = WORLD_MAX_Y - WORLD_MIN_Y + 1; // 384
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT;
export const SEA_LEVEL = 62;

export const TPS = 20;                 // Spiel-Ticks pro Sekunde
export const TICK_SECONDS = 1 / TPS;
export const DAY_LENGTH_TICKS = 24000; // ein kompletter Tag = 20 Minuten

export const MAX_STACK = 64;
export const AUTOSAVE_INTERVAL_MS = 60_000;

export const RENDER_DISTANCE_MIN = 2;
export const RENDER_DISTANCE_MAX = 16;

export const DIFFICULTIES = ['peaceful', 'easy', 'normal', 'hard'];
export const DIFFICULTY_LABELS = {
  peaceful: 'Friedlich',
  easy: 'Leicht',
  normal: 'Normal',
  hard: 'Schwer',
};
export const GAME_MODES = ['survival', 'creative'];
export const GAME_MODE_LABELS = { survival: 'Überleben', creative: 'Kreativ' };

export const DB_NAME = 'minecraft-2';
export const DB_VERSION = 1;
