/* Community tab: a feed of shared sightings.
   Demo mode (no backend in config.js): sample posts + your own posts, kept on this device.
   Live mode (Supabase configured): everyone's posts. Posts made offline wait in an outbox
   and upload automatically when the connection is back. */
import { COMMUNITY } from './config.js';
import { SAMPLE_POSTS, SAMPLE_USERS, SAMPLE_PLACES, TAXA } from './community-seed.js';
import { ACHIEVEMENTS, ACH_TIERS, TOP_ACHIEVEMENTS, achievementItem } from './account.js';
import {
  TIER_LABEL, esc, displayName, photoSize, taxonUrl, timeAgo, stateCard, toast, local, newId, requestJSON,
  friendlyError, rememberJSON, recallJSON, filterBarHtml, filterNoun, matchesFilter, announceChange, isOffline,
  skeletonRows, getProfile, saveProfile, moreButton, rarityModel, isTree, groupOf, TIER_RANK, isShiny, dexNo,
} from './shared.js';
import { postsDB, requestPersistence } from './store.js';

export const LIVE = Boolean(COMMUNITY.supabaseUrl && COMMUNITY.supabaseAnonKey);
const BASE = (COMMUNITY.supabaseUrl || '').replace(/\/+$/, '');
const KEY = COMMUNITY.supabaseAnonKey || '';
const BUCKET = 'sightings';
const COLUMNS = 'id,created_at,author_name,author_avatar,author_color,taxon_id,taxon_name,common_name,iconic,tier,rarity,place,lat,lng,caption,photo_path,likes';
const LIKED_KEY = 'nr-liked';
const SAMPLES_KEY = 'nr-show-explorers';

let ctx = null; // from app.js: getSightings, thumbUrl, showOnMap, showTab, onChange
const C = {
  remote: [], mine: [], status: LIVE ? 'idle' : 'ready', error: '', staleAt: null, lastFetch: 0,
  filter: { group: 'all', tier: 'all' }, flushing: false, mineLoaded: false,
};
const mineUrls = new Map(); // post id → object URL of its photo on this device
const $ = id => document.getElementById(id);
const el = {};

// Sample posts get fresh-looking times relative to when the app opened.
const NOW = Date.now();
const samples = SAMPLE_POSTS.map(p => ({
  ...p, sample: true,
  createdAt: new Date(NOW - p.hoursAgo * 3600 * 1000).toISOString(),
}));

export const showSamples = () => local.get(SAMPLES_KEY, true);
export function setShowSamples(on) {
  local.set(SAMPLES_KEY, on);
  render();
}

export function init(options) {
  ctx = options;
  Object.assign(el, { feed: $('feed'), status: $('communityStatus'), filters: $('communityFilters'), mode: $('communityMode'), dialog: $('communityDialog') });
  document.addEventListener('click', onClick);
  el.dialog.addEventListener('close', () => { el.dialog.innerHTML = ''; });
  el.dialog.addEventListener('click', e => { if (e.target === el.dialog) el.dialog.close(); });
  window.addEventListener('online', () => { flushOutbox(); if (LIVE) fetchRemote(); });
  loadMine();
}

// Called whenever the Community tab becomes visible.
export function onShow() {
  if (LIVE && Date.now() - C.lastFetch > 60000) fetchRemote();
  else render();
}

export const isShared = sightingId => C.mine.some(p => p.sightingId === sightingId);
export const myPostCount = () => C.mine.length;

