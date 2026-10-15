import fs from 'node:fs';
import path from 'node:path';
import { config, paths } from './config.js';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
let threshold = LEVELS[config.logLevel] ?? LEVELS.info;
let fileStream = null;

/** Start mirroring logs to output/logs/run-<ts>.log. Returns the file path. */
export function initFileLogging() {
  fs.mkdirSync(paths.logs, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(paths.logs, `run-${ts}.log`);
  fileStream = fs.createWriteStream(file, { flags: 'a' });
  return file;
}

export function setLevel(level) {
  if (LEVELS[level] != null) threshold = LEVELS[level];
}

function fmt(a) {
  if (typeof a === 'string') return a;
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
}

function emit(level, args) {
  if (LEVELS[level] > threshold) return;
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${args.map(fmt).join(' ')}`;
  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  stream.write(line + '\n');
  if (fileStream) fileStream.write(line + '\n');
}

export const log = {
  error: (...a) => emit('error', a),
  warn: (...a) => emit('warn', a),
  info: (...a) => emit('info', a),
  debug: (...a) => emit('debug', a),
};
