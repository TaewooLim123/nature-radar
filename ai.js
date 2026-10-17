/* On-device wildlife ID, no internet needed after a one-time download (the service worker keeps it).
   Two kinds of model work together:
   • MobileNet (ImageNet's 1,000 everyday categories, TensorFlow.js): is this wildlife, a pet, a
     landscape, or not wildlife at all (a cup, a car…)? Also a rough guess for mammals, reptiles, fungi…
   • Three species models trained on iNaturalist photos (Google's AIY Vision classifiers, TFLite):
     ~960 birds, ~2,100 plants and ~1,000 insects, identified to species.
   ai-labels.js and species-labels.js map each model's outputs to iNaturalist taxa. */
import { WILDLIFE, PETS, NATURE, LABELS } from './ai-labels.js';
import { SPECIES_MODELS } from './species-labels.js';
import { local } from './shared.js';

const MODEL_URL = './models/mobilenet/model.json?v=2'; // v2: weights in one file (weights.bin)
const TFJS_URL = './vendor/tfjs/tf.min.js';
const TFLITE_URL = './vendor/tflite/tf-tflite.min.js';
const READY_KEY = 'nr-ai-downloaded';

let modelPromise = null;
const listeners = new Set();
// state: idle (never downloaded) | cached (downloaded before) | loading | ready | error
const status = { state: local.get(READY_KEY, false) ? 'cached' : 'idle', progress: 0, error: '', speciesModels: false };

export const aiStatus = () => ({ ...status });
export function onAiStatus(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function setStatus(patch) {
  Object.assign(status, patch);
  listeners.forEach(cb => cb(aiStatus()));
}

// Pauses briefly so the browser can draw the screen between heavy AI steps (phones would otherwise freeze).
const breathe = () => new Promise(resolve => setTimeout(resolve, 30));

function loadScript(src, globalName) {
  return new Promise((resolve, reject) => {
    if (window[globalName]) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load the AI library'));
    document.head.append(s);
  });
}

// Loads TensorFlow.js + all models once; later calls reuse them.
// If the species models can't run on a device, the app still works with MobileNet alone.
export function loadModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      setStatus({ state: 'loading', progress: 0, error: '' });
      await loadScript(TFJS_URL, 'tf');
      const tf = window.tf;
      // The GPU (WebGL) is fast; fall back to the CPU on devices without it.
      if (!(await tf.setBackend('webgl').catch(() => false))) await tf.setBackend('cpu');
      await tf.ready();
      await breathe();
      const mobilenet = await tf.loadLayersModel(MODEL_URL, { onProgress: p => setStatus({ progress: p * 0.45 }) });
      tf.tidy(() => mobilenet.predict(tf.zeros([1, 224, 224, 3]))); // warm-up, so the first real photo is quick
      await breathe();

      const species = {};
      try {
        await loadScript(TFLITE_URL, 'tflite');
        window.tflite.setWasmPath('./vendor/tflite/');
        const keys = Object.keys(SPECIES_MODELS);
        for (const [i, key] of keys.entries()) {
          species[key] = await window.tflite.loadTFLiteModel(`./models/species/${key}.tflite`);
          await breathe();
          setStatus({ progress: 0.45 + 0.55 * ((i + 1) / keys.length) });
        }
      } catch (err) {
        console.warn('Species models unavailable; using the general model only', err);
      }

      local.set(READY_KEY, true);
      setStatus({ state: 'ready', progress: 1, speciesModels: Object.keys(species).length > 0 });
      return { mobilenet, species };
    })();
    modelPromise.catch(err => {
      console.error('AI model failed to load', err);
      modelPromise = null;
      setStatus({ state: 'error', error: navigator.onLine === false ? 'offline' : 'failed' });
    });
  }
  return modelPromise;
}

// Loads the AI quietly in the background once the app is idle, so the first photo of a visit is
// identified right away instead of waiting several seconds. Only when it was downloaded before
// (it's then on the device, no data used) and the phone isn't in data-saver mode.
export function warmUp() {
  if (status.state !== 'cached' || navigator.connection?.saveData) return;
  const start = () => loadModel().catch(() => {});
  if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 8000 });
  else setTimeout(start, 3000);
}

