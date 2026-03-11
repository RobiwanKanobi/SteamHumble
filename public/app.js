const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let appState = {
  hasSteamKey: false,
  partnerId: '',
  bundles: [],
  library: null,
  wishlist: null,
  steamId: null,
  viewMode: 'list',
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

function steamCapsule(appId, size) {
  if (!appId) return '';
  if (size === 'header') return `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`;
  if (size === 'capsule') return `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/capsule_231x87.jpg`;
  return `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/capsule_sm_120.jpg`;
}

function steamUrl(game) {
  if (game.steamAppId) return `https://store.steampowered.com/app/${game.steamAppId}`;
  return `https://store.steampowered.com/search/?term=${encodeURIComponent(game.name)}`;
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

  if (wishlistIds && game.steamAppId) wishlisted = wishlistIds.has(game.steamAppId);

  return { ...game, owned, wishlisted };
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

/* ---------- Bundle rendering ---------- */

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

    const heroImg = bundle.logo || bundle.image || null;

    const heroHtml = heroImg
      ? `<div class="bundle-hero"><img src="${heroImg}" alt="${esc(bundle.name)}" loading="lazy"></div>`
      : '';

    const summaryParts = [];
    if (total > 0) summaryParts.push(`<span class="stat stat-total">${total} games</span>`);
    if (compared) {
      summaryParts.push(`<span class="stat stat-owned">${ownedCount} owned</span>`);
      summaryParts.push(`<span class="stat stat-new">${newCount} new</span>`);
      if (wishlistedCount > 0) summaryParts.push(`<span class="stat stat-wishlist">${wishlistedCount} wishlisted</span>`);
    }
    const summaryHtml = summaryParts.length ? `<div class="bundle-summary">${summaryParts.join('')}</div>` : '';

    let valueBarHtml = '';
    if (compared && total > 0) {
      const pctNew = Math.round((newCount / total) * 100);
      let verdict = '', verdictClass = '';
      if (newCount === 0) { verdict = 'You own everything here'; verdictClass = 'verdict-skip'; }
      else if (pctNew >= 70) { verdict = 'Great value — mostly new games!'; verdictClass = 'verdict-great'; }
      else if (pctNew >= 40) { verdict = 'Good value — many new games'; verdictClass = 'verdict-good'; }
      else { verdict = 'Low value — you own most of these'; verdictClass = 'verdict-low'; }
      if (wishlistedCount > 0 && newCount > 0) {
        verdict = `⭐ ${wishlistedCount} wishlisted! ${verdict}`;
        verdictClass = 'verdict-great';
      }
      valueBarHtml = `
        <div class="value-bar">
          <div class="value-meter"><div class="value-meter-fill" style="width:${pctNew}%"></div></div>
          <div class="value-verdict ${verdictClass}">${verdict}</div>
        </div>`;
    }

    const wishlistedGames = allGames.filter(g => g.wishlisted && !g.owned);
    let wishlistCalloutHtml = '';
    if (wishlistedGames.length > 0) {
      const gameChips = wishlistedGames.map(g => {
        const thumbSrc = g.steamAppId ? steamCapsule(g.steamAppId, 'small') : '';
        const thumbImg = thumbSrc ? `<img src="${thumbSrc}" alt="" class="callout-thumb">` : '';
        return `<a href="${steamUrl(g)}" target="_blank" class="callout-game">${thumbImg}<span>${esc(g.name)}</span></a>`;
      }).join('');
      wishlistCalloutHtml = `
        <div class="wishlist-callout">
          <div class="callout-header">⭐ ${wishlistedGames.length} game${wishlistedGames.length > 1 ? 's' : ''} from your wishlist!</div>
          <div class="callout-games">${gameChips}</div>
        </div>`;
    }

    const seenInTier = new Set();
    const tiersHtml = (bundle.tiers && bundle.tiers.length > 0)
      ? [...bundle.tiers].reverse().map(tier => {
          const tierPrice = extractTierPrice(tier.name);
          const tierGames = tier.games
            .filter(g => { const k = g.machineName || g.name; if (seenInTier.has(k)) return false; seenInTier.add(k); return true; })
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

          const gamesHtml = appState.viewMode === 'grid'
            ? `<div class="game-grid">${tierGames.map(g => gameCardHtml(g, compared)).join('')}</div>`
            : `<ul class="game-list">${tierGames.map(g => gameListHtml(g, compared)).join('')}</ul>`;

          return `
            <div class="tier">
              <div class="tier-header">
                <div class="tier-name">${esc(tier.name)}</div>
                ${valueHtml}
              </div>
              ${gamesHtml}
            </div>`;
        }).reverse().filter(Boolean).join('')
      : (allGames.length > 0
          ? `<div class="tier">${appState.viewMode === 'grid'
              ? `<div class="game-grid">${allGames.map(g => gameCardHtml(g, compared)).join('')}</div>`
              : `<ul class="game-list">${allGames.map(g => gameListHtml(g, compared)).join('')}</ul>`
            }</div>`
          : `<div class="tier"><p class="no-compare-hint">No game data extracted. Try adding games manually.</p></div>`);

    const topTierPrice = bundle.tiers?.reduce((max, t) => { const p = extractTierPrice(t.name); return (p && p > max) ? p : max; }, 0) || null;
    const totalMsrp = allGames.reduce((s, g) => s + (g.msrp || 0), 0);

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
        ${heroHtml}
        <div class="bundle-header">
          <h3>${esc(bundle.name)}</h3>
          ${summaryHtml}
        </div>
        ${valueBarHtml}
        ${wishlistCalloutHtml}
        ${tiersHtml}
        ${ctaHtml}
      </div>`;
  }).join('');

  setupHoverPreviews();
}

/* ---------- List view game item ---------- */

function gameListHtml(game, compared) {
  const badgeClass = !compared ? 'badge-unknown' : game.owned ? 'badge-owned' : 'badge-new';
  const nameClass = game.owned ? 'owned' : '';
  const tags = [];
  if (game.wishlisted && !game.owned) tags.push('<span class="game-tag tag-wishlist">WISHLISTED</span>');
  if (compared) {
    tags.push(game.owned ? '<span class="game-tag tag-owned">OWNED</span>' : '<span class="game-tag tag-new">NEW</span>');
  }
  const msrpHtml = game.msrp ? `<span class="game-msrp">$${game.msrp.toFixed(2)}</span>` : '';
  const thumbSrc = game.steamAppId ? steamCapsule(game.steamAppId, 'small') : (game.icon || '');
  const thumbHtml = thumbSrc
    ? `<img class="game-thumb" src="${thumbSrc}" alt="" loading="lazy" onerror="this.style.display='none'">`
    : '<span class="game-thumb-placeholder"></span>';

  return `
    <li class="game-item${game.wishlisted && !game.owned ? ' game-wishlisted' : ''}"
        data-appid="${game.steamAppId || ''}" data-name="${esc(game.name)}" data-rating="${esc(game.rating || '')}" data-msrp="${game.msrp || ''}">
      <span class="game-badge ${badgeClass}"></span>
      ${thumbHtml}
      <a href="${steamUrl(game)}" target="_blank" class="game-name ${nameClass}">${esc(game.name)}</a>
      ${msrpHtml}
      ${tags.join('')}
    </li>`;
}

/* ---------- Grid/card view game item ---------- */

function gameCardHtml(game, compared) {
  const headerSrc = game.steamAppId ? steamCapsule(game.steamAppId, 'header') : (game.icon || '');
  const owned = game.owned === true;
  const isWishlisted = game.wishlisted && !owned;
  const tags = [];
  if (isWishlisted) tags.push('<span class="game-tag tag-wishlist">WISHLISTED</span>');
  if (compared) tags.push(owned ? '<span class="game-tag tag-owned">OWNED</span>' : '<span class="game-tag tag-new">NEW</span>');

  const starHtml = isWishlisted ? '<div class="game-card-star">⭐</div>' : '';

  return `
    <a href="${steamUrl(game)}" target="_blank" class="game-card ${owned ? 'game-card-owned' : ''} ${isWishlisted ? 'game-card-wishlisted' : ''}"
       data-appid="${game.steamAppId || ''}" data-name="${esc(game.name)}" data-rating="${esc(game.rating || '')}" data-msrp="${game.msrp || ''}">
      <div class="game-card-img">
        ${headerSrc ? `<img src="${headerSrc}" alt="${esc(game.name)}" loading="lazy" onerror="this.parentElement.classList.add('img-error')">` : ''}
        ${owned ? '<div class="game-card-owned-overlay">OWNED</div>' : ''}
        ${starHtml}
        <div class="game-card-tags">${tags.join('')}</div>
      </div>
      <div class="game-card-info">
        <div class="game-card-name">${isWishlisted ? '⭐ ' : ''}${esc(game.name)}</div>
        <div class="game-card-meta">
          ${game.rating ? `<span class="game-card-rating">${esc(game.rating)}</span>` : ''}
          ${game.msrp ? `<span class="game-card-price">$${game.msrp.toFixed(2)}</span>` : ''}
        </div>
      </div>
    </a>`;
}

/* ---------- Hover preview with trailer ---------- */

let previewEl = null;
let previewHls = null;
let previewTimer = null;
const trailerCache = new Map();

function setupHoverPreviews() {
  if (!previewEl) {
    previewEl = document.createElement('div');
    previewEl.className = 'hover-preview';
    previewEl.style.display = 'none';
    document.body.appendChild(previewEl);
  }

  document.querySelectorAll('.game-item, .game-card').forEach(el => {
    el.addEventListener('mouseenter', showPreview);
    el.addEventListener('mouseleave', hidePreview);
  });
}

function positionPreview(anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  const pw = 340;
  let left = rect.right + 12;
  if (left + pw > window.innerWidth) left = rect.left - pw - 12;
  if (left < 4) left = 4;
  let top = rect.top;
  if (top + 280 > window.innerHeight) top = window.innerHeight - 290;
  if (top < 4) top = 4;
  previewEl.style.left = left + 'px';
  previewEl.style.top = top + 'px';
}

function showPreview(e) {
  clearTimeout(previewTimer);
  destroyPreviewHls();

  const el = e.currentTarget;
  const appId = el.dataset.appid;
  const name = el.dataset.name;
  const rating = el.dataset.rating;
  const msrp = el.dataset.msrp;
  if (!appId) return;

  const headerSrc = steamCapsule(appId, 'header');
  previewEl.innerHTML = `
    <div class="preview-media">
      <img class="preview-img" src="${headerSrc}" alt="${esc(name)}" onerror="this.style.display='none'">
      <video class="preview-video" muted playsinline style="display:none"></video>
      <div class="preview-loading" style="display:none"><div class="spinner"></div></div>
    </div>
    <div class="preview-body">
      <div class="preview-name">${esc(name)}</div>
      ${rating ? `<div class="preview-rating">${esc(rating)}</div>` : ''}
      ${msrp ? `<div class="preview-price">MSRP: $${parseFloat(msrp).toFixed(2)}</div>` : ''}
      <div class="preview-link">Click to view on Steam →</div>
    </div>`;
  previewEl.style.display = '';
  positionPreview(el);

  previewTimer = setTimeout(() => loadTrailer(appId), 400);
}

async function loadTrailer(appId) {
  if (previewEl.style.display === 'none') return;

  const video = previewEl.querySelector('.preview-video');
  const img = previewEl.querySelector('.preview-img');
  const loading = previewEl.querySelector('.preview-loading');
  if (!video) return;

  let data = trailerCache.get(appId);
  if (!data) {
    loading.style.display = '';
    try {
      data = await api(`/api/steam/trailer/${appId}`);
      trailerCache.set(appId, data);
    } catch (_e) {
      loading.style.display = 'none';
      return;
    }
  }

  if (previewEl.style.display === 'none') return;
  loading.style.display = 'none';

  if (!data.trailer?.hls) return;

  if (typeof Hls !== 'undefined' && Hls.isSupported()) {
    previewHls = new Hls({ maxBufferLength: 5, maxMaxBufferLength: 10 });
    previewHls.loadSource(data.trailer.hls);
    previewHls.attachMedia(video);
    previewHls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.style.display = '';
      img.style.display = 'none';
      video.play().catch(() => {});
    });
    previewHls.on(Hls.Events.ERROR, () => {
      video.style.display = 'none';
      img.style.display = '';
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = data.trailer.hls;
    video.addEventListener('loadedmetadata', () => {
      video.style.display = '';
      img.style.display = 'none';
      video.play().catch(() => {});
    }, { once: true });
  }
}

function destroyPreviewHls() {
  if (previewHls) {
    previewHls.destroy();
    previewHls = null;
  }
}

function hidePreview() {
  clearTimeout(previewTimer);
  destroyPreviewHls();
  if (previewEl) previewEl.style.display = 'none';
}

/* ---------- View switcher ---------- */

function setView(mode) {
  appState.viewMode = mode;
  $$('.view-btn').forEach(b => b.classList.toggle('view-btn-active', b.dataset.view === mode));
  renderChoice();
  renderBundles();
}

/* ---------- Humble Choice ---------- */

let choiceData = null;

function renderChoice() {
  const section = $('#choice-section');
  const container = $('#choice-container');
  if (!choiceData) { section.style.display = 'none'; return; }

  section.style.display = '';
  const compared = !!appState.library;
  const games = choiceData.games.map(classifyGame);
  const ownedCount = games.filter(g => g.owned === true).length;
  const newCount = games.filter(g => g.owned === false).length;
  const wishlistedCount = games.filter(g => g.wishlisted && !g.owned).length;
  const total = games.length;

  const summaryParts = [`${total} games`];
  if (compared) {
    summaryParts.push(`${ownedCount} owned`);
    summaryParts.push(`${newCount} new`);
    if (wishlistedCount > 0) summaryParts.push(`${wishlistedCount} wishlisted`);
  }

  let verdictHtml = '';
  if (compared && total > 0) {
    const pctNew = Math.round((newCount / total) * 100);
    let verdict = '', verdictClass = '';
    if (newCount === 0) { verdict = 'You own everything — skip this month'; verdictClass = 'verdict-skip'; }
    else if (pctNew >= 70) { verdict = 'Great month — mostly new games!'; verdictClass = 'verdict-great'; }
    else if (pctNew >= 40) { verdict = 'Decent month — several new games'; verdictClass = 'verdict-good'; }
    else { verdict = 'Weak month for you — you own most of these'; verdictClass = 'verdict-low'; }
    if (wishlistedCount > 0 && newCount > 0) {
      verdict = `⭐ ${wishlistedCount} wishlisted! ${verdict}`;
      verdictClass = 'verdict-great';
    }
    const costPerNew = newCount > 0 ? (choiceData.price / newCount).toFixed(2) : null;
    verdictHtml = `
      <div class="choice-verdict">
        <div class="value-meter"><div class="value-meter-fill" style="width:${pctNew}%"></div></div>
        <span class="value-verdict ${verdictClass}">${verdict}</span>
        ${costPerNew ? `<span class="choice-cpg">$${costPerNew}/new game</span>` : ''}
      </div>`;
  }

  const wishlistCallout = (wishlistedCount > 0)
    ? `<div class="wishlist-callout">
         <div class="callout-header">⭐ ${wishlistedCount} game${wishlistedCount > 1 ? 's' : ''} from your wishlist!</div>
         <div class="callout-games">${games.filter(g => g.wishlisted && !g.owned).map(g => {
           const thumb = g.steamAppId ? steamCapsule(g.steamAppId, 'small') : '';
           return `<a href="${steamUrl(g)}" target="_blank" class="callout-game">${thumb ? `<img src="${thumb}" class="callout-thumb">` : ''}<span>${esc(g.name)}</span></a>`;
         }).join('')}</div>
       </div>`
    : '';

  const gamesHtml = appState.viewMode === 'grid'
    ? `<div class="game-grid choice-grid">${games.map(g => gameCardHtml(g, compared)).join('')}</div>`
    : `<ul class="game-list">${games.map(g => gameListHtml(g, compared)).join('')}</ul>`;

  const bonusHtml = choiceData.bonuses?.length
    ? `<div class="choice-bonuses">Also includes: ${choiceData.bonuses.map(b => esc(b)).join(', ')}</div>`
    : '';

  const ctaUrl = bundleLink(choiceData.url);
  const ctaText = compared && newCount > 0
    ? `Get ${newCount} new games for $${choiceData.price}`
    : `Get ${total} games for $${choiceData.price}/month`;

  container.innerHTML = `
    <div class="choice-card">
      ${choiceData.heroImage ? `<div class="choice-hero"><img src="${choiceData.heroImage}" alt="${esc(choiceData.name)}" loading="lazy"><div class="choice-hero-overlay"><div class="choice-badge">HUMBLE CHOICE</div></div></div>` : ''}
      <div class="choice-header">
        <div>
          <h2 class="choice-title">${esc(choiceData.name)}</h2>
          <div class="choice-subtitle">$${choiceData.price}/month · All ${total} games included</div>
        </div>
        <div class="bundle-summary">${summaryParts.map((s, i) => {
          const cls = i === 0 ? 'stat-total' : s.includes('owned') ? 'stat-owned' : s.includes('new') ? 'stat-new' : 'stat-wishlist';
          return `<span class="stat ${cls}">${s}</span>`;
        }).join('')}</div>
      </div>
      ${verdictHtml}
      ${wishlistCallout}
      <div class="choice-games">${gamesHtml}</div>
      ${bonusHtml}
      <div class="bundle-cta choice-cta">
        <a href="${ctaUrl}" target="_blank" class="btn-cta btn-cta-choice">${ctaText}</a>
        <span class="cta-savings">Best value subscription — cancel anytime</span>
      </div>
    </div>`;

  setupHoverPreviews();
}

async function loadChoice() {
  try {
    const data = await api('/api/choice');
    choiceData = data.choice;
    renderChoice();
  } catch (err) {
    console.error('Failed to load Humble Choice:', err);
  }
}

/* ---------- Data loading ---------- */

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

/* ---------- Smart input detection ---------- */

function detectInputType(val) {
  const trimmed = val.trim();
  if (!trimmed) return null;
  if (/^\d{17}$/.test(trimmed)) return { type: 'steamid64', label: 'SteamID64 detected', icon: '✓' };
  if (/steamcommunity\.com\/profiles\/\d{17}/.test(trimmed)) return { type: 'profile_url', label: 'Steam profile URL detected', icon: '✓' };
  if (/steamcommunity\.com\/id\/[^/]+/.test(trimmed)) return { type: 'vanity_url', label: 'Steam custom URL detected', icon: '✓' };
  if (trimmed.includes('steamcommunity.com')) return { type: 'steam_url', label: 'Steam URL detected', icon: '✓' };
  if (trimmed.includes(' ') || trimmed.length > 40) return { type: 'probably_name', label: 'This looks like a display name — paste your profile URL instead', icon: '⚠' };
  return { type: 'vanity_guess', label: 'Will try as custom URL', icon: '…' };
}

function updateInputDetect() {
  const el = $('#input-detect');
  const val = $('#steam-input').value;
  const detect = detectInputType(val);
  if (!detect) { el.style.display = 'none'; return; }
  const cls = (detect.icon === '✓') ? 'detect-ok' : (detect.icon === '⚠') ? 'detect-warn' : 'detect-neutral';
  el.innerHTML = `<span class="${cls}">${detect.icon} ${detect.label}</span>`;
  el.style.display = '';
}

/* ---------- Profile connection ---------- */

function showProfileCard(player, stats) {
  const card = $('#profile-card');
  $('#profile-avatar').src = player.avatar;
  $('#profile-name').textContent = player.name;
  $('#profile-stats').textContent = stats;
  card.style.display = '';
  $('#steam-input').parentElement.style.display = 'none';
  $('.profile-actions').style.display = 'none';
  $('#input-detect').style.display = 'none';
}

function disconnectProfile() {
  $('#profile-card').style.display = 'none';
  $('#steam-input').parentElement.style.display = '';
  $('.profile-actions').style.display = '';
  $('#profile-status').textContent = '';
  appState.library = null;
  appState.wishlist = null;
  appState.steamId = null;
  renderBundles();
}

function showPrivacyGuide(reason, player) {
  const guide = $('#privacy-guide');
  const name = player?.name || 'your profile';
  const settingsUrl = 'https://steamcommunity.com/my/edit/settings';

  if (reason === 'profile_private') {
    guide.innerHTML = `
      <div class="privacy-header">🔒 ${esc(name)}'s profile is private</div>
      <p>We found your account but can't see your games. Follow these steps:</p>
      <ol class="privacy-steps">
        <li>Open <a href="${settingsUrl}" target="_blank">Steam Privacy Settings</a> (opens Steam)</li>
        <li>Set <strong>My profile</strong> → <strong>Public</strong></li>
        <li>Set <strong>Game details</strong> → <strong>Public</strong></li>
        <li>Click <strong>Save</strong></li>
        <li>Come back here and click <button class="btn-link btn-retry" type="button">Retry</button></li>
      </ol>
      <div class="privacy-note">Changes take effect immediately — no need to restart Steam.</div>`;
  } else if (reason === 'games_private') {
    guide.innerHTML = `
      <div class="privacy-header">🔒 ${esc(name)}'s game details are hidden</div>
      <p>Your profile is public but your game list is hidden. Quick fix:</p>
      <ol class="privacy-steps">
        <li>Open <a href="${settingsUrl}" target="_blank">Steam Privacy Settings</a></li>
        <li>Set <strong>Game details</strong> → <strong>Public</strong></li>
        <li>Click <strong>Save</strong>, then <button class="btn-link btn-retry" type="button">Retry</button></li>
      </ol>`;
  }

  guide.style.display = '';
  guide.querySelector('.btn-retry')?.addEventListener('click', () => {
    guide.style.display = 'none';
    compareLibrary();
  });
}

async function compareLibrary() {
  const input = $('#steam-input').value.trim();
  const status = $('#profile-status');
  const btn = $('#compare-btn');
  const privacyGuide = $('#privacy-guide');
  privacyGuide.style.display = 'none';

  if (!input) { setStatus(status, 'Please enter a Steam profile.', 'error'); return; }
  if (!appState.hasSteamKey) { setStatus(status, 'Steam API key is not configured on the server.', 'error'); return; }

  btn.disabled = true;
  setStatus(status, 'Checking your Steam profile…', 'loading');

  try {
    const check = await api(`/api/steam/check?profile=${encodeURIComponent(input)}`);

    if (!check.resolved) {
      setStatus(status, 'Could not find that Steam profile.', 'error');
      btn.disabled = false;
      return;
    }

    if (check.reason === 'profile_private' || check.reason === 'games_private') {
      setStatus(status, '', '');
      showPrivacyGuide(check.reason, check.player);
      btn.disabled = false;
      return;
    }

    setStatus(status, `Found ${esc(check.player?.name || 'profile')} — loading ${check.gameCount} games…`, 'loading');

    const data = await api(`/api/steam/library?profile=${encodeURIComponent(input)}`);
    appState.library = data;
    appState.wishlist = data.wishlist || [];
    appState.steamId = data.steamId;

    localStorage.setItem('steam_profile', input);

    const parts = [`${data.gameCount} games`];
    if (data.wishlistCount > 0) parts.push(`${data.wishlistCount} wishlisted`);

    if (check.player) {
      showProfileCard(check.player, parts.join(' · '));
    }
    setStatus(status, `✓ ${parts.join(' · ')}`, 'success');
    renderChoice();
    renderBundles();
  } catch (err) {
    setStatus(status, err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

function tryDemo() {
  $('#steam-input').value = '76561198006409530';
  updateInputDetect();
  compareLibrary();
}

async function addBundleUrl() {
  const input = $('#bundle-url-input');
  const url = input.value.trim();
  if (!url) return;
  try {
    const data = await api('/api/bundles/add', { method: 'POST', body: { url } });
    if (data.bundle) {
      if (!appState.bundles.find(b => b.url === data.bundle.url)) appState.bundles.unshift(data.bundle);
      renderBundles();
      input.value = '';
      $('#add-bundle-modal').style.display = 'none';
    }
  } catch (err) { alert('Failed to fetch bundle: ' + err.message); }
}

async function manualCompare() {
  const text = $('#manual-games').value.trim();
  if (!text) return;
  const names = text.split('\n').map(l => l.trim()).filter(Boolean);
  const manualBundle = {
    name: 'Manual Game List', url: '#',
    tiers: [{ name: 'Games', games: names.map(n => ({ name: n, steamAppId: null })) }],
    games: names.map(n => ({ name: n, steamAppId: null })),
  };
  const i = appState.bundles.findIndex(b => b.name === 'Manual Game List');
  if (i >= 0) appState.bundles[i] = manualBundle; else appState.bundles.unshift(manualBundle);
  renderBundles();
}

/* ---------- Init ---------- */

async function init() {
  try {
    const config = await api('/api/config');
    appState.hasSteamKey = config.hasSteamKey;
    appState.partnerId = config.partnerId;
    if (!config.hasSteamKey) $('#api-warning').style.display = '';
  } catch (_e) {}

  loadChoice();
  loadBundles();

  const savedProfile = localStorage.getItem('steam_profile');
  if (savedProfile) {
    $('#steam-input').value = savedProfile;
    updateInputDetect();
  }

  $('#compare-btn').addEventListener('click', compareLibrary);
  $('#steam-input').addEventListener('keydown', e => { if (e.key === 'Enter') compareLibrary(); });
  $('#steam-input').addEventListener('input', updateInputDetect);
  $('#steam-input').addEventListener('paste', () => setTimeout(updateInputDetect, 0));
  $('#demo-btn').addEventListener('click', tryDemo);
  $('#help-toggle').addEventListener('click', () => {
    const g = $('#help-guide');
    g.style.display = g.style.display === 'none' ? '' : 'none';
  });
  $('#profile-disconnect').addEventListener('click', disconnectProfile);
  $('#refresh-btn').addEventListener('click', () => loadBundles(true));
  $('#add-bundle-btn').addEventListener('click', () => {
    const m = $('#add-bundle-modal');
    m.style.display = m.style.display === 'none' ? '' : 'none';
  });
  $('#bundle-url-submit').addEventListener('click', addBundleUrl);
  $('#bundle-url-input').addEventListener('keydown', e => { if (e.key === 'Enter') addBundleUrl(); });
  $('#manual-compare-btn').addEventListener('click', manualCompare);

  $$('.view-btn').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
}

document.addEventListener('DOMContentLoaded', init);
