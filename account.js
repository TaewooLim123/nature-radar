/* Account page (opened from the avatar button, separate from the main tabs):
   profile, stats, achievements, community + data settings. */
import {
  esc, local, toast, getProfile, saveProfile, avatarChoices, avatarColors, groupOf, haversineKm, localDay, isTree, isOak, isConifer, moreButton, infoHead, DE_ANZA,
} from './shared.js';
import { sightingsDB, postsDB } from './store.js';

const UNLOCKED_KEY = 'nr-achievements';
const SEEN_KEY = 'nr-achievements-seen';

let ctx = null; // from app.js: getSightings, myPostCount, isReady, liveCommunity, showSamples, setShowSamples, isVisible
const $ = id => document.getElementById(id);

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------
// Each achievement has a rarity tier by how hard it is (used to show the best ones first).
export const ACH_TIERS = { legendary: 4, rare: 3, uncommon: 2, common: 1 };
export const ACH_TIER_LABEL = { legendary: 'Legendary', rare: 'Rare', uncommon: 'Uncommon', common: 'Common' };
export const ACHIEVEMENTS = [
  { id: 'first', tier: 'common', icon: '📸', title: 'First sighting', desc: 'Save your first sighting', goal: 1, value: s => s.count },
  { id: 'first-bird', tier: 'common', icon: '🐦', title: 'First bird', desc: 'Identify a bird', goal: 1, value: s => s.groups.Aves || 0 },
  { id: 'first-plant', tier: 'common', icon: '🌿', title: 'Green thumb', desc: 'Identify a plant', goal: 1, value: s => s.groups.Plantae || 0 },
  { id: 'first-mammal', tier: 'common', icon: '🦊', title: 'Mammal spotter', desc: 'Identify a mammal', goal: 1, value: s => s.groups.Mammalia || 0 },
  { id: 'first-insect', tier: 'common', icon: '🐞', title: 'Bug hunter', desc: 'Identify an insect', goal: 1, value: s => s.groups.Insecta || 0 },
  { id: 'first-fungus', tier: 'uncommon', icon: '🍄', title: 'Fungus among us', desc: 'Identify a fungus', goal: 1, value: s => s.groups.Fungi || 0 },
  { id: 'species-5', tier: 'common', icon: '🔎', title: 'Getting started', desc: 'Identify 5 different species', goal: 5, value: s => s.species },
  { id: 'species-10', tier: 'uncommon', icon: '🧭', title: 'Naturalist', desc: '10 species identified', goal: 10, value: s => s.species },
  { id: 'species-25', tier: 'rare', icon: '🏅', title: 'Field expert', desc: '25 species identified', goal: 25, value: s => s.species },
  { id: 'groups-5', tier: 'rare', icon: '🌈', title: 'Biodiversity buff', desc: 'Identify 5 different groups (birds, plants…)', goal: 5, value: s => s.groupCount },
  { id: 'rare', tier: 'rare', icon: '💎', title: 'Rare find', desc: 'Log a Rare or Very rare sighting', goal: 1, value: s => s.rare },
  { id: 'very-rare', tier: 'legendary', icon: '🦄', title: 'Unicorn', desc: 'Log a Very rare sighting', goal: 1, value: s => s.veryRare },
  { id: 'streak-3', tier: 'uncommon', icon: '🔥', title: '3-day streak', desc: 'Log sightings 3 days in a row', goal: 3, value: s => s.bestStreak },
  { id: 'streak-7', tier: 'rare', icon: '⚡', title: '7-day streak', desc: 'Log sightings 7 days in a row', goal: 7, value: s => s.bestStreak },
  { id: 'explorer', tier: 'uncommon', icon: '🗺️', title: 'Explorer', desc: 'Log sightings in 3 places at least 5 km apart', goal: 3, value: s => s.places },
  { id: 'ai', tier: 'common', icon: '🤖', title: 'AI assist', desc: 'Save a sighting identified by the offline AI', goal: 1, value: s => s.ai },
  { id: 'share', tier: 'common', icon: '📣', title: 'Sharing is caring', desc: 'Share a sighting with the community', goal: 1, value: s => s.shared },
  { id: 'dex-10', tier: 'uncommon', icon: '📖', title: 'Dex starter', desc: 'Collect 10 species from a local dex', goal: 10, value: s => s.dex },
  { id: 'dex-25', tier: 'rare', icon: '📚', title: 'Dex devotee', desc: 'Collect 25 species from a local dex', goal: 25, value: s => s.dex },
  { id: 'dex-50', tier: 'legendary', icon: '🏆', title: 'Dex master', desc: 'Collect 50 species from a local dex', goal: 50, value: s => s.dex },
  { id: 'trees-5', tier: 'uncommon', icon: '🌳', title: 'Tree spotter', desc: 'Collect 5 different trees', goal: 5, value: s => s.trees },
  { id: 'trees-15', tier: 'rare', icon: '🌲', title: 'Arborist', desc: 'Collect 15 different trees', goal: 15, value: s => s.trees },
  { id: 'trees-30', tier: 'legendary', icon: '🏞️', title: 'Forest keeper', desc: 'Collect 30 different trees', goal: 30, value: s => s.trees },
  { id: 'oaks', tier: 'rare', icon: '🌰', title: 'Oak collector', desc: 'Collect 3 different oaks', goal: 3, value: s => s.oaks },
  { id: 'conifer', tier: 'uncommon', icon: '🎄', title: 'Conifer', desc: 'Collect a redwood, pine, cedar or other conifer', goal: 1, value: s => s.conifers },
  { id: 'campus', tier: 'uncommon', icon: '🎓', title: 'Campus naturalist', desc: 'Log 10 sightings at De Anza College', goal: 10, value: s => s.campus },
  { id: 'globetrotter', tier: 'rare', icon: '🧳', title: 'Globetrotter', desc: 'Log sightings in 5 places at least 5 km apart', goal: 5, value: s => s.places },
  { id: 'level-5', tier: 'uncommon', icon: '⭐', title: 'Tracker', desc: 'Reach level 5', goal: 5, value: s => s.level },
  { id: 'invader', tier: 'uncommon', icon: '⚠️', title: 'Invader alert', desc: 'Log a non-native species (it helps track invasives)', goal: 1, value: s => s.nonNative },
];

