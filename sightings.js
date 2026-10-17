/* "My sightings": take a photo, identify it (offline AI + nearby species + search), save it on this
   device with time + place, rate its local rarity, browse/filter, share, back up. */
import {
  TIER_LABEL, esc, displayName, photoSize, haversineKm, formatDateTime, isoDaysAgo, taxonUrl, stateCard, toast,
  fetchWeekSpecies, fetchBaseline, fetchIntroduced, nonNativeMark, NON_NATIVE_TIP, rarityModel, searchTaxa, filterBarHtml, filterNoun, matchesFilter, announceChange,
  skeletonRows, friendlyError, isOffline, newId, GROUPS, local,
} from './shared.js';
import { sightingsDB, requestPersistence } from './store.js';
import { loadModel, identify, nearbyMatches, aiStatus, onAiStatus } from './ai.js';
import { makeShareCard, shareCard } from './share-card.js';

const RATING_RADIUS_KM = 3;   // every sighting is rated against the same-size circle, so ratings are comparable
const PHOTO_MAX = 1280;       // longest side in pixels of the saved photo
const THUMB_MAX = 320;

let ctx = null;               // callbacks from app.js: getNearby, showOnMap, showTab, onChange, share, isShared
const S = { items: [], loaded: false, error: '', sort: 'newest', filter: { group: 'all', tier: 'all' }, highlight: null, rating: false };
const thumbUrls = new Map();  // sighting id → object URL for its thumbnail
let draft = null;             // the sighting being identified (a new photo, or "Change ID")
let detail = null;            // the sighting open in the detail view
let detailPhotoUrl = null;

const $ = id => document.getElementById(id);
const el = {};

export const getItems = () => S.items;
export const isLoaded = () => S.loaded;

export function init(options) {
  ctx = options;
  Object.assign(el, {
    photoInput: $('photoInput'), importInput: $('importInput'), dialog: $('sightingDialog'),
    list: $('mineList'), status: $('mineStatus'), filters: $('mineFilters'), sort: $('mineSort'), tabCount: $('mineCount'),
  });
  el.photoInput.addEventListener('change', onPhotoChosen);
  el.importInput.addEventListener('change', onImportChosen);
  el.dialog.addEventListener('close', onDialogClosed);
  el.dialog.addEventListener('cancel', e => { if (draft?.saving) e.preventDefault(); });
  el.dialog.addEventListener('click', e => { if (e.target === el.dialog && !draft?.saving) el.dialog.close(); }); // backdrop tap
  el.dialog.addEventListener('input', onSearchInput);
  document.addEventListener('click', onClick);
  window.addEventListener('online', rateMissing);
  onAiStatus(() => { if (draft) renderAiBox(); });
  loadAll();
}

function onClick(e) {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  switch (t.dataset.action) {
    case 'camera': openCamera(); break;
    case 's-sort': S.sort = t.dataset.sort; render(); break;
    case 'filter':
      if (t.dataset.scope === 'mine') { S.filter[t.dataset.kind] = t.dataset.value; render(); }
      break;
    case 's-open': openDetail(t.dataset.id); break;
    case 's-close': if (!draft?.saving) el.dialog.close(); break;
    case 's-choose': chooseCandidate('list', Number(t.dataset.idx)); break;
    case 's-choose-ai': chooseCandidate('ai', Number(t.dataset.idx)); break;
    case 's-ai-retry': if (draft) runAI(draft); break;
    case 's-ai-search': searchFromAi(t.dataset.q); break;
    case 's-save': saveDraft(true); break;
    case 's-save-unknown': saveDraft(false); break;
    case 's-reid': startReidentify(); break;
    case 's-map': showDetailOnMap(); break;
    case 's-card': openCard(); break;
    case 's-card-share': shareCurrentCard(); break;
    case 's-card-back': releaseCard(); renderDetail(); break;
    case 's-share': { const id = detail?.id; el.dialog.close(); ctx.share(id); break; }
    case 's-rate': toast('Checking rarity…'); rateMissing(); break;
    case 's-delete': deleteDetail(t); break;
    case 's-export': exportBackup(); break;
    case 's-import': el.importInput.value = ''; el.importInput.click(); break;
  }
}

// ---------------------------------------------------------------------------
// Loading + list
// ---------------------------------------------------------------------------
async function loadAll() {
  try {
    S.items = await sightingsDB.getAll();
    if (!S.items.length) S.items = await seedDemo();
  } catch (err) {
    console.error(err);
    S.error = 'This browser isn’t letting Nature Radar save anything. Private browsing modes often block it.';
  }
  S.loaded = true;
  render();
  announceChange();
  rateMissing();
}

// TEMPORARY: on a first run, fill the journal from demo-data.js (if that file exists) for demos.
const DEMO_KEY = 'nr-demo-seeded';
async function seedDemo() {
  if (local.get(DEMO_KEY, false)) return [];
  local.set(DEMO_KEY, true); // only once, so erasing your data leaves the app empty
  const demo = await import('./demo-data.js').catch(() => null);
  if (!demo) return [];
  const items = demo.demoSightings();
  for (const rec of items) await sightingsDB.put(rec);
  return items;
}

function upsert(rec) {
  const i = S.items.findIndex(x => x.id === rec.id);
  if (i >= 0) S.items[i] = rec; else S.items.push(rec);
}

const tierOf = s => !s.taxon ? 'needsid' : !s.rating ? 'unrated' : s.rating.tier;
const rows = () => S.items.map(s => ({ s, iconic: s.taxon?.iconic || null, tier: tierOf(s) }));

