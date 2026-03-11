const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let appState = {
  hasSteamKey: false,
  partnerId: '',
  bundles: [],
  library: null,
  wishlist: null,
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
  if (!url || url === '#') return '#';
  if (appState.partnerId) {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}partner=${appState.partnerId}`;
  }
  return url;
}

function extractTierPrice(tierName) {
  const m = tierName.match(/\$(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

function classifyGame(game) {
  const ownedIds = appState.library ? new Set(appState.library.games.map(g => g.appId)) : null;
  const ownedNames = appState.library ? new Map(appState.library.games.map(g => [g.name.toLowerCase(), g])) : null;
  const wishlistIds = appState.wishlist ? new Set(appState.wishlist) : null;

  let owned = null;
  let wishlisted = false;

  if (ownedIds) {
    owned = false;
    if (game.steamAppId && ownedIds.has(game.steamAppId)) owned = true;
    else if (game.name && ownedNames.has(game.name.toLowerCase())) owned = true;
    else if (game.name) {
      const lower = game.name.toLowerCase();
      for (const [oName] of ownedNames) {
        if (oName.includes(lower) || lower.includes(oName)) { owned = true; break; }
      }
    }
  }

  if (wishlistIds && game.steamAppId) {
    wishlisted = wishlistIds.has(game.steamAppId);
  }

  return { ...game, owned, wishlisted };
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
  const compared = !!appState.library;

  container.innerHTML = appState.bundles.map(bundle => {
    const allGamesRaw = bundle.tiers?.flatMap(t => t.games) || bundle.games || [];
    const uniqueMap = new Map();
    for (const g of allGamesRaw) uniqueMap.set(g.machineName || g.name, g);
    const allGames = [...uniqueMap.values()].map(classifyGame);

    const ownedCount = allGames.filter(g => g.owned === true).length;
    const newCount = allGames.filter(g => g.owned === false).length;
    const wishlistedCount = allGames.filter(g => g.wishlisted && !g.owned).length;
    const total = allGames.length;

    const seenInTier = new Set();
    const tiersHtml = (bundle.tiers && bundle.tiers.length > 0)
      ? [...bundle.tiers].reverse().map(tier => {
          const tierPrice = extractTierPrice(tier.name);
          const tierGames = tier.games
            .filter(g => {
              const key = g.machineName || g.name;
              if (seenInTier.has(key)) return false;
              seenInTier.add(key);
              return true;
            })
            .map(g => allGames.find(ag => ag.name === g.name || (ag.machineName && ag.machineName === g.machineName)) || classifyGame(g));

          if (tierGames.length === 0) return '';

          const tierNew = tierGames.filter(g => g.owned === false).length;
          const tierMsrp = tierGames.reduce((s, g) => s + (g.msrp || 0), 0);
          const costPerNew = (compared && tierPrice && tierNew > 0) ? (tierPrice / tierNew) : null;

          let valueHtml = '';
          if (compared && tierPrice) {
            const parts = [];
            if (tierNew > 0) parts.push(`<span class="tier-value-item">$${costPerNew.toFixed(2)}/new game</span>`);
            if (tierMsrp > 0) parts.push(`<span class="tier-value-item">${Math.round((1 - tierPrice / tierMsrp) * 100)}% off MSRP</span>`);
            if (tierNew === 0) parts.push(`<span class="tier-value-item tier-value-skip">You own all ${tierGames.length} games</span>`);
            if (parts.length) valueHtml = `<div class="tier-value">${parts.join(' · ')}</div>`;
          } else if (tierPrice && tierMsrp > 0) {
            valueHtml = `<div class="tier-value"><span class="tier-value-item">Worth $${tierMsrp.toFixed(0)} · ${Math.round((1 - tierPrice / tierMsrp) * 100)}% off</span></div>`;
          }

          return `
            <div class="tier">
              <div class="tier-header">
                <div class="tier-name">${esc(tier.name)}</div>
                ${valueHtml}
              </div>
              <ul class="game-list">
                ${tierGames.map(g => gameItemHtml(g, compared)).join('')}
              </ul>
            </div>`;
        }).reverse().filter(Boolean).join('')
      : (allGames.length > 0
          ? `<div class="tier"><ul class="game-list">${allGames.map(g => gameItemHtml(g, compared)).join('')}</ul></div>`
          : `<div class="tier"><p class="no-compare-hint">No game data extracted. Try adding games manually.</p></div>`);

    const summaryParts = [];
    if (total > 0) summaryParts.push(`<span class="stat stat-total">${total} games</span>`);
    if (compared) {
      summaryParts.push(`<span class="stat stat-owned">${ownedCount} owned</span>`);
      summaryParts.push(`<span class="stat stat-new">${newCount} new</span>`);
      if (wishlistedCount > 0) summaryParts.push(`<span class="stat stat-wishlist">${wishlistedCount} wishlisted</span>`);
    }
    const summaryHtml = summaryParts.length > 0
      ? `<div class="bundle-summary">${summaryParts.join('')}</div>`
      : '';

    const topTierPrice = bundle.tiers?.reduce((max, t) => {
      const p = extractTierPrice(t.name);
      return (p && p > max) ? p : max;
    }, 0) || null;

    const totalMsrp = allGames.reduce((s, g) => s + (g.msrp || 0), 0);

    let valueBarHtml = '';
    if (compared && total > 0) {
      const pctNew = Math.round((newCount / total) * 100);
      const hasWishlisted = wishlistedCount > 0;
      let verdict = '';
      let verdictClass = '';
      if (newCount === 0) { verdict = 'You own everything here'; verdictClass = 'verdict-skip'; }
      else if (pctNew >= 70) { verdict = 'Great value — mostly new games!'; verdictClass = 'verdict-great'; }
      else if (pctNew >= 40) { verdict = 'Good value — many new games'; verdictClass = 'verdict-good'; }
      else { verdict = 'Low value — you own most of these'; verdictClass = 'verdict-low'; }

      if (hasWishlisted && newCount > 0) {
        verdict = `⭐ ${wishlistedCount} wishlisted game${wishlistedCount > 1 ? 's' : ''}! ${verdict}`;
        verdictClass = 'verdict-great';
      }

      valueBarHtml = `
        <div class="value-bar">
          <div class="value-meter">
            <div class="value-meter-fill" style="width:${pctNew}%"></div>
          </div>
          <div class="value-verdict ${verdictClass}">${verdict}</div>
        </div>`;
    }

    const ctaUrl = bundleLink(bundle.url);
    const ctaHtml = (bundle.url && bundle.url !== '#')
      ? `<div class="bundle-cta">
           <a href="${ctaUrl}" target="_blank" class="btn-cta">
             ${compared && newCount > 0
               ? `Get ${newCount} new game${newCount > 1 ? 's' : ''} ${topTierPrice ? 'from $' + topTierPrice : ''}`
               : (totalMsrp > 0 && topTierPrice
                 ? `Get ${total} games worth $${totalMsrp.toFixed(0)} ${topTierPrice ? 'from $' + topTierPrice : ''}`
                 : 'View Bundle on Humble Bundle')}
           </a>
           ${totalMsrp > 0 && topTierPrice ? `<span class="cta-savings">Save ${Math.round((1 - topTierPrice / totalMsrp) * 100)}% vs buying separately</span>` : ''}
         </div>`
      : '';

    return `
      <div class="bundle-card${wishlistedCount > 0 ? ' bundle-wishlisted' : ''}">
        <div class="bundle-header">
          <h3>${esc(bundle.name)}</h3>
          ${summaryHtml}
        </div>
        ${valueBarHtml}
        ${tiersHtml}
        ${ctaHtml}
      </div>`;
  }).join('');
}

function steamUrl(game) {
  if (game.steamAppId) return `https://store.steampowered.com/app/${game.steamAppId}`;
  return `https://store.steampowered.com/search/?term=${encodeURIComponent(game.name)}`;
}

