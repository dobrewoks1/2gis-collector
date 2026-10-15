import fs from 'node:fs';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Filesystem-safe slug that keeps Cyrillic letters readable in folder names. */
export function slugify(s) {
  return (
    String(s)
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'x'
  );
}

/** Normalize a string for dedup comparison (lowercase, no punctuation, ё->е). */
export function normKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export const nowIso = () => new Date().toISOString();
export const tsForFile = () => new Date().toISOString().replace(/[:.]/g, '-');
