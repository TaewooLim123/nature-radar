/* Collection: a Pokédex-style page of every species you've photographed, set against the
   "local dex" (the 151 species most often recorded around the place you're scanning, plus its trees).
   Extras that make collecting fun: XP + levels, shiny cards for rare catches, nearby targets,
   dex entry pages with your photo gallery, and the "NEW SPECIES!" celebration. */
import { esc, infoHead, TIER_RANK, isShiny, dexNo, nonNativeBadge, displayName, photoSize, TIER_LABEL, GROUPS, groupOf, isTree, prefersReducedMotion, formatDateTime, local } from './shared.js';

let ctx = null; // from app.js: getSightings, thumbUrl, getNearby, isVisible, onChange, openSighting, showTab
const C = { group: 'all', status: 'all', year: 'all' };
const $ = id => document.getElementById(id);

export function init(options) {
  ctx = options;
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('celebrate').hidden) closeCelebration(); });
  document.addEventListener('nr:data-changed', () => {
    if (ctx.currentView() === 'collection') render();
    else if (ctx.currentView() === 'lifelist') renderLifeList();
  });
  $('dexDialog').addEventListener('click', e => { if (e.target === $('dexDialog')) $('dexDialog').close(); });
}

function onClick(e) {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  switch (t.dataset.action) {
    case 'x-group': C.group = t.dataset.value; render(); break;
    case 'x-status': C.status = t.dataset.value; render(); break;
    case 'x-entry': openEntry(Number(t.dataset.id)); break;
    case 'x-hint': openHint(Number(t.dataset.id)); break;
    case 'x-reveal': revealHint(); break;
    case 'x-sighting': $('dexDialog').close(); ctx.openSighting(t.dataset.id); break;
    case 'x-close': $('dexDialog').close(); break;
    case 'x-year': C.year = t.dataset.value; renderLifeList(); break;
    case 'cele-close': closeCelebration(); break;
    case 'cele-view': closeCelebration(); ctx.showTab('collection'); break;
  }
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

// One entry per species you've photographed: every sighting (newest first), first "catch", best tier.
function collected(exceptSightingId) {
  const map = new Map();
  for (const s of ctx.getSightings()) {
    if (!s.taxon || s.id === exceptSightingId) continue;
    let m = map.get(s.taxon.id);
    if (!m) map.set(s.taxon.id, m = { taxon: s.taxon, sightings: [], first: s, tier: 'unrated' });
    m.sightings.push(s);
    if (s.createdAt < m.first.createdAt) m.first = s;
    const tier = s.rating?.tier || 'unrated';
    if (TIER_RANK[tier] > TIER_RANK[m.tier]) m.tier = tier;
  }
  for (const m of map.values()) m.sightings.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return map;
}

// True if you've never saved this species before (used for the ✨ New badges and the celebration).
export const isNewSpecies = (taxonId, exceptSightingId) => !collected(exceptSightingId).has(taxonId);

const dexList = () => ctx.getNearby().model?.dex || [];
const nounFor = d => (d.tree ? 'tree' : GROUPS.find(g => g.key === groupOf(d.iconic))?.noun || 'species');

// XP: each species is worth more the rarer it is around here; every sighting adds a little.
const TIER_XP = { veryrare: 100, rare: 50, uncommon: 25, common: 10, unranked: 10, unrated: 10 };
const LEVELS = ['Sprout', 'Seedling', 'Trail Walker', 'Spotter', 'Tracker', 'Field Naturalist', 'Ranger', 'Biologist', 'Wildlife Expert', 'Legend'];
const xpForLevel = level => 20 * (level - 1) * level; // 0, 40, 120, 240, 400, …

function xpOf(map, sightingCount) {
  let xp = sightingCount * 2;
  for (const m of map.values()) xp += TIER_XP[m.tier] ?? 10;
  return xp;
}

function levelFor(xp) {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  const floor = xpForLevel(level), next = xpForLevel(level + 1);
  return { level, xp, title: LEVELS[Math.min(level, LEVELS.length) - 1], progress: (xp - floor) / (next - floor), toNext: next - xp };
}

export function xpSummary(exceptSightingId) {
  const map = collected(exceptSightingId);
  const count = ctx.getSightings().filter(s => s.id !== exceptSightingId).length;
  return levelFor(xpOf(map, count));
}

// How many local-dex species you've caught (used by achievements too).
export function dexProgress() {
  const mine = collected();
  const dex = dexList();
  return { got: dex.filter(d => mine.has(d.id)).length, total: dex.length };
}

export function statHtml() {
  const mine = collected();
  const { got, total } = dexProgress();
  return `<strong>${mine.size}</strong> species collected${total ? ` · ${got}/${total} in the local dex` : ''}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export function render() {
  const view = $('collectionView');
  if (!view) return;
  ctx.onChange();
  const mine = collected();
  const dex = dexList();
  const { loc, model } = ctx.getNearby();
  const inDex = new Set(dex.map(d => d.id));
  const extras = [...mine.values()].filter(m => !inDex.has(m.taxon.id));
  const dexTrees = dex.filter(d => d.tree), treeExtra = extras.filter(m => isTree(m.taxon)).length;
  const matchesGroup = (t, tree) => C.group === 'all' || (C.group === 'trees' ? tree : groupOf(t.iconic) === C.group);
  const matchesStatus = got => C.status === 'all' || (C.status === 'caught') === got;
  const lv = xpSummary();

  // Filters: group (with progress) + caught/missing.
  const groupStats = GROUPS.filter(g => g.key !== 'all').map(g => {
    const dexIn = dex.filter(d => groupOf(d.iconic) === g.key);
    const extra = extras.filter(m => groupOf(m.taxon.iconic) === g.key).length;
    return { ...g, total: dexIn.length + extra, got: dexIn.filter(d => mine.has(d.id)).length + extra };
  }).filter(g => g.total || g.key === C.group);
  // Trees cut across groups (oaks are plants, like poppies), so they get their own filter chip.
  if (dexTrees.length || treeExtra) groupStats.unshift({ key: 'trees', label: '🌳 Trees', total: dexTrees.length + treeExtra, got: dexTrees.filter(d => mine.has(d.id)).length + treeExtra });

  // Header: level + progress for what's shown (the whole local dex, or one group such as Trees).
  const { got, total } = dexProgress();
  const scope = C.group === 'all' ? { label: 'Local dex', got, total } : groupStats.find(g => g.key === C.group) || { label: 'Local dex', got, total };
  const pct = scope.total ? Math.round((scope.got / scope.total) * 100) : 0;
  const scopeName = C.group === 'all' ? 'Local dex' : scope.label.replace(/^\S+ (?=Trees)/, '');
  const head = `<div class="dex-head">
      <div class="dex-ring" style="--pct:${pct}" role="img" aria-label="${scope.got} of ${scope.total} ${esc(scopeName)} collected">
        <strong>${scope.got}</strong><span>/ ${scope.total || '—'}</span>
      </div>
      <div class="dex-head-text">
        ${infoHead(esc(scopeName), `${!total
          ? (loc ? 'Loading this place’s local dex…' : 'Choose a place on the Nearby tab to unlock its local dex: 151 species, starting with its 50 most-recorded trees.')
          : C.group === 'trees' ? `The ${scope.total} trees most recorded within ${model.radius} km of ${esc(loc.label)} (planted ones too). Snap a leaf, bark or the whole tree.`
          : C.group === 'all' ? `The ${total} species most recorded within ${model.radius} km of ${esc(loc.label)}, ${dexTrees.length} of them trees (planted ones too). #001 is the most recorded. Snap them all!`
          : `${pct}% of this area’s ${esc(scope.label.toLowerCase())} collected.`}`)}
        <p class="level-line" title="${lv.xp} XP · ${lv.toNext} XP to level ${lv.level + 1}"><span class="level-pill">Lv ${lv.level}</span><strong>${esc(lv.title)}</strong></p>
        <div class="progress" role="progressbar" aria-label="XP to level ${lv.level + 1}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(lv.progress * 100)}"><span style="width:${Math.round(lv.progress * 100)}%"></span></div>
      </div>
    </div>`;

  // Targets: species you still need that someone spotted nearby this week.
  const weekIds = new Map((model?.species || []).map(s => [s.id, s.weekCount]));
  const targets = dex.filter(d => !mine.has(d.id) && weekIds.has(d.id) && matchesGroup(d, d.tree)).slice(0, 8);
  const targetsHtml = targets.length ? `<section class="targets" aria-labelledby="targetsTitle">
      ${infoHead('🎯 Targets nearby', 'Species missing from your dex that someone spotted nearby this week. They’re out there!', { id: 'targetsTitle' })}
      <ul class="target-row">${targets.map(d => `<li><button type="button" class="target" data-action="x-hint" data-id="${d.id}">
        <span class="dex-photo">${d.photo ? `<img src="${esc(photoSize(d.photo, 'small'))}" alt="" loading="lazy" data-fallback=" ">` : ''}<span class="dex-q" aria-hidden="true">?</span></span>
        <span class="target-no">${dexNo(d.no)}</span><span class="target-seen" title="Spotted ${weekIds.get(d.id)}× nearby this week">seen ${weekIds.get(d.id)}×</span>
      </button></li>`).join('')}</ul></section>` : '';

  const bar = (a, b) => `<span class="chip-bar" aria-hidden="true"><i style="width:${b ? Math.round((a / b) * 100) : 0}%"></i></span>`;
  const chips = `<div class="chip-row dex-chips" role="toolbar" aria-label="Filter collection by group">
      <button type="button" class="chip" data-action="x-group" data-value="all" aria-pressed="${C.group === 'all'}">All<span class="chip-count">${got + extras.length}/${total + extras.length}</span>${bar(got + extras.length, total + extras.length)}</button>
      ${groupStats.map(g => `<button type="button" class="chip g-${g.key}${g.key === 'trees' ? ' chip-trees' : ''}" data-action="x-group" data-value="${g.key}" aria-pressed="${C.group === g.key}">${g.label}<span class="chip-count">${g.got}/${g.total}</span>${bar(g.got, g.total)}</button>`).join('')}
    </div>
    <div class="chip-row chip-row-sub dex-chips" role="toolbar" aria-label="Show caught or missing">
      ${[['all', 'All'], ['caught', 'Caught'], ['missing', 'Missing']].map(([k, label]) =>
        `<button type="button" class="chip chip-sub" data-action="x-status" data-value="${k}" aria-pressed="${C.status === k}">${label}</button>`).join('')}
    </div>`;

  // One grid: the local dex in number order, then your finds from beyond it (marked ✦, newest first).
  const dexCards = dex.filter(d => matchesGroup(d, d.tree) && matchesStatus(mine.has(d.id)))
    .map(d => (mine.has(d.id) ? caughtCard(mine.get(d.id), d.no, d) : missingCard(d)));
  const beyond = C.status === 'missing' ? [] : extras.filter(m => matchesGroup(m.taxon, isTree(m.taxon)))
    .sort((a, b) => b.first.createdAt.localeCompare(a.first.createdAt)).map(m => caughtCard(m, null));
  const cards = [...dexCards, ...beyond].join('');

  view.innerHTML = `${head}${mine.size || total ? chips : ''}${targetsHtml}
    ${!mine.size ? `<p class="notice">📷 Tap <strong>Add a sighting</strong> to catch your first species.</p>` : ''}
    ${cards ? `<ol class="dex-grid">${cards}</ol>` : (total ? '<p class="cand-note">Nothing here with these filters.</p>' : '')}`;
}

const groupClass = t => `g-${isTree(t) ? 'trees' : groupOf(t.iconic)}`;

function caughtCard(m, no, d) {
  const url = ctx.thumbUrl(m.first);
  const shiny = isShiny(m.tier);
  return `<li><button type="button" class="dex-card is-got t-${m.tier} ${d?.tree ? 'g-trees' : groupClass(m.taxon)}${shiny ? ' is-shiny' : ''}" data-action="x-entry" data-id="${m.taxon.id}"
      aria-label="${no ? `Number ${no}, ` : ''}${esc(displayName(m.taxon))}, collected${shiny ? ', shiny' : ''}">
    ${no ? `<span class="dex-no">${dexNo(no)}</span>` : '<span class="dex-no is-star" title="Beyond this area’s local dex">✦</span>'}
    ${shiny ? '<span class="shiny-tag" aria-hidden="true">✦</span>' : ''}
    <span class="dex-photo">${url ? `<img src="${url}" alt="" loading="lazy">` : '<span aria-hidden="true">📷</span>'}</span>
    <span class="dex-name">${esc(displayName(m.taxon))}</span>
    <span class="dex-meta"><i class="dot t-${m.tier}"></i>${m.first.rating?.introduced ? '<span class="nn-mark" title="Non-native here">⚠</span>' : ''}${m.sightings.length > 1 ? `×${m.sightings.length}` : esc(formatDateTime(m.first.createdAt, { weekday: undefined, hour: undefined, minute: undefined }))}</span>
  </button></li>`;
}

function missingCard(d) {
  return `<li><button type="button" class="dex-card is-missing ${d.tree ? 'g-trees' : groupClass(d)}" data-action="x-hint" data-id="${d.id}" aria-label="Number ${d.no}, not collected yet. Show a hint">
    <span class="dex-no">${dexNo(d.no)}</span>
    <span class="dex-photo">${d.photo ? `<img src="${esc(photoSize(d.photo, 'small'))}" alt="" loading="lazy" data-fallback=" ">` : ''}<span class="dex-q" aria-hidden="true">?</span></span>
    <span class="dex-name">???</span>
    <span class="dex-meta"><i class="dot t-${d.tier}" title="${esc(TIER_LABEL[d.tier] || '')}"></i></span>
  </button></li>`;
}

function openDialog(html) {
  const dlg = $('dexDialog');
  dlg.innerHTML = html;
  if (!dlg.open) dlg.showModal();
}

const dialogHead = title => `<div class="dlg-head">
    <h2 id="dexTitle">${title}</h2>
    <button type="button" class="icon-btn" data-action="x-close" aria-label="Close">✕</button>
  </div>`;

// Dex entry for a species you've caught: your photo gallery and stats.
function openEntry(taxonId) {
  const m = collected().get(taxonId);
  if (!m) return;
  const d = dexList().find(x => x.id === taxonId);
  const shiny = isShiny(m.tier);
  openDialog(`${dialogHead(`${d ? `${dexNo(d.no)} · ` : ''}${esc(displayName(m.taxon))}`)}
    <div class="dlg-body entry-body">
      <div class="entry-hero${shiny ? ' is-shiny' : ''}">
        ${ctx.thumbUrl(m.first) ? `<img src="${ctx.thumbUrl(m.first)}" alt="Your first photo of ${esc(displayName(m.taxon))}">` : ''}
        ${shiny ? '<span class="entry-shiny">✦ Shiny catch</span>' : ''}
      </div>
      ${m.taxon.common ? `<p class="sci">${esc(m.taxon.name)}</p>` : ''}
      <p class="entry-found">Found ${esc(formatDateTime(m.first.createdAt, { year: 'numeric', weekday: undefined }))}${m.first.loc?.label && m.first.loc.label !== 'Your location' ? ` · ${esc(m.first.loc.label)}` : ''}</p>
      <dl class="entry-stats">
        <div><dt>Best rarity</dt><dd><span class="badge t-${m.tier}">${TIER_LABEL[m.tier]}</span>${m.first.rating?.introduced ? nonNativeBadge() : ''}</dd></div>
        <div><dt>Times seen</dt><dd>${m.sightings.length}</dd></div>
        ${d ? `<div><dt>Local records</dt><dd>${d.count.toLocaleString()}</dd></div>` : ''}
        <div><dt>XP</dt><dd>+${TIER_XP[m.tier] ?? 10}</dd></div>
      </dl>
      <h3 class="entry-sub">Your photos</h3>
      <ul class="entry-gallery">${m.sightings.map(s => `<li><button type="button" data-action="x-sighting" data-id="${esc(s.id)}" aria-label="Open sighting from ${esc(formatDateTime(s.createdAt))}">
        ${ctx.thumbUrl(s) ? `<img src="${ctx.thumbUrl(s)}" alt="">` : '📷'}<span>${esc(formatDateTime(s.createdAt, { weekday: undefined, hour: undefined, minute: undefined }))}</span>
      </button></li>`).join('')}</ul>
      <a class="btn btn-ghost" href="https://www.inaturalist.org/taxa/${m.taxon.id}" target="_blank" rel="noopener">About this species ↗</a>
    </div>`);
}

// Hint for a species you haven't caught: blurred photo, how common it is, optional name reveal.
let hintId = null;
function openHint(id) {
  const d = dexList().find(x => x.id === id);
  if (!d) return;
  hintId = id;
  const week = (ctx.getNearby().model?.species || []).find(s => s.id === id);
  const noun = nounFor(d);
  openDialog(`${dialogHead(`${dexNo(d.no)} · ???`)}
    <div class="dlg-body hint-body">
      <div class="hint-photo">${d.photo ? `<img src="${esc(photoSize(d.photo, 'medium'))}" alt="" data-fallback=" ">` : ''}<span class="dex-q">?</span></div>
      <p class="hint-line"><span class="badge t-${d.tier}">${TIER_LABEL[d.tier]}</span>${d.introduced ? nonNativeBadge() : ''} ${esc(noun)} around here · worth <strong>${TIER_XP[d.tier] ?? 10} XP</strong></p>
      <p class="muted">${d.count.toLocaleString()} local records${week ? ` · <strong>🎯 seen ${week.weekCount}× nearby this week</strong>` : ''}</p>
      <div id="hintReveal"><button type="button" class="btn btn-ghost" data-action="x-reveal">Reveal its name</button></div>
    </div>`);
}

function revealHint() {
  const d = dexList().find(x => x.id === hintId);
  if (!d) return;
  $('dexTitle').textContent = `${dexNo(d.no)} · ${displayName(d)}`;
  $('hintReveal').innerHTML = `<p class="hint-name"><strong>${esc(displayName(d))}</strong>${d.common ? ` <em>${esc(d.name)}</em>` : ''}</p>
    <a class="btn btn-ghost" href="https://www.inaturalist.org/taxa/${d.id}" target="_blank" rel="noopener">How to find it ↗</a>`;
  document.querySelector('#dexDialog .hint-photo')?.classList.add('is-revealed');
}

// ---------------------------------------------------------------------------
// "NEW SPECIES!" celebration
// ---------------------------------------------------------------------------
const CONFETTI = ['#f2b544', '#b9e0a5', '#e0558d', '#4cb5c6', '#f6f0e1', '#e08a63'];
export const soundOn = () => local.get('nr-sound', true);
export const setSound = on => local.set('nr-sound', on);

// A short rising chime made with the Web Audio API (no sound files needed).
function chime(rare) {
  if (!soundOn()) return;
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const notes = rare ? [523.25, 659.25, 783.99, 1046.5, 1318.5] : [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const t = ac.currentTime + i * 0.09;
      const osc = ac.createOscillator(), gain = ac.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(gain).connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.55);
    });
    setTimeout(() => ac.close(), 1500);
  } catch { /* no audio on this device */ }
}

