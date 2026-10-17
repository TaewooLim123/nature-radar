/* Shared helpers: iNaturalist access (rate-limited, cached, failure-tolerant), rarity, filters, UI bits. */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const API = 'https://api.inaturalist.org/v1';
const QUALITY = 'research,needs_id';
const BASELINE_PAGES = 3;
const SPECIES_PER_PAGE = 500;
const MIN_GAP_MS = 1000;        // iNaturalist asks for ~1 request/second
const TIMEOUT_MS = 15000;       // give up on a request that hangs this long
const CACHE_PREFIX = 'nr4|';    // bump when the cached shape changes
const LAST_GOOD_CACHE = 'nr-last-good-v1';
const SPECIES_RANKS = new Set(['species', 'subspecies', 'variety', 'form', 'hybrid']);

// Lower bound of each tier's rarity score (0 = most common here, 1 = rarest).
const TIERS = [
  { key: 'veryrare', label: 'Very rare', min: 0.85 },
  { key: 'rare', label: 'Rare', min: 0.65 },
  { key: 'uncommon', label: 'Uncommon', min: 0.4 },
  { key: 'common', label: 'Common', min: 0 },
];
export const TIER_LABEL = {
  ...Object.fromEntries(TIERS.map(t => [t.key, t.label])),
  unranked: 'Unranked',
  unrated: 'Not rated yet',
  needsid: 'Needs ID',
};
const TIER_ORDER = ['veryrare', 'rare', 'uncommon', 'common', 'unranked', 'unrated', 'needsid'];
// Higher = rarer (for "best first" sorting). Rare and very rare catches are "shiny" in the dex.
export const TIER_RANK = { veryrare: 4, rare: 3, uncommon: 2, common: 1, unranked: 0, unrated: 0 };
export const isShiny = tier => tier === 'rare' || tier === 'veryrare';
export const dexNo = n => `#${String(n).padStart(3, '0')}`;
export const DE_ANZA = { lat: 37.3193, lng: -122.0453, label: 'De Anza College', kind: 'place' };

// Taxonomic groups for the filter chips, keyed by iNaturalist's iconic_taxon_name.
export const GROUPS = [
  { key: 'all', label: 'All' },
  { key: 'Aves', label: 'Birds', noun: 'bird', core: true },
  { key: 'Plantae', label: 'Plants', noun: 'plant', core: true },
  { key: 'Mammalia', label: 'Mammals', noun: 'mammal', core: true },
  { key: 'Insecta', label: 'Insects', noun: 'insect', core: true },
  { key: 'Fungi', label: 'Fungi', noun: 'fungus', core: true },
  { key: 'Reptilia', label: 'Reptiles', noun: 'reptile' },
  { key: 'Amphibia', label: 'Amphibians', noun: 'amphibian' },
  { key: 'Arachnida', label: 'Spiders & kin', noun: 'arachnid' },
  { key: 'other', label: 'Other', noun: '' },
];
const GROUP_KEYS = new Set(GROUPS.map(g => g.key));
export const groupOf = iconic => (iconic && GROUP_KEYS.has(iconic) && iconic !== 'all' ? iconic : 'other');

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const abortError = () => new DOMException('Aborted', 'AbortError');

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(abortError()); }, { once: true });
  });
}

// Local calendar date, `days` ago, as YYYY-MM-DD.
export function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return localDay(d);
}
export const localDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function haversineKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const formatDistance = km => km < 1 ? `${Math.max(10, Math.round(km * 100) * 10)} m` : `${km.toFixed(1)} km`;

// "Sun, Oct 11 · 5 days ago" from a YYYY-MM-DD date.
export function formatDate(iso) {
  if (!iso) return 'Date unknown';
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((today - date) / 86400000);
  const abs = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const rel = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  return `${abs} · ${rel}`;
}

