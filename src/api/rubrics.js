import { apiGet } from './client.js';
import { log } from '../logger.js';
import { normKey } from '../util.js';

// Non-service categories to keep out of a niche's rubric set (goods/supply, not firms).
const EXCLUDE_RE = /^(товар|мебель|оборудован|магазин|аренд|прокат|производств|поставк|запчаст|расходн|опт)/u;

// Crude Russian stemmer: drop a common inflectional ending for loose matching.
function stem(w) {
  return normKey(w).replace(/(ами|ями|ов|ах|ий|ый|ая|яя|ое|ее|ы|и|а|я|у|е|ой|ей|ю)$/u, '');
}

/**
 * Resolve a niche name to a SET of relevant rubrics via /2.0/catalog/rubric/search.
 *
 * A niche rarely maps to one rubric: "стоматологии" splits into state polyclinics
 * (rubric 226, ~23 firms) AND "Частные стоматологии" (222) — querying only the top
 * hit would miss most dentists. So we take the top-ranked hit as the primary rubric
 * and add any sibling results that share a query stem (excluding goods categories
 * like "Товары для стоматологий"). The 2GIS Places API accepts these ids
 * comma-separated in one request.
 *
 * Returns { primaryId, primaryName, ids[], names[] }, or null (caller falls back
 * to a free-text q search).
 */
export async function resolveRubricSet(niche, regionId) {
  let items = [];
  try {
    const body = await apiGet('/2.0/catalog/rubric/search', { q: niche, region_id: regionId });
    items = body?.result?.items || [];
  } catch (e) {
    if (e.fatal) throw e;
    log.warn(`[rubric] search failed for "${niche}": ${e.message}`);
  }
  if (!items.length) {
    log.warn(`[rubric] no rubric for "${niche}" -> using free-text q fallback`);
    return null;
  }

  const nk = normKey(niche);
  const stems = nk.split(' ').map(stem).filter((s) => s.length >= 4);

  const exact = items.find((r) => normKey(r.name) === nk);
  const primary = exact || items[0];

  // Always include the primary; add stem-sharing siblings, skipping goods categories.
  const chosen = new Map([[String(primary.id), primary.name]]);
  for (const r of items) {
    if (chosen.size >= 6) break;
    const rn = normKey(r.name);
    if (EXCLUDE_RE.test(rn)) continue;
    if (stems.some((s) => rn.includes(s))) chosen.set(String(r.id), r.name);
  }

  const ids = [...chosen.keys()];
  const names = [...chosen.values()];
  log.info(`[rubric] "${niche}" -> primary=${primary.id} "${primary.name}" (${exact ? 'exact' : 'top-hit'}); querying ${ids.length} rubric(s): ${names.join(' | ')}`);
  return { primaryId: String(primary.id), primaryName: primary.name, ids, names };
}