export function thumbUrl(s) {
  if (!s.thumb) return s.photoRemote || null; // demo sightings use an iNaturalist photo
  if (!thumbUrls.has(s.id)) thumbUrls.set(s.id, URL.createObjectURL(s.thumb));
  return thumbUrls.get(s.id);
}

// Short place for list rows: the place's name when known ("De Anza College"), otherwise nothing.
function whereShort(s) {
  const label = s.loc?.label;
  return label && label !== 'Your location' ? label : '';
}

export function statHtml() {
  if (!S.loaded) return '<span class="sk sk-stat-num"></span><span class="sk sk-stat-line"></span>';
  const shown = rows().filter(r => matchesFilter(r, S.filter)).map(r => r.s);
  const species = new Set(shown.filter(s => s.taxon).map(s => s.taxon.id)).size;
  const n = shown.length;
  return `<strong>${n}</strong> ${filterNoun(S.filter)}${n === 1 ? 'sighting' : 'sightings'} saved on this device · ${species} species`;
}

function render() {
  el.tabCount.textContent = S.items.length || '';
  ctx.onChange();

  if (!S.loaded) {
    el.status.innerHTML = '';
    el.list.innerHTML = skeletonRows(3);
    return;
  }
  if (S.error) {
    el.filters.innerHTML = el.sort.innerHTML = el.list.innerHTML = '';
    el.status.innerHTML = stateCard({ icon: '⚠', title: 'Can’t save sightings here', text: esc(S.error), error: true });
    return;
  }
  if (!S.items.length) {
    el.filters.innerHTML = el.sort.innerHTML = el.list.innerHTML = '';
    el.status.innerHTML = stateCard({
      icon: '📷', title: 'No sightings yet',
      text: 'Take a photo of a plant or animal. The offline AI suggests what it is, and we save it with the time, place and how rare it is around here.',
      actions: '<button type="button" class="btn" data-action="camera">Take a photo</button>',
    });
    return;
  }

  const all = rows();
  el.filters.innerHTML = filterBarHtml('mine', all, S.filter);
  el.sort.innerHTML = `<span class="sort-label">Sort</span>${[['newest', 'Newest'], ['rarest', 'Rarest']].map(([key, label]) =>
    `<button type="button" class="chip chip-sub" data-action="s-sort" data-sort="${key}" aria-pressed="${S.sort === key}">${label}</button>`).join('')}`;

  const byNewest = (a, b) => b.createdAt.localeCompare(a.createdAt);
  const rarityKey = s => (s.taxon && s.rating ? s.rating.rarity : -2);
  const shown = all.filter(r => matchesFilter(r, S.filter)).map(r => r.s)
    .sort(S.sort === 'rarest' ? (a, b) => rarityKey(b) - rarityKey(a) || byNewest(a, b) : byNewest);
  if (!shown.length) {
    el.list.innerHTML = '';
    el.status.innerHTML = stateCard({ icon: '🔭', title: 'No sightings match these filters', text: 'Try another group or rarity.',
      actions: '<button type="button" class="btn" data-action="filter" data-scope="mine" data-kind="tier" data-value="all">Any rarity</button>' });
    return;
  }
  el.status.innerHTML = '';
  el.list.innerHTML = shown.map(sightingItem).join('');
}

function sightingItem(s) {
  const tier = tierOf(s);
  const name = s.taxon ? displayName(s.taxon) : 'Unidentified';
  const url = thumbUrl(s);
  const shared = ctx.isShared(s.id) ? ' · shared' : '';
  return `<li class="sp t-${tier}${s.id === S.highlight ? ' is-new' : ''}">
    <button type="button" class="sp-main" data-action="s-open" data-id="${esc(s.id)}">
      ${url ? `<img class="thumb" src="${url}" alt="" width="68" height="68">` : '<span class="thumb thumb-empty" aria-hidden="true">📷</span>'}
      <span class="sp-text">
        <p class="sp-name">${esc(name)}</p>
        ${s.taxon?.common ? `<p class="sci">${esc(s.taxon.name)}</p>` : ''}
        <p class="sp-meta"><span class="badge t-${tier}">${TIER_LABEL[tier]}</span>${s.rating?.introduced ? nonNativeMark() : ''}<span>${esc([formatDateTime(s.createdAt, { weekday: undefined, hour: undefined, minute: undefined }), whereShort(s)].filter(Boolean).join(' · '))}${shared}</span></p>
      </span>
    </button>
  </li>`;
}

// ---------------------------------------------------------------------------
// Rarity for your sightings
// ---------------------------------------------------------------------------
async function rate(rec) {
  const baseline = await fetchBaseline(rec.loc, RATING_RADIUS_KM);
  const model = rarityModel(baseline);
  // Is it non-native where you saw it? (null = unknown; never blocks the rating)
  const introduced = await fetchIntroduced(rec.loc, RATING_RADIUS_KM).then(ids => ids.has(rec.taxon.id)).catch(() => null);
  return { ...model.rate(rec.taxon), maxCount: model.maxCount, radiusKm: RATING_RADIUS_KM, introduced, ratedAt: new Date().toISOString() };
}

// Sightings saved while offline get rated once iNaturalist is reachable again.
async function rateMissing() {
  if (S.rating || isOffline()) return;
  S.rating = true;
  try {
    for (const s of S.items.filter(x => x.taxon && x.loc && !x.rating)) {
      try {
        const updated = { ...s, rating: await rate(s) };
        await sightingsDB.put(updated);
        upsert(updated);
        render();
        announceChange();
        if (detail?.id === s.id) { detail = updated; renderDetail(); }
      } catch (err) {
        console.warn('Rating failed, will retry later', err);
        break;
      }
    }
  } finally {
    S.rating = false;
  }
}