const dayNumber = day => { const [y, m, d] = day.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };

function computeStats(items, shared) {
  const identified = items.filter(s => s.taxon);
  const groups = {};
  for (const s of identified) {
    const g = groupOf(s.taxon.iconic);
    groups[g] = (groups[g] || 0) + 1;
  }

  // Streaks: runs of consecutive calendar days with at least one sighting.
  const days = [...new Set(items.map(s => dayNumber(localDay(new Date(s.createdAt)))))].sort((a, b) => a - b);
  let bestStreak = 0, run = 0;
  days.forEach((d, i) => { run = i && d === days[i - 1] + 1 ? run + 1 : 1; bestStreak = Math.max(bestStreak, run); });
  const today = dayNumber(localDay(new Date()));
  let currentStreak = 0;
  if (days.length && today - days[days.length - 1] <= 1) {
    currentStreak = 1;
    for (let i = days.length - 1; i > 0 && days[i] === days[i - 1] + 1; i--) currentStreak++;
  }

  // Places: sightings more than 5 km from every place counted so far.
  const places = [];
  for (const s of items) if (s.loc && places.every(p => haversineKm(p, s.loc) >= 5)) places.push(s.loc);

  const tierOf = s => s.rating?.tier;
  const species = new Map(identified.map(s => [s.taxon.id, s.taxon]));
  const trees = [...species.values()].filter(isTree);
  return {
    count: items.length,
    species: new Set(identified.map(s => s.taxon.id)).size,
    groups,
    groupCount: Object.keys(groups).filter(g => g !== 'other').length,
    rare: identified.filter(s => tierOf(s) === 'rare' || tierOf(s) === 'veryrare').length,
    veryRare: identified.filter(s => tierOf(s) === 'veryrare').length,
    bestStreak, currentStreak,
    places: places.length,
    trees: trees.length,
    oaks: trees.filter(isOak).length,
    conifers: trees.filter(isConifer).length,
    campus: items.filter(s => s.loc && haversineKm(s.loc, DE_ANZA) <= 1).length,
    ai: identified.filter(s => s.idSource === 'ai').length,
    nonNative: identified.filter(s => s.rating?.introduced).length,
    shared,
  };
}

// Stats from sightings + posts, plus local-dex progress and level from the Collection.
const getStats = () => ({
  ...computeStats(ctx.getSightings(), ctx.myPostCount()),
  dex: ctx.dexProgress().got,
  level: ctx.level().level,
});

let checkedOnce = false;
// Unlocks newly earned achievements. The first check after startup is silent, so existing
// progress doesn't fire a burst of toasts.
function checkAchievements() {
  if (!ctx.isReady()) return;
  const stats = getStats();
  const unlocked = local.get(UNLOCKED_KEY, {});
  const fresh = ACHIEVEMENTS.filter(a => !unlocked[a.id] && a.value(stats) >= a.goal);
  if (fresh.length) {
    const now = new Date().toISOString();
    fresh.forEach(a => { unlocked[a.id] = now; });
    local.set(UNLOCKED_KEY, unlocked);
    if (checkedOnce) {
      toast(`🏆 Achievement unlocked: ${fresh[0].title}${fresh.length > 1 ? ` (+${fresh.length - 1} more)` : ''}`);
    } else {
      local.set(SEEN_KEY, Object.keys(unlocked).length);
    }
  }
  checkedOnce = true;
  updateBadge();
  if (ctx.isVisible()) render();
}

