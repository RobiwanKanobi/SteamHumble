require('dotenv').config();
const express = require('express');
const path = require('path');
const steam = require('./src/steam');
const humble = require('./src/humble');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

let bundleCache = { data: null, ts: 0 };
const CACHE_TTL = 15 * 60 * 1000;

app.get('/api/config', (_req, res) => {
  res.json({
    hasSteamKey: !!process.env.STEAM_API_KEY,
    partnerId: process.env.HUMBLE_PARTNER_ID || '',
  });
});

app.get('/api/bundles', async (_req, res) => {
  try {
    if (bundleCache.data && Date.now() - bundleCache.ts < CACHE_TTL) {
      return res.json({ bundles: bundleCache.data, cached: true });
    }
    const bundles = await humble.fetchBundles();
    bundleCache = { data: bundles, ts: Date.now() };
    res.json({ bundles, cached: false });
  } catch (err) {
    console.error('Bundle fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/bundles/refresh', async (_req, res) => {
  try {
    bundleCache = { data: null, ts: 0 };
    const bundles = await humble.fetchBundles();
    bundleCache = { data: bundles, ts: Date.now() };
    res.json({ bundles, cached: false });
  } catch (err) {
    console.error('Bundle refresh error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bundles/add', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    const bundle = await humble.fetchBundleDetails(url);
    res.json({ bundle });
  } catch (err) {
    console.error('Bundle add error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/steam/resolve', async (req, res) => {
  try {
    const { profile } = req.query;
    if (!profile) return res.status(400).json({ error: 'Profile URL or ID is required' });
    const steamId = await steam.resolveProfileUrl(profile);
    res.json({ steamId });
  } catch (err) {
    console.error('Steam resolve error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/steam/library', async (req, res) => {
  try {
    const { profile } = req.query;
    if (!profile) return res.status(400).json({ error: 'Profile URL or ID is required' });
    const steamId = await steam.resolveProfileUrl(profile);
    const [games, wishlist] = await Promise.all([
      steam.getOwnedGames(steamId),
      steam.getWishlist(steamId).catch(() => []),
    ]);
    res.json({
      steamId,
      gameCount: games.length,
      wishlistCount: wishlist.length,
      games: games.map(g => ({
        appId: g.appid,
        name: g.name,
        playtime: g.playtime_forever || 0,
        icon: g.img_icon_url
          ? `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`
          : null,
      })),
      wishlist,
    });
  } catch (err) {
    console.error('Steam library error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/steam/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Search query is required' });
    const result = await steam.searchSteamApp(q);
    res.json({ result });
  } catch (err) {
    console.error('Steam search error:', err);
    res.status(500).json({ error: err.message });
  }
});

const trailerCache = new Map();

app.get('/api/steam/trailer/:appId', async (req, res) => {
  try {
    const appId = req.params.appId;
    if (trailerCache.has(appId)) return res.json(trailerCache.get(appId));

    const url = `https://store.steampowered.com/api/appdetails?appids=${appId}`;
    const r = await fetch(url);
    if (!r.ok) return res.json({ trailer: null });
    const data = await r.json();
    const entry = data[appId];
    if (!entry?.success || !entry.data?.movies?.length) {
      const result = { trailer: null };
      trailerCache.set(appId, result);
      return res.json(result);
    }
    const movie = entry.data.movies[0];
    const result = {
      trailer: {
        name: movie.name,
        thumbnail: movie.thumbnail,
        hls: movie.hls_h264 || null,
        dash: movie.dash_h264 || null,
      },
    };
    trailerCache.set(appId, result);
    res.json(result);
  } catch (err) {
    console.error('Trailer fetch error:', err);
    res.json({ trailer: null });
  }
});

app.post('/api/compare', async (req, res) => {
  try {
    const { profile, bundleGames } = req.body;
    if (!profile || !bundleGames) {
      return res.status(400).json({ error: 'Profile and bundleGames are required' });
    }
    const steamId = await steam.resolveProfileUrl(profile);
    const ownedGames = await steam.getOwnedGames(steamId);
    const ownedAppIds = new Set(ownedGames.map(g => g.appid));
    const ownedNames = new Map(ownedGames.map(g => [g.name.toLowerCase(), g]));

    const results = bundleGames.map(game => {
      let owned = false;
      let matchedBy = null;

      if (game.steamAppId && ownedAppIds.has(game.steamAppId)) {
        owned = true;
        matchedBy = 'appId';
      } else if (game.name) {
        const lower = game.name.toLowerCase();
        if (ownedNames.has(lower)) {
          owned = true;
          matchedBy = 'exactName';
        } else {
          for (const [ownedName] of ownedNames) {
            if (ownedName.includes(lower) || lower.includes(ownedName)) {
              owned = true;
              matchedBy = 'partialName';
              break;
            }
          }
        }
      }
      return { ...game, owned, matchedBy };
    });

    const ownedCount = results.filter(r => r.owned).length;
    res.json({ steamId, totalGames: results.length, ownedCount, results });
  } catch (err) {
    console.error('Compare error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Steam × Humble Bundle Compare running at http://localhost:${PORT}`);
  console.log(`Steam API key: ${process.env.STEAM_API_KEY ? 'configured' : 'NOT SET'}`);
});
