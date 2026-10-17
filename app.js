/* Nature Radar — startup, navigation between views, and the "Nearby this week" tab.
   shared.js: iNaturalist access + helpers · sightings.js: your photos · community.js: the feed
   account.js: profile + achievements · ai.js: the offline species AI */
import {
  TIER_LABEL, DE_ANZA, nonNativeBadge, nonNativeMark, infoHead, esc, prefersReducedMotion, isoDaysAgo, haversineKm, formatDistance, formatDate, timeAgo,
  photoSize, displayName, tierFor, stateCard, friendlyError, filterBarHtml, filterNoun, matchesFilter, skeletonRows,
  isOffline, toast, fetchWeekSpecies, fetchWeekObservations, fetchBaseline, fetchMonthSpecies, fetchIntroduced, fetchTrees, rarityModel, groupOf, announceChange,
} from './shared.js';
import * as sightings from './sightings.js';
import { warmUp as warmUpAI } from './ai.js';
import * as community from './community.js';
import * as account from './account.js';
import * as collection from './collection.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const VIEWS = ['nearby', 'mine', 'collection', 'lifelist', 'community', 'account'];
const COLLECTION_PARTS = ['collection', 'lifelist', 'mine']; // the Collection tab's Dex, Life list and Journal
const viewFromHash = () => (VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'nearby');

const state = {
  view: viewFromHash(),
  loc: null,          // { lat, lng, label, kind }
  radius: 3,
  filter: { group: 'all', tier: 'all' },
  status: 'locating', // locating | need-location | loading | ready | error
  step: '',
  partialTotal: null,
  model: null,
  error: '',
  picking: false,
  controller: null,
  geoToken: 0,
};

const $ = id => document.getElementById(id);
const el = {
  stat: $('stat'), placeLabel: $('placeLabel'), filters: $('nearbyFilters'), notice: $('nearbyNotice'), season: $('seasonCard'),
  status: $('status'), list: $('list'), pickBanner: $('pickBanner'), mapLoading: $('mapLoading'),
  mapLoadingText: $('mapLoadingText'), sheet: $('sheet'), sheetBackdrop: $('sheetBackdrop'),
  sheetNote: $('sheetNote'), map: $('map'), netBanner: $('netBanner'),
};

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------
async function loadModel(loc, radius, signal, onProgress) {
  onProgress({ step: 'Counting this week’s species' });
  const week = await fetchWeekSpecies(loc, radius, signal);
  onProgress({ partialTotal: week.total });

  // Nothing seen this week: no need to spend requests on photos or the baseline.
  if (week.results.length === 0) return buildModel(loc, radius, week, { results: [] }, new Map());

  onProgress({ step: 'Fetching this week’s photos' });
  const obs = await fetchWeekObservations(loc, radius, signal);

  const baseline = await fetchBaseline(loc, radius, signal,
    (page, of) => onProgress({ step: `Reading the all-time local record (${page}/${of})` }));

  // "In season now" is a bonus: if it fails, the rest of the page still shows.
  onProgress({ step: 'Checking what’s in season' });
  const monthData = await fetchMonthSpecies(loc, radius, new Date().getMonth() + 1, signal).catch(err => {
    if (err.name === 'AbortError') throw err;
    return null;
  });

  onProgress({ step: 'Checking for non-native species' });
  const introduced = await fetchIntroduced(loc, radius, signal).catch(err => {
    if (err.name === 'AbortError') throw err;
    return new Set();
  });

  // Trees (planted ones included) fill extra Collection entries; also a bonus that fails softly.
  onProgress({ step: 'Listing the trees around here' });
  const trees = await fetchTrees(loc, radius, signal).catch(err => {
    if (err.name === 'AbortError') throw err;
    return [];
  });

  return buildModel(loc, radius, week, obs, baseline, monthData, introduced, trees);
}

