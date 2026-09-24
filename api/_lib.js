// Shared helpers for the API routes. Files starting with "_" are not deployed as routes.
import { Redis } from '@upstash/redis';
import { createHash, timingSafeEqual } from 'node:crypto';
import { SEED } from '../seed.js';

export const COLLS = ['orgs', 'tasks', 'contacts', 'touches', 'opps'];
export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const MAX_DOC_BYTES = 64 * 1024;

// Vercel's Upstash integration sets KV_REST_API_*; a direct Upstash setup uses UPSTASH_REDIS_REST_*.
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
export const redis = url && token ? new Redis({ url, token }) : null;

const PREFIX = process.env.KEY_PREFIX || 'sd';
export const hashKey = (c) => `${PREFIX}:${c}`;
const SEEDED_KEY = `${PREFIX}:seeded`;

const digest = (s) => createHash('sha256').update(String(s)).digest();

/** Returns true when the request may proceed; otherwise sends the error response. */
export function guard(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!redis) {
    res.status(503).json({ error: 'no_db' });
    return false;
  }
  const required = process.env.APP_PASSCODE;
  if (required) {
    const given = req.headers['x-passcode'] || '';
    if (!timingSafeEqual(digest(given), digest(required))) {
      res.status(401).json({ error: 'passcode' });
      return false;
    }
  }
  return true;
}

export const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function parseValue(v) {
  if (v == null) return null;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return null; }
  }
  return v; // @upstash/redis may already have deserialized it
}

export async function readCollection(c) {
  const h = (await redis.hgetall(hashKey(c))) || {};
  const out = {};
  for (const [id, v] of Object.entries(h)) {
    const doc = parseValue(v);
    if (isPlainObject(doc)) out[id] = doc;
  }
  return out;
}

export async function readAll() {
  const parts = await Promise.all(COLLS.map(readCollection));
  return Object.fromEntries(COLLS.map((c, i) => [c, parts[i]]));
}

export async function writeCollection(c, docs) {
  const entries = Object.entries(docs).filter(([id, d]) => ID_RE.test(id) && isPlainObject(d));
  if (entries.length) {
    await redis.hset(hashKey(c), Object.fromEntries(entries.map(([id, d]) => [id, JSON.stringify(d)])));
  }
}

/** Loads the starter organization list and action plan exactly once per database. */
export async function seedIfNeeded() {
  const first = await redis.set(SEEDED_KEY, new Date().toISOString(), { nx: true });
  if (first === 'OK') {
    await writeCollection('orgs', SEED.orgs);
    await writeCollection('tasks', SEED.tasks);
  }
}

export async function markSeeded() {
  await redis.set(SEEDED_KEY, new Date().toISOString());
}
