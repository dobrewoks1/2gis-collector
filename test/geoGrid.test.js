import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  centroid,
  generateGrid,
  loadPoints,
  metersToDegLat,
  metersToDegLon,
} from '../src/core/geoGrid.js';

test('generateGrid: square grid around the center, step = 1.4 × radius', () => {
  // 111.32 km per degree of latitude; a degree of longitude shrinks with cos(lat)
  assert.equal(metersToDegLat(111320), 1);
  assert.ok(Math.abs(metersToDegLon(111320, 60) - 2) < 1e-9);

  const center = { lat: 55, lon: 73 };
  const pts = generateGrid(center, { halfWidthM: 2800, halfHeightM: 2800, radiusM: 1000 });

  // step 1400 m over ±2800 m -> 5 rows × 5 columns
  assert.equal(pts.length, 25);
  assert.equal(pts[0].name, 'grid-r0c0');
  assert.equal(pts[24].name, 'grid-r4c4');
  assert.ok(pts.every((p) => p.radius === 1000 && p.generated === true));

  // the middle point is the center itself, the grid is symmetric around it
  assert.deepEqual([pts[12].lat, pts[12].lon], [55, 73]);
  const c = centroid(pts);
  assert.ok(Math.abs(c.lat - 55) < 1e-9 && Math.abs(c.lon - 73) < 1e-9);

  // neighbouring rows are 1400 m apart
  assert.ok(Math.abs(pts[5].lat - pts[0].lat - metersToDegLat(1400)) < 2e-6);
});

test('loadPoints: reads {points: [...]}, skips invalid rows, default radius 2000 m', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'twogis-points-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'points.json');

  fs.writeFileSync(
    file,
    JSON.stringify({
      points: [
        { name: 'A', lat: 55, lon: 73, radius: 3000 },
        { lat: '55.1', lon: '73.1' },
        { name: 'broken', lat: 'x', lon: 73 },
      ],
    })
  );
  assert.deepEqual(loadPoints(file), [
    { name: 'A', lat: 55, lon: 73, radius: 3000 },
    { name: 'point-2', lat: 55.1, lon: 73.1, radius: 2000 },
  ]);

  fs.writeFileSync(file, '[]');
  assert.throws(() => loadPoints(file), /No valid points/);
});