// Species recorded here far more often in this calendar month than in an average month.
// ratio = records in this month (all years) ÷ (all-time records ÷ 12).
function inSeasonNow(monthData, baseline, weekIds) {
  if (!monthData) return [];
  return monthData.results.flatMap(({ count, taxon }) => {
    const allTime = baseline.get(taxon.id);
    if (!allTime || count < 3 || taxon.rank !== 'species') return [];
    const ratio = count / (allTime / 12);
    return ratio >= 1.8 ? [{ ...taxon, monthCount: count, ratio, seenThisWeek: weekIds.has(taxon.id) }] : [];
  }).sort((a, b) => b.ratio * Math.log1p(b.monthCount) - a.ratio * Math.log1p(a.monthCount)).slice(0, 10);
}

const DEX_SIZE = 151, DEX_TREES = 50;

function buildModel(loc, radius, week, obsData, baseline, monthData = null, introduced = new Set(), allTrees = []) {
  const rarity = rarityModel(baseline);

  const obs = obsData.results.map(o => ({ ...o, distKm: haversineKm(loc, o) }));
  const nearest = new Map();
  for (const o of obs) {
    const cur = nearest.get(o.taxonId);
    if (!cur || o.distKm < cur.distKm) nearest.set(o.taxonId, o);
  }

  const species = week.results.map(({ count, taxon }) => {
    const near = nearest.get(taxon.id) || null;
    return { ...taxon, ...rarity.rate(taxon), weekCount: count, nearest: near, photo: near?.photo || taxon.photo, introduced: introduced.has(taxon.id) };
  });
  species.sort((a, b) =>
    b.rarity - a.rarity || a.baseCount - b.baseCount || b.weekCount - a.weekCount ||
    displayName(a).localeCompare(displayName(b)));

  // Map markers take their species' score; other taxa fall back to the baseline.
  const byId = new Map(species.map(s => [s.id, s]));
  for (const o of obs) {
    o.rarity = byId.get(o.taxonId)?.rarity ?? rarity.rateId(o.taxonId);
    o.tier = tierFor(o.rarity);
    o.introduced = introduced.has(o.taxonId);
  }

  // If any part came from the offline fallback, remember the oldest save time to tell the user.
  const staleAt = [week.staleAt, obsData.staleAt, baseline.staleAt].filter(Boolean).sort()[0] || null;
  const inSeason = inSeasonNow(monthData, baseline, new Set(species.map(s => s.id)));
  // The Collection's "local dex": 151 entries in one list, numbered by how often they're recorded in this
  // circle (#001 = most recorded). Up to 50 of them are trees (planted ones too, recorded at least twice),
  // so campus trees are collectable alongside the wildlife; the most-recorded other species fill the rest.
  const trees = allTrees.filter(t => t.count >= 2);
  const treeIds = new Set(trees.map(t => t.id));
  const dexTrees = trees.slice(0, DEX_TREES);
  const others = (baseline.top || []).filter(t => !treeIds.has(t.id)).slice(0, DEX_SIZE - dexTrees.length);
  const dex = [...dexTrees, ...others].sort((a, b) => b.count - a.count).map((t, i) => ({
    ...t, no: i + 1, tier: rarity.rate(t).tier, introduced: introduced.has(t.id), tree: treeIds.has(t.id),
  }));
  return { loc, radius, weekTotal: week.total, species, obs, inSeason, dex, trees, introduced, counts: baseline, d1: isoDaysAgo(7), staleAt };
}

async function load() {
  if (!state.loc) return;
  state.controller?.abort();
  const controller = new AbortController();
  state.controller = controller;
  Object.assign(state, { status: 'loading', step: 'Starting…', partialTotal: null, model: null, error: '' });
  render();

  try {
    const model = await loadModel(state.loc, state.radius, controller.signal, p => {
      if (controller.signal.aborted) return;
      if (p.step) state.step = p.step;
      if (p.partialTotal != null) state.partialTotal = p.partialTotal;
      renderHeader(); renderProgress();
    });
    if (controller.signal.aborted) return;
    Object.assign(state, { status: 'ready', model });
    announceChange(); // a new local dex can unlock dex achievements
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error(err);
    Object.assign(state, { status: 'error', error: friendlyError(err) });
  }
  render();
}

// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------
const map = L.map('map', { zoomControl: false, zoomSnap: 0.25 }).setView([DE_ANZA.lat, DE_ANZA.lng], 11);
L.control.zoom({ position: 'topright' }).addTo(map);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  crossOrigin: true, // lets the service worker save tiles for offline use
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Sightings: <a href="https://www.inaturalist.org">iNaturalist</a>',
}).addTo(map);

const obsLayer = L.layerGroup().addTo(map);
const markerById = new Map();
let areaCircle = null, hereMarker = null, pinMarker = null;
const iconCache = {};
const pinIcon = tier => iconCache[tier] ||= L.divIcon({
  className: `obs-pin t-${tier}`, html: '<span></span>', iconSize: [40, 40], iconAnchor: [20, 20], popupAnchor: [0, -10],
});
const popupOptions = { maxWidth: 240, minWidth: 240, autoPanPadding: [8, 8] };

function drawArea() {
  const { lat, lng, kind } = state.loc;
  const radiusM = state.radius * 1000;
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2f6b3f';
  if (!areaCircle) {
    areaCircle = L.circle([lat, lng], { radius: radiusM, color: accent, weight: 2, dashArray: '6 6', fillColor: accent, fillOpacity: 0.06, interactive: false }).addTo(map);
  } else {
    areaCircle.setLatLng([lat, lng]).setRadius(radiusM);
  }
  hereMarker?.remove();
  hereMarker = L.marker([lat, lng], {
    icon: L.divIcon({ className: `here-pin${kind === 'gps' ? '' : ' is-place'}`, html: '<span></span>', iconSize: [28, 28], iconAnchor: [14, 14] }),
    interactive: false, keyboard: false, zIndexOffset: -1000,
  }).addTo(map);
  if (state.view === 'nearby') fitArea();
}

function fitArea() {
  if (!state.loc) return;
  map.fitBounds(L.latLng(state.loc.lat, state.loc.lng).toBounds(state.radius * 2000), { padding: [16, 16], animate: !prefersReducedMotion() });
}

function popupHtml(o) {
  const img = o.photo
    ? `<img class="pop-photo" src="${esc(photoSize(o.photo, 'medium'))}" alt="Photo of ${esc(displayName(o))}" width="240" height="124" data-fallback="🌿">`
    : '';
  return `${img}
    <div class="pop-body">
      <h3>${esc(displayName(o))}</h3>
      ${o.common ? `<p class="sci">${esc(o.name)}</p>` : ''}
      <span class="badge t-${o.tier}">${TIER_LABEL[o.tier]}</span>${o.introduced ? nonNativeBadge() : ''}
      <p class="pop-meta">${esc(formatDate(o.date))}${o.user ? ` · by ${esc(o.user)}` : ''}<br>${formatDistance(o.distKm)} from the center</p>
      <a class="btn" href="${esc(o.uri)}" target="_blank" rel="noopener">View on iNaturalist ↗</a>
    </div>`;
}

function renderMarkers() {
  obsLayer.clearLayers();
  markerById.clear();
  if (state.status !== 'ready') return;
  // Add common first so the rarest markers sit on top.
  const visible = state.model.obs.filter(o => matchesFilter(o, state.filter)).sort((a, b) => a.rarity - b.rarity);
  for (const o of visible) {
    const m = L.marker([o.lat, o.lng], {
      icon: pinIcon(o.tier),
      title: `${displayName(o)} (${TIER_LABEL[o.tier]})`,
      zIndexOffset: Math.round((o.rarity + 1) * 500),
      riseOnHover: true,
    });
    m.bindPopup(() => popupHtml(o), popupOptions);
    obsLayer.addLayer(m);
    markerById.set(o.id, m);
  }
}

function scrollToMap() {
  el.map.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
}

function focusObservation(id) {
  const m = markerById.get(id);
  if (!m) return;
  scrollToMap();
  map.setView(m.getLatLng(), Math.max(map.getZoom(), 16), { animate: !prefersReducedMotion() });
  m.openPopup();
}