function onClick(e) {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  switch (t.dataset.action) {
    case 'c-like': toggleLike(t.dataset.id); break;
    case 'c-map': showPostOnMap(t.dataset.id); break;
    case 'c-delete': deletePost(t); break;
    case 'c-refresh': fetchRemote(); break;
    case 'c-pick': openPicker(); break;
    case 'c-choose': openShare(t.dataset.id); break;
    case 'c-submit': submitShare(t.dataset.id); break;
    case 'c-close': el.dialog.close(); break;
    case 'c-profile': openProfile(t.dataset.user); break;
    case 'c-retry-outbox': flushOutbox(true); break;
    case 'filter':
      if (t.dataset.scope === 'community') { C.filter[t.dataset.kind] = t.dataset.value; render(); }
      break;
  }
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
function sb(path, { method = 'GET', body, headers = {} } = {}) {
  // New-style Supabase keys (sb_publishable_…) go only in the apikey header; old JWT keys go in both.
  const auth = KEY.startsWith('eyJ') ? { Authorization: `Bearer ${KEY}` } : {};
  return requestJSON(`${BASE}${path}`, { method, body, headers: { apikey: KEY, ...auth, ...headers } }, 20000);
}

const fromRow = r => ({
  id: r.id, createdAt: r.created_at,
  author: { name: r.author_name, avatar: r.author_avatar, color: r.author_color },
  taxon: { id: r.taxon_id, name: r.taxon_name, common: r.common_name, iconic: r.iconic },
  iconic: r.iconic, tier: r.tier, rarity: r.rarity, place: r.place, lat: r.lat, lng: r.lng, caption: r.caption,
  photoUrl: r.photo_path ? `${BASE}/storage/v1/object/public/${BUCKET}/${r.photo_path}` : null,
  likes: r.likes,
});

async function loadMine() {
  try {
    C.mine = await postsDB.getAll();
  } catch (err) {
    console.error(err);
    C.mine = [];
  }
  C.mineLoaded = true;
  render();
  announceChange();
  flushOutbox();
}

async function fetchRemote() {
  if (!LIVE) return;
  C.status = C.remote.length ? 'refreshing' : 'loading';
  render();
  try {
    const rows = await sb(`/rest/v1/posts?select=${COLUMNS}&order=created_at.desc&limit=60`);
    C.remote = rows.map(fromRow);
    C.staleAt = null;
    C.status = 'ready';
    C.lastFetch = Date.now();
    rememberJSON('community-feed', rows);
  } catch (err) {
    console.warn('Feed failed', err);
    const saved = await recallJSON('community-feed');
    if (saved) {
      C.remote = saved.data.map(fromRow);
      C.staleAt = saved.savedAt;
      C.status = 'ready';
    } else {
      C.status = 'error';
      C.error = friendlyError(err);
    }
  }
  render();
}

function myPostView(p) {
  if (!mineUrls.has(p.id) && p.photo) mineUrls.set(p.id, URL.createObjectURL(p.photo));
  return {
    id: p.id, createdAt: p.createdAt, author: p.author, taxon: p.taxon, iconic: p.taxon.iconic, tier: p.tier,
    rarity: p.rarity, place: p.place, lat: p.lat, lng: p.lng, caption: p.caption,
    photoUrl: mineUrls.get(p.id) || null, likes: 0, mine: true, status: p.status, lastError: p.lastError,
  };
}

function feedItems() {
  const byId = new Map();
  if (showSamples()) samples.forEach(p => byId.set(p.id, p));
  C.remote.forEach(p => byId.set(p.id, p));
  for (const p of C.mine) {
    const remote = byId.get(p.id);
    byId.set(p.id, remote ? { ...remote, mine: true } : myPostView(p));
  }
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
export function statHtml() {
  const items = feedItems().filter(p => matchesFilter(p, C.filter));
  const people = new Set(items.map(p => p.author.name)).size;
  return `<strong>${items.length}</strong> ${filterNoun(C.filter)}${items.length === 1 ? 'post' : 'posts'} from ${people} ${people === 1 ? 'naturalist' : 'naturalists'}`;
}

function render() {
  if (!el.feed) return;
  ctx.onChange();
  const items = feedItems();
  el.filters.innerHTML = filterBarHtml('community', items, C.filter);

  const notes = [];
  if (C.staleAt) notes.push(`<strong>Offline.</strong> Showing posts saved ${esc(timeAgo(C.staleAt))}.`);
  const pending = C.mine.filter(p => p.status === 'pending' || p.status === 'failed');
  if (pending.length) notes.push(`${pending.length} ${pending.length === 1 ? 'post is' : 'posts are'} waiting to upload. <button type="button" class="link-btn" data-action="c-retry-outbox">Try now</button>`);
  el.mode.innerHTML = notes.map(n => `<div class="notice">${n}</div>`).join('')
    + (LIVE ? `<button type="button" class="btn btn-ghost btn-small refresh-btn" data-action="c-refresh"${C.status === 'refreshing' || C.status === 'loading' ? ' disabled' : ''}>${C.status === 'refreshing' ? 'Refreshing…' : '↻ Refresh'}</button>` : '');

  if (C.status === 'loading' && !items.length) {
    el.status.innerHTML = '';
    el.feed.innerHTML = skeletonRows(3);
    return;
  }
  if (C.status === 'error' && !items.length) {
    el.feed.innerHTML = '';
    el.status.innerHTML = stateCard({ icon: '⚠', title: 'Couldn’t load the community feed', text: esc(C.error), error: true,
      actions: '<button type="button" class="btn" data-action="c-refresh">Retry</button>' });
    return;
  }
  const shown = items.filter(p => matchesFilter(p, C.filter));
  if (!shown.length) {
    el.feed.innerHTML = '';
    el.status.innerHTML = items.length
      ? stateCard({ icon: '🔭', title: 'No posts match these filters', text: 'Try another group or rarity.',
          actions: '<button type="button" class="btn" data-action="filter" data-scope="community" data-kind="group" data-value="all">Show all groups</button>' })
      : stateCard({ icon: '🌱', title: 'No posts yet', text: 'Be the first to share a sighting with the community.',
          actions: '<button type="button" class="btn" data-action="c-pick">Share a sighting</button>' });
    return;
  }
  el.status.innerHTML = '';
  el.feed.innerHTML = (showSamples() ? explorersStrip() + topExplorers() : '') + shown.map(postCard).join('');
}

// "Explorers": everyone in the community, one tap from their profile (collection + achievements).
function explorersStrip() {
  const people = Object.values(SAMPLE_USERS).sort((a, b) => b.level - a.level || b.dex.length - a.dex.length);
  return `<section class="explorers" aria-labelledby="explorersTitle">
    <h2 id="explorersTitle">Explorers</h2>
    <ul class="explorer-row">${people.map(u => `<li><button type="button" class="explorer" data-action="c-profile" data-user="${esc(u.key)}" aria-label="See ${esc(u.name)}’s profile">
      <span class="avatar" style="--av:${esc(u.color)}" aria-hidden="true">${esc(u.avatar)}</span>
      <span class="explorer-name">${esc(u.name)}</span><span class="explorer-meta">Lv ${u.level} · ${u.dex.length} sp.</span>
    </button></li>`).join('')}</ul>
  </section>`;
}

// "Top explorers this week": sample people ranked by posts and likes in the last 7 days.
function topExplorers() {
  const week = new Map();
  for (const p of samples) {
    if (!p.author.key || Date.now() - new Date(p.createdAt) > 7 * 86400000) continue;
    const w = week.get(p.author.key) || { posts: 0, likes: 0 };
    w.posts++;
    w.likes += p.likes || 0;
    week.set(p.author.key, w);
  }
  const ranked = [...week].map(([key, w]) => ({ u: SAMPLE_USERS[key], ...w, score: w.posts * 10 + w.likes }))
    .sort((a, b) => b.score - a.score).slice(0, 5);
  if (!ranked.length) return '';
  return `<section class="leaderboard" aria-labelledby="lbTitle">
    <h2 id="lbTitle">Top explorers this week</h2>
    <ol class="more-list" id="leaderboard">${ranked.map(({ u, posts, likes }, i) => `<li${i >= 3 ? ' class="is-extra"' : ''}><button type="button" class="lb-row" data-action="c-profile" data-user="${esc(u.key)}">
      <span class="lb-rank">${i + 1}</span>
      <span class="avatar" style="--av:${esc(u.color)}" aria-hidden="true">${esc(u.avatar)}</span>
      <span class="lb-text"><strong>${esc(u.name)}</strong><span>${posts} ${posts === 1 ? 'post' : 'posts'} · ${likes} likes</span></span>
      <span class="lb-lv">Lv ${u.level}</span>
    </button></li>`).join('')}</ol>
    ${moreButton('leaderboard', ranked.length, 3)}
  </section>`;
}

function postCard(p) {
  const liked = local.get(LIKED_KEY, []).includes(p.id);
  const likes = (p.likes || 0) + (liked && (p.sample || p.mine) && !C.remote.some(r => r.id === p.id) ? 1 : 0);
  const name = displayName(p.taxon);
  const photo = p.photoUrl
    ? `<img class="post-photo" src="${esc(p.sample ? photoSize(p.photoUrl, 'medium') : p.photoUrl)}" alt="${esc(name)}, photographed by ${esc(p.author.name)}" loading="lazy" width="600" height="450" data-fallback="🌿">`
    : '<div class="post-photo post-photo-empty" aria-hidden="true">🌿</div>';
  const statusLine = p.status === 'pending' ? '<p class="post-pending">⏳ Waiting for a connection to post…</p>'
    : p.status === 'failed' ? `<p class="post-pending is-error">Couldn’t post: ${esc(p.lastError || 'unknown error')}</p>`
    : '';
  return `<article class="post">
    <header class="post-head">
      ${p.author.key
        ? `<button type="button" class="avatar avatar-btn" style="--av:${esc(p.author.color)}" data-action="c-profile" data-user="${esc(p.author.key)}" aria-label="See ${esc(p.author.name)}’s profile">${esc(p.author.avatar)}</button>`
        : `<span class="avatar" style="--av:${esc(p.author.color)}" aria-hidden="true">${esc(p.author.avatar)}</span>`}
      <div class="post-who">
        <p>${p.author.key ? `<button type="button" class="post-author" data-action="c-profile" data-user="${esc(p.author.key)}" aria-label="See ${esc(p.author.name)}’s profile">${esc(p.author.name)}</button>` : `<strong>${esc(p.author.name)}</strong>`}${p.mine ? '<span class="tag tag-you">You</span>' : ''}</p>
        <p class="post-meta">${esc(timeAgo(p.createdAt))}${p.place ? ` · 📍 ${esc(p.place)}` : ''}</p>
      </div>
      ${p.mine ? `<button type="button" class="btn btn-ghost btn-small post-delete" data-action="c-delete" data-id="${esc(p.id)}">Delete</button>` : ''}
    </header>
    ${photo}
    <div class="post-body">
      <div class="post-species">
        <div><h3>${esc(name)}</h3>${p.taxon.common ? `<p class="sci">${esc(p.taxon.name)}</p>` : ''}</div>
        <span class="badge t-${esc(p.tier)}">${TIER_LABEL[p.tier] || ''}</span>
      </div>
      ${p.caption ? `<p class="post-caption">${esc(p.caption)}</p>` : ''}
      ${statusLine}
      <div class="post-actions">
        <button type="button" class="post-act like-btn" data-action="c-like" data-id="${esc(p.id)}" aria-pressed="${liked}" aria-label="${liked ? 'Unlike' : 'Like'}">
          <span aria-hidden="true">${liked ? '♥' : '♡'}</span> ${likes}
        </button>
        ${Number.isFinite(p.lat) ? `<button type="button" class="post-act" data-action="c-map" data-id="${esc(p.id)}" aria-label="Show on map">📍 Map</button>` : ''}
        <a class="post-act" href="${taxonUrl(p.taxon.id)}" target="_blank" rel="noopener" aria-label="About ${esc(name)} on iNaturalist">Info ↗</a>
      </div>
      ${p.credit ? `<p class="post-credit" title="Photo ${esc(p.credit)} · via iNaturalist">Photo ${esc(p.credit.replace(/, some rights reserved/, ''))}</p>` : ''}
    </div>
  </article>`;
}

// ---------------------------------------------------------------------------
// Likes, map, delete
// ---------------------------------------------------------------------------
async function toggleLike(id) {
  const liked = new Set(local.get(LIKED_KEY, []));
  const nowLiked = !liked.has(id);
  if (nowLiked) liked.add(id); else liked.delete(id);
  local.set(LIKED_KEY, [...liked]);
  const remote = C.remote.find(p => p.id === id);
  if (remote) {
    remote.likes = Math.max(0, remote.likes + (nowLiked ? 1 : -1)); // show it straight away
    render();
    try {
      const count = await sb('/rest/v1/rpc/like_post', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_id: id, p_delta: nowLiked ? 1 : -1 }),
      });
      if (Number.isInteger(count)) remote.likes = count;
    } catch (err) {
      // Undo the optimistic change.
      remote.likes = Math.max(0, remote.likes + (nowLiked ? -1 : 1));
      if (nowLiked) liked.delete(id); else liked.add(id);
      local.set(LIKED_KEY, [...liked]);
      toast(friendlyError(err));
    }
  }
  render();
}