function rarityNote(s) {
  if (!s.taxon) return 'Add an ID to see how rare this is around here.';
  if (!s.loc) return 'This sighting has no location, so it can’t be compared with local records.';
  if (!s.rating) return `Not rated yet. It needs a connection to iNaturalist and will be rated automatically. <button type="button" class="link-btn" data-action="s-rate">Rate now</button>`;
  const { tier, baseCount, maxCount, rarity, radiusKm } = s.rating;
  if (tier === 'unranked') return 'Identified above species level (for example, only to genus), so it can’t be compared with species records.';
  if (baseCount === 0) return `Not among the species recorded on iNaturalist within ${radiusKm} km of this spot, so it gets the top rarity score.`;
  return `Recorded ${baseCount.toLocaleString()} ${baseCount === 1 ? 'time' : 'times'} on iNaturalist within ${radiusKm} km of this spot. `
    + `The most-recorded species there has ${maxCount.toLocaleString()}. Rarity score ${rarity.toFixed(2)} (0 = most common, 1 = rarest).`;
}

// ---------------------------------------------------------------------------
// Taking a photo
// ---------------------------------------------------------------------------
// Snap: opens the phone's camera (a file picker on computers).
function openCamera() {
  if (S.error) { toast(S.error); return; }
  el.photoInput.value = '';
  el.photoInput.click(); // opens the camera on phones, a file picker on computers
  // Start getting the AI ready while the camera is open.
  if (aiStatus().state !== 'ready' && !isOffline()) loadModel().catch(() => {});
}

async function decodeImage(blob) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch { /* fall back below */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Shrinks the photo so many sightings fit on the device.
function toJpeg(image, maxDim, quality) {
  const w = image.naturalWidth || image.width, h = image.naturalHeight || image.height;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not encode image'))), 'image/jpeg', quality));
}

function newDraft(props) {
  return {
    mode: 'new', sighting: null, takenAt: null, photoBlob: null, thumbBlob: null, photoUrl: null,
    loc: null, locStatus: 'pending', locPromise: Promise.resolve(),
    chosen: null, idSource: null, query: '', results: [], searchStatus: 'idle',
    suggestions: [], suggestStatus: 'loading', pool: [], candidates: [], aiCandidates: [],
    ai: { state: 'waiting', result: null },
    saving: false, saveStep: '', controller: new AbortController(), searchController: null, searchTimer: 0,
    ...props,
  };
}

function onPhotoChosen() {
  const file = el.photoInput.files?.[0];
  if (file) handlePhoto(file);
}

// A photo from the camera, the picker or the live camera → the identify-and-save screen.
async function handlePhoto(file) {
  const d = newDraft({ mode: 'new', takenAt: new Date().toISOString() });
  openDraft(d);
  d.locPromise = locateForPhoto(d);
  // Show the photo straight away: the browser can display the camera's file as it is.
  d.photoUrl = URL.createObjectURL(file);
  renderDraftPhoto();
  let image;
  try {
    image = await decodeImage(file);
  } catch (err) {
    console.error(err);
    if (draft === d) { el.dialog.close(); toast('That image couldn’t be read. Try taking the photo again.'); }
    return;
  }
  // Identify first; shrink the photo for storage at the same time (the AI doesn't need to wait for it).
  const identifying = runAI(d, image);
  const shrinking = (async () => {
    d.photoBlob = await toJpeg(image, PHOTO_MAX, 0.82);
    d.thumbBlob = await toJpeg(image, THUMB_MAX, 0.75);
    if (draft === d) renderDraftFoot();
  })();
  try {
    await Promise.all([identifying, shrinking]);
  } catch (err) {
    console.error(err);
    if (draft === d && !d.photoBlob) { el.dialog.close(); toast('That image couldn’t be saved. Try taking the photo again.'); }
  } finally {
    image.close?.();
  }
}

// Runs the on-device model on the photo. `image` is optional (decoded from the saved photo otherwise).
async function runAI(d, image) {
  d.ai = { state: aiStatus().state === 'ready' ? 'thinking' : 'loading', result: null };
  renderAiBox();
  // Let the panel appear on screen before the heavy AI work starts.
  // (A timer backs up the animation frame, which never fires while the page is in the background.)
  await new Promise(resolve => {
    let started = false;
    const go = () => { if (!started) { started = true; setTimeout(resolve, 16); } };
    requestAnimationFrame(go);
    setTimeout(go, 120);
  });
  try {
    await loadModel();
    if (draft !== d) return;
    d.ai.state = 'thinking';
    renderAiBox();
    const source = image || await decodeImage(d.photoBlob);
    // Species recorded around here count for more (only if the photo was taken near the scanned area).
    const { model } = ctx.getNearby();
    const prior = model?.counts && (!d.loc || haversineKm(model.loc, d.loc) < 5) ? model.counts : null;
    const result = await identify(source, {
      prior,
      // Unsure at first glance (e.g. a tree in a wide shot): show that answer now, refine it after a closer look.
      onQuick: quick => { if (draft === d) { d.ai = { state: 'done', result: quick, refining: true }; renderAiBox(); } },
    });
    d.ai = { state: 'done', result };
  } catch (err) {
    console.warn('AI failed', err);
    d.ai = { state: 'error', result: null };
  }
  if (draft === d) renderAiBox();
}

// Where the photo was taken: GPS if allowed, otherwise the place you're scanning (marked approximate).
function locateForPhoto(d) {
  return new Promise(resolve => {
    const fallback = () => {
      const scan = ctx.getNearby().loc;
      d.loc = scan ? { lat: scan.lat, lng: scan.lng, accuracy: null, source: 'scan', label: scan.label } : null;
      d.locStatus = scan ? 'scan' : 'none';
      resolve();
    };
    if (!('geolocation' in navigator)) return fallback();
    navigator.geolocation.getCurrentPosition(pos => {
      d.loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy), source: 'gps', label: 'Your location' };
      d.locStatus = 'gps';
      resolve();
    }, fallback, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  }).then(() => {
    if (draft !== d) return;
    renderDraftLocation();
    loadSuggestions(d);
  });
}