function updateBadge() {
  const count = Object.keys(local.get(UNLOCKED_KEY, {})).length;
  $('accountDot').hidden = count <= local.get(SEEN_KEY, 0);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export function init(options) {
  ctx = options;
  document.addEventListener('nr:data-changed', checkAchievements);
  document.addEventListener('nr:profile-changed', renderAvatarButton);
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChangeEvent);
  renderAvatarButton();
  updateBadge();
}

function renderAvatarButton() {
  const p = getProfile();
  const btn = $('accountBtn');
  btn.querySelector('.avatar').textContent = p.avatar;
  btn.querySelector('.avatar').style.setProperty('--av', p.color);
}

export function statHtml() {
  const p = getProfile();
  return `<strong class="stat-name">${esc(p.name || 'Your account')}</strong> Lv ${ctx.level().level} · ${esc(ctx.level().title)} · Naturalist since ${esc(new Date(p.since).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))}`;
}

export function onShow() {
  local.set(SEEN_KEY, Object.keys(local.get(UNLOCKED_KEY, {})).length);
  updateBadge();
  render();
}

function render() {
  const p = getProfile();
  const stats = getStats();
  const unlocked = local.get(UNLOCKED_KEY, {});
  const doneCount = ACHIEVEMENTS.filter(a => unlocked[a.id]).length;

  $('accountView').innerHTML = `
    <section class="card profile-card" aria-labelledby="profileTitle">
      <h2 id="profileTitle" class="sr-only">Profile</h2>
      <button type="button" class="avatar avatar-lg" style="--av:${esc(p.color)}" data-action="a-avatar" aria-label="Change avatar" aria-expanded="false">${esc(p.avatar)}</button>
      <div class="profile-fields">
        <label class="field-label" for="profileName">Display name</label>
        <input id="profileName" class="field" maxlength="40" autocomplete="nickname" value="${esc(p.name)}" placeholder="Shown on posts you share">
      </div>
      <div class="avatar-picker" id="avatarPicker" hidden>
        <div class="picker-row">${avatarChoices().map(a => `<button type="button" class="pick${a === p.avatar ? ' is-on' : ''}" data-action="a-set-avatar" data-value="${a}">${a}</button>`).join('')}</div>
        <div class="picker-row">${avatarColors().map(c => `<button type="button" class="swatch${c === p.color ? ' is-on' : ''}" style="--av:${c}" data-action="a-set-color" data-value="${c}" aria-label="Color ${c}"></button>`).join('')}</div>
      </div>
    </section>

    <section class="stat-tiles" aria-label="Your stats">
      <div class="tile"><strong>${stats.count}</strong><span>sightings</span></div>
      <div class="tile"><strong>${stats.species}</strong><span>species</span></div>
      <div class="tile"><strong>${stats.currentStreak}🔥</strong><span>day streak</span></div>
      <div class="tile"><strong>${stats.shared}</strong><span>shared</span></div>
    </section>

    <section class="card" aria-labelledby="achTitle">
      <div class="card-head"><h2 id="achTitle">Achievements</h2><span class="muted">${doneCount} of ${ACHIEVEMENTS.length}</span></div>
      <ul class="ach-grid more-list" id="myAchievements">${[...ACHIEVEMENTS]
        .sort((a, b) => Boolean(unlocked[b.id]) - Boolean(unlocked[a.id]) || (unlocked[a.id]
          ? ACH_TIERS[b.tier] - ACH_TIERS[a.tier]
          : b.value(stats) / b.goal - a.value(stats) / a.goal || ACH_TIERS[a.tier] - ACH_TIERS[b.tier]))
        .map((a, i) => achievementItem(a, stats, unlocked[a.id], i >= TOP_ACHIEVEMENTS)).join('')}</ul>
      ${moreButton('myAchievements', ACHIEVEMENTS.length, TOP_ACHIEVEMENTS)}
    </section>

    <section class="card" aria-labelledby="commTitle">
      ${infoHead('Community', ctx.liveCommunity
        ? 'Connected: posts you share are visible to everyone using this app.'
        : 'Demo mode: posts you share stay on this device. See README.md to connect a free Supabase project. Sample posts are made-up people with real local species.', { id: 'commTitle' })}
      <label class="switch-row">
        <input type="checkbox" id="samplesToggle"${ctx.showSamples() ? ' checked' : ''}>
        <span>Show sample posts</span>
      </label>
    </section>

    <section class="card" aria-labelledby="backupTitle">
      ${infoHead('Back up your sightings', 'Your sightings live only in this browser. Download a backup now and then, and restore it on another device or after clearing browser data.', { id: 'backupTitle' })}
      <div class="backup-actions">
        <button type="button" class="btn btn-ghost" data-action="s-export">Download backup</button>
        <button type="button" class="btn btn-ghost" data-action="s-import">Restore from backup</button>
      </div>
    </section>

    <section class="card" aria-labelledby="appTitle">
      ${infoHead('App', 'Add Nature Radar to your home screen: in Safari tap <strong>Share → Add to Home Screen</strong>; in Chrome tap <strong>⋮ → Add to Home screen</strong>. It then opens full-screen and works offline.', { id: 'appTitle' })}
      <label class="switch-row">
        <input type="checkbox" id="soundToggle"${ctx.soundOn() ? " checked" : ""}>
        <span>Sound when you collect a new species</span>
      </label>
      <p class="muted" id="storageUse"></p>
      <button type="button" class="btn btn-danger" data-action="a-reset">Erase all my data on this device</button>
    </section>

    <p class="credits">Data: <a href="https://www.inaturalist.org" target="_blank" rel="noopener">iNaturalist</a> · Map © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a></p>`;
  showStorageUse();
}