// Shrinks the photo in halving steps to at most 448 px (2× the models' 224). One big jump lets the
// browser skip pixels, which turned pine needles into noise, and gave different answers for the same
// photo depending on how it was loaded. Every later crop is then a gentle ≤2× step.
const WORK_SIZE = 448;
function normalize(image) {
  let src = image, w = image.naturalWidth || image.width, h = image.naturalHeight || image.height;
  do {
    const k = Math.max(0.5, Math.min(1, WORK_SIZE / Math.max(w, h)));
    const c = document.createElement('canvas');
    c.width = Math.round(w * k);
    c.height = Math.round(h * k);
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, 0, 0, c.width, c.height);
    [src, w, h] = [c, c.width, c.height];
  } while (Math.max(w, h) > WORK_SIZE);
  return src;
}

// A canvas of the models' input size that draws smoothly.
function smallCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  return { canvas, g };
}

// Center-crops the photo to a 224×224 square, the size all the models expect.
function squareCanvas(image, size) {
  const w = image.naturalWidth || image.width, h = image.naturalHeight || image.height;
  const side = Math.min(w, h);
  const { canvas, g } = smallCanvas(size);
  g.drawImage(image, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size);
  return canvas;
}

/* Returns what the AI thinks is in the photo:
   kind: 'wildlife' | 'pet' | 'nature' | 'none'
   guesses: up to 4 { taxon, p, label, source } for wildlife, best first
   confident: whether the top wildlife guess is strong
   group: the iconic group (Aves, Mammalia…) when the AI is sure of it, even if unsure of the species
   top: MobileNet's raw top-5 { label, p } (used to tell objects from wildlife) */
/* options.prior: Map<taxonId, records near you> — species actually recorded around here get a
   boost, ones never recorded here are discounted (like iNaturalist's "seen nearby" geomodel). */
async function classify(image, options = {}) {
  const { species } = await loadModel();
  const canvas = squareCanvas(image, 224);
  const [general] = await generalFor([canvas]);
  const order = speciesModelOrder(general, Object.keys(species));
  const { hits, raw } = await speciesFor(canvas, order, options.prior, general);
  return { ...combine(general, hits, raw), raw, hits };
}

// MobileNet on several 224×224 canvases in one batch (one GPU call is much faster than several).
async function generalFor(canvases) {
  const { mobilenet } = await loadModel();
  const tf = window.tf;
  const output = tf.tidy(() => mobilenet.predict(tf.stack(canvases.map(c => tf.browser.fromPixels(c))).toFloat().div(127.5).sub(1)));
  const probs = await output.data();
  output.dispose();
  return canvases.map((_, i) => interpret(probs.subarray(i * 1000, (i + 1) * 1000)));
}

// Runs the given species models on one canvas. Returns their hits (best species, local prior
// applied) and raw info: each model's "background" (sure it's nothing it knows) and top picks.
// With `general`, stops after the first model if it confirms the group MobileNet expected.
async function speciesFor(canvas, keys, prior, general) {
  const { species } = await loadModel();
  const tf = window.tf;
  const hits = [];
  const raw = {};
  if (!keys.length) return { hits, raw };
  const input = tf.tidy(() => tf.browser.fromPixels(canvas).toInt().expandDims(0)); // these models take 0–255 pixels
  for (const key of keys) {
    const out = species[key].predict(input);
    const scores = await out.data(); // 0–255 confidence per species
    out.dispose();
    const info = SPECIES_MODELS[key];
    const ranked = Array.from(scores, (s, i) => [i, s / 255])
      .filter(([i, p]) => i !== info.background && info.taxa[i] && p >= 0.01)
      .map(([i, p]) => [i, p, applyPrior(p, info.taxa[i][0], prior)])
      .sort((a, b) => b[2] - a[2])
      .slice(0, 3);
    raw[key] = { background: scores[info.background] / 255, top: ranked.map(([i, p]) => [info.taxa[i][1], Math.round(p * 100)]) };
    for (const [i, p, score] of ranked) {
      const row = info.taxa[i];
      if (score >= 0.08 || (p >= 0.08 && !prior)) hits.push({ taxon: rowToTaxon(row), p: score, rawP: p, label: row[2] || row[1], source: key });
    }
    // Stop early only when the plant model is sure of a plant. Bird and insect answers always get the
    // plant model's second opinion: in testing, leafy branches and pine needles fooled MobileNet and the
    // insect model into "Monarch".
    if (general && key === 'plants' && key === keys[0] && general.group === 'Plantae' && hits.some(h => h.source === key && h.p >= 0.5)) break;
  }
  input.dispose();
  hits.sort((a, b) => b.p - a.p);
  return { hits, raw };
}