// "Likely matches": species logged near the photo this week, most-seen first. The same list
// helps the AI: a guess like "jay family" becomes "Steller's Jay, seen nearby this week".
async function loadSuggestions(d) {
  if (!d.loc) { d.suggestStatus = 'none'; renderCandidates(); return; }
  d.suggestStatus = 'loading';
  renderCandidates();
  try {
    const { model } = ctx.getNearby();
    const list = model && haversineKm(model.loc, d.loc) < 1
      ? model.species.map(s => ({ taxon: s, count: s.weekCount }))
      : (await fetchWeekSpecies(d.loc, RATING_RADIUS_KM, d.controller.signal)).results;
    d.pool = list.map(({ taxon, count }) => ({ ...pickTaxon(taxon), ancestors: taxon.ancestors || [], weekCount: count }));
    d.suggestions = [...d.pool].sort((a, b) => b.weekCount - a.weekCount).slice(0, 15);
    d.suggestStatus = 'ready';
  } catch (err) {
    if (err.name === 'AbortError') return;
    d.suggestStatus = isOffline() ? 'offline' : 'error';
  }
  if (draft !== d) return;
  renderCandidates();
  renderAiBox(); // nearby species sharpen the AI's suggestions
}

const pickTaxon = t => ({ id: t.id, name: t.name, common: t.common, iconic: t.iconic, rank: t.rank, photo: t.photo });

function onSearchInput(e) {
  if (e.target.id !== 'taxonSearch' || !draft) return;
  const d = draft;
  d.query = e.target.value;
  clearTimeout(d.searchTimer);
  d.searchController?.abort();
  d.searchStatus = d.query.trim().length >= 2 ? 'loading' : 'idle';
  renderCandidates();
  if (d.searchStatus === 'loading') d.searchTimer = setTimeout(() => runSearch(d), 350);
}

async function runSearch(d) {
  const controller = new AbortController();
  d.searchController = controller;
  try {
    d.results = await searchTaxa(d.query.trim(), controller.signal);
    d.searchStatus = 'ready';
  } catch (err) {
    if (err.name === 'AbortError') return;
    d.searchStatus = 'error';
    d.searchError = friendlyError(err);
  }
  if (draft === d && !controller.signal.aborted) renderCandidates();
}

function chooseCandidate(from, i) {
  if (!draft) return;
  const item = from === 'ai' ? draft.aiCandidates[i] : draft.candidates[i];
  if (!item) return;
  draft.chosen = pickTaxon(item.taxon || item);
  draft.idSource = from === 'ai' ? 'ai' : draft.query.trim().length >= 2 ? 'search' : 'nearby';
  renderCandidates();
  renderAiBox();
  renderDraftFoot();
}

async function saveDraft(withId) {
  const d = draft;
  if (!d || d.saving || !d.photoBlob || (withId && !d.chosen)) return;
  d.saving = true;
  d.saveStep = d.locStatus === 'pending' ? 'Waiting for your location…' : 'Saving…';
  renderDraftFoot();
  await d.locPromise;

  const rec = d.mode === 'edit'
    ? { ...d.sighting }
    : { id: newId(), createdAt: d.takenAt, loc: d.loc, photo: d.photoBlob, thumb: d.thumbBlob };
  rec.taxon = withId ? d.chosen : null;
  rec.idSource = withId ? d.idSource : null;
  rec.rating = null;

  if (rec.taxon && rec.loc && !isOffline()) {
    d.saveStep = 'Checking how rare this is around here…';
    renderDraftFoot();
    try { rec.rating = await rate(rec); } catch (err) { console.warn('Rating failed, will retry later', err); }
  }

  try {
    await sightingsDB.put(rec);
  } catch (err) {
    console.error(err);
    d.saving = false;
    renderDraftFoot();
    toast('Couldn’t save on this device. Storage may be full.');
    return;
  }
  requestPersistence();

  const isNew = Boolean(rec.taxon) && ctx.isNewSpecies(rec.taxon.id, rec.id); // first photo of this species?
  upsert(rec);
  S.highlight = rec.id;
  el.dialog.close();
  ctx.showTab('mine');
  render();
  document.querySelector('#mineList .is-new')?.scrollIntoView({ block: 'center' });
  if (isNew) ctx.celebrate(rec, thumbUrl(rec));
  toast(!rec.taxon ? 'Saved. Tap it any time to add an ID.'
    : rec.rating ? `Saved: ${TIER_LABEL[rec.rating.tier].toLowerCase()} around here`
    : 'Saved. Rarity will be rated once you’re back online.');
  announceChange(); // may unlock achievements (their toast follows this one)
}

// ---------------------------------------------------------------------------
// Dialog: identify (draft) view
// ---------------------------------------------------------------------------
function onDialogClosed() {
  if (draft) {
    draft.controller.abort();
    draft.searchController?.abort();
    clearTimeout(draft.searchTimer);
    if (draft.photoUrl) URL.revokeObjectURL(draft.photoUrl);
  }
  if (detailPhotoUrl) URL.revokeObjectURL(detailPhotoUrl);
  detailPhotoUrl = null;
  releaseCard();
  draft = null;
  detail = null;
  el.dialog.innerHTML = '';
}