function gameItemHtml(game, compared) {
  const badgeClass = !compared ? 'badge-unknown' : game.owned ? 'badge-owned' : 'badge-new';
  const nameClass = game.owned ? 'owned' : '';
  const tags = [];
  if (game.wishlisted && !game.owned) tags.push('<span class="game-tag tag-wishlist">WISHLISTED</span>');
  if (compared) {
    if (game.owned) tags.push('<span class="game-tag tag-owned">OWNED</span>');
    else tags.push('<span class="game-tag tag-new">NEW</span>');
  }
  const msrpHtml = game.msrp ? `<span class="game-msrp">$${game.msrp.toFixed(2)}</span>` : '';
  return `
    <li class="game-item${game.wishlisted && !game.owned ? ' game-wishlisted' : ''}">
      <span class="game-badge ${badgeClass}"></span>
      <a href="${steamUrl(game)}" target="_blank" class="game-name ${nameClass}">${esc(game.name)}</a>
      ${msrpHtml}
      ${tags.join('')}
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
  setStatus(status, 'Fetching your Steam library & wishlist…', 'loading');

  try {
    const data = await api(`/api/steam/library?profile=${encodeURIComponent(input)}`);
    appState.library = data;
    appState.wishlist = data.wishlist || [];
    appState.steamId = data.steamId;
    const parts = [`✓ Found ${data.gameCount} games`];
    if (data.wishlistCount > 0) parts.push(`${data.wishlistCount} wishlisted`);
    setStatus(status, parts.join(' · '), 'success');
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
      if (!exists) appState.bundles.unshift(data.bundle);
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
    if (!config.hasSteamKey) $('#api-warning').style.display = '';
  } catch (_e) { /* server might not be ready */ }

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