/* Identify a photo, wide shots included. A quick look at the center comes first; if that's unsure,
   a closer look checks regions of the photo (the whole frame, its sides, and zoomed-in areas), so
   a tree in a landscape or a small bird in a big scene is found and named.
   options.onQuick(result) is called with the quick result when a closer look follows. */
export async function identify(photo, options = {}) {
  const image = normalize(photo);
  const quick = await classify(image, options);
  if (!needsCloserLook(quick)) return quick;
  options.onQuick?.(quick);
  return closerLook(image, quick, options);
}

function needsCloserLook(r) {
  if (r.kind === 'pet') return false;
  // Clearly an object (cup, laptop…) and the plant model sees no plant either.
  if (r.kind === 'none' && (r.top[0]?.p ?? 0) >= 0.5 && (r.raw.plants?.background ?? 1) >= 0.5) return false;
  // A sure bird / insect answer was set aside for a plant: zoom in to check (a small ladybug on leaves).
  if (r.guesses[0]?.source === 'plants' && r.hits.some(h => h.source !== 'plants' && (h.rawP ?? h.p) >= 0.8)) return true;
  return !r.confident;
}

// Square regions to check in a photo (at most 6): the whole frame (padded, nothing cut off), its two
// ends, and three zoomed-in areas where a subject could be.
function regions(w, h) {
  const m = Math.min(w, h);
  const list = [{ full: true }];
  if (w / h >= 1.25) list.push({ x: 0, y: 0, s: h }, { x: w - h, y: 0, s: h });
  else if (h / w >= 1.25) list.push({ x: 0, y: 0, s: w }, { x: 0, y: h - w, s: w });
  // Upper quadrants (where a tree's canopy usually is) and the center, zoomed in.
  const z = m * 0.6, cx = w / 2, cy = h / 2, off = m * 0.2;
  for (const dx of [-off, off]) list.push({ x: cx + dx - z / 2, y: cy - off - z / 2, s: z });
  list.push({ x: cx - m * 0.25, y: cy - m * 0.25, s: m * 0.5 });
  return list;
}

function regionCanvas(image, r, size = 224) {
  const w = image.naturalWidth || image.width, h = image.naturalHeight || image.height;
  const { canvas: c, g } = smallCanvas(size);
  if (r.full) {
    g.fillStyle = '#7f7f7f';
    g.fillRect(0, 0, size, size);
    const k = size / Math.max(w, h);
    g.drawImage(image, (size - w * k) / 2, (size - h * k) / 2, w * k, h * k);
  } else {
    g.drawImage(image, Math.max(0, r.x), Math.max(0, r.y), r.s, r.s, 0, 0, size, size);
  }
  return c;
}