export function celebrate(rec, photoUrl) {
  const el = $('celebrate');
  const mine = collected();
  const { got, total } = dexProgress();
  const entry = dexList().find(d => d.id === rec.taxon.id);
  const tier = rec.rating?.tier;
  const rare = isShiny(tier);
  const before = xpSummary(rec.id), after = xpSummary();
  const gained = after.xp - before.xp;
  const levelUp = after.level > before.level;
  const reduced = prefersReducedMotion();
  const bits = reduced ? '' : Array.from({ length: rare ? 70 : 46 }, () => {
    const style = [
      `--x:${Math.round(Math.random() * 100)}vw`, `--drift:${Math.round(Math.random() * 160 - 80)}px`,
      `--r:${Math.round(Math.random() * 1080 - 540)}deg`, `--d:${(2.2 + Math.random() * 1.8).toFixed(2)}s`,
      `--delay:${(0.35 + Math.random() * 0.9).toFixed(2)}s`, `--c:${CONFETTI[Math.floor(Math.random() * CONFETTI.length)]}`,
      `--w:${6 + Math.round(Math.random() * 6)}px`,
    ].join(';');
    return `<i class="cele-bit" style="${style}"></i>`;
  }).join('');

  el.innerHTML = `
    <div class="cele-rays${rare ? ' is-rare' : ''}" aria-hidden="true"></div>
    <div class="cele-bits" aria-hidden="true">${bits}</div>
    <div class="cele-card${rare ? ' is-rare' : ''}" role="dialog" aria-modal="true" aria-labelledby="celeName">
      <span class="cele-spark s1" aria-hidden="true">✦</span><span class="cele-spark s2" aria-hidden="true">✦</span><span class="cele-spark s3" aria-hidden="true">✧</span>
      <div class="cele-new">${rare ? '✦ RARE FIND! ✦' : 'NEW SPECIES!'}</div>
      <div class="cele-photo">${photoUrl ? `<img src="${photoUrl}" alt="">` : '<span aria-hidden="true">🌿</span>'}</div>
      <p class="cele-no">${entry ? `${dexNo(entry.no)} · LOCAL DEX` : '✨ BEYOND THE LOCAL DEX'}</p>
      <h2 id="celeName">${esc(displayName(rec.taxon))}</h2>
      ${rec.taxon.common ? `<p class="cele-sci">${esc(rec.taxon.name)}</p>` : ''}
      ${tier && TIER_LABEL[tier] && tier !== 'unrated' ? `<p><span class="badge t-${tier}">${TIER_LABEL[tier]}</span></p>` : ''}
      ${rec.rating?.introduced ? '<p class="cele-nn">⚠ Non-native here. Thanks for logging it, it helps track invasive species.</p>' : ''}
      <p class="cele-xp">+${gained} XP</p>
      ${levelUp ? `<p class="cele-level">⬆ LEVEL UP! Lv ${after.level} · ${esc(after.title)}</p>` : ''}
      <p class="cele-stats">Species collected: <strong>${mine.size}</strong>${total ? ` · Local dex <strong>${got}/${total}</strong>` : ''}</p>
      <div class="cele-actions">
        <button type="button" class="btn cele-btn" data-action="cele-close">Awesome!</button>
        <button type="button" class="btn btn-ghost cele-btn-ghost" data-action="cele-view">See my dex</button>
      </div>
    </div>`;
  el.hidden = false;
  el.classList.remove('is-out');
  navigator.vibrate?.(rare ? [40, 60, 40, 60, 40, 60, 120] : [30, 60, 30, 60, 90]); // a buzz on Android
  chime(rare);
  el.querySelector('[data-action="cele-close"]').focus({ preventScroll: true });
}