// "Fri, Oct 16, 3:42 PM" from a full ISO timestamp.
export const formatDateTime = (iso, opts = {}) => new Date(iso).toLocaleString(undefined,
  { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', ...opts });

// "5 min ago", "3 h ago", "2 d ago", then a date.
export function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// iNat photo URLs end in /square.jpg, /medium.jpg, etc.
export const photoSize = (url, size) => url ? url.replace(/\/(square|thumb|small|medium|large|original)\./, `/${size}.`) : null;

export const displayName = t => t.common || t.name;

export function tierFor(rarity) {
  if (rarity < 0) return 'unranked';
  return TIERS.find(t => rarity >= t.min).key;
}

// Badge for species iNaturalist lists as introduced at a place. Some introduced species spread
// invasively and crowd out native wildlife, so the app flags them.
export const NON_NATIVE_TIP = 'Not native here: introduced by people. Some introduced species spread invasively and harm local wildlife.';
export const nonNativeBadge = () => `<span class="badge-nn" title="${NON_NATIVE_TIP}">⚠ Non-native</span>`;
// Compact version for list rows and tiles: just the ⚠, with the explanation for screen readers and on hover.
export const nonNativeMark = () => `<span class="nn-mark" title="${NON_NATIVE_TIP}" role="img" aria-label="Non-native">⚠</span>`;

// A section heading whose explanation stays folded away until you tap the ⓘ (progressive disclosure:
// the screen shows the title; the "why" is one tap away).
export const infoHead = (title, text, { id = '', level = 2 } = {}) => `<details class="info-head">
  <summary><h${level}${id ? ` id="${id}"` : ''}>${title}</h${level}><span class="info-i" aria-label="More about this">i</span></summary>
  <p class="list-sub">${text}</p>
</details>`;

export const taxonUrl = id => `https://www.inaturalist.org/taxa/${id}`;

export const newId = () => crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function stateCard({ icon, title, text, actions = '', error = false }) {
  return `<div class="state${error ? ' is-error' : ''}">
    <div class="state-icon" aria-hidden="true">${icon}</div>
    <h3>${title}</h3>
    <p>${text}</p>
    ${actions ? `<div class="state-actions">${actions}</div>` : ''}
  </div>`;
}

export const skeletonRows = n => Array.from({ length: n }, () => `
  <li class="sk-row" aria-hidden="true"><span class="sk sk-thumb"></span>
    <span class="sk-lines"><span class="sk sk-l1"></span><span class="sk sk-l2"></span><span class="sk sk-l3"></span></span></li>`).join('');

// Short messages at the bottom of the screen, shown one after another.
const toastQueue = [];
let toastBusy = false;
export function toast(message) {
  if (toastQueue[toastQueue.length - 1] === message) return;
  toastQueue.push(message);
  if (!toastBusy) nextToast();
}
function nextToast() {
  const t = document.getElementById('toast');
  const message = toastQueue.shift();
  if (!message) { toastBusy = false; t.hidden = true; return; }
  toastBusy = true;
  t.textContent = message;
  t.hidden = false;
  setTimeout(nextToast, toastQueue.length ? 2600 : 4000);
}

// Tells other parts of the app that sightings/posts changed (achievements listen for this).
// "Top first + show more": a list shows its first items; the rest have .is-extra and appear when
// the button opens the list (CSS: .more-list:not(.is-open) > .is-extra { display: none }).
export const moreButton = (listId, total, shown) => total > shown
  ? `<button type="button" class="btn btn-ghost btn-small more-btn" data-action="toggle-more" aria-controls="${listId}" aria-expanded="false" data-label="Show all ${total}">Show all ${total}</button>` : '';
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-action="toggle-more"]');
  const list = btn && document.getElementById(btn.getAttribute('aria-controls'));
  if (!list) return;
  const open = list.classList.toggle('is-open');
  btn.setAttribute('aria-expanded', open);
  btn.textContent = open ? 'Show fewer' : btn.dataset.label;
  if (!open) list.scrollIntoView({ block: 'nearest' });
});

export const announceChange = () => document.dispatchEvent(new CustomEvent('nr:data-changed'));

// Small JSON values kept in localStorage (profile, likes, settings). Never throws.
export const local = {
  get(key, fallback) {
    try { const raw = localStorage.getItem(key); return raw == null ? fallback : JSON.parse(raw); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked or full */ }
  },
};

// Your profile (name + avatar), shown on community posts and the account page.
const AVATARS = ['🦉', '🦊', '🐢', '🦋', '🍄', '🌿', '🐝', '🦎', '🐿️', '🐦', '🐸', '🦌'];
const AVATAR_COLORS = ['#2f6b3f', '#2b8595', '#c47f12', '#bd2f6a', '#6a4fb3', '#3b6fb6', '#8a5a2b'];
export const avatarChoices = () => AVATARS;
export const avatarColors = () => AVATAR_COLORS;
export function getProfile() {
  let p = local.get('nr-profile', null);
  if (!p) {
    p = {
      name: '',
      avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
      color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
      since: new Date().toISOString(),
    };
    local.set('nr-profile', p);
  }
  return p;
}
export function saveProfile(patch) {
  const p = { ...getProfile(), ...patch };
  local.set('nr-profile', p);
  document.dispatchEvent(new CustomEvent('nr:profile-changed'));
  return p;
}