function openDraft(d) {
  if (detailPhotoUrl) { URL.revokeObjectURL(detailPhotoUrl); detailPhotoUrl = null; }
  draft = d;
  detail = null;
  el.dialog.innerHTML = `
    <div class="dlg-head">
      <h2 id="dlgTitle">${d.mode === 'edit' ? 'Change ID' : 'New sighting'}</h2>
      <button type="button" class="icon-btn" data-action="s-close" aria-label="Close">✕</button>
    </div>
    <div class="dlg-body">
      <div class="draft-top">
        <div class="draft-photo" id="draftPhoto"></div>
        <div class="draft-facts">
          <p>🕒 ${esc(formatDateTime(d.takenAt))}</p>
          <p id="draftLoc"></p>
        </div>
      </div>
      <div class="ai-box" id="aiBox" aria-live="polite"></div>
      <label class="field-label" for="taxonSearch">Search for a name</label>
      <input id="taxonSearch" class="field" type="search" placeholder="e.g. coyote, oak, monarch"
             autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">
      <div class="candidates" id="candidates" aria-live="polite"></div>
    </div>
    <div class="dlg-foot" id="draftFoot"></div>`;
  if (!el.dialog.open) el.dialog.showModal();
  renderDraftPhoto();
  renderDraftLocation();
  renderAiBox();
  renderCandidates();
  renderDraftFoot();
}

function renderDraftPhoto() {
  const box = $('draftPhoto');
  if (!box || !draft) return;
  box.innerHTML = draft.photoUrl ? `<img src="${draft.photoUrl}" alt="Your photo">` : '<span class="sk" aria-label="Preparing photo"></span>';
}

function renderDraftLocation() {
  const p = $('draftLoc');
  if (!p || !draft) return;
  const { locStatus, loc } = draft;
  p.textContent = locStatus === 'pending' ? '📍 Getting your location…'
    : locStatus === 'gps' ? `📍 Your location${loc.accuracy ? ` (±${loc.accuracy} m)` : ''}`
    : locStatus === 'scan' ? `📍 No GPS, so using ${loc.label} (approximate)`
    : '📍 No location, so rarity can’t be rated';
}

const candButton = (t, i, action, note) => `<li>
  <button type="button" class="cand" data-action="${action}" data-idx="${i}" aria-pressed="${draft.chosen?.id === t.id}">
    ${t.photo ? `<img src="${esc(photoSize(t.photo, 'small'))}" alt="" width="48" height="48" loading="lazy" data-fallback="🌿">` : '<span class="cand-noimg" aria-hidden="true">🌿</span>'}
    <span class="cand-text"><strong>${esc(displayName(t))}</strong>${action === 's-choose-ai' && ctx.isNewSpecies(t.id, draft.sighting?.id) ? '<span class="new-badge">✨ New</span>' : ''}${t.common ? `<em>${esc(t.name)}</em>` : ''}</span>
    ${note ? `<span class="cand-count">${note}</span>` : ''}
  </button></li>`;

