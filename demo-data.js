/* TEMPORARY demo journal for presentations. On the first run (nothing saved yet), the app fills
   "your" journal with these sightings, so the Collection, life list, XP level and achievements
   already have progress to show. Photos are openly licensed iNaturalist photos.
   To start with an empty app instead: delete this file (and its line in sw.js). */
import { TAXA, NON_NATIVE } from './community-seed.js';

const PLACES = {
  deanza: { lat: 37.3193, lng: -122.0447, label: 'De Anza College' },
  shoreline: { lat: 37.4300, lng: -122.0800, label: 'Shoreline Park' },
  vasona: { lat: 37.2400, lng: -121.9700, label: 'Vasona Lake County Park' },
  baylands: { lat: 37.4600, lng: -122.1100, label: 'Palo Alto Baylands' },
};

// [TAXA id, days ago, place, rarity tier, how it was identified]
const ENTRIES = [
  [47850, 0, 'deanza', 'common', 'ai'], [6317, 0, 'deanza', 'common', 'ai'], [49011, 1, 'deanza', 'uncommon', 'ai'],
  [53348, 1, 'deanza', 'common', 'ai'], [17013, 1, 'deanza', 'common', 'nearby'], [47372, 2, 'deanza', 'common', 'ai'],
  [58231, 2, 'deanza', 'uncommon', 'ai'], [506118, 2, 'deanza', 'common', 'ai'], [47219, 3, 'deanza', 'common', 'ai'],
  [48662, 3, 'deanza', 'uncommon', 'ai'], [53169, 4, 'deanza', 'common', 'search'], [47726, 5, 'deanza', 'uncommon', 'ai'],
  [48807, 6, 'deanza', 'uncommon', 'ai'], [57354, 6, 'deanza', 'uncommon', 'ai'], [36204, 7, 'deanza', 'common', 'nearby'],
  [180007, 8, 'deanza', 'common', 'ai'], [18209, 9, 'deanza', 'uncommon', 'ai'], [48225, 10, 'deanza', 'common', 'ai'],
  [4956, 12, 'shoreline', 'uncommon', 'ai'], [7089, 12, 'shoreline', 'common', 'ai'], [6930, 12, 'shoreline', 'common', 'ai'],
  [7109, 15, 'vasona', 'rare', 'ai'], [4981, 15, 'vasona', 'uncommon', 'nearby'], [20044, 18, 'baylands', 'rare', 'search'],
  [56534, 21, 'deanza', 'veryrare', 'search'], [10094, 22, 'deanza', 'common', 'ai'],
  [64350, 4, 'deanza', 'uncommon', 'ai'], [143792, 5, 'deanza', 'uncommon', 'ai'], [57140, 9, 'deanza', 'uncommon', 'ai'],
  [53421, 11, 'deanza', 'rare', 'ai'],
];
const RARITY = { common: 0.2, uncommon: 0.5, rare: 0.75, veryrare: 0.9 };

export function demoSightings(now = Date.now()) {
  return ENTRIES.map(([id, daysAgo, at, tier, idSource], i) => {
    const { photo, ...taxon } = TAXA[id];
    const place = PLACES[at];
    // Spread the campus sightings around a little, like real GPS fixes.
    const jitter = n => (((i * 37 + n) % 11) - 5) * 0.0004;
    return {
      id: `demo-${i + 1}`,
      createdAt: new Date(now - daysAgo * 86400000 - (i % 5) * 3600000 - 2 * 3600000).toISOString(),
      loc: { lat: place.lat + jitter(1), lng: place.lng + jitter(3), accuracy: 12, source: 'gps', label: place.label },
      taxon: { ...taxon, photo },
      idSource,
      rating: { baseCount: 0, rarity: RARITY[tier], tier, maxCount: 0, radiusKm: 5, introduced: NON_NATIVE.has(id), ratedAt: new Date(now).toISOString() },
      photoRemote: photo,
      demo: true,
    };
  });
}