// ---------------------------------------------------------------------------
// Group + rarity filters (two chip rows, each row's counts respect the other row)
// ---------------------------------------------------------------------------
export const matchesFilter = (item, f) =>
  (f.group === 'all' || groupOf(item.iconic) === f.group) && (f.tier === 'all' || item.tier === f.tier);

export function filterBarHtml(scope, items, f) {
  const groupCounts = {}, tierCounts = {};
  let groupTotal = 0, tierTotal = 0;
  for (const it of items) {
    const g = groupOf(it.iconic);
    if (f.tier === 'all' || it.tier === f.tier) { groupCounts[g] = (groupCounts[g] || 0) + 1; groupTotal++; }
    if (f.group === 'all' || g === f.group) { tierCounts[it.tier] = (tierCounts[it.tier] || 0) + 1; tierTotal++; }
  }
  const groups = GROUPS.filter(g => g.key === 'all' || g.core || groupCounts[g.key] || g.key === f.group);
  const tiers = TIER_ORDER.filter(t => tierCounts[t] || t === f.tier || TIERS.some(x => x.key === t));
  const chip = (kind, key, label, count, cls = '') =>
    `<button type="button" class="chip${cls}" data-action="filter" data-scope="${scope}" data-kind="${kind}" data-value="${key}" aria-pressed="${f[kind] === key}">${label}<span class="chip-count">${count}</span></button>`;
  return `
    <div class="chip-row" role="toolbar" aria-label="Filter by group">
      ${groups.map(g => chip('group', g.key, g.label, g.key === 'all' ? groupTotal : groupCounts[g.key] || 0)).join('')}
    </div>
    <div class="chip-row chip-row-sub" role="toolbar" aria-label="Filter by rarity">
      ${chip('tier', 'all', 'Any rarity', tierTotal, ' chip-sub')}
      ${tiers.map(t => chip('tier', t, `<i class="dot t-${t}"></i>${TIER_LABEL[t]}`, tierCounts[t] || 0, ' chip-sub')).join('')}
    </div>`;
}

// "rare bird " / "" — for headings like "4 rare bird species".
export function filterNoun(f) {
  const tier = f.tier !== 'all' ? `${TIER_LABEL[f.tier].toLowerCase()} ` : '';
  const noun = GROUPS.find(g => g.key === f.group)?.noun;
  return `${tier}${noun ? `${noun} ` : ''}`;
}

// ---------------------------------------------------------------------------
// Network: timeouts, retries, offline fallbacks
// ---------------------------------------------------------------------------
export const isOffline = () => navigator.onLine === false;

// fetch + read the body, all inside one time limit. Throws an Error with .status / .offline / .timeout.
export async function requestJSON(url, options = {}, timeoutMs = TIMEOUT_MS) {
  if (isOffline()) throw Object.assign(new Error('You are offline'), { offline: true });
  const controller = new AbortController();
  const outer = options.signal;
  if (outer?.aborted) throw abortError();
  const onAbort = () => controller.abort();
  outer?.addEventListener('abort', onAbort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) throw Object.assign(new Error(`Server responded with HTTP ${res.status}`), { status: res.status, detail: data });
    return data;
  } catch (err) {
    if (timedOut) throw Object.assign(new Error('The request timed out'), { name: 'TimeoutError', timeout: true });
    if (err.name === 'AbortError' && outer?.aborted) throw err;
    if (err instanceof TypeError) throw Object.assign(new Error('Network error'), { network: true });
    throw err;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onAbort);
  }
}

export function friendlyError(err) {
  if (err?.offline || isOffline()) return 'You’re offline. Check your connection and try again.';
  if (err?.timeout) return 'The connection is too slow right now. Try again in a moment.';
  if (err?.status === 429) return 'iNaturalist is asking us to slow down. Give it a few seconds, then retry.';
  if (err?.status >= 500) return 'The server is having trouble right now. Try again in a moment.';
  if (err?.network) return 'We couldn’t reach the server. Check your connection and try again.';
  return 'Something went wrong talking to the server. Try again.';
}