// Shows one of your sightings, or a community post, on the Nearby map with a gold ★.
function showPinOnMap({ lat, lng, title, subtitle, photoUrl }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  showView('nearby');
  pinMarker?.remove();
  pinMarker = L.marker([lat, lng], {
    icon: L.divIcon({ className: 'mine-pin', html: '<span>★</span>', iconSize: [40, 40], iconAnchor: [20, 20], popupAnchor: [0, -12] }),
    title, zIndexOffset: 3000,
  }).addTo(map);
  pinMarker.bindPopup(`
    ${photoUrl ? `<img class="pop-photo" src="${esc(photoUrl)}" alt="Photo of ${esc(title)}" width="240" height="124" data-fallback="🌿">` : ''}
    <div class="pop-body">
      <h3>${esc(title)}</h3>
      <p class="pop-meta">${esc(subtitle)}</p>
    </div>`, popupOptions);
  scrollToMap();
  map.setView([lat, lng], 16, { animate: false });
  pinMarker.openPopup();
}

// ---------------------------------------------------------------------------
// Views: three tabs + the account page
// ---------------------------------------------------------------------------
function showView(view) {
  const prev = state.view;
  state.view = view;
  document.body.dataset.view = view;
  for (const v of VIEWS) $(`${v}View`).hidden = v !== view;
  // The Journal ("mine") is the second half of the Collection tab.
  const tab = COLLECTION_PARTS.includes(view) ? 'collection' : view;
  document.querySelectorAll('[role="tab"]').forEach(t => {
    const on = t.dataset.tab === tab;
    t.setAttribute('aria-selected', on);
    t.tabIndex = on || (view === 'account' && t.dataset.tab === 'nearby') ? 0 : -1;
  });
  $('subDex').setAttribute('aria-pressed', view === 'collection');
  $('subJournal').setAttribute('aria-pressed', view === 'mine');
  $('accountBtn').setAttribute('aria-current', view === 'account' ? 'page' : 'false');
  history.replaceState(null, '', view === 'nearby' ? location.pathname + location.search : `#${view}`);
  if (view === 'nearby') {
    map.invalidateSize(); // the map can't measure itself while hidden
    if (prev !== 'nearby' && state.loc && !pinMarker) fitArea();
  }
  if (view === 'community') community.onShow();
  if (view === 'collection') collection.render();
  if (view === 'lifelist') collection.renderLifeList();
  $('subLife').setAttribute('aria-pressed', view === 'lifelist');
  if (view === 'account') account.onShow();
  if (view !== prev) window.scrollTo(0, 0);
  renderHeader();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function render() {
  if (state.view === 'collection' && state.status !== 'loading') collection.render(); // the local dex follows the Nearby place
  renderHeader();
  renderProgress();
  renderStatusAndList();
  renderMarkers();
}

function renderHeader() {
  const r = state.radius;
  el.placeLabel.textContent = state.loc ? state.loc.label : state.status === 'locating' ? 'Locating…' : 'Choose a place';

  if (state.view === 'mine') { el.stat.innerHTML = sightings.statHtml(); return; }
  if (state.view === 'community') { el.stat.innerHTML = community.statHtml(); return; }
  if (state.view === 'account') { el.stat.innerHTML = account.statHtml(); return; }
  if (state.view === 'collection') { el.stat.innerHTML = collection.statHtml(); return; }
  if (state.view === 'lifelist') { el.stat.innerHTML = collection.lifeStatHtml(); return; }

  let html;
  switch (state.status) {
    case 'locating': html = 'Looking for nature near you…'; break;
    case 'need-location': html = 'Choose a place to start scanning.'; break;
    case 'error': html = 'Sightings didn’t load this time.'; break;
    case 'loading':
      html = state.partialTotal != null
        ? `<strong>${state.partialTotal.toLocaleString()}</strong> species seen within ${r} km this week`
        : '<span class="sk sk-stat-num"></span><span class="sk sk-stat-line"></span>';
      break;
    case 'ready': {
      const all = state.filter.group === 'all' && state.filter.tier === 'all';
      const n = all ? state.model.weekTotal : state.model.species.filter(s => matchesFilter(s, state.filter)).length;
      html = `<strong>${n.toLocaleString()}</strong> ${filterNoun(state.filter)}species seen within ${r} km this week`;
      break;
    }
  }
  el.stat.innerHTML = html;
}

function renderProgress() {
  const loading = state.status === 'loading';
  el.mapLoading.hidden = !loading;
  if (loading) el.mapLoadingText.textContent = state.step;
  const note = el.status.querySelector('.progress-note span:last-child');
  if (note) note.textContent = state.step;
}

const placeButtons = `
  <button type="button" class="btn" data-action="deanza">Use De Anza College</button>
  <button type="button" class="btn btn-ghost" data-action="pick">Pick a spot on the map</button>`;

function renderStatusAndList() {
  el.list.innerHTML = '';
  el.notice.innerHTML = '';
  el.season.innerHTML = state.status === 'ready' ? seasonHtml() : '';
  el.filters.innerHTML = state.status === 'ready' && state.model.species.length
    ? filterBarHtml('nearby', state.model.species, state.filter) : '';
  switch (state.status) {
    case 'locating':
      el.status.innerHTML = stateCard({
        icon: '◎', title: 'Finding your location', text: 'Allow location access, or choose a place instead.', actions: placeButtons,
      });
      return;
    case 'need-location':
      el.status.innerHTML = stateCard({
        icon: '◎', title: 'Where should we look?', text: esc(state.error) || 'We need a place to scan.',
        actions: `${placeButtons}<button type="button" class="btn btn-ghost" data-action="locate">Try my location again</button>`,
      });
      return;
    case 'loading':
      el.status.innerHTML = `<p class="progress-note"><span class="spinner" aria-hidden="true"></span><span>${esc(state.step)}</span></p>`;
      el.list.innerHTML = skeletonRows(6);
      return;
    case 'error':
      el.status.innerHTML = stateCard({
        icon: '⚠', title: isOffline() ? 'You’re offline' : 'Something went wrong', text: esc(state.error), error: true,
        actions: `<button type="button" class="btn" data-action="retry">Retry</button>
          ${isOffline() ? '<p class="state-hint">We’ll retry automatically when you’re back online. Your sightings and the offline AI still work.</p>' : ''}`,
      });
      return;
  }

  // ready
  if (state.model.staleAt) {
    el.notice.innerHTML = `<p class="notice"><strong>Showing saved data</strong> from ${esc(timeAgo(state.model.staleAt))}, because iNaturalist couldn’t be reached.
      <button type="button" class="link-btn" data-action="retry">Try again</button></p>`;
  }
  const { species } = state.model;
  const nonNative = species.filter(s => s.introduced).length;
  if (nonNative) {
    el.notice.innerHTML += `<details class="notice notice-nn notice-fold"><summary><span>⚠ <strong>${nonNative} non-native</strong> species this week</span></summary>
      <p>Introduced here by people. They’re marked ⚠ in the list; logging them helps track invasive species.</p></details>`;
  }
  if (species.length === 0) {
    const next = [1, 3, 5].find(r => r > state.radius);
    el.status.innerHTML = stateCard({
      icon: '🍃', title: 'Quiet week here, try a bigger radius',
      text: `Nobody has logged a sighting within ${state.radius} km in the last 7 days.`,
      actions: next
        ? `<button type="button" class="btn" data-action="radius" data-radius="${next}">Search ${next} km</button>`
        : '<button type="button" class="btn" data-action="open-sheet">Try another place</button>',
    });
    return;
  }

  const shown = species.filter(s => matchesFilter(s, state.filter));
  if (shown.length === 0) {
    el.status.innerHTML = stateCard({
      icon: '🔭', title: `No ${filterNoun(state.filter)}species this week`,
      text: 'Other groups or rarities were spotted, though.',
      actions: '<button type="button" class="btn" data-action="clear-filter">Show everything</button>',
    });
    return;
  }

  el.status.innerHTML = '';
  el.list.innerHTML = shown.map((s, i) => speciesItem(s, i + 1)).join('');
}

// "In season" strip: species to look out for this month (respects the group filter).
function seasonHtml() {
  const items = state.model.inSeason.filter(s => state.filter.group === 'all' || groupOf(s.iconic) === state.filter.group);
  if (!items.length) return '';
  const month = new Date().getMonth() + 1;
  const monthName = new Date().toLocaleString(undefined, { month: 'long' });
  const icon = [12, 1, 2].includes(month) ? '❄️' : month <= 5 ? '🌸' : month <= 8 ? '☀️' : '🍂';
  const { lat, lng } = state.model.loc;
  return `<section class="season" aria-labelledby="seasonTitle">
    ${infoHead(`${icon} In season in ${esc(monthName)}`, 'Recorded here much more often this month than in an average month (“3× usual”). Keep an eye out!', { id: 'seasonTitle' })}
    <ul class="season-row">${items.map(s => `<li>
      <a class="season-item" href="https://www.inaturalist.org/observations?taxon_id=${s.id}&lat=${lat.toFixed(3)}&lng=${lng.toFixed(3)}&radius=${state.model.radius}&month=${month}" target="_blank" rel="noopener">
        ${s.photo ? `<img src="${esc(photoSize(s.photo, 'small'))}" alt="" loading="lazy" width="132" height="100" data-fallback="🌿">` : '<span class="img-fallback" aria-hidden="true">🌿</span>'}
        <strong>${esc(displayName(s))}</strong>
        <span class="season-ratio">${s.ratio >= 10 ? '10×+' : `${s.ratio.toFixed(s.ratio < 3 ? 1 : 0)}×`} usual</span>
        ${s.seenThisWeek ? '<span class="season-tag is-seen">✓ Seen this week</span>' : ''}
      </a></li>`).join('')}</ul>
  </section>`;
}

function speciesItem(s, rank) {
  const name = displayName(s);
  const thumb = s.photo
    ? `<img class="thumb" src="${esc(photoSize(s.photo, 'small'))}" alt="" loading="lazy" width="68" height="68" data-fallback="🌿">`
    : `<span class="thumb thumb-empty" aria-hidden="true">🌿</span>`;
  const allTime = s.baseCount > 0 ? `${s.baseCount.toLocaleString()} all-time` : s.tier === 'unranked' ? `ID to ${s.rank}` : 'few local records';
  const facts = [s.nearest && formatDistance(s.nearest.distKm), `${s.weekCount}× this week`].filter(Boolean).join(' · ');
  const badgeTitle = s.tier === 'unranked' ? 'Identified above species level, so no local baseline' : `${allTime} records here · rarity score ${s.rarity.toFixed(2)}`;
  const meta = `<span class="badge t-${s.tier}" title="${esc(badgeTitle)}">${TIER_LABEL[s.tier]}</span>${s.introduced ? nonNativeMark() : ''}<span>${esc(facts)}</span>`;
  const inner = `
    <span class="rank">${rank}</span>
    ${thumb}
    <span class="sp-text">
      <p class="sp-name">${esc(name)}</p>
      ${s.common ? `<p class="sci">${esc(s.name)}</p>` : ''}
      <p class="sp-meta">${meta}</p>
    </span>`;
  const main = s.nearest
    ? `<button type="button" class="sp-main" data-action="focus" data-obs="${s.nearest.id}" aria-label="${esc(name)}, ${TIER_LABEL[s.tier]}. Show on map">${inner}</button>`
    : `<div class="sp-main">${inner}</div>`;
  const { lat, lng } = state.model.loc;
  const href = `https://www.inaturalist.org/observations?taxon_id=${s.id}&lat=${lat.toFixed(3)}&lng=${lng.toFixed(3)}&radius=${state.model.radius}&d1=${state.model.d1}`;
  return `<li class="sp t-${s.tier}">
    ${main}
    <a class="sp-link" href="${esc(href)}" target="_blank" rel="noopener" aria-label="This week's ${esc(name)} sightings on iNaturalist">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M14 4h6v6m0-6L10 14M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>
    </a>
  </li>`;
}

// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------
function setLocation(loc) {
  state.geoToken++; // a late GPS fix must not override a place the user chose
  state.loc = { ...loc, lat: +loc.lat.toFixed(3), lng: +loc.lng.toFixed(3) };
  pinMarker?.remove();
  pinMarker = null;
  closeSheet();
  stopPicking();
  drawArea();
  load();
}

const GEO_ERRORS = {
  1: 'Location permission was denied.',
  2: 'Your position isn’t available right now.',
  3: 'Finding your location took too long.',
};

function locateUser() {
  closeSheet();
  if (!('geolocation' in navigator)) return needLocation('This browser can’t share its location.');
  const token = ++state.geoToken;
  state.controller?.abort();
  Object.assign(state, { status: 'locating', model: null });
  render();
  navigator.geolocation.getCurrentPosition(
    pos => { if (token === state.geoToken) setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'Near you', kind: 'gps' }); },
    err => { if (token === state.geoToken) needLocation(GEO_ERRORS[err.code] || 'Location unavailable.'); },
    { enableHighAccuracy: false, timeout: 12000, maximumAge: 5 * 60 * 1000 },
  );
}