export const TOP_ACHIEVEMENTS = 6;

// One achievement card. With stats it shows progress; for sample profiles just earned or locked.
export function achievementItem(a, stats, unlockedAt, extra = false) {
  const value = stats ? Math.min(a.value(stats), a.goal) : 0;
  return `<li class="ach at-${a.tier}${unlockedAt ? ' is-done' : ''}${extra ? ' is-extra' : ''}" title="${esc(a.desc)}">
    <span class="ach-icon" aria-hidden="true">${a.icon}</span>
    <div class="ach-text">
      <span class="ach-tier">${ACH_TIER_LABEL[a.tier]}</span>
      <strong>${a.title}</strong>
      ${unlockedAt ? '' : `<p>${a.desc}</p>`}
      ${unlockedAt === true ? '<p class="ach-date">Earned</p>' : !stats && !unlockedAt ? '<p class="ach-progress">Locked</p>' : unlockedAt
        ? `<p class="ach-date">Unlocked ${esc(new Date(unlockedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))}</p>`
        : `<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${a.goal}" aria-valuenow="${value}" aria-label="${a.title} progress"><span style="width:${(value / a.goal) * 100}%"></span></div>
           <p class="ach-progress">${value} / ${a.goal}</p>`}
    </div>
  </li>`;
}

async function showStorageUse() {
  try {
    const { usage } = await navigator.storage.estimate();
    const mb = n => (n / 1048576).toFixed(n > 1048576 * 10 ? 0 : 1);
    $('storageUse').textContent = `Using ${mb(usage)} MB on this device.`;
  } catch { /* not supported */ }
}

function onClick(e) {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  switch (t.dataset.action) {
    case 'a-avatar': {
      const picker = $('avatarPicker');
      picker.hidden = !picker.hidden;
      t.setAttribute('aria-expanded', String(!picker.hidden));
      break;
    }
    case 'a-set-avatar': saveProfile({ avatar: t.dataset.value }); render(); $('avatarPicker').hidden = false; break;
    case 'a-set-color': saveProfile({ color: t.dataset.value }); render(); $('avatarPicker').hidden = false; break;
    case 'a-reset': resetAll(t); break;
  }
}

function onChangeEvent(e) {
  if (e.target.id === 'profileName') {
    saveProfile({ name: e.target.value.trim().slice(0, 40) });
    ctx.onChange();
    toast('Name saved');
  } else if (e.target.id === 'samplesToggle') {
    ctx.setShowSamples(e.target.checked);
  } else if (e.target.id === 'soundToggle') {
    ctx.setSound(e.target.checked);
  }
}

// Two taps, then wipes sightings, posts, settings and caches on this device.
async function resetAll(btn) {
  if (btn.dataset.confirm !== 'yes') {
    btn.dataset.confirm = 'yes';
    btn.textContent = 'Tap again to erase everything';
    setTimeout(() => { if (btn.isConnected) { btn.dataset.confirm = ''; btn.textContent = 'Erase all my data on this device'; } }, 4000);
    return;
  }
  btn.disabled = true;
  try {
    await sightingsDB.clear();
    await postsDB.clear();
    // The downloaded AI model is kept (it isn't personal data), so keep its flag too.
    Object.keys(localStorage).filter(k => k.startsWith('nr-') && k !== 'nr-ai-downloaded' && k !== 'nr-demo-seeded').forEach(k => localStorage.removeItem(k));
    sessionStorage.clear();
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('nr-last-good')).map(k => caches.delete(k)));
  } catch (err) {
    console.error(err);
  }
  location.reload();
}
