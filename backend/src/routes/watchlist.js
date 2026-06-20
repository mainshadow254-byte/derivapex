// Watchlists + favorites. Users build custom watchlists of real Deriv symbols
// and a favorites list. Symbols are stored as a JSON array; the backend
// mediates all access (collection rules are locked).
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getServicePB } from '../pocketbase.js';

const router = Router();

function parseSymbols(s) { try { return JSON.parse(s || '[]'); } catch { return []; } }

async function favRow(pb, userId) {
  let fav = await pb.collection('watchlists').getFirstListItem(`user="${userId}" && is_favorites=true`).catch(() => null);
  if (!fav) fav = await pb.collection('watchlists').create({ user: userId, name: 'Favorites', symbols: '[]', is_favorites: true });
  return fav;
}

router.get('/', requireAuth, async (req, res) => {
  const pb = await getServicePB();
  await favRow(pb, req.auth.user.id); // ensure favorites exists
  const lists = await pb.collection('watchlists').getFullList({ filter: `user="${req.auth.user.id}"`, sort: '-is_favorites,created' });
  res.json({ watchlists: lists.map((l) => ({ id: l.id, name: l.name, is_favorites: l.is_favorites, symbols: parseSymbols(l.symbols) })) });
});

router.post('/', requireAuth, async (req, res) => {
  const { name, symbols } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required.' });
  const pb = await getServicePB();
  const rec = await pb.collection('watchlists').create({ user: req.auth.user.id, name, symbols: JSON.stringify(symbols || []), is_favorites: false });
  res.json({ ok: true, watchlist: { id: rec.id, name: rec.name, symbols: parseSymbols(rec.symbols), is_favorites: false } });
});

router.put('/:id', requireAuth, async (req, res) => {
  const pb = await getServicePB();
  const l = await pb.collection('watchlists').getOne(req.params.id).catch(() => null);
  if (!l || l.user !== req.auth.user.id) return res.status(404).json({ error: 'Watchlist not found.' });
  const body = {};
  if (req.body?.name != null) body.name = req.body.name;
  if (req.body?.symbols != null) body.symbols = JSON.stringify(req.body.symbols);
  const rec = await pb.collection('watchlists').update(req.params.id, body);
  res.json({ ok: true, watchlist: { id: rec.id, name: rec.name, symbols: parseSymbols(rec.symbols), is_favorites: rec.is_favorites } });
});

router.delete('/:id', requireAuth, async (req, res) => {
  const pb = await getServicePB();
  const l = await pb.collection('watchlists').getOne(req.params.id).catch(() => null);
  if (!l || l.user !== req.auth.user.id) return res.status(404).json({ error: 'Watchlist not found.' });
  if (l.is_favorites) return res.status(400).json({ error: 'Favorites cannot be deleted.' });
  await pb.collection('watchlists').delete(req.params.id);
  res.json({ ok: true });
});

// Toggle a symbol in favorites.
router.post('/favorites/toggle', requireAuth, async (req, res) => {
  const { symbol } = req.body || {};
  if (!symbol) return res.status(400).json({ error: 'symbol required.' });
  const pb = await getServicePB();
  const fav = await favRow(pb, req.auth.user.id);
  const set = new Set(parseSymbols(fav.symbols));
  if (set.has(symbol)) set.delete(symbol); else set.add(symbol);
  const rec = await pb.collection('watchlists').update(fav.id, { symbols: JSON.stringify([...set]) });
  res.json({ ok: true, favorites: parseSymbols(rec.symbols) });
});

export default router;