function closeCelebration() {
  const el = $('celebrate');
  if (el.hidden) return;
  el.classList.add('is-out');
  setTimeout(() => { el.hidden = true; el.innerHTML = ''; }, prefersReducedMotion() ? 0 : 260);
}

// ---------------------------------------------------------------------------
// Life list: every species you've ever recorded, numbered in the order you found them,
// on a map, with a year list (species seen in a given year), like eBird's life list.
// ---------------------------------------------------------------------------
let lifeMap = null, lifeLayer = null;
const MILESTONES = new Set([1, 10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500]);

// Species with the first sighting of each (in the chosen year, or ever), oldest first.
function lifeEntries(year) {
  const firsts = new Map();
  for (const s of ctx.getSightings()) {
    if (!s.taxon || (year !== 'all' && new Date(s.createdAt).getFullYear() !== Number(year))) continue;
    const cur = firsts.get(s.taxon.id);
    if (!cur || s.createdAt < cur.createdAt) firsts.set(s.taxon.id, s);
  }
  return [...firsts.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

const yearsWithSightings = () =>
  [...new Set(ctx.getSightings().filter(s => s.taxon).map(s => new Date(s.createdAt).getFullYear()))].sort((a, b) => b - a);

export function lifeStatHtml() {
  const life = lifeEntries('all').length;
  const thisYear = lifeEntries(String(new Date().getFullYear())).length;
  return `<strong>${life}</strong> ${life === 1 ? 'species' : 'species'} on your life list · ${thisYear} this year`;
}

export function renderLifeList() {
  if (!$('lifelistView')) return;
  ctx.onChange();
  const year = C.year;
  const entries = lifeEntries(year);
  const nowYear = new Date().getFullYear();
  const years = yearsWithSightings();
  if (!years.includes(nowYear)) years.unshift(nowYear);
  const monthCount = lifeEntries(String(nowYear)).filter(s => new Date(s.createdAt).getMonth() === new Date().getMonth()).length;

  $('lifeHead').innerHTML = `
    ${infoHead('Life list', 'Every species you’ve recorded, numbered in the order you found them, with a pin where you first found each. Pick a year for that year’s list.')}
    <div class="stat-tiles life-tiles">
      <div class="tile"><strong>${lifeEntries('all').length}</strong><span>life list</span></div>
      <div class="tile"><strong>${lifeEntries(String(nowYear)).length}</strong><span>${nowYear}</span></div>
      <div class="tile"><strong>${monthCount}</strong><span>new this month</span></div>
    </div>
    <div class="chip-row chip-row-sub life-years" role="toolbar" aria-label="Life list or year list">
      <button type="button" class="chip chip-sub" data-action="x-year" data-value="all" aria-pressed="${year === 'all'}">All time</button>
      ${years.map(y => `<button type="button" class="chip chip-sub" data-action="x-year" data-value="${y}" aria-pressed="${year === String(y)}">${y}</button>`).join('')}
    </div>`;

  renderLifeMap(entries);

  if (!entries.length) {
    $('lifeBody').innerHTML = `<p class="notice">🗺️ ${year === 'all' ? 'Your life list is empty.' : `No species recorded in ${esc(year)} yet.`}
      Tap <strong>Add a sighting</strong>: every species you identify is added here, with a pin where you found it.</p>`;
    return;
  }
  // Newest first, so the latest find is at the top; numbers still count up from your first.
  $('lifeBody').innerHTML = `<ol class="life-list">${entries.map((s, i) => ({ s, n: i + 1 })).reverse().map(({ s, n }) => {
    const tier = s.rating?.tier || 'unrated';
    const url = ctx.thumbUrl(s);
    return `<li>${MILESTONES.has(n) ? `<p class="life-milestone">🎉 ${n === 1 ? 'Your first species!' : `Species #${n}!`}</p>` : ''}
      <button type="button" class="life-row" data-action="x-entry" data-id="${s.taxon.id}">
        <span class="life-no">${n}</span>
        ${url ? `<img src="${url}" alt="" loading="lazy">` : '<span class="life-noimg">📷</span>'}
        <span class="life-text"><strong>${esc(displayName(s.taxon))}</strong>
          <span>${esc(formatDateTime(s.createdAt, { year: 'numeric', weekday: undefined, hour: undefined, minute: undefined }))}${s.loc?.source === 'scan' ? ` · ${esc(s.loc.label)}` : ''}</span></span>
        <span class="badge t-${tier}">${TIER_LABEL[tier]}</span>
      </button></li>`;
  }).join('')}</ol>`;
}

// A map with a pin where you first found each species (colored by rarity).
function renderLifeMap(entries) {
  const card = $('lifeMapCard');
  const located = entries.filter(s => s.loc);
  card.hidden = !located.length || !window.L;
  if (card.hidden) return;
  if (!lifeMap) {
    lifeMap = L.map('lifeMap', { zoomControl: false, attributionControl: true, scrollWheelZoom: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, crossOrigin: true,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(lifeMap);
    lifeLayer = L.layerGroup().addTo(lifeMap);
  }
  lifeMap.invalidateSize(); // it was hidden until now
  lifeLayer.clearLayers();
  const points = [];
  for (const s of located) {
    const tier = s.rating?.tier || 'unrated';
    const m = L.marker([s.loc.lat, s.loc.lng], {
      icon: L.divIcon({ className: `life-pin t-${tier}`, html: '<span>★</span>', iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -10] }),
      title: displayName(s.taxon),
    });
    const url = ctx.thumbUrl(s);
    m.bindPopup(`${url ? `<img class="pop-photo" src="${url}" alt="" width="240" height="124">` : ''}
      <div class="pop-body"><h3>${esc(displayName(s.taxon))}</h3>
      <p class="pop-meta">First found ${esc(formatDateTime(s.createdAt, { year: 'numeric', weekday: undefined }))}</p></div>`, { maxWidth: 240, minWidth: 240 });
    lifeLayer.addLayer(m);
    points.push([s.loc.lat, s.loc.lng]);
  }
  if (points.length === 1) lifeMap.setView(points[0], 13);
  else lifeMap.fitBounds(points, { padding: [28, 28], maxZoom: 15 });
}
