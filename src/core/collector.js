import { resolveRubricSet } from '../api/rubrics.js';
import { searchPlacesPage } from '../api/places.js';
import { normalizeItem } from './normalize.js';
import { dedupKey, dedupeRecords } from './dedup.js';
import { saveRaw } from '../storage/rawStore.js';
import { generateGrid, centroid } from './geoGrid.js';
import { config } from '../config.js';
import { log } from '../logger.js';

/**
 * Collect one niche. Two strategies:
 *  - geo-split (default): sweep hand-picked points + auto-grid, paging each until
 *    the target is reached — needed when the key has a per-search page cap.
 *  - region-wide (regionWide=true): page the whole region_id per niche in one
 *    stream — faster and complete when the key has no per-search cap.
 */
export async function collectNiche({ niche, region, filePoints, regionWide = false }) {
  const rubricSet = await resolveRubricSet(niche, region.id);
  const rubricParam = rubricSet ? rubricSet.ids.join(',') : null;
  const q = rubricSet ? null : niche; // free-text fallback when no rubric matched
  const fallbackRubricId = rubricSet?.primaryId || null;

  const seen = new Set();
  const rawRecords = [];
  const pointStats = new Map();
  let apiCalls = 0;
  let pointsUsed = 0;
  const target = region.target;

  // Page one search stream (a point+radius, or region-wide when point is null).
  const runQuery = async (point) => {
    pointsUsed++;
    const label = point ? point.name : 'вся область';
    const before = seen.size;
    let contributed = 0;

    for (let page = 1; page <= config.maxPagesPerPoint; page++) {
      let resp;
      try {
        resp = await searchPlacesPage({
          regionId: region.id,
          rubricId: rubricParam,
          q,
          point: point || undefined,
          radius: point ? point.radius : undefined,
          page,
          pageSize: config.pageSize,
        });
        apiCalls++;
      } catch (e) {
        if (e.fatal) throw e;
        log.warn(`[collect:${niche}] ${label} p${page} skipped: ${e.message}`);
        break;
      }

      if (!resp.items.length) break;
      const rawPath = saveRaw(region.name, niche, { name: label }, page, resp.raw);
      for (const item of resp.items) {
        const rec = normalizeItem(item, {
          niche,
          fallbackRubricId,
          regionName: region.name,
          regionId: region.id,
          rawPath,
          point: { name: label },
        });
        rawRecords.push(rec);
        const k = dedupKey(rec);
        if (!seen.has(k)) {
          seen.add(k);
          contributed++;
        }
      }

      if (resp.items.length < config.pageSize) break; // stream exhausted
      if (seen.size >= target) break;
    }

    pointStats.set(label, (pointStats.get(label) || 0) + contributed);
    log.info(`[collect:${niche}] ${label}: +${seen.size - before} unique (total ${seen.size}/${target})`);
    return seen.size;
  };

  if (regionWide) {
    await runQuery(null);
  } else {
    for (const p of filePoints) {
      if (seen.size >= target) break;
      await runQuery(p);
    }
    if (seen.size < target && config.autoGrid && filePoints.length) {
      const grid = generateGrid(centroid(filePoints), {
        halfWidthM: config.gridHalfWidthM,
        halfHeightM: config.gridHalfHeightM,
        radiusM: config.gridRadiusM,
      }).slice(0, config.maxGridPoints);
      log.info(`[collect:${niche}] under target (${seen.size}/${target}); expanding with up to ${grid.length} grid points`);
      for (const p of grid) {
        if (seen.size >= target) break;
        await runQuery(p);
      }
    }
  }

  const { unique, removed } = dedupeRecords(rawRecords);
  const topPoints = [...pointStats.entries()]
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  const result = {
    niche,
    rubric_id: rubricSet?.primaryId || null,
    rubric_name: rubricSet?.primaryName || null,
    rubric_ids: rubricSet?.ids || [],
    rubric_names: rubricSet?.names || [],
    used_q_fallback: !rubricSet,
    found: unique.length,
    target,
    target_met: unique.length >= target,
    duplicates_removed: removed,
    api_calls: apiCalls,
    points_used: pointsUsed,
    top_points: topPoints.slice(0, 10),
    records: unique,
  };
  log.info(
    `[collect:${niche}] DONE found=${unique.length}/${target} met=${result.target_met} dupes=${removed} calls=${apiCalls}`
  );
  return result;
}