// "Last good" copies of responses, kept across sessions in the Cache API so the app still
// shows something useful offline. Keys ignore the date, so yesterday's data can stand in.
export async function rememberJSON(key, data) {
  try {
    const c = await caches.open(LAST_GOOD_CACHE);
    await c.put(`https://nature-radar.local/${encodeURIComponent(key)}`, new Response(JSON.stringify({ savedAt: new Date().toISOString(), data })));
  } catch { /* Cache API unavailable (old browser / insecure context) */ }
}
export async function recallJSON(key) {
  try {
    const c = await caches.open(LAST_GOOD_CACHE);
    const res = await c.match(`https://nature-radar.local/${encodeURIComponent(key)}`);
    return res ? await res.json() : null;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// sessionStorage cache (fast, same-day; best effort)
// ---------------------------------------------------------------------------
const cache = {
  get(key) {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  set(key, value) {
    let raw;
    try { raw = JSON.stringify(value); } catch { return; }
    try { sessionStorage.setItem(key, raw); }
    catch {
      // Probably over quota: drop our older entries and try once more.
      try {
        Object.keys(sessionStorage).filter(k => k.startsWith('nr')).forEach(k => sessionStorage.removeItem(k));
        sessionStorage.setItem(key, raw);
      } catch { /* run uncached */ }
    }
  },
};

// ---------------------------------------------------------------------------
// Rate-limited, sequential iNaturalist requests
// ---------------------------------------------------------------------------
let queue = Promise.resolve();
let lastRequestAt = 0;

// Every request goes through one promise chain, so requests never overlap
// and each starts at least MIN_GAP_MS after the previous one.
function queuedRequest(url, signal) {
  const run = async () => {
    if (signal?.aborted) throw abortError();
    if (isOffline()) throw Object.assign(new Error('You are offline'), { offline: true }); // no request, so no need to wait
    const wait = lastRequestAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait, signal);
    lastRequestAt = Date.now();
    return requestJSON(url, { signal, headers: { Accept: 'application/json' } });
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

// Retries rate limits, server errors, timeouts and network blips (not "you're offline").
async function fetchJSON(url, signal) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await queuedRequest(url, signal);
    } catch (err) {
      const retryable = err.status === 429 || err.status >= 500 || err.timeout || err.network;
      if (!retryable || attempt >= 2 || signal?.aborted || isOffline()) throw err;
      await sleep(2000 * (attempt + 1), signal);
    }
  }
}

// Same-day cache → network → (on failure) last good copy, marked with staleAt.
async function cachedGet(key, lastGoodKey, path, params, slim, signal) {
  const hit = cache.get(key);
  if (hit) return hit;
  const url = `${API}${path}?${new URLSearchParams(params)}`;
  try {
    const data = slim(await fetchJSON(url, signal));
    cache.set(key, data);
    rememberJSON(lastGoodKey, data);
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    const saved = await recallJSON(lastGoodKey);
    if (saved) return { ...saved.data, staleAt: saved.savedAt };
    throw err;
  }
}

// Keep only what the UI needs, so several responses fit in storage.
const slimTaxon = t => ({
  id: t.id,
  name: t.name,
  common: t.preferred_common_name || null,
  iconic: t.iconic_taxon_name || null,
  rank: t.rank || null,
  photo: t.default_photo?.square_url || t.default_photo?.url || null,
  ancestors: t.ancestor_ids || [],
});

const slimSpeciesCounts = json => ({
  total: json.total_results,
  results: json.results.map(r => ({ count: r.count, taxon: slimTaxon(r.taxon) })),
});

const slimBaseline = json => ({
  total: json.total_results,
  results: json.results.map(r => [r.taxon.id, r.count]),
  // Page 1 keeps names + photos of the most-recorded species: the Collection's "local dex".
  top: json.page === 1 || !json.page
    ? json.results.slice(0, 250).filter(r => SPECIES_RANKS.has(r.taxon.rank)).map(r => {
        const { ancestors, ...taxon } = slimTaxon(r.taxon);
        return { ...taxon, count: r.count };
      })
    : undefined,
});

const slimObservations = json => ({
  results: json.results.flatMap(o => {
    let lat, lng;
    if (o.geojson?.coordinates) [lng, lat] = o.geojson.coordinates;
    else if (o.location) [lat, lng] = o.location.split(',').map(Number);
    if (!o.taxon || !Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    return [{
      id: o.id, lat, lng,
      date: o.observed_on || null,
      taxonId: o.taxon.id,
      name: o.taxon.name,
      common: o.taxon.preferred_common_name || null,
      iconic: o.taxon.iconic_taxon_name || null,
      photo: o.photos?.[0]?.url || null,
      uri: o.uri || `https://www.inaturalist.org/observations/${o.id}`,
      user: o.user?.login || null,
    }];
  }),
});

// ---------------------------------------------------------------------------
// iNaturalist queries
// ---------------------------------------------------------------------------
const area = (loc, radius) => ({ lat: loc.lat.toFixed(3), lng: loc.lng.toFixed(3), radius });
const keyBase = (loc, radius) => `${CACHE_PREFIX}${loc.lat.toFixed(3)}|${loc.lng.toFixed(3)}|${radius}`;

// Species seen in the circle in the last 7 days, with counts.
export function fetchWeekSpecies(loc, radius, signal) {
  const d1 = isoDaysAgo(7);
  const base = keyBase(loc, radius);
  return cachedGet(`${base}|${d1}|week`, `${base}|week`, '/observations/species_counts',
    { ...area(loc, radius), d1, quality_grade: QUALITY, per_page: SPECIES_PER_PAGE }, slimSpeciesCounts, signal);
}

// Up to 100 observations with photos from the last 7 days, for the map.
export function fetchWeekObservations(loc, radius, signal) {
  const d1 = isoDaysAgo(7);
  const base = keyBase(loc, radius);
  return cachedGet(`${base}|${d1}|obs`, `${base}|obs`, '/observations',
    { ...area(loc, radius), d1, photos: true, quality_grade: QUALITY, order_by: 'observed_on', per_page: 100 }, slimObservations, signal);
}

// Species that iNaturalist lists as introduced (non-native) at this place, as a Set of taxon ids.
// Up to 2 pages of 500 cover almost any area. Fails softly: callers treat errors as "unknown".
export async function fetchIntroduced(loc, radius, signal) {
  const base = keyBase(loc, radius);
  const ids = new Set();
  for (let page = 1; page <= 2; page++) {
    const data = await cachedGet(`${base}|${isoDaysAgo(0)}|intro|p${page}`, `${base}|intro|p${page}`, '/observations/species_counts',
      { ...area(loc, radius), introduced: true, per_page: SPECIES_PER_PAGE, page }, json => ({
        total: json.total_results, results: json.results.map(r => r.taxon.id),
      }), signal);
    data.results.forEach(id => ids.add(id));
    if (data.results.length < SPECIES_PER_PAGE || page * SPECIES_PER_PAGE >= data.total) break;
  }
  return ids;
}

// Tree genera (iNaturalist ids): oaks, pines, redwoods, sycamores, maples, palms… Used for the
// Collection's tree entries and for "same genus" tree suggestions on photo IDs.
const TREE_GENERA = new Set([47851, 47373, 59531, 47561, 49664, 49661, 325545, 82096, 72301, 49292, 69821, 122025, 51815,
  47727, 53549, 57145, 58736, 68717, 47351, 54806, 72197, 48810, 64355, 51047, 54500, 72055, 82743, 53350, 49156, 54495,
  54856, 72232, 135442, 57355, 56089, 54858, 48498, 57280, 129056, 54297, 47566, 53352, 50999, 53453, 50185, 64324, 72295,
  48801, 72384, 49667, 50861, 63573, 58322, 54262, 69152, 53727, 53718, 85284, 129808, 122303, 135446, 47451, 185433,
  47452, 72119, 53580, 62848, 56091, 62891, 69819, 71148, 48257, 54760, 51597, 47193, 49187, 54769, 54804, 49203, 82771,
  121264, 53946, 60448, 129799, 157055, 63619, 369898, 72354, 55571, 69757, 83434, 48255, 54788, 72408, 64515, 47574,
  126186, 54772, 157348, 68226, 145381, 119794, 464250, 53408, 48253, 52689, 48582, 51148]);
// Shrubs, ground covers and houseplants inside those genera.
const NOT_TREES = new Set(['Juniperus horizontalis', 'Grevillea rosmarinifolia', 'Ficus lyrata', 'Ficus benjamina', 'Ficus elastica',
  'Ficus pumila', 'Pittosporum tobira', 'Ligustrum japonicum', 'Cornus sericea', 'Photinia × fraseri', 'Melaleuca nesophila']);

export const isTree = t => !NOT_TREES.has(t.name) && ((t.ancestors || []).some(id => TREE_GENERA.has(id)) || TREE_GENERA.has(t.genus));
// For the tree achievements: oaks (Quercus) and conifers (redwoods, pines, cedars, cypresses, firs…), by genus name.
const CONIFER_GENERA = new Set(['Sequoia', 'Sequoiadendron', 'Metasequoia', 'Pinus', 'Cedrus', 'Calocedrus', 'Cupressus', 'Hesperocyparis',
  'Juniperus', 'Abies', 'Pseudotsuga', 'Picea', 'Tsuga', 'Taxodium', 'Cryptomeria', 'Araucaria', 'Podocarpus', 'Afrocarpus', 'Taxus', 'Thuja', 'Chamaecyparis']);
const genusName = t => (t.name || '').split(' ')[0];
export const isOak = t => genusName(t) === 'Quercus' && t.rank !== 'genus';
export const isConifer = t => CONIFER_GENERA.has(genusName(t)) && isTree(t);

// Trees recorded in the circle (all time, planted ones included), most-recorded first.
export async function fetchTrees(loc, radius, signal) {
  const base = keyBase(loc, radius);
  const data = await cachedGet(`${base}|${isoDaysAgo(0)}|trees`, `${base}|trees`, '/observations/species_counts',
    { ...area(loc, radius), taxon_id: [...TREE_GENERA].join(','), per_page: 200 }, slimSpeciesCounts, signal);
  return data.results.filter(r => SPECIES_RANKS.has(r.taxon.rank) && isTree(r.taxon)).map(r => ({ ...r.taxon, count: r.count }));
}

// Species recorded in the circle during this calendar month, across all years (for "in season now").
export function fetchMonthSpecies(loc, radius, month, signal) {
  const base = keyBase(loc, radius);
  return cachedGet(`${base}|${isoDaysAgo(0)}|m${month}`, `${base}|m${month}`, '/observations/species_counts',
    { ...area(loc, radius), month, quality_grade: QUALITY, per_page: 200 }, slimSpeciesCounts, signal);
}

// All-time species counts in the circle (up to 3 pages), as Map<taxonId, count>.
// If any page came from the offline fallback, the Map gets a .staleAt timestamp.
export async function fetchBaseline(loc, radius, signal, onPage) {
  const today = isoDaysAgo(0);
  const base = keyBase(loc, radius);
  const baseline = new Map();
  for (let page = 1; page <= BASELINE_PAGES; page++) {
    onPage?.(page, BASELINE_PAGES);
    const data = await cachedGet(`${base}|${today}|base|p${page}`, `${base}|base|p${page}`, '/observations/species_counts',
      { ...area(loc, radius), per_page: SPECIES_PER_PAGE, page }, slimBaseline, signal);
    if (data.staleAt) baseline.staleAt = data.staleAt;
    if (data.top) baseline.top = data.top;
    for (const [id, count] of data.results) baseline.set(id, count);
    if (data.results.length < SPECIES_PER_PAGE || page * SPECIES_PER_PAGE >= data.total) break;
  }
  return baseline;
}

// Name search for the "what did you see?" box. Not cached: every query is different.
export async function searchTaxa(q, signal) {
  const params = new URLSearchParams({ q, per_page: 10, is_active: true });
  const json = await fetchJSON(`${API}/taxa/autocomplete?${params}`, signal);
  return json.results.map(slimTaxon);
}

// ---------------------------------------------------------------------------
// Rarity
// ---------------------------------------------------------------------------
// Log-scaled: 1 - log(1 + count) / log(1 + max). Missing from the baseline → 1 (rarest).
export function rarityModel(baseline) {
  let maxCount = 0;
  for (const c of baseline.values()) if (c > maxCount) maxCount = c;
  const rarityOf = count => (count > 0 && maxCount > 0) ? 1 - Math.log1p(count) / Math.log1p(maxCount) : 1;

  return {
    maxCount,
    // species_counts only lists leaf taxa. A genus/family-level ID that is missing from the all-time
    // list is usually missing because finer IDs exist under it, not because it is rare, so leave it unranked.
    rate(taxon) {
      const baseCount = baseline.get(taxon.id) ?? 0;
      const coarse = baseCount === 0 && taxon.rank && !SPECIES_RANKS.has(taxon.rank);
      const rarity = coarse ? -1 : rarityOf(baseCount);
      return { baseCount, rarity, tier: tierFor(rarity) };
    },
    // For map markers whose taxon isn't in the week's species list: baseline count if known, else unranked.
    rateId(id) {
      return baseline.has(id) ? rarityOf(baseline.get(id)) : -1;
    },
  };
}