async function closerLook(image, quick, options) {
  const { species } = await loadModel();
  const w = image.naturalWidth || image.width, h = image.naturalHeight || image.height;
  const canvases = regions(w, h).map(r => regionCanvas(image, r));
  const generals = await generalFor(canvases);
  const lookForPlants = Boolean(species.plants) && (quick.raw.plants?.background ?? 0) < 0.6;
  const merged = new Map(); // taxon id → best hit across regions (+ how many regions agreed)
  let plantsBackground = quick.raw.plants?.background ?? 1;
  for (const [i, c] of canvases.entries()) {
    const keys = [];
    if (lookForPlants) keys.push('plants');
    // Bird / insect models only where MobileNet's best guess in that region is one (and fairly sure).
    const lead = generals[i].guesses[0];
    if (species.birds && lead?.taxon.iconic === 'Aves' && lead.p >= 0.3) keys.push('birds');
    if (species.insects && lead?.taxon.iconic === 'Insecta' && lead.p >= 0.3) keys.push('insects');
    const { hits, raw } = await speciesFor(c, keys, options.prior, null);
    if (raw.plants) plantsBackground = Math.min(plantsBackground, raw.plants.background);
    for (const hit of hits) {
      const cur = merged.get(hit.taxon.id);
      if (!cur) merged.set(hit.taxon.id, { ...hit, votes: 1 });
      else { cur.votes++; if (hit.p > cur.p) Object.assign(cur, hit, { votes: cur.votes }); }
    }
  }
  // An animal found in a region where MobileNet also saw that kind of animal (models only run there).
  const animal = [...merged.values()].find(h => h.source !== 'plants' && (h.rawP ?? h.p) >= 0.5);
  for (const hit of quick.hits || []) if (!merged.has(hit.taxon.id)) merged.set(hit.taxon.id, { ...hit, votes: 1 });
  // A species several regions agree on is more believable than a one-region fluke.
  const hits = [...merged.values()].map(h => ({ ...h, p: Math.min(1, h.p + 0.04 * (h.votes - 1)) })).sort((a, b) => b.p - a.p);

  // MobileNet's own guesses on small regions are too noisy to trust (a kitchen became a "crab"), so the
  // closer look only adds evidence from the species models. A bird or insect model that's sure about a
  // region where MobileNet also saw that kind of animal counts as finding it.
  let general = quick;
  if (animal && quick.kind !== 'pet') {
    general = { ...quick, kind: 'wildlife', group: MODEL_GROUP[animal.source], wild: Math.max(quick.wild ?? 0, 0.35) };
  }
  const raw = { ...quick.raw, plants: { ...(quick.raw.plants || {}), background: plantsBackground } };
  return { ...combine(general, hits, raw), raw, closerLook: true };
}

// Local prior: re-weight a species model's confidence by whether it's ever been recorded nearby.
function applyPrior(p, taxonId, prior) {
  if (!prior || !prior.size) return p;
  const count = prior.get(taxonId) || 0;
  return count ? Math.min(1, p * (1.15 + 0.1 * Math.log10(count))) : p * 0.35;
}

// Which species models to run, fastest path first. Each one takes a noticeable moment on a phone,
// so skip them when they can't change the answer (pets, obvious objects), and start with the
// model for the group MobileNet already sees (a bird photo usually needs only the bird model).
function speciesModelOrder(general, available) {
  if (general.kind === 'pet') return [];
  // MobileNet has no tree categories: it calls bark a "stone wall" and an olive branch a "fig".
  // The plant model still checks these photos; it knows when there's no plant ("background").
  if (general.kind === 'none' && (general.top[0]?.p ?? 0) >= 0.5) return available.filter(k => k === 'plants');
  const first = available.find(k => MODEL_GROUP[k] === general.group);
  return first ? [first, ...available.filter(k => k !== first)] : available;
}

// Plant evidence comes from the plant model itself: a low "background" (not-a-plant) score plus a
// solid species score. In testing, every tree photo scored ~0% background; a coffee cup and a cat ~91%.
function plantEvidence(raw, hits, general) {
  if (!raw?.plants || raw.plants.background > 0.25) return false;
  const plantHits = hits.filter(h => h.source === 'plants');
  // Weighted by what grows around here (raw scores alone made some bird photos look like plants)…
  if (Math.max(0, ...plantHits.map(h => h.p)) >= 0.3) return true;
  // …or raw, when MobileNet's own best guess is a plant too (a pine species not recorded nearby).
  return general.guesses?.[0]?.taxon.iconic === 'Plantae' && Math.max(0, ...plantHits.map(h => h.rawP ?? h.p)) >= 0.4;
}

