const cheerio = require('cheerio');
const steam = require('./steam');

const HUMBLE_BASE = 'https://www.humblebundle.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const appIdCache = new Map();

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

async function fetchBundlesList() {
  const html = await fetchPage(`${HUMBLE_BASE}/bundles`);
  const $ = cheerio.load(html);

  const raw = $('#landingPage-json-data').html();
  if (!raw) return [];

  const data = JSON.parse(raw);
  const gamesMosaic = data?.data?.games?.mosaic || [];
  const bundles = [];

  for (const section of gamesMosaic) {
    for (const product of (section.products || [])) {
      const url = product.product_url?.startsWith('http')
        ? product.product_url
        : `${HUMBLE_BASE}${product.product_url}`;
      bundles.push({
        url,
        name: product.tile_short_name || product.tile_name || product.product_url.split('/').pop(),
        image: product.high_res_tile_image || product.tile_image || null,
        blurb: (product.detailed_marketing_blurb || '').replace(/<[^>]+>/g, '').substring(0, 200),
      });
    }
  }
  return bundles;
}

async function resolveSteamAppId(gameName) {
  if (appIdCache.has(gameName)) return appIdCache.get(gameName);
  try {
    const result = await steam.searchSteamApp(gameName);
    const appId = result?.id || null;
    appIdCache.set(gameName, appId);
    return appId;
  } catch (_e) {
    appIdCache.set(gameName, null);
    return null;
  }
}

async function fetchBundleDetails(bundleUrl) {
  const html = await fetchPage(bundleUrl);
  const $ = cheerio.load(html);

  const raw = $('#webpack-bundle-page-data').html();
  if (!raw) {
    return {
      url: bundleUrl,
      name: $('title').text().replace(/\s*\|?\s*Humble Bundle.*$/i, '').trim(),
      tiers: [],
      games: [],
    };
  }

  const data = JSON.parse(raw);
  const bd = data.bundleData;

  const bundle = {
    url: bundleUrl,
    name: bd.basic_data?.human_name
      || $('title').text().replace(/\s*\|?\s*Humble Bundle.*$/i, '').trim()
      || bundleUrl.split('/').pop(),
    logo: bd.basic_data?.logo || null,
    blurb: (bd.basic_data?.detailed_marketing_blurb || '').replace(/<[^>]+>/g, '').substring(0, 300),
    tiers: [],
    games: [],
  };

  const itemsByMachine = bd.tier_item_data || {};
  const tierDisplay = bd.tier_display_data || {};
  const tierOrder = bd.tier_order || Object.keys(tierDisplay);

  const allGameObjects = {};

  for (const [machineName, item] of Object.entries(itemsByMachine)) {
    const gameObj = {
      name: item.human_name || machineName,
      machineName,
      steamAppId: null,
      icon: item.resolved_paths?.featured_image || null,
      developers: item.developers || [],
      platforms: (item.availability_icons?.platform_icons || [])
        .filter(p => p !== 'hb-steam')
        .map(p => (item.availability_icons?.human_names || {})[p] || p),
      hasSteam: (item.availability_icons?.platform_icons || []).includes('hb-steam'),
      rating: item.user_ratings?.review_text || null,
      msrp: item.msrp_price?.amount || item['msrp_price|money']?.amount || null,
    };
    allGameObjects[machineName] = gameObj;
  }

  for (const tierKey of tierOrder) {
    const display = tierDisplay[tierKey];
    if (!display) continue;
    const machineNames = display.tier_item_machine_names || [];
    const tierGames = machineNames
      .map(mn => allGameObjects[mn])
      .filter(Boolean);

    bundle.tiers.push({
      name: display.display_header || display.header || display.tier_name || `Tier ${bundle.tiers.length + 1}`,
      games: tierGames,
    });
  }

  if (bundle.tiers.length === 0 && Object.keys(allGameObjects).length > 0) {
    bundle.tiers.push({
      name: 'All Games',
      games: Object.values(allGameObjects),
    });
  }

  bundle.games = bundle.tiers.flatMap(t => t.games);

  const steamGames = bundle.games.filter(g => g.hasSteam || true);
  const resolvePromises = steamGames.map(async (game) => {
    const appId = await resolveSteamAppId(game.name);
    if (appId) game.steamAppId = appId;
  });

  const BATCH_SIZE = 5;
  for (let i = 0; i < resolvePromises.length; i += BATCH_SIZE) {
    await Promise.all(resolvePromises.slice(i, i + BATCH_SIZE));
    if (i + BATCH_SIZE < resolvePromises.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return bundle;
}

async function fetchBundles() {
  try {
    const list = await fetchBundlesList();
    console.log(`Found ${list.length} game bundles on Humble Bundle`);

    const detailed = [];
    for (const b of list) {
      try {
        console.log(`  Fetching: ${b.name}`);
        const details = await fetchBundleDetails(b.url);
        details.image = details.image || b.image;
        details.blurb = details.blurb || b.blurb;
        detailed.push(details);
      } catch (err) {
        console.error(`  Failed: ${b.name} - ${err.message}`);
        detailed.push({ ...b, tiers: [], games: [] });
      }
    }
    return detailed;
  } catch (err) {
    console.error('Failed to fetch bundles list:', err.message);
    return [];
  }
}

module.exports = { fetchBundles, fetchBundlesList, fetchBundleDetails };