// The on-device AI's verdict: species suggestions, or "this isn't wildlife".
function renderAiBox() {
  const d = draft, box = $('aiBox');
  if (!d || !box) return;
  const { state, result } = d.ai;
  const st = aiStatus();
  d.aiCandidates = [];

  if (state === 'waiting') { box.innerHTML = ''; return; }
  if (state === 'loading') {
    const pct = Math.round(st.progress * 100);
    box.innerHTML = `<p class="ai-head">🤖 Getting the offline AI ready${st.state === 'loading' ? `… ${pct}%` : '…'}</p>
      <p class="ai-note">One-time 37 MB download, then it works offline.</p>
      <div class="progress"><span style="width:${pct}%"></span></div>`;
    return;
  }
  if (state === 'thinking') {
    box.innerHTML = '<p class="ai-head"><span class="spinner" aria-hidden="true"></span> 🤖 Looking at your photo…</p>';
    return;
  }
  // Quick look found nothing clear and a closer look is running: don't flash "no wildlife" yet.
  if (d.ai.refining && (result.kind === 'none' || result.kind === 'nature' || !result.guesses.length)) {
    box.innerHTML = '<p class="ai-head"><span class="spinner" aria-hidden="true"></span> 🔍 Looking closer at the whole photo…</p>';
    return;
  }
  if (state === 'error') {
    box.innerHTML = `<div class="ai-verdict is-warn"><p class="ai-head">🤖 The offline AI isn’t available</p>
      <p class="ai-note">${isOffline() ? 'It needs a one-time download while you’re online.' : 'It couldn’t start on this device.'} You can still pick a match below.</p>
      <button type="button" class="btn btn-ghost btn-small" data-action="s-ai-retry">Try again</button></div>`;
    return;
  }

  // done
  const pct = p => `${Math.round(p * 100)}%`;
  if (result.kind === 'pet') {
    box.innerHTML = `<div class="ai-verdict is-warn"><p class="ai-head">🐾 This looks like a pet or farm animal</p>
      <p class="ai-note">Nature Radar is for wild plants and animals. If the AI got it wrong, pick a species below.</p></div>`;
    return;
  }
  if (result.kind === 'none') {
    box.innerHTML = `<div class="ai-verdict is-stop"><p class="ai-head">🚫 No wildlife detected in this photo</p>
      <p class="ai-note">Try another photo, or pick a species below if you think the AI missed it.</p></div>`;
    return;
  }

  // Wildlife (or a nature scene with weak guesses): combine AI guesses with what's been seen nearby.
  // Order: nearby species that fit the top guesses → the guesses themselves → nearby species of the same group.
  const seen = new Set();
  const add = (taxon, note) => { if (!seen.has(taxon.id)) { seen.add(taxon.id); d.aiCandidates.push({ taxon, note }); } };
  const [top, ...rest] = result.guesses;
  // Trees recorded here (planted ones too). The AI model knows only some of them, so when it names a
  // tree's genus (e.g. a pistache it can't tell apart), offer this area's trees from that genus.
  const isPlantPhoto = result.group === 'Plantae' || result.plantish;
  const { model } = ctx.getNearby();
  const trees = isPlantPhoto ? model?.trees || [] : [];
  const addTrees = g => { for (const m of nearbyMatches(g, trees)) if (m.score >= 2) add(m.s, m.s.id === g.taxon.id ? `${pct(g.rawP ?? g.p)} · tree here` : 'same genus · tree here'); };
  if (top) {
    for (const m of nearbyMatches(top, d.pool)) add(m.s, m.s.id === top.taxon.id ? `${pct(top.rawP ?? top.p)} · seen nearby` : 'seen nearby');
    addTrees(top);
    add(top.taxon, pct(top.rawP ?? top.p));
  }
  for (const g of rest) {
    for (const m of nearbyMatches(g, d.pool)) if (m.score >= 2) add(m.s, 'seen nearby');
    addTrees(g);
    add(g.taxon, pct(g.rawP ?? g.p));
  }
  const group = GROUPS.find(g => g.key === result.group);
  if (group) {
    d.pool.filter(s => s.iconic === group.key).sort((a, b) => b.weekCount - a.weekCount).slice(0, 3)
      .forEach(s => add(s, `nearby ${group.noun}`));
  }
  // Trees and shrubs are rarely logged in any given week, so for an unsure plant ID also offer the
  // plants most often recorded here over all time (e.g. coast live oak on campus).
  if (isPlantPhoto && !result.confident) {
    (model?.dex || []).filter(t => t.iconic === 'Plantae').slice(0, 4).forEach(t => add(t, 'common here'));
  }
  const list = d.aiCandidates.slice(0, isPlantPhoto ? 8 : 6);
  d.aiCandidates = list;
  // For a guess above species level ("Lynxes"), offer to search for the species inside it.
  const searchHint = top && top.taxon.rank !== 'species' && !isOffline()
    ? `<button type="button" class="link-btn ai-search" data-action="s-ai-search" data-q="${esc(top.taxon.name)}">Search species in ${esc(displayName(top.taxon))}</button>` : '';
  const head = result.kind === 'nature'
    ? `<p class="ai-head">🌄 No clear plant or animal found in this photo</p>
       <p class="ai-note">${list.length ? 'Possible matches are below. ' : ''}If you photographed one, pick it below or search for it.</p>`
    : `<p class="ai-head">🤖 AI suggestions${result.confident ? '' : ' <span class="ai-unsure">(not very sure)</span>'}</p>
       <details class="ai-how"><summary>How was this found?</summary><p class="ai-note">The AI ran on your phone, no internet needed${result.closerLook ? ', checking the whole photo region by region' : ''}${d.pool.length ? ', then matched against species seen nearby' : ''}. Tap a suggestion to pick it.</p></details>
       ${d.ai.refining ? '<p class="ai-note"><span class="spinner" aria-hidden="true"></span> Looking closer at the whole photo…</p>' : ''}
       ${isPlantPhoto && !result.confident && !d.ai.refining ? '<p class="ai-tip">🌳 <strong>Tip for trees:</strong> for the surest match, also snap a close-up of one leaf, a cone, fruit, flower or the bark.</p>' : ''}`;
  box.innerHTML = `<div class="ai-verdict${result.kind === 'nature' ? ' is-info' : ''}">${head}
    ${list.length ? `<ul class="cand-list">${list.map((c, i) => candButton(c.taxon, i, 's-choose-ai', c.note)).join('')}</ul>` : ''}
    ${searchHint}</div>`;
}

