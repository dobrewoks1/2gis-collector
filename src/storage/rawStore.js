import fs from 'node:fs';
import path from 'node:path';
import { paths } from '../config.js';
import { slugify, tsForFile, ensureDir } from '../util.js';

/** Persist one raw API response under data/raw/<region>/<niche>/. Returns a
 *  project-relative path stored on each record for traceability. */
export function saveRaw(regionName, niche, point, page, body) {
  const dir = path.join(paths.dataRaw, slugify(regionName), slugify(niche));
  ensureDir(dir);
  const file = path.join(dir, `${slugify(point.name)}_page-${page}_${tsForFile()}.json`);
  fs.writeFileSync(file, JSON.stringify(body, null, 2), 'utf8');
  return path.relative(paths.root, file).replace(/\\/g, '/');
}
