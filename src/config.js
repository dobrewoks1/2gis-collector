import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute project root (parent of src/). Paths are anchored here, not to cwd. */
export const ROOT = path.resolve(__dirname, '..');

const env = process.env;

function intEnv(name, def) {
  const v = parseInt(env[name], 10);
  return Number.isFinite(v) ? v : def;
}
function boolEnv(name, def) {
  const v = env[name];
  if (v == null || v === '') return def;
  return /^(1|true|yes|on)$/i.test(v);
}

export const config = {
  apiKey: env.TWOGIS_API_KEY || '',
  baseUrl: (env.TWOGIS_BASE_URL || 'https://catalog.api.2gis.com').replace(/\/+$/, ''),

  timeoutMs: intEnv('REQUEST_TIMEOUT_MS', 15000),
  rateLimitMs: intEnv('RATE_LIMIT_MS', 350),
  maxRetries: intEnv('MAX_RETRIES', 4),
  logLevel: env.LOG_LEVEL || 'info',

  pageSize: intEnv('PAGE_SIZE', 50), // 2GIS hard max is 50 per page
  maxPagesPerPoint: intEnv('MAX_PAGES_PER_POINT', 10),

  // Exact fields flags so /3.0/items returns everything we persist.
  fields: [
    'items.point',
    'items.address',
    'items.adm_div',
    'items.contact_groups',
    'items.reviews',
    'items.schedule',
    'items.rubrics',
    'items.name_ex',
    'items.region_id',
    'items.org',
    'items.external_content',
  ].join(','),

  // Auto geo-grid expansion (used when hand-picked points don't hit the target).
  autoGrid: boolEnv('AUTO_GRID', true),
  gridRadiusM: intEnv('GRID_RADIUS_M', 2000),
  gridHalfWidthM: intEnv('GRID_HALF_WIDTH_M', 11000),
  gridHalfHeightM: intEnv('GRID_HALF_HEIGHT_M', 9000),
  maxGridPoints: intEnv('MAX_GRID_POINTS', 40),
};

export const paths = {
  root: ROOT,
  dataRaw: path.join(ROOT, 'data', 'raw'),
  dataNormalized: path.join(ROOT, 'data', 'normalized'),
  output: path.join(ROOT, 'output'),
  logs: path.join(ROOT, 'output', 'logs'),
  input: path.join(ROOT, 'input'),
};

/** Redirect output artifacts (CSV, SQLite, report, logs) to a custom dir. */
export function setOutputDir(dir) {
  paths.output = dir;
  paths.logs = path.join(dir, 'logs');
}
