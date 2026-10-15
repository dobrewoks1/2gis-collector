import fs from 'node:fs';
import path from 'node:path';
import { ensureDir } from '../util.js';
import { log } from '../logger.js';

/**
 * Write records to a fresh SQLite database using Node's built-in node:sqlite
 * (no native build required). Needs Node >= 22.5; on older runtimes we skip
 * SQLite and let CSV + JSON stand. DB recreated each run for idempotent output.
 * Returns { file, count, skipped? }.
 */
export async function writeSqlite(records, file) {
  let DatabaseSync;
  try {
    ({ DatabaseSync } = await import('node:sqlite'));
  } catch {
    log.warn('[sqlite] node:sqlite unavailable (requires Node >= 22.5). Skipping SQLite export; CSV + JSON still written.');
    return { file: null, count: 0, skipped: true };
  }

  ensureDir(path.dirname(file));
  for (const f of [file, `${file}-wal`, `${file}-shm`, `${file}-journal`]) {
    try {
      if (fs.existsSync(f)) fs.rmSync(f);
    } catch {
      /* ignore locked leftovers */
    }
  }

  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE firms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      niche TEXT, rubric_id TEXT, rubric_name TEXT, region_name TEXT, region_id TEXT,
      twogis_id TEXT, name TEXT, full_name TEXT, address TEXT,
      lat REAL, lon REAL, url TEXT, website TEXT,
      phones TEXT, emails TEXT, whatsapp TEXT, telegram TEXT, viber TEXT,
      max_messenger TEXT, vk TEXT, socials TEXT,
      rating REAL, reviews_count INTEGER, schedule TEXT,
      zayavka_channel TEXT, zayavka_link TEXT,
      raw_json_path TEXT, collected_at TEXT, source_point TEXT
    );
    CREATE INDEX idx_firms_niche ON firms(niche);
    CREATE INDEX idx_firms_twogis ON firms(twogis_id);
  `);

  const stmt = db.prepare(`
    INSERT INTO firms
    (niche, rubric_id, rubric_name, region_name, region_id, twogis_id, name, full_name, address,
     lat, lon, url, website, phones, emails, whatsapp, telegram, viber, max_messenger, vk, socials,
     rating, reviews_count, schedule, zayavka_channel, zayavka_link,
     raw_json_path, collected_at, source_point)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  const j = (v) => (v && Object.keys(v).length ? JSON.stringify(v) : null);
  db.exec('BEGIN');
  for (const r of records) {
    stmt.run(
      r.niche,
      r.rubric_id,
      r.rubric_name,
      r.region_name,
      r.region_id,
      r['2gis_id'],
      r.name,
      r.full_name,
      r.address,
      r.lat,
      r.lon,
      r.url,
      r.website,
      (r.phones || []).join('; '),
      (r.emails || []).join('; '),
      r.whatsapp,
      r.telegram,
      r.viber,
      r.max,
      r.vk,
      j(r.socials),
      r.rating,
      r.reviews_count,
      r.schedule ? JSON.stringify(r.schedule) : null,
      r.zayavka_channel,
      r.zayavka_link,
      r.raw_json_path,
      r.collected_at,
      r.source_point
    );
  }
  db.exec('COMMIT');

  const count = db.prepare('SELECT COUNT(*) AS c FROM firms').get().c;
  db.close();
  return { file, count };
}