function needLocation(message) {
  if (state.loc) { // keep showing the last place, just tell them
    openSheet(message);
    if (state.status === 'locating') load();
    return;
  }
  Object.assign(state, { status: 'need-location', error: message });
  render();
}

function startPicking() {
  closeSheet();
  if (state.view !== 'nearby') showView('nearby');
  state.picking = true;
  el.map.classList.add('picking');
  el.pickBanner.hidden = false;
  scrollToMap();
}

function stopPicking() {
  state.picking = false;
  el.map.classList.remove('picking');
  el.pickBanner.hidden = true;
}

const pinFrom = latlng => ({ lat: latlng.lat, lng: latlng.lng, label: 'Pinned spot', kind: 'pin' });
map.on('click', e => { if (state.picking) setLocation(pinFrom(e.latlng)); });
map.on('contextmenu', e => setLocation(pinFrom(e.latlng))); // long-press on touch

// ---------------------------------------------------------------------------
// Place sheet
// ---------------------------------------------------------------------------
let sheetReturnFocus = null;
function openSheet(note) {
  el.sheetNote.textContent = note || '';
  el.sheetNote.hidden = !note;
  sheetReturnFocus = document.activeElement;
  el.sheet.hidden = false;
  el.sheetBackdrop.hidden = false;
  el.sheet.querySelector('.option').focus();
}
function closeSheet() {
  if (el.sheet.hidden) return;
  el.sheet.hidden = true;
  el.sheetBackdrop.hidden = true;
  sheetReturnFocus?.focus?.();
}

