import axios from 'axios';
import { config } from '../config.js';
import { log } from '../logger.js';
import { sleep } from '../util.js';

const http = axios.create({
  baseURL: config.baseUrl,
  timeout: config.timeoutMs,
  validateStatus: () => true, // we inspect meta.code ourselves
  headers: { Accept: 'application/json' },
});

export class ApiError extends Error {
  constructor(message, { status, code, type, fatal = false } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.type = type;
    this.fatal = fatal;
  }
}

// Serial rate limiter: keep >= rateLimitMs between request starts.
let lastStart = 0;
async function throttle() {
  const wait = config.rateLimitMs - (Date.now() - lastStart);
  if (wait > 0) await sleep(wait);
  lastStart = Date.now();
}

const backoffMs = (attempt) => Math.min(1000 * 2 ** (attempt - 1), 15000);

/**
 * GET against the Catalog API with timeout, rate limiting and retry/backoff.
 * Returns the parsed body `{ meta, result }`. A 404 "not found" is normalized
 * to an empty result rather than thrown.
 */
export async function apiGet(pathname, params) {
  const full = { ...params, key: config.apiKey };
  let attempt = 0;

  while (true) {
    attempt++;
    await throttle();

    let res;
    try {
      res = await http.get(pathname, { params: full });
    } catch (err) {
      if (attempt <= config.maxRetries) {
        const wait = backoffMs(attempt);
        log.warn(`[api] ${pathname} network error (${err.code || err.message}); retry ${attempt}/${config.maxRetries} in ${wait}ms`);
        await sleep(wait);
        continue;
      }
      throw new ApiError(`Network error after ${attempt} attempts: ${err.message}`);
    }

    const body = res.data || {};
    const code = body?.meta?.code ?? res.status;
    const apiErr = body?.meta?.error || {};

    if (code === 200) return body;

    // Empty result — not an error (page past the end, or zero matches).
    if (code === 404) return { meta: { code: 404 }, result: { items: [], total: 0 } };

    const blocked = code === 403 && /block/i.test(apiErr.message || '');
    if ((code === 429 || code >= 500 || blocked) && attempt <= config.maxRetries) {
      const wait = backoffMs(attempt) * (code === 429 || blocked ? 2 : 1);
      log.warn(`[api] ${pathname} code ${code} (${apiErr.message || ''}); retry ${attempt}/${config.maxRetries} in ${wait}ms`);
      await sleep(wait);
      continue;
    }

    if (code === 403) {
      throw new ApiError(
        `2GIS auth error (403): ${apiErr.message || 'forbidden'}. Check TWOGIS_API_KEY in .env`,
        { status: code, code, type: apiErr.type, fatal: true }
      );
    }

    throw new ApiError(`2GIS API error ${code}: ${apiErr.message || 'unknown'} (${pathname})`, {
      status: code,
      code,
      type: apiErr.type,
    });
  }
}
