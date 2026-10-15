import fs from 'node:fs';
import path from 'node:path';
import { ensureDir } from '../util.js';

const COLUMNS = [
  'niche', 'rubric_id', 'rubric_name', 'region_name', 'region_id', '2gis_id',
  'name', 'full_name', 'address', 'lat', 'lon', 'url',
  'website', 'phones', 'emails', 'whatsapp', 'telegram', 'viber', 'max', 'vk', 'socials',
  'rating', 'reviews_count', 'schedule', 'zayavka_channel', 'zayavka_link',
  'raw_json_path', 'collected_at', 'source_point',
];

function cell(v) {
  if (v == null) return '';
  let s;
  if (Array.isArray(v)) s = v.join('; ');
  else if (typeof v === 'object') s = Object.keys(v).length ? JSON.stringify(v) : '';
  else s = String(v);
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function writeCsv(records, file) {
  ensureDir(path.dirname(file));
  const lines = [COLUMNS.join(',')];
  for (const r of records) lines.push(COLUMNS.map((c) => cell(r[c])).join(','));
  // Leading BOM so Excel reads UTF-8 Cyrillic correctly.
  fs.writeFileSync(file, '﻿' + lines.join('\r\n'), 'utf8');
  return file;
}