// ---------------------------------------------------------------------------
// Network status
// ---------------------------------------------------------------------------
function renderNetwork() {
  el.netBanner.hidden = !isOffline();
}
window.addEventListener('offline', renderNetwork);
window.addEventListener('online', () => {
  renderNetwork();
  toast('Back online');
  // Refresh anything that failed or came from the offline fallback.
  if (state.loc && (state.status === 'error' || state.model?.staleAt)) load();
});

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
function setRadius(r) {
  if (r === state.radius) return;
  state.radius = r;
  document.querySelector(`input[name="radius"][value="${r}"]`).checked = true;
  if (state.loc) { drawArea(); load(); } else renderHeader();
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  switch (t.dataset.action) {
    case 'tab': showView(t.dataset.tab); break;
    case 'account': showView(state.view === 'account' ? 'nearby' : 'account'); break;
    case 'open-sheet': openSheet(); break;
    case 'close-sheet': closeSheet(); break;
    case 'locate': locateUser(); break;
    case 'deanza': setLocation(DE_ANZA); break;
    case 'pick': startPicking(); break;
    case 'cancel-pick': stopPicking(); break;
    case 'retry': load(); break;
    case 'radius': setRadius(Number(t.dataset.radius)); break;
    case 'focus': focusObservation(Number(t.dataset.obs)); break;
    case 'clear-filter': state.filter = { group: 'all', tier: 'all' }; render(); break;
    case 'filter':
      if (t.dataset.scope === 'nearby') {
        state.filter[t.dataset.kind] = t.dataset.value;
        renderHeader(); renderMarkers(); renderStatusAndList();
      }
      break;
  }
});