// "Search species in Lynxes": fill the search box with the AI's genus/family name.
function searchFromAi(q) {
  const input = $('taxonSearch');
  if (!input || !draft) return;
  input.value = q;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function renderCandidates() {
  const d = draft, box = $('candidates');
  if (!d || !box) return;
  let heading, note = '', items;
  if (d.query.trim().length >= 2) {
    heading = 'Search results';
    items = d.searchStatus === 'ready' ? d.results : [];
    if (d.searchStatus === 'loading') note = 'Searching…';
    else if (d.searchStatus === 'error') note = esc(d.searchError || 'Search didn’t work.');
    else if (!items.length) note = 'No matches. Try another spelling or a broader name, like “oak”.';
  } else {
    heading = 'Seen nearby this week';
    items = d.suggestStatus === 'ready' ? d.suggestions : [];
    if (d.suggestStatus === 'loading') note = 'Finding species seen nearby…';
    else if (d.suggestStatus === 'none') note = 'No location, so there’s no nearby list. Search for a name above.';
    else if (d.suggestStatus === 'offline') note = 'You’re offline, so the nearby list isn’t available. Use the AI suggestions above.';
    else if (d.suggestStatus === 'error') note = 'Couldn’t load nearby species. You can still search above.';
    else if (!items.length) note = 'Nothing logged nearby this week. Search for a name above.';
  }
  d.candidates = items;
  box.innerHTML = `<p class="cand-head">${heading}</p>${note ? `<p class="cand-note">${note}</p>` : ''}
    <ul class="cand-list">${items.map((t, i) => candButton(t, i, 's-choose', t.weekCount ? `${t.weekCount}× this week` : '')).join('')}</ul>`;
}

function renderDraftFoot() {
  const d = draft, foot = $('draftFoot');
  if (!d || !foot) return;
  if (d.saving) {
    foot.innerHTML = `<p class="progress-note"><span class="spinner" aria-hidden="true"></span><span>${esc(d.saveStep)}</span></p>`;
    return;
  }
  const ready = !!d.photoBlob;
  foot.innerHTML = `
    ${d.mode === 'new' ? `<button type="button" class="btn btn-ghost" data-action="s-save-unknown"${ready ? '' : ' disabled'}>Save without ID</button>` : ''}
    <button type="button" class="btn btn-save" data-action="s-save"${ready && d.chosen ? '' : ' disabled'}>
      ${d.chosen ? `Save as ${esc(displayName(d.chosen))}${ctx.isNewSpecies(d.chosen.id, d.sighting?.id) ? ' · ✨ New!' : ''}` : 'Pick a match'}
    </button>`;
}

// ---------------------------------------------------------------------------
// Dialog: detail view
// ---------------------------------------------------------------------------
export function openDetail(id) {
  const s = S.items.find(x => x.id === id);
  if (!s) return;
  draft = null;
  detail = s;
  renderDetail();
  if (!el.dialog.open) el.dialog.showModal();
}

function whereLong(s) {
  if (!s.loc) return 'No location saved';
  const { lat, lng, accuracy, source, label } = s.loc;
  return source === 'gps'
    ? `${lat.toFixed(5)}, ${lng.toFixed(5)} (GPS${accuracy ? `, ±${accuracy} m` : ''})`
    : `Approximate: ${label} (${lat.toFixed(3)}, ${lng.toFixed(3)})`;
}

const ID_SOURCE = { ai: 'Offline AI', nearby: 'Nearby list', search: 'Name search' };

function renderDetail() {
  const s = detail;
  if (detailPhotoUrl) URL.revokeObjectURL(detailPhotoUrl);
  detailPhotoUrl = s.photo ? URL.createObjectURL(s.photo) : s.photoRemote || null;
  const tier = tierOf(s);
  const name = s.taxon ? displayName(s.taxon) : 'Unidentified';
  const shared = ctx.isShared(s.id);
  el.dialog.innerHTML = `
    <div class="dlg-head">
      <h2 id="dlgTitle">${esc(name)}</h2>
      <button type="button" class="icon-btn" data-action="s-close" aria-label="Close">✕</button>
    </div>
    <div class="dlg-body">
      ${detailPhotoUrl ? `<img class="detail-photo" src="${detailPhotoUrl}" alt="Your photo of ${esc(name)}">` : ''}
      ${s.taxon?.common ? `<p class="sci detail-sci">${esc(s.taxon.name)}</p>` : ''}
      <p class="detail-badge"><span class="badge t-${tier}">${TIER_LABEL[tier]}</span></p>
      <p class="rarity-note">${rarityNote(s)}</p>
      ${s.rating?.introduced ? `<div class="nn-note"><strong>⚠ Non-native species here.</strong> ${NON_NATIVE_TIP} <span>Logging it on iNaturalist helps local land managers track and control introduced species.</span> <a href="https://www.inaturalist.org/observations/upload" target="_blank" rel="noopener">Log it on iNaturalist ↗</a></div>` : ''}
      <dl class="facts">
        <div><dt>When</dt><dd>${esc(formatDateTime(s.createdAt, { year: 'numeric' }))}</dd></div>
        <div><dt>Where</dt><dd>${esc(whereLong(s))}</dd></div>
        ${s.idSource ? `<div><dt>ID by</dt><dd>${ID_SOURCE[s.idSource] || 'You'}</dd></div>` : ''}
      </dl>
      <div class="detail-actions">
        ${s.taxon ? (shared
          ? '<p class="ok">✓ Shared with the community</p>'
          : '<button type="button" class="btn" data-action="s-share">Share to community</button>') : ''}
        ${s.taxon ? '<button type="button" class="btn btn-ghost" data-action="s-card">📸 Make a share card</button>' : ''}
        ${s.loc ? `<button type="button" class="btn${s.taxon ? ' btn-ghost' : ''}" data-action="s-map">Show on map</button>` : ''}
        <button type="button" class="btn${s.taxon ? ' btn-ghost' : ''}" data-action="s-reid">${s.taxon ? 'Change ID' : 'Identify it'}</button>
        ${s.taxon ? `<a class="btn btn-ghost" href="${taxonUrl(s.taxon.id)}" target="_blank" rel="noopener">About this species ↗</a>` : ''}
        <button type="button" class="btn btn-danger" data-action="s-delete">Delete sighting</button>
      </div>
    </div>`;
}

// Share card: an image of the sighting for Instagram, Messages, etc.
let card = null; // { blob, url } of the card being previewed
function releaseCard() {
  if (card) URL.revokeObjectURL(card.url);
  card = null;
}

async function openCard() {
  const s = detail;
  if (!s?.taxon) return;
  releaseCard();
  el.dialog.innerHTML = `
    <div class="dlg-head">
      <h2 id="dlgTitle">Share card</h2>
      <button type="button" class="icon-btn" data-action="s-close" aria-label="Close">✕</button>
    </div>
    <div class="dlg-body card-body" id="cardBody"><p class="progress-note"><span class="spinner" aria-hidden="true"></span><span>Making your card…</span></p></div>
    <div class="dlg-foot">
      <button type="button" class="btn btn-ghost" data-action="s-card-back">Back</button>
      <button type="button" class="btn" data-action="s-card-share" disabled>Share</button>
    </div>`;
  try {
    const blob = await makeShareCard(s);
    if (detail !== s || !$('cardBody')) return;
    card = { blob, url: URL.createObjectURL(blob) };
    $('cardBody').innerHTML = `<img class="card-preview" src="${card.url}" alt="Share card for ${esc(displayName(s.taxon))}">
      <p class="cand-note">Tap Share to post it to Instagram, Messages and more${navigator.canShare ? '' : ' (on this device the image will be saved instead)'}.</p>`;
    el.dialog.querySelector('[data-action="s-card-share"]').disabled = false;
  } catch (err) {
    console.error(err);
    toast('Couldn’t make the card on this device.');
    renderDetail();
  }
}

async function shareCurrentCard() {
  if (!card || !detail) return;
  const result = await shareCard(card.blob, detail);
  if (result === 'saved') toast('Card saved to your downloads');
}

function startReidentify() {
  const s = detail;
  if (!s) return;
  const d = newDraft({
    mode: 'edit', sighting: s, takenAt: s.createdAt, photoBlob: s.photo, thumbBlob: s.thumb,
    photoUrl: s.photo ? URL.createObjectURL(s.photo) : s.photoRemote || null,
    loc: s.loc, locStatus: s.loc ? s.loc.source : 'none', chosen: s.taxon, idSource: s.idSource,
  });
  openDraft(d);
  loadSuggestions(d);
  if (s.photo) runAI(d);
}

function showDetailOnMap() {
  const s = detail;
  if (!s?.loc) return;
  el.dialog.close();
  ctx.showOnMap({
    lat: s.loc.lat, lng: s.loc.lng, title: s.taxon ? displayName(s.taxon) : 'Unidentified',
    subtitle: `Your sighting · ${formatDateTime(s.createdAt)}`, photoUrl: thumbUrl(s),
  });
}

// Two taps so a slip of the thumb doesn't lose a sighting.
async function deleteDetail(btn) {
  if (btn.dataset.confirm !== 'yes') {
    btn.dataset.confirm = 'yes';
    btn.textContent = 'Tap again to delete for good';
    setTimeout(() => {
      if (btn.isConnected) { btn.dataset.confirm = ''; btn.textContent = 'Delete sighting'; }
    }, 4000);
    return;
  }
  const s = detail;
  try {
    await sightingsDB.remove(s.id);
  } catch (err) {
    console.error(err);
    toast('Couldn’t delete. Try again.');
    return;
  }
  S.items = S.items.filter(x => x.id !== s.id);
  if (thumbUrls.has(s.id)) { URL.revokeObjectURL(thumbUrls.get(s.id)); thumbUrls.delete(s.id); }
  el.dialog.close();
  render();
  announceChange();
  toast('Sighting deleted');
}

// ---------------------------------------------------------------------------
// Backup + restore (a JSON file with the photos inside)
// ---------------------------------------------------------------------------
const blobToDataUrl = blob => !blob ? null : new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

async function exportBackup() {
  if (!S.items.length) { toast('Nothing to back up yet.'); return; }
  const sightings = await Promise.all(S.items.map(async s => ({ ...s, photo: await blobToDataUrl(s.photo), thumb: await blobToDataUrl(s.thumb) })));
  const json = JSON.stringify({ app: 'nature-radar', version: 1, exportedAt: new Date().toISOString(), sightings });
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `nature-radar-backup-${isoDaysAgo(0)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast(`Backup downloaded (${S.items.length} ${S.items.length === 1 ? 'sighting' : 'sightings'})`);
}

// A backup file could come from anywhere, so only known, well-formed fields are kept.
const cleanLoc = l => l && Number.isFinite(l.lat) && Number.isFinite(l.lng)
  ? { lat: l.lat, lng: l.lng, accuracy: Number.isFinite(l.accuracy) ? l.accuracy : null, source: l.source === 'gps' ? 'gps' : 'scan', label: String(l.label || 'Saved place') }
  : null;
const cleanTaxon = t => t && Number.isInteger(t.id) && typeof t.name === 'string'
  ? { id: t.id, name: t.name, common: t.common ? String(t.common) : null, iconic: t.iconic ? String(t.iconic) : null,
      rank: t.rank ? String(t.rank) : null, photo: typeof t.photo === 'string' && t.photo.startsWith('https://') ? t.photo : null }
  : null;
const cleanRating = r => r && Number.isFinite(r.rarity) && ['veryrare', 'rare', 'uncommon', 'common', 'unranked'].includes(r.tier)
  ? { rarity: r.rarity, tier: r.tier, baseCount: Number(r.baseCount) || 0, maxCount: Number(r.maxCount) || 0, radiusKm: Number(r.radiusKm) || RATING_RADIUS_KM, introduced: typeof r.introduced === 'boolean' ? r.introduced : null, ratedAt: String(r.ratedAt || '') }
  : null;
const dataUrlToBlob = async u => (typeof u === 'string' && u.startsWith('data:image/') ? (await fetch(u)).blob() : null);

async function onImportChosen() {
  const file = el.importInput.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data?.app !== 'nature-radar' || !Array.isArray(data.sightings)) throw new Error('Not a Nature Radar backup');
    let restored = 0;
    for (const raw of data.sightings) {
      if (typeof raw?.id !== 'string' || Number.isNaN(Date.parse(raw.createdAt))) continue;
      const taxon = cleanTaxon(raw.taxon);
      const rec = {
        id: raw.id, createdAt: new Date(raw.createdAt).toISOString(), loc: cleanLoc(raw.loc), taxon,
        idSource: ['ai', 'nearby', 'search'].includes(raw.idSource) ? raw.idSource : null,
        rating: taxon ? cleanRating(raw.rating) : null,
        photo: await dataUrlToBlob(raw.photo), thumb: await dataUrlToBlob(raw.thumb),
      };
      await sightingsDB.put(rec);
      upsert(rec);
      restored++;
    }
    render();
    announceChange();
    toast(`Restored ${restored} ${restored === 1 ? 'sighting' : 'sightings'}`);
    rateMissing();
  } catch (err) {
    console.error(err);
    toast('That file isn’t a Nature Radar backup.');
  }
}