const rowToTaxon = ([id, name, common, iconic, rank, genus]) => ({ id, name, common, iconic, rank, genus, family: null, photo: null });

// The group each species model knows. Outside it, a model still answers (in testing, the bird
// model called a coffee cup a duck at 69% and a golden retriever an egret at 74%).
const MODEL_GROUP = { birds: 'Aves', insects: 'Insecta', plants: 'Plantae' };

// Trust a species model only when MobileNet agrees on the group, or when it's very sure.
function trusted(hit, general, isPlant, surePlant) {
  const group = MODEL_GROUP[hit.source];
  if (isPlant && group === 'Plantae') return hit.p >= 0.15; // the plant model vouched for this photo
  // The plant model is certain this is a plant: a bird / insect answer then needs MobileNet to see that
  // kind of animal, in its top guesses for the photo or in a zoomed-in region (pine needles gave the
  // insect model an 88% "Monarch"; a small ladybug on leaves shows up once the closer look zooms in).
  if (surePlant && group !== 'Plantae' && general.group !== group && !general.guesses?.some(g => g.taxon.iconic === group)) return false;
  // A bird / insect answer needs MobileNet to see some wildlife at all, unless the model is very sure
  // (in testing, a young pine that MobileNet barely read as wildlife became a 59% "Monarch").
  if (group !== 'Plantae' && (general.wild ?? 1) < 0.2 && (hit.rawP ?? hit.p) < 0.8) return false;
  if (general.group === group) return hit.p >= 0.2;
  if (general.group) return hit.p >= 0.8; // MobileNet is sure it's another group (e.g. a mammal)
  return hit.p >= 0.5;
}

// The species models always name *something*, even for a coffee cup, so MobileNet decides
// whether there's wildlife at all (except plants, which vouch for themselves, see plantEvidence);
// the species models then say which species it is.
function combine(general, allHits, raw) {
  const isPlant = general.kind !== 'pet' && plantEvidence(raw, allHits, general);
  const surePlant = Boolean(raw?.plants && raw.plants.background <= 0.05);
  let hits = allHits.filter(h => trusted(h, general, isPlant, surePlant));
  if (isPlant) {
    // On a plant photo the bird and insect models still "see" something (pine needles → "Monarch").
    // Keep an animal answer only when MobileNet's own best guess is that kind of animal and it's fairly
    // sure: a real butterfly on a flower or a bird in a tree.
    const lead = general.guesses?.[0];
    // Also kept: an animal the closer look found in a region of the photo.
    hits = hits.filter(h => h.source === 'plants' || (h.rawP ?? h.p) >= 0.5 && (general.group === MODEL_GROUP[h.source] ||
      lead?.taxon.iconic === MODEL_GROUP[h.source] && lead.p >= 0.3 && (general.wild ?? 0) >= 0.35));
  }
  const best = hits[0];
  let kind = general.kind;
  if (kind === 'pet') {
    // keep: a dog isn't a coyote just because the bird model shrugged
  } else if (isPlant && (general.top[0]?.p ?? 0) < 0.8) {
    kind = 'wildlife'; // a plant or tree, even if MobileNet saw a "nail" or a "fig"
  } else if (kind === 'none') {
    if (best && best.p >= 0.85 && general.top[0]?.p < 0.5) kind = 'wildlife'; // very sure specialist, unsure generalist
  } else if (best && best.p >= 0.3) {
    kind = 'wildlife';
  }
  // The plant model is certain there's a plant ("not a plant" under 10%), even if unsure which one:
  // never "no wildlife" (an olive branch that MobileNet calls a "fig"). Objects scored 86–91% here.
  const surelyAPlant = Boolean(raw?.plants && raw.plants.background <= 0.1);
  if (kind === 'none' && surelyAPlant) kind = 'nature';
  if (kind !== 'wildlife' && kind !== 'nature') return { ...general, kind };

  const seen = new Set();
  const guesses = [];
  // On a plant photo, MobileNet's animal guesses (bark → "iguana") are noise: keep only plant/fungus ones.
  const generalGuesses = isPlant ? general.guesses.filter(g => ['Plantae', 'Fungi'].includes(g.taxon.iconic)) : general.guesses;
  for (const g of [...hits.filter(h => h.p >= 0.15), ...generalGuesses]) {
    if (seen.has(g.taxon.id)) continue;
    seen.add(g.taxon.id);
    guesses.push({ source: 'general', ...g });
  }
  const strong = best && (best.rawP ?? best.p) >= 0.5; // raw: the local weighting alone shouldn't make it "sure"
  return {
    ...general,
    kind,
    guesses: guesses.slice(0, 4),
    confident: strong || general.confident,
    group: strong ? best.taxon.iconic : isPlant ? 'Plantae' : general.group, // a butterfly on a flower is an insect
    // The plant model says "this is a plant" even if it's unsure which (lets the app offer local trees + tips).
    plantish: isPlant || surelyAPlant || Boolean(raw?.plants && raw.plants.background <= 0.25 &&
      allHits.some(h => h.source === 'plants' && (h.rawP ?? h.p) >= 0.2)),
  };
}