document.querySelectorAll('input[name="radius"]').forEach(input =>
  input.addEventListener('change', () => setRadius(Number(input.value))));

// Arrow keys move between tabs (standard tablist behavior).
document.querySelector('[role="tablist"]').addEventListener('keydown', e => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const tabs = ['nearby', 'community', 'collection'];
  const i = Math.max(0, tabs.indexOf(COLLECTION_PARTS.includes(state.view) ? 'collection' : state.view));
  const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
  showView(next);
  document.querySelector(`[role="tab"][data-tab="${next}"]`).focus();
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!el.sheet.hidden) closeSheet();
  else if (state.picking) stopPicking();
});

window.addEventListener('hashchange', () => { if (viewFromHash() !== state.view) showView(viewFromHash()); });

// The part of the screen that's actually visible (phones shrink it for the keyboard and toolbars).
// Pop-up panels size themselves to it so their buttons are never hidden.
function syncVisibleArea() {
  const vv = window.visualViewport;
  const root = document.documentElement.style;
  root.setProperty('--vv-height', `${vv ? vv.height : window.innerHeight}px`);
  root.setProperty('--vv-top', `${vv ? vv.offsetTop : 0}px`);
}
window.visualViewport?.addEventListener('resize', syncVisibleArea);
window.visualViewport?.addEventListener('scroll', syncVisibleArea);
window.addEventListener('resize', syncVisibleArea);
syncVisibleArea();

