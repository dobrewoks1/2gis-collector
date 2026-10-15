import { apiGet } from './client.js';
import { config } from '../config.js';

/**
 * One page of /3.0/items. `point` is {lat, lon}; the 2GIS `point` param is
 * emitted as "lon,lat" (that order is required). Either rubricId or q must be
 * provided; passing point+radius geo-limits results within the region.
 */
export async function searchPlacesPage({ regionId, rubricId, q, point, radius, page, pageSize }) {
  const params = {
    page,
    page_size: pageSize || config.pageSize,
    fields: config.fields,
  };
  if (regionId) params.region_id = regionId;
  if (rubricId) params.rubric_id = rubricId;
  if (q) params.q = q;
  if (point) {
    params.point = `${point.lon},${point.lat}`; // 2GIS order = lon,lat
    params.radius = radius;
  }

  const body = await apiGet('/3.0/items', params);
  return {
    items: body?.result?.items || [],
    total: body?.result?.total ?? 0,
    raw: body,
  };
}
