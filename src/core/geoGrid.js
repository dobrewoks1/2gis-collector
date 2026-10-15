import fs from 'node:fs';
import { log } from '../logger.js';

const M_PER_DEG_LAT = 111320;

export const metersToDegLat = (m) => m / M_PER_DEG_LAT;
export const metersToDegLon = (m, lat) => m / (M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));

/** Load search points from a JSON file (array, or object with a `points` key). */
export function loadPoints(file) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  const arr = Array.isArray(parsed) ? parsed : parsed.points || [];
  const points = arr
    .map((p, i) => ({
      name: p.name || `point-${i + 1}`,
      lat: Number(p.lat),
      lon: Number(p.lon),
      radius: Number(p.radius) || 2000,
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (!points.length) throw new Error(`No valid points found in ${file}`);
  return points;
}

export function centroid(points) {
  const n = points.length;
  return {
    lat: points.reduce((s, p) => s + p.lat, 0) / n,
    lon: points.reduce((s, p) => s + p.lon, 0) / n,
  };
}

/**
 * Square grid of points around `center` covering ±halfWidth/±halfHeight meters.
 * Step = 1.4*radius so radius-R circles tile the area with slight overlap.
 */
export function generateGrid(center, { halfWidthM, halfHeightM, radiusM }) {
  const step = 1.4 * radiusM;
  const stepLat = metersToDegLat(step);
  const stepLon = metersToDegLon(step, center.lat);
  const halfLat = metersToDegLat(halfHeightM);
  const halfLon = metersToDegLon(halfWidthM, center.lat);

  const pts = [];
  let row = 0;
  for (let dLat = -halfLat; dLat <= halfLat + 1e-9; dLat += stepLat) {
    let col = 0;
    for (let dLon = -halfLon; dLon <= halfLon + 1e-9; dLon += stepLon) {
      pts.push({
        name: `grid-r${row}c${col}`,
        lat: +(center.lat + dLat).toFixed(6),
        lon: +(center.lon + dLon).toFixed(6),
        radius: radiusM,
        generated: true,
      });
      col++;
    }
    row++;
  }
  log.info(`[grid] generated ${pts.length} grid points (step=${Math.round(step)}m, radius=${radiusM}m)`);
  return pts;
}
