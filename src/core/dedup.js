import { normKey } from '../util.js';

/** Dedup key: 2GIS id when present, else normalized name + address. */
export function dedupKey(rec) {
  if (rec['2gis_id']) return `id:${rec['2gis_id']}`;
  return `na:${normKey(rec.name)}|${normKey(rec.address)}`;
}

/**
 * Deduplicate records (first-wins). Later duplicates enrich the kept record by
 * filling in any fields the first occurrence was missing (e.g. a branch that
 * has a website when the first one didn't). Returns { unique, removed }.
 */
export function dedupeRecords(records) {
  const map = new Map();
  let removed = 0;

  for (const rec of records) {
    const k = dedupKey(rec);
    const keep = map.get(k);
    if (!keep) {
      map.set(k, rec);
      continue;
    }
    removed++;
    for (const f of ['website', 'rating', 'reviews_count', 'schedule', 'address', 'url']) {
      if ((keep[f] == null || keep[f] === '') && rec[f] != null && rec[f] !== '') keep[f] = rec[f];
    }
    if ((!keep.phones || !keep.phones.length) && rec.phones?.length) keep.phones = rec.phones;
  }

  return { unique: [...map.values()], removed };
}
