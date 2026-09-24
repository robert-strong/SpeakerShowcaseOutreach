// POST /api/import — replace all data with a backup file's contents.
import { guard, redis, hashKey, COLLS, isPlainObject, writeCollection, markSeeded } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!guard(req, res)) return;
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!isPlainObject(body) || !COLLS.some((c) => isPlainObject(body[c]))) {
      return res.status(400).json({ error: 'bad_backup' });
    }
    for (const c of COLLS) {
      await redis.del(hashKey(c));
      if (isPlainObject(body[c])) await writeCollection(c, body[c]);
    }
    await markSeeded(); // an import replaces the starter data for good
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  }
}
