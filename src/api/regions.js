import { apiGet } from './client.js';
import { log } from '../logger.js';

/** Resolve a region/city name to its 2GIS region_id via /2.0/region/search. */
export async function resolveRegion(name) {
  const body = await apiGet('/2.0/region/search', { q: name });
  const items = body?.result?.items || [];
  if (!items.length) throw new Error(`Region not found for "${name}"`);
  const r = items[0];
  log.info(`[region] "${name}" -> id=${r.id} name="${r.name}"`);
  return { id: String(r.id), name: r.name };
}
