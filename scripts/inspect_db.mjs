#!/usr/bin/env node
// Quick stats for the collected SQLite DB.
// Usage: node scripts/inspect_db.mjs [path/to/file.sqlite]  (defaults to newest in ./output)
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

process.emitWarning = () => {}; // silence node:sqlite experimental notice

let file = process.argv[2];
if (!file) {
  const dir = 'output';
  const dbs = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.sqlite')) : [];
  if (!dbs.length) {
    console.error('No .sqlite file found in ./output — run a collection first.');
    process.exit(1);
  }
  file = path.join(dir, dbs[0]);
}

const db = new DatabaseSync(file);
console.log(`DB: ${file}\n`);

console.log('Firms per niche:');
for (const r of db.prepare('SELECT niche, COUNT(*) AS c FROM firms GROUP BY niche ORDER BY c DESC').all()) {
  console.log(`  ${String(r.c).padStart(4)}  ${r.niche}`);
}

const total = db.prepare('SELECT COUNT(*) AS c FROM firms').get().c;
const phones = db.prepare("SELECT COUNT(*) AS c FROM firms WHERE phones <> ''").get().c;
const sites = db.prepare('SELECT COUNT(*) AS c FROM firms WHERE website IS NOT NULL').get().c;
const ratings = db.prepare('SELECT COUNT(*) AS c FROM firms WHERE rating IS NOT NULL').get().c;
console.log(`\nTotal: ${total}   with phone: ${phones}   with website: ${sites}   with rating: ${ratings}`);

console.log('\nSample rows:');
for (const r of db.prepare('SELECT name, address, phones, rating FROM firms WHERE phones <> \'\' LIMIT 3').all()) {
  console.log(`  - ${r.name} | ${r.address} | ${r.phones} | ★ ${r.rating ?? '-'}`);
}
db.close();
