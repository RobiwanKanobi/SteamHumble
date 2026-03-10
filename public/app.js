const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let appState = {
  hasSteamKey: false,
  partnerId: '',
  bundles: [],
  library: null,
  steamId: null,
};

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function setStatus(el, msg, type = '') {
  el.textContent = msg;
  el.className = `status ${type}`;
}

function bundleLink(url) {
  if (appState.partnerId) {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}partner=${appState.partnerId}`;
  }
  return url;
}

function renderBundles() {
  const container = $('#bundles-container');
  const noBundles = $('#no-bundles');

  if (appState.bundles.length === 0) {
    container.innerHTML = '';
    noBundles.style.display = '';
    return;
  }

  noBundles.style.display = 'none';
  const ownedIds = appState.library
    ? new Set(appState.library.games.map(g => g.appId))
    : null;
  const ownedNames = appState.library
    ? new Map(appState.library.games.map(g => [g.name.toLowerCase(), g]))
    : null;

  container.innerHTML = appState.bundles.map(bundle => {
    const allGamesRaw = bundle.tiers?.flatMap(t => t.games) || bundle.games || [];
    const uniqueMap = new Map();
    for (const g of allGamesRaw) uniqueMap.set(g.machineName || g.name, g);
    const allGames = [...uniqueMap.values()];
    const gamesWithOwnership = allGames.map(g => {
      if (!ownedIds) return { ...g, owned: null };
      if (g.steamAppId && ownedIds.has(g.steamAppId)) return { ...g, owned: true };
      if (g.name && ownedNames.has(g.name.toLowerCase())) return { ...g, owned: true };
      if (g.name) {
        const lower = g.name.toLowerCase();
        for (const [oName] of ownedNames) {
          if (oName.includes(lower) || lower.includes(oName)) return { ...g, owned: true };
        }
      }
      return { ...g, owned: false };
    });

    const ownedCount = gamesWithOwnership.filter(g => g.owned === true).length;
    const newCount = gamesWithOwnership.filter(g => g.owned === false).length;
    const total = gamesWithOwnership.length;
    const compared = ownedIds !== null;

    const seenInTier = new Set();
    const tiersHtml = (bundle.tiers && bundle.tiers.length > 0)
      ? [...bundle.tiers].reverse().map(tier => {
          const tierGamesOwnership = tier.games
            .filter(g => {
              const key = g.machineName || g.name;
              if (seenInTier.has(key)) return false;
              seenInTier.add(key);
              return true;
            })
            .map(g => {
              const match = gamesWithOwnership.find(
                gw => gw.name === g.name || (gw.machineName && gw.machineName === g.machineName)
              );
              return match || { ...g, owned: null };
            });
          if (tierGamesOwnership.length === 0) return '';
          return `
            <div class="tier">
              <div class="tier-name">${esc(tier.name)}</div>
              <ul class="game-list">
                ${tierGamesOwnership.map(g => gameItemHtml(g, compared)).join('')}
              </ul>
            </div>`;
        }).reverse().filter(Boolean).join('')
      : (gamesWithOwnership.length > 0
          ? `<div class="tier">
               <ul class="game-list">
                 ${gamesWithOwnership.map(g => gameItemHtml(g, compared)).join('')}
               </ul>
             </div>`
          : `<div class="tier"><p class="no-compare-hint">No game data extracted for this bundle. Try adding games manually.</p></div>`);

    const summaryHtml = compared && total > 0
      ? `<div class="bundle-summary">
           <span class="stat stat-total">${total} games</span>
           <span class="stat stat-owned">${ownedCount} owned</span>
           <span class="stat stat-new">${newCount} new</span>
         </div>`
      : (total > 0
          ? `<div class="bundle-summary"><span class="stat stat-total">${total} games</span></div>`
          : '');

    return `
      <div class="bundle-card">
        <div class="bundle-header">
          <h3>${esc(bundle.name)}</h3>
          <div style="display:flex;align-items:center;gap:1rem">
            ${summaryHtml}
            <a href="${bundleLink(bundle.url)}" target="_blank">View on Humble →</a>
          </div>
        </div>
        ${tiersHtml}
      </div>`;
  }).join('');
}

function gameItemHtml(game, compared) {
  const badgeClass = !compared ? 'badge-unknown' : game.owned ? 'badge-owned' : 'badge-new';
  const nameClass = game.owned ? 'owned' : '';
  const tag = !compared
    ? ''
    : game.owned
      ? '<span class="game-tag tag-owned">OWNED</span>'
      : '<span class="game-tag tag-new">NEW</span>';
  return `
    <li class="game-item">
      <span class="game-badge ${badgeClass}"></span>
      <span class="game-name ${nameClass}">${esc(game.name)}</span>
      ${tag}
    </li>`;
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

async function loadBundles(refresh = false) {
  const loading = $('#bundles-loading');
  loading.style.display = '';
  try {
    const path = refresh ? '/api/bundles/refresh' : '/api/bundles';
    const data = await api(path);
    appState.bundles = data.bundles || [];
    renderBundles();
  } catch (err) {
    console.error('Failed to load bundles:', err);
    appState.bundles = [];
    renderBundles();
  } finally {
    loading.style.display = 'none';
  }
}

async function compareLibrary() {
  const input = $('#steam-input').value.trim();
  const status = $('#profile-status');
  const btn = $('#compare-btn');

  if (!input) { setStatus(status, 'Please enter a Steam profile.', 'error'); return; }
  if (!appState.hasSteamKey) { setStatus(status, 'Steam API key is not configured on the server.', 'error'); return; }

  btn.disabled = true;
  setStatus(status, 'Fetching your Steam library…', 'loading');

  try {
    const data = await api(`/api/steam/library?profile=${encodeURIComponent(input)}`);
    appState.library = data;
    appState.steamId = data.steamId;
    setStatus(status, `✓ Found ${data.gameCount} games in your library`, 'success');
    renderBundles();
  } catch (err) {
    setStatus(status, err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function addBundleUrl() {
  const input = $('#bundle-url-input');
  const url = input.value.trim();
  if (!url) return;

  try {
    const data = await api('/api/bundles/add', { method: 'POST', body: { url } });
    if (data.bundle) {
      const exists = appState.bundles.find(b => b.url === data.bundle.url);
      if (!exists) {
        appState.bundles.unshift(data.bundle);
      }
      renderBundles();
      input.value = '';
      $('#add-bundle-modal').style.display = 'none';
    }
  } catch (err) {
    alert('Failed to fetch bundle: ' + err.message);
  }
}

async function manualCompare() {
  const text = $('#manual-games').value.trim();
  if (!text) return;

  const names = text.split('\n').map(l => l.trim()).filter(Boolean);
  const manualBundle = {
    name: 'Manual Game List',
    url: '#',
    tiers: [{ name: 'Games', games: names.map(n => ({ name: n, steamAppId: null })) }],
    games: names.map(n => ({ name: n, steamAppId: null })),
  };

  const exists = appState.bundles.findIndex(b => b.name === 'Manual Game List');
  if (exists >= 0) appState.bundles[exists] = manualBundle;
  else appState.bundles.unshift(manualBundle);

  renderBundles();
}

async function init() {
  try {
    const config = await api('/api/config');
    appState.hasSteamKey = config.hasSteamKey;
    appState.partnerId = config.partnerId;

    if (!config.hasSteamKey) {
      $('#api-warning').style.display = '';
    }
  } catch (_e) { /* server might not be ready yet */ }

  loadBundles();

  $('#compare-btn').addEventListener('click', compareLibrary);
  $('#steam-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') compareLibrary(); });
  $('#refresh-btn').addEventListener('click', () => loadBundles(true));
  $('#add-bundle-btn').addEventListener('click', () => {
    const modal = $('#add-bundle-modal');
    modal.style.display = modal.style.display === 'none' ? '' : 'none';
  });
  $('#bundle-url-submit').addEventListener('click', addBundleUrl);
  $('#bundle-url-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') addBundleUrl(); });
  $('#manual-compare-btn').addEventListener('click', manualCompare);
}

document.addEventListener('DOMContentLoaded', init);
