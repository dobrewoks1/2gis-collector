#!/usr/bin/env node
import path from 'node:path';
import { Command } from 'commander';
import { config, paths, setOutputDir } from './config.js';
import { log, initFileLogging, setLevel } from './logger.js';
import { ApiError } from './api/client.js';
import { resolveRegion } from './api/regions.js';
import { resolveRubricSet } from './api/rubrics.js';
import { loadPoints } from './core/geoGrid.js';
import { collectNiche } from './core/collector.js';
import { saveNormalizedNiche, saveNormalizedAll } from './storage/normalizedStore.js';
import { writeCsv } from './storage/csvExporter.js';
import { writeSqlite } from './storage/sqliteExporter.js';
import { buildReport } from './report.js';
import { slugify, tsForFile } from './util.js';

// Hide only the node:sqlite experimental warning; keep every other warning.
const _emitWarning = process.emitWarning;
process.emitWarning = (w, ...rest) => {
  if (typeof w === 'string' && /SQLite is an experimental feature/i.test(w)) return;
  return _emitWarning.call(process, w, ...rest);
};

const rel = (p) => path.relative(paths.root, p).replace(/\\/g, '/');

function preflight() {
  if (!config.apiKey) {
    console.error('ERROR: TWOGIS_API_KEY is not set. Copy .env.example to .env and add your 2GIS key.');
    process.exit(1);
  }
  setLevel(config.logLevel);
}

async function runCollect(opts) {
  preflight();
  if (opts.output) setOutputDir(path.resolve(opts.output));
  if (opts.autoGrid === false) config.autoGrid = false;

  const logFile = initFileLogging();
  log.info(`[start] region="${opts.region}" target=${opts.targetPerNiche} autoGrid=${config.autoGrid}`);
  log.info(`[start] log file: ${rel(logFile)}`);

  const region = await resolveRegion(opts.region);
  region.target = opts.targetPerNiche;

  let filePoints = [];
  if (opts.regionWide) {
    log.info('[points] region-wide mode: geo-points skipped');
  } else {
    const pointsFile = opts.pointsFile ? path.resolve(opts.pointsFile) : path.join(paths.input, 'omsk_points.json');
    filePoints = loadPoints(pointsFile);
    log.info(`[points] loaded ${filePoints.length} points from ${pointsFile}`);
  }

  const niches = opts.niches.split(',').map((s) => s.trim()).filter(Boolean);
  const results = [];
  const allRecords = [];

  for (const niche of niches) {
    log.info(`─── NICHE: ${niche} ───────────────────────────────`);
    const res = await collectNiche({ niche, region, filePoints, regionWide: opts.regionWide });
    saveNormalizedNiche(niche, res.records);
    results.push(res);
    allRecords.push(...res.records);
  }

  saveNormalizedAll(allRecords);
  const ts = tsForFile();
  const csvFile = path.join(paths.output, `firms_${slugify(region.name)}_${ts}.csv`);
  writeCsv(allRecords, csvFile);
  const sq = await writeSqlite(allRecords, path.join(paths.output, `firms_${slugify(region.name)}.sqlite`));
  if (sq.skipped) log.warn('[sqlite] export skipped (Node < 22.5)');
  else log.info(`[sqlite] wrote ${sq.count} rows -> ${rel(sq.file)}`);

  buildReport({
    region,
    target: region.target,
    niches: results,
    files: {
      csv: rel(csvFile),
      sqlite: sq.file ? rel(sq.file) : '(skipped — Node < 22.5)',
      normalized: rel(paths.dataNormalized),
      raw: rel(paths.dataRaw),
      report_json: rel(path.join(paths.output, 'report.json')),
    },
  });
  log.info('[done] all niches processed');
}

function guard(fn) {
  return (...args) =>
    fn(...args).catch((e) => {
      if (e instanceof ApiError && e.fatal) log.error(e.message);
      else log.error(`Fatal: ${e?.stack || e?.message || e}`);
      process.exit(1);
    });
}

const program = new Command();
program
  .name('2gis-collect')
  .description('Collect firms from 2GIS via the official Catalog API (Categories + Places)')
  .version('1.0.0');

program
  .command('collect')
  .description('Collect firms across niches with geo-splitting, dedup and export')
  .requiredOption('--region <name>', 'region/city name, e.g. "Omsk"')
  .option('--niches <list>', 'comma-separated niches', 'кофейни,стоматологии,автосервисы,салоны красоты,юристы')
  .option('--target-per-niche <n>', 'target unique firms per niche', (v) => parseInt(v, 10), 100)
  .option('--points-file <path>', 'JSON file with search points')
  .option('--output <dir>', 'output directory (default ./output)')
  .option('--no-auto-grid', 'disable automatic geo-grid expansion')
  .option('--region-wide', 'page the whole region per niche (key must have no per-search cap)')
  .action(guard(runCollect));

program
  .command('resolve-region')
  .description('Resolve a region/city name to its 2GIS region_id')
  .requiredOption('--region <name>')
  .action(
    guard(async (o) => {
      preflight();
      console.log(await resolveRegion(o.region));
    })
  );

program
  .command('resolve-rubric')
  .description('Resolve a niche name to the 2GIS rubric set for a region')
  .requiredOption('--region <name>')
  .requiredOption('--niche <name>')
  .action(
    guard(async (o) => {
      preflight();
      const r = await resolveRegion(o.region);
      console.log(await resolveRubricSet(o.niche, r.id));
    })
  );

program.parseAsync();
