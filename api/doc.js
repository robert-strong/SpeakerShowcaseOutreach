// PUT    /api/doc?c=<collection>&id=<id>  replace a record
// PATCH  /api/doc?c=<collection>&id=<id>  merge fields into a record
// DELETE /api/doc?c=<collection>&id=<id>  remove a record
import { guard, redis, hashKey, COLLS, ID_RE, MAX_DOC_BYTES, isPlainObject } from './_lib.js';

export default async function handler(req, res) {
  if (!['PUT', 'PATCH', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'method_not_allowed' });
  if (!guard(req, res)) return;
  const c = String(req.query.c || '');
  const id = String(req.query.id || '');
  if (!COLLS.includes(c) || !ID_RE.test(id)) return res.status(400).json({ error: 'bad_path' });

  try {
    if (req.method === 'DELETE') {
      await redis.hdel(hashKey(c), id);
      return res.status(200).json({ ok: true });
    }
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!isPlainObject(body)) return res.status(400).json({ error: 'bad_body' });

    let doc = body;
    if (req.method === 'PATCH') {
      const cur = await redis.hget(hashKey(c), id);
      const existing = typeof cur === 'string' ? JSON.parse(cur) : cur;
      if (!isPlainObject(existing)) return res.status(404).json({ error: 'not_found' });
      doc = { ...existing, ...body };
    }
    const json = JSON.stringify(doc);
    if (Buffer.byteLength(json) > MAX_DOC_BYTES) return res.status(413).json({ error: 'too_large' });
    await redis.hset(hashKey(c), { [id]: json });
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  }
}