// Photos from the internet can fail (offline, deleted): swap in a placeholder instead of a broken image.
document.addEventListener('error', e => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.dataset.fallback) return;
  const span = document.createElement('span');
  span.className = `${img.className} img-fallback`;
  span.textContent = img.dataset.fallback;
  span.setAttribute('aria-hidden', 'true');
  img.replaceWith(span);
}, true);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
sightings.init({
  getNearby: () => ({ loc: state.loc, model: state.model }),
  showOnMap: showPinOnMap,
  showTab: showView,
  onChange: renderHeader,
  share: id => community.openShare(id),
  isNewSpecies: (taxonId, exceptId) => collection.isNewSpecies(taxonId, exceptId),
  celebrate: (rec, photoUrl) => collection.celebrate(rec, photoUrl),
  isShared: id => community.isShared(id),
});
community.init({
  getSightings: sightings.getItems,
  getNearby: () => ({ loc: state.loc, model: state.model }),
  thumbUrl: sightings.thumbUrl,
  showOnMap: showPinOnMap,
  showTab: showView,
  onChange: renderHeader,
});
collection.init({
  getSightings: sightings.getItems,
  thumbUrl: sightings.thumbUrl,
  getNearby: () => ({ loc: state.loc, model: state.model }),
  currentView: () => state.view,
  onChange: renderHeader,
  openSighting: id => sightings.openDetail(id),
  showTab: showView,
});
account.init({
  getSightings: sightings.getItems,
  myPostCount: community.myPostCount,
  isReady: sightings.isLoaded,
  isVisible: () => state.view === 'account',
  liveCommunity: community.LIVE,
  showSamples: community.showSamples,
  setShowSamples: community.setShowSamples,
  dexProgress: collection.dexProgress,
  level: () => collection.xpSummary(),
  soundOn: collection.soundOn,
  setSound: collection.setSound,
  onChange: renderHeader,
});
showView(state.view);
warmUpAI(); // get the AI ready in the background so the first photo is identified quickly
renderNetwork();
render();
locateUser();

// Offline support: the service worker keeps the app, map tiles you've seen and the AI model.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(err => console.warn('Offline support unavailable', err));
}