function interpret(probs) {
  const ranked = Array.from(probs, (p, i) => [i, p]).sort((a, b) => b[1] - a[1]).slice(0, 50); // the tail is noise
  let wild = 0, pet = 0, nature = 0, petLabel = null, natureLabel = null;
  const byTaxon = new Map();
  const byGroup = {}; // iconic group (Aves, Mammalia…) → summed probability
  for (const [i, p] of ranked) {
    const taxon = WILDLIFE[i];
    if (taxon) {
      wild += p;
      const g = byTaxon.get(taxon.id) || { taxon, p: 0, label: LABELS[i] };
      g.p += p;
      byTaxon.set(taxon.id, g);
      if (taxon.iconic) byGroup[taxon.iconic] = (byGroup[taxon.iconic] || 0) + p;
    } else if (PETS[i]) {
      pet += p;
      petLabel ||= LABELS[i];
    } else if (NATURE[i]) {
      nature += p;
      natureLabel ||= LABELS[i];
    }
  }
  const guesses = [...byTaxon.values()].sort((a, b) => b.p - a.p).filter(g => g.p >= 0.04).slice(0, 3);
  const top = ranked.slice(0, 5).map(([i, p]) => ({ label: LABELS[i], p }));

  let kind;
  if (guesses.length && wild >= 0.12 && wild >= pet) kind = 'wildlife';
  else if (pet >= 0.3) kind = 'pet';
  else if (nature + wild >= 0.2) kind = 'nature';
  else kind = 'none';

  // Even when the exact category is wrong, the model is often right about the group
  // ("some kind of bird"), which lets the app suggest birds actually seen nearby.
  const [group, groupP] = Object.entries(byGroup).sort((a, b) => b[1] - a[1])[0] || [null, 0];
  const confidentGroup = wild > 0 && groupP / wild >= 0.6 ? group : null;

  return { kind, wild, confident: wild >= 0.35 && (guesses[0]?.p ?? 0) >= 0.25, guesses, group: confidentGroup, top, petLabel, natureLabel };
}

// Species seen nearby this week that fit an AI guess: the same taxon or inside it (3),
// the same genus (2) or the same family (1). `pool` items carry iNaturalist ancestor ids.
export function nearbyMatches(guess, pool) {
  const t = guess.taxon;
  return pool
    .map(s => {
      const anc = s.ancestors || [];
      const score = s.id === t.id || anc.includes(t.id) ? 3
        : t.genus && anc.includes(t.genus) ? 2
        : t.family && anc.includes(t.family) ? 1 : 0;
      return { s, score };
    })
    .filter(x => x.score)
    .sort((a, b) => b.score - a.score || (b.s.weekCount || 0) - (a.s.weekCount || 0))
    .slice(0, 3);
}
