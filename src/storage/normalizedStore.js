import fs from 'node:fs';
import path from 'node:path';
import { paths } from '../config.js';
import { slugify, ensureDir } from '../util.js';

export function saveNormalizedNiche(niche, records) {
  ensureDir(paths.dataNormalized);
  const file = path.join(paths.dataNormalized, `${slugify(niche)}.json`);
  fs.writeFileSync(file, JSON.stringify(records, null, 2), 'utf8');
  return file;
}

export function saveNormalizedAll(records) {
  ensureDir(paths.dataNormalized);
  const file = path.join(paths.dataNormalized, 'all_firms.json');
  fs.writeFileSync(file, JSON.stringify(records, null, 2), 'utf8');
  return file;
}
