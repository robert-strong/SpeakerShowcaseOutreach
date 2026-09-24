// GET /api/data — every collection in one response.
import { guard, readAll, seedIfNeeded } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  if (!guard(req, res)) return;
  try {
    await seedIfNeeded();
    res.status(200).json(await readAll());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  }
}