function showPostOnMap(id) {
  const p = feedItems().find(x => x.id === id);
  if (!p) return;
  ctx.showOnMap({
    lat: p.lat, lng: p.lng, title: displayName(p.taxon),
    subtitle: `${p.author.name} · ${timeAgo(p.createdAt)}`,
    photoUrl: p.sample ? photoSize(p.photoUrl, 'small') : p.photoUrl,
  });
}

async function deletePost(btn) {
  if (btn.dataset.confirm !== 'yes') {
    btn.dataset.confirm = 'yes';
    btn.textContent = 'Tap to confirm';
    setTimeout(() => { if (btn.isConnected) { btn.dataset.confirm = ''; btn.textContent = 'Delete'; } }, 4000);
    return;
  }
  const p = C.mine.find(x => x.id === btn.dataset.id);
  if (!p) return;
  btn.disabled = true;
  try {
    if (LIVE && p.status === 'sent') {
      const ok = await sb('/rest/v1/rpc/delete_post', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_id: p.id, p_token: p.token }),
      });
      if (ok === false) throw new Error('The server didn’t recognize this post as yours.');
    }
    await postsDB.remove(p.id);
  } catch (err) {
    btn.disabled = false;
    toast(err.message?.startsWith('The server') ? err.message : friendlyError(err));
    return;
  }
  C.mine = C.mine.filter(x => x.id !== p.id);
  C.remote = C.remote.filter(x => x.id !== p.id);
  if (mineUrls.has(p.id)) { URL.revokeObjectURL(mineUrls.get(p.id)); mineUrls.delete(p.id); }
  render();
  announceChange();
  toast('Post deleted');
}

