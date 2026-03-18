const STEAM_API_BASE = 'https://api.steampowered.com';
const STORE_API_BASE = 'https://store.steampowered.com';

function getApiKey() {
  const key = process.env.STEAM_API_KEY;
  if (!key) throw new Error('STEAM_API_KEY is not configured. Get one at https://steamcommunity.com/dev/apikey');
  return key;
}

async function resolveVanityUrl(vanityName) {
  const key = getApiKey();
  const url = `${STEAM_API_BASE}/ISteamUser/ResolveVanityURL/v1/?key=${key}&vanityurl=${encodeURIComponent(vanityName)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Steam API error: ${res.status}`);
  const data = await res.json();
  if (data.response.success === 1) return data.response.steamid;
  throw new Error(
    `"${vanityName}" is not a Steam custom URL. ` +
    'Your display name and custom URL are different things — ' +
    'paste your full profile URL from a browser (e.g. steamcommunity.com/profiles/7656…) ' +
    'or find your SteamID64 at steamid.io'
  );
}

async function resolveProfileUrl(input) {
  const trimmed = input.trim();

  if (/^\d{17}$/.test(trimmed)) return trimmed;

  const profileMatch = trimmed.match(/steamcommunity\.com\/profiles\/(\d{17})/);
  if (profileMatch) return profileMatch[1];

  const vanityMatch = trimmed.match(/steamcommunity\.com\/id\/([^/]+)/);
  if (vanityMatch) return resolveVanityUrl(vanityMatch[1]);

  return resolveVanityUrl(trimmed);
}

async function getOwnedGames(steamId) {
  const key = getApiKey();
  const url = `${STEAM_API_BASE}/IPlayerService/GetOwnedGames/v1/?key=${key}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Steam API error: ${res.status}`);
  const data = await res.json();
  if (!data.response || !data.response.games) {
    throw new Error('Could not fetch games. Make sure the Steam profile is public and game details are visible.');
  }
  return data.response.games;
}

async function searchSteamApp(gameName) {
  const url = `${STORE_API_BASE}/api/storesearch/?term=${encodeURIComponent(gameName)}&l=english&cc=US`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.items && data.items.length > 0) return data.items[0];
  return null;
}

async function getAppDetails(appId) {
  const url = `${STORE_API_BASE}/api/appdetails?appids=${appId}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const entry = data[String(appId)];
  if (entry && entry.success) return entry.data;
  return null;
}

async function getWishlist(steamId) {
  const key = getApiKey();
  const url = `${STEAM_API_BASE}/IWishlistService/GetWishlist/v1/?steamid=${steamId}&key=${key}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.response?.items || []).map(i => i.appid);
}

async function getPlayerSummary(steamId) {
  const key = getApiKey();
  const url = `${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${steamId}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const player = data.response?.players?.[0];
  if (!player) return null;
  return {
    steamId: player.steamid,
    name: player.personaname,
    avatar: player.avatarmedium,
    profileUrl: player.profileurl,
    visibility: player.communityvisibilitystate,
  };
}

module.exports = { resolveProfileUrl, getOwnedGames, getWishlist, getPlayerSummary, searchSteamApp, getAppDetails };