// ---------------------------------------------------------------------------
// Sharing
// ---------------------------------------------------------------------------
function openDialog(html) {
  el.dialog.innerHTML = html;
  if (!el.dialog.open) el.dialog.showModal();
}

const dialogHead = title => `
  <div class="dlg-head">
    <h2 id="cdlgTitle">${title}</h2>
    <button type="button" class="icon-btn" data-action="c-close" aria-label="Close">✕</button>
  </div>`;

// A sample person's profile, best first: their 6 hardest achievements and 9 rarest species
// (rarity around the place you're scanning), each with "Show all" for the rest.
const TOP_SPECIES = 9;
let rated = { model: null, rate: null };
function speciesRarity(t) {
  const { model } = ctx.getNearby?.() || {};
  if (!model?.counts) return { tier: 'unrated', rarity: 0 };
  if (rated.model !== model) rated = { model, rate: rarityModel(model.counts) };
  return rated.rate.rate(t);
}

function openProfile(key) {
  const u = SAMPLE_USERS[key];
  if (!u) return;
  const earned = new Set(u.achievements);
  const badges = ACHIEVEMENTS.filter(a => earned.has(a.id)).sort((x, y) => ACH_TIERS[y.tier] - ACH_TIERS[x.tier]);
  const locked = ACHIEVEMENTS.filter(a => !earned.has(a.id)).sort((x, y) => ACH_TIERS[x.tier] - ACH_TIERS[y.tier]);
  const posts = samples.filter(p => p.author.key === key).length;
  const since = new Date(`${u.since}-15`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const dexNumbers = new Map((ctx.getNearby?.().model?.dex || []).map(d => [d.id, d.no]));
  const species = u.dex.map(id => ({ t: TAXA[id], ...speciesRarity(TAXA[id]) }))
    .sort((x, y) => TIER_RANK[y.tier] - TIER_RANK[x.tier] || y.rarity - x.rarity);
  const trees = u.dex.filter(id => isTree(TAXA[id])).length;
  openDialog(`${dialogHead(`${esc(u.name)}’s profile`)}
    <div class="dlg-body profile">
      <div class="profile-top">
        <span class="avatar avatar-lg" style="--av:${esc(u.color)}" aria-hidden="true">${esc(u.avatar)}</span>
        <div><p class="profile-name">${esc(u.name)}</p>
          <p class="muted">Level ${u.level} · exploring since ${esc(since)}</p></div>
      </div>
      <div class="profile-stats">
        <div><strong>${u.dex.length}</strong><span>species</span></div>
        <div><strong>${trees}</strong><span>trees</span></div>
        <div><strong>${badges.length}</strong><span>badges</span></div>
        <div><strong>${posts}</strong><span>posts</span></div>
      </div>
      <h3 class="profile-h">Places explored</h3>
      <ul class="place-chips">${u.places.map(k => `<li>${esc(SAMPLE_PLACES[k].place)}</li>`).join('')}</ul>
      <h3 class="profile-h">Achievements <span class="muted">${badges.length} of ${ACHIEVEMENTS.length}</span></h3>
      <ul class="ach-grid ach-compact more-list" id="profileAch">${[
        ...badges.map((a, i) => achievementItem(a, null, true, i >= TOP_ACHIEVEMENTS)),
        ...locked.map(a => achievementItem(a, null, false, true)),
      ].join('')}</ul>
      ${moreButton('profileAch', ACHIEVEMENTS.length, Math.min(TOP_ACHIEVEMENTS, badges.length))}
      <h3 class="profile-h">Collection <span class="muted">rarest first${rated.model ? '' : ' (pick a place on Nearby to rate rarity)'}</span></h3>
      <ol class="dex-grid dex-mini more-list" id="profileDex">${species.map(({ t, tier }, i) => {
        const no = dexNumbers.get(t.id);
        return `<li${i >= TOP_SPECIES ? ' class="is-extra"' : ''}><span class="dex-card is-got t-${tier} g-${isTree(t) ? 'trees' : groupOf(t.iconic)}${isShiny(tier) ? ' is-shiny' : ''}">
          <span class="dex-no">${no ? dexNo(no) : '✦'}</span>
          <span class="dex-photo"><img src="${esc(photoSize(t.photo, 'small'))}" alt="" title="Photo ${esc(t.credit || '')}" loading="lazy" data-fallback="🌿"></span>
          <span class="dex-name">${esc(displayName(t))}</span>
          <span class="dex-meta"><i class="dot t-${tier}"></i>${esc(TIER_LABEL[tier] || '')}</span></span></li>`;
      }).join('')}</ol>
      ${moreButton('profileDex', species.length, TOP_SPECIES)}
      <p class="post-credit">Photos: openly licensed iNaturalist photos; hold or hover a photo for its credit.</p>
    </div>`);
}

// "Share a sighting" from the Community tab: pick one of your identified sightings.
function openPicker() {
  const list = ctx.getSightings().filter(s => s.taxon && !isShared(s.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!list.length) {
    openDialog(`${dialogHead('Share a sighting')}
      <div class="dlg-body">${stateCard({
        icon: '📷', title: 'Nothing to share yet',
        text: ctx.getSightings().length ? 'Identify one of your sightings first (Collection → Journal), or take a new photo.' : 'Take a photo of a plant or animal first. Then you can share it here.',
        actions: '<button type="button" class="btn" data-action="camera">Take a photo</button>',
      })}</div>`);
    el.dialog.querySelector('[data-action="camera"]').addEventListener('click', () => el.dialog.close());
    return;
  }
  openDialog(`${dialogHead('Which sighting?')}
    <div class="dlg-body">
      <ul class="cand-list">${list.map(s => {
        const url = ctx.thumbUrl(s);
        return `<li><button type="button" class="cand" data-action="c-choose" data-id="${esc(s.id)}">
          ${url ? `<img src="${url}" alt="" width="48" height="48">` : '<span class="cand-noimg">📷</span>'}
          <span class="cand-text"><strong>${esc(displayName(s.taxon))}</strong><em>${esc(new Date(s.createdAt).toLocaleDateString())}</em></span>
          <span class="badge t-${s.rating?.tier || 'unrated'}">${TIER_LABEL[s.rating?.tier || 'unrated']}</span>
        </button></li>`;
      }).join('')}</ul>
    </div>`);
}

// The share form for one sighting (also opened from a sighting's detail view).
export function openShare(sightingId) {
  const s = ctx.getSightings().find(x => x.id === sightingId);
  if (!s) return;
  if (!s.taxon) { toast('Identify this sighting before sharing it.'); return; }
  if (isShared(s.id)) { toast('You already shared this sighting.'); return; }
  const profile = getProfile();
  const url = ctx.thumbUrl(s);
  const tier = s.rating?.tier || 'unrated';
  const placeGuess = s.loc?.source === 'scan' ? s.loc.label : '';
  openDialog(`${dialogHead('Share with the community')}
    <div class="dlg-body share-form">
      <div class="draft-top">
        <div class="draft-photo">${url ? `<img src="${url}" alt="">` : ''}</div>
        <div class="draft-facts">
          <p class="share-name"><strong>${esc(displayName(s.taxon))}</strong></p>
          <p><span class="badge t-${tier}">${TIER_LABEL[tier]}</span></p>
        </div>
      </div>
      <label class="field-label" for="shareName">Your display name</label>
      <input id="shareName" class="field" maxlength="40" autocomplete="nickname" value="${esc(profile.name)}" placeholder="e.g. Sam P.">
      <label class="field-label" for="shareCaption">Caption <span class="optional">(optional)</span></label>
      <textarea id="shareCaption" class="field field-area" maxlength="280" rows="3" placeholder="What was it doing? Where exactly?"></textarea>
      <label class="field-label" for="sharePlace">Place name <span class="optional">(optional)</span></label>
      <input id="sharePlace" class="field" maxlength="80" value="${esc(placeGuess)}" placeholder="e.g. Rancho San Antonio">
      ${LIVE ? '<p class="share-note">Your photo and post will be public. The location is rounded to about 1 km to protect the spot.</p>' : ''}
    </div>
    <div class="dlg-foot">
      <button type="button" class="btn btn-ghost" data-action="c-close">Cancel</button>
      <button type="button" class="btn" data-action="c-submit" data-id="${esc(s.id)}">Share</button>
    </div>`);
  // No automatic focus: on phones that pops the keyboard over half the form.
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function submitShare(sightingId) {
  const s = ctx.getSightings().find(x => x.id === sightingId);
  const name = $('shareName').value.trim();
  if (!name) { $('shareName').focus(); toast('Add a display name first.'); return; }
  const profile = saveProfile({ name });
  const token = [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join('');
  const post = {
    id: newId(), sightingId: s.id, createdAt: new Date().toISOString(),
    status: LIVE ? 'pending' : 'local', token,
    author: { name: profile.name, avatar: profile.avatar, color: profile.color },
    taxon: { id: s.taxon.id, name: s.taxon.name, common: s.taxon.common, iconic: s.taxon.iconic },
    tier: s.rating?.tier || 'unrated', rarity: s.rating ? s.rating.rarity : null,
    place: $('sharePlace').value.trim() || null, caption: $('shareCaption').value.trim() || null,
    // Rounded to 0.01° (about 1 km) so the exact spot isn't published.
    lat: s.loc ? Math.round(s.loc.lat * 100) / 100 : null,
    lng: s.loc ? Math.round(s.loc.lng * 100) / 100 : null,
    photo: s.photo, photoUploaded: false,
  };
  try {
    await postsDB.put(post);
  } catch (err) {
    console.error(err);
    toast('Couldn’t save the post on this device.');
    return;
  }
  requestPersistence();
  C.mine.push(post);
  el.dialog.close();
  ctx.showTab('community');
  render();
  announceChange();
  if (LIVE) {
    toast(isOffline() ? 'Saved. It will post when you’re back online.' : 'Posting…');
    flushOutbox();
  } else {
    toast('Shared (demo mode: visible on this device only)');
  }
}

// Uploads posts that are waiting (made offline, or a request failed). Safe to call any time.
async function flushOutbox(userAsked = false) {
  if (!LIVE || C.flushing || isOffline()) {
    if (userAsked && isOffline()) toast('Still offline. Posts will upload when you reconnect.');
    return;
  }
  const waiting = C.mine.filter(p => p.status === 'pending' || (userAsked && p.status === 'failed'));
  if (!waiting.length) return;
  C.flushing = true;
  let sent = 0;
  try {
    for (const p of waiting) {
      try {
        const path = `posts/${p.id}.jpg`;
        if (!p.photoUploaded && p.photo) {
          try {
            await sb(`/storage/v1/object/${BUCKET}/${path}`, { method: 'POST', body: p.photo, headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'false' } });
          } catch (err) {
            const duplicate = err.status === 409 || /exist|duplicate/i.test(JSON.stringify(err.detail || ''));
            if (!duplicate) throw err; // already uploaded on an earlier try is fine
          }
          p.photoUploaded = true;
          await postsDB.put(p);
        }
        try {
          await sb('/rest/v1/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({
              id: p.id, author_name: p.author.name, author_avatar: p.author.avatar, author_color: p.author.color,
              taxon_id: p.taxon.id, taxon_name: p.taxon.name, common_name: p.taxon.common, iconic: p.taxon.iconic,
              tier: p.tier, rarity: p.rarity, place: p.place, lat: p.lat, lng: p.lng, caption: p.caption,
              photo_path: p.photo ? path : null, owner_hash: await sha256Hex(p.token),
            }),
          });
        } catch (err) {
          if (err.status !== 409) throw err; // 409 = this post already exists from an earlier try
        }
        Object.assign(p, { status: 'sent', lastError: null });
        await postsDB.put(p);
        sent++;
      } catch (err) {
        console.warn('Post upload failed', err);
        const temporary = err.offline || err.network || err.timeout || err.status === 429 || err.status >= 500;
        Object.assign(p, { status: temporary ? 'pending' : 'failed', lastError: friendlyError(err) });
        await postsDB.put(p).catch(() => {});
        if (temporary) break; // the connection is the problem: wait for the next 'online' event
      }
    }
  } finally {
    C.flushing = false;
  }
  if (sent) {
    toast(sent === 1 ? 'Your post is live' : `${sent} posts are live`);
    fetchRemote();
  } else {
    render();
  }
}
