# Nature Radar

A mobile-first web app for spotting wildlife:

- **Nearby:** see which plants and animals people logged near you **this week**, ranked by how rare they are **in that exact area**.
- **Nearby** also shows what’s **in season this month**, species that turn up here far more often now than usual.
- **Snap a photo** (camera button, bottom right). An **AI that runs on your phone, with no internet needed,** identifies about 4,000 birds, plants and insects to species, or tells you the photo has no wildlife in it. Turn any sighting into a share card for Instagram. Your sightings are saved with time, place and local rarity.
- **Community:** share sightings to a feed and like other people's posts.
- **Account** (tap your avatar): profile, stats, 29 achievements with rarity tiers ("Oak collector", "Forest keeper", "7-day streak", …) and backups.
- **Collection:** a pixel-art, Pokédex-style page. Its 151 entries start with the 50 trees most recorded near you (#001–#050), then the most-recorded wildlife and plants, with a "NEW SPECIES!" animation every time you photograph something for the first time.

It's plain HTML, CSS and JavaScript with no build step and no API keys. It works on any static web host, including **GitHub Pages**, and keeps working offline.

---

## Put it on GitHub Pages (to test on your phone)

You'll end up with a link like `https://YOUR-NAME.github.io/nature-radar/` that opens the app on any phone.

> **Why not just open the GitHub repo link?** `github.com/you/nature-radar` shows the *code*. GitHub **Pages** turns that code into a working website at `you.github.io/nature-radar`. Phones also only allow the camera, GPS and offline mode on `https://` sites, and GitHub Pages provides that.

### 1. Make a GitHub account
Go to <https://github.com/signup> and sign up (free). Verify your email.

### 2. Create a repository
1. Click the **+** (top right) → **New repository**.
2. **Repository name:** `nature-radar`. Lowercase with no spaces is easiest; this name becomes part of your link.
3. Choose **Public**. GitHub Pages is free only for public repos.
4. Leave everything else as is and click **Create repository**.

### 3. Upload the files
1. On the new repo's page, click **uploading an existing file** (or **Add file → Upload files**).
2. On your computer, open the `Nature Radar` folder. Select **everything inside it**: the files *and* the `icons`, `models`, `supabase` and `vendor` folders. Drag them all onto the GitHub page.
   - Drag the *contents*, not the `Nature Radar` folder itself, so `index.html` ends up at the top level of the repo.
   - Chrome, Edge or Safari keep the folder structure when you drag folders.
   - That’s 40 files (about 40 MB). GitHub's limit is 100 files per upload, so it fits in one go. Wait until every file shows in the list.
3. Scroll down and click **Commit changes**.
4. Check that the repo's main page shows `index.html`, `app.js`, … and the folders `icons/`, `models/`, `vendor/`.

### 4. Turn on GitHub Pages
1. In the repo, click **Settings** (top tab) → **Pages** (left menu).
2. Under **Build and deployment → Source**, pick **Deploy from a branch**.
3. Under **Branch**, pick **main** and **/ (root)**, then click **Save**.
4. Wait 1–2 minutes and refresh the page. A box appears: **"Your site is live at https://YOUR-NAME.github.io/nature-radar/"**.
   (You can watch progress in the repo's **Actions** tab; a green check ✓ means it's done.)

### 5. Open it on your phone
1. Open that link on your phone (text or email it to yourself, or type it in).
2. Allow **location** when asked, then try **Snap**. The first photo downloads the AI (about 37 MB, once; use Wi-Fi if you can).
3. **Install it like an app:**
   - iPhone (Safari): **Share** button → **Add to Home Screen**.
   - Android (Chrome): **⋮** menu → **Add to Home screen** / **Install app**.
4. Try offline: switch on airplane mode and open the app from your home screen. Your sightings, saved Nearby data, the map areas you've viewed and the AI all still work.

### Updating the app later
Edit or replace a file in the repo (**Add file → Upload files** with the new version, then **Commit changes**). GitHub Pages republishes in about a minute. The app loads the newest files whenever the phone is online.

### If something goes wrong
| Problem | Fix |
|---|---|
| The link shows **404** | Wait 2 minutes. Check that `index.html` is at the top level of the repo (not inside a `Nature Radar/` folder) and that Pages is set to `main` / `(root)`. |
| The page is blank, or **"Almost there!"** | You opened the file directly from your computer. Use the GitHub Pages link instead. |
| Map works but **"Use my location"** fails | Allow location for the site in your phone's browser settings, or use **De Anza College** / **Pick a spot**. |
| AI says "isn't available" | The first time, the phone must be online to download it. Check that the `models/mobilenet` folder (`model.json` + `weights.bin`) was uploaded. |
| Camera doesn't open | Some in-app browsers (inside Instagram, Gmail, etc.) block it. Open the link in Safari or Chrome. |

---

## Optional: make the Community feed real (free Supabase account)

Out of the box, the Community tab runs in **demo mode**: you see sample posts (made-up people, real species and photos, each labeled "Sample"), and posts you share stay on your device. To let everyone using your link see each other's posts:

1. Sign up at <https://supabase.com> (free) and click **New project**. Pick any name, set a database password (save it somewhere) and choose a region near you. Wait about 2 minutes while it sets up.
2. In the project, open **SQL Editor** → **New query**. Copy everything from [`supabase/setup.sql`](supabase/setup.sql), paste it, and click **Run**. You should see "Success. No rows returned".
3. Go to **Project Settings** → **API** (or **API Keys**). Copy the **Project URL** and the **anon public** key (or the **publishable** key, which starts with `sb_publishable_`).
4. In your GitHub repo, open `config.js`, click the ✏️ pencil, and paste them in:
   ```js
   export const COMMUNITY = {
     supabaseUrl: 'https://abcdefghijklmnop.supabase.co',
     supabaseAnonKey: 'eyJhbGciOi…',
   };
   ```
   Click **Commit changes**. In a minute the Community tab shows a **↻ Refresh** button instead of the demo notice.

**Is it safe to put that key in a public repo?** Yes. The anon/publishable key is designed to be public. What it can do is limited by the rules in `setup.sql`: anyone can read posts and add posts (JPEG photos up to 2 MB), but nobody can edit posts, and only the phone that made a post can delete it. Never put the **service_role** / **secret** key in the app.

How posting works: photos upload to a public storage bucket, and the location is rounded to about 1 km so exact spots aren't published. If you're offline, posts wait in an outbox and upload automatically when the connection returns. You can remove unwanted posts from the Supabase dashboard (**Table Editor → posts**).

---

## Features in detail

### Nearby this week
1. **Finds a place.** On load it asks for your location. If that fails, you can choose **Use De Anza College** or **Pick a spot on the map**. You can also long-press the map any time.
2. **Scans a circle** of 1, 3 or 5 km (default 3 km) using the controls at the bottom of the screen.
3. **Map + "Rarest this week" list.** Markers are colored by rarity tier; tap one for the photo, name, date, observer and a link to iNaturalist. List rows show the photo, names, rarity badge, sightings this week, all-time local count and distance.
4. **🍂 In season this month.** A strip of species recorded in your circle **much more often this month than in an average month** (across all years), such as October gall wasps or spring wildflowers. Each card shows how much more often (e.g. "8× usual") and whether it was already seen this week ("✓ Seen this week") or is one to look out for ("👀 Look out"). The math: records this month ÷ (all-time records ÷ 12). Only species with at least 3 records this month and a ratio of at least 1.8 are listed.
5. **⚠ Non-native species.** iNaturalist records which species were introduced by people at each place. Those get a **⚠ Non-native** badge in the list, on the map, in your Journal and in the dex, and the page says how many of this week's species are non-native. Your own sightings are checked at the spot where you took the photo. The sighting's detail view explains why it matters (some introduced species spread invasively) and links to logging it on iNaturalist. An achievement, **Invader alert**, rewards logging one.
6. **Two filter rows:** a **group** row (Birds, Plants, Mammals, Insects, Fungi, Reptiles, Amphibians, Spiders & kin, Other) and a **rarity** sub-row (Very rare, Rare, Uncommon, Common, Unranked). They combine, for example "Mammals + Rare". Each row's counts update to match the other's selection, and the map and header ("1 rare mammal species…") follow the filters. The same filters appear in the Journal and Community.

### Snapping a sighting + offline AI
1. **Snap** opens the camera. The photo is shrunk to 1280 px and the time and GPS location are recorded. If GPS isn't allowed, the scan location is used and marked *approximate*.
2. **On-device AI** ([`ai.js`](ai.js)). Four models run in the browser. Nothing is uploaded, and after a one-time download (about 37 MB) they work with no internet:
   - **Species models trained on iNaturalist photos.** Google's [AIY Vision classifiers](https://www.kaggle.com/models/google/aiy) identify about **960 birds, 2,100 plants and 1,000 insects** to species, running on the [TensorFlow Lite](https://github.com/tensorflow/tfjs/tree/master/tfjs-tflite) web runtime. [`species-labels.js`](species-labels.js) links each output to its iNaturalist taxon.
   - **A general model.** [MobileNet](https://arxiv.org/abs/1704.04861) on [TensorFlow.js](https://www.tensorflow.org/js) knows 1,000 everyday categories. [`ai-labels.js`](ai-labels.js) sorts them into wildlife (277 categories, covering mammals, reptiles, fungi, …), **pets and farm animals** ("This looks like a pet or farm animal"), **landscapes** ("No clear animal found") and **everything else** (cups, cars, laptops, food…) → **"🚫 No wildlife detected in this photo"**.
   - **How they work together.** The species models always name *some* species, even for a coffee cup, so the general model decides whether there's wildlife at all. The species models then say exactly which species it is.
3. **Fast.** The AI loads quietly in the background as soon as the app opens (if it was downloaded before), so it's ready before you tap Snap. Identification starts immediately, while the photo is compressed for storage at the same time. Only the species model for the group the general model sees is run (a bird photo usually needs just the bird model), and pets or obvious objects skip the species models entirely. Typical time per photo is about 0.2 s on a laptop; a wide shot that needs a closer look takes about 0.6 s, and the quick answer shows first.
4. **AI + local knowledge.** The AI's guesses are matched against species seen nearby this week. If the AI says "jay family" and Steller's Jays were logged nearby, Steller's Jay is suggested first. If it's only sure of the group ("a mammal"), mammals seen nearby are suggested too.
5. **Trees.** The plant model knows about 2,100 plants, including most campus trees: coast live oak, valley oak, coast redwood, California buckeye, bay laurel, toyon, olive, Monterey pine, blue gum eucalyptus, pepper tree, sweetgum, crape myrtle, ginkgo, magnolia, jacaranda and more.
   - **Plants vouch for themselves.** The general model has no tree categories and sees bark as a "stone wall" and an olive branch as a "fig". The plant model's own "not a plant" score decides instead: about 0% on every tree photo tested, about 91% on a coffee cup.
   - **Local weighting.** Species recorded around the scanned area count for more, and species never recorded there count for less, like iNaturalist's "seen nearby" model.
   - **Help when unsure.** For an unsure plant photo, the app also offers the plants most often recorded nearby (e.g. coast live oak) and a tip: close-ups of a leaf, cone, fruit, flower or bark identify far better than a whole tree.
   - **Wide shots (closer look).** If the first look at the middle of a photo is unsure, the app checks regions of the whole photo: the full frame, its left and right sides, and zoomed-in areas. This finds a tree in a landscape or a small bird in a big scene. The plant model checks every region, and the bird and insect models only check regions where the general model sees that kind of animal.
   - **Same pixels on every device.** Photos are shrunk in gentle halving steps to 448 px before the AI looks at them. One big jump made the browser skip pixels, turning pine needles into noise, and gave different answers for the same photo depending on how it was loaded.
   - **No more "Monarch" pines.** When the plant model is sure a photo is a plant, a bird or insect answer is only kept if the general model also sees that kind of animal, either in the whole photo or in a zoomed-in region.
   - **Trees the AI doesn't know.** 73 of the 133 trees recorded near De Anza are in the plant model. For the others (e.g. Chinese pistache, London plane, deodar cedar), when the AI names the genus, the app suggests this area's trees from that genus ("same genus · tree here").
   - **Results** (10 real iNaturalist photos per group, with the De Anza local weighting, on a laptop):

     | Group | Detected as wildlife | Right group | Right species (top 1 / top 3) | Typical time |
     |---|---|---|---|---|
     | Trees (wide shots) | 10/10 | 8/10 | 3 / 4 | 0.2 s (0.6 s with a closer look) |
     | Plant close-ups | 10/10 | 10/10 | 10 / 10 | 0.17 s |
     | Birds | 9/10 | 8/10 | 6 / 6 | 0.18 s |
     | Insects | 10/10 | 7/10 | 6 / 6 | 0.17 s |
     | Mammals (genus level only) | 9/10 | 9/10 | 2 / 3 | 0.18 s |
     | Not wildlife (objects, food, people, pets) | 10/10 correctly *not* wildlife | | | 0.09 s |

     Whole trees are the hardest case. A close-up of a leaf, cone, flower or bark is much more accurate (10/10 for plant close-ups).
6. **Honest limits.** The species models cover birds, plants and insects. For mammals, reptiles, amphibians and fungi only the general model helps, so it gives broader guesses like "Lynxes" (then **Search species in Lynxes** finds Bobcat). You can always pick from the **Seen nearby this week** list or **search** iNaturalist's species names.
7. **Rarity** is rated in a 3 km circle around where you took the photo. If you're offline, rarity is rated automatically later.
8. **Browse** newest-first or rarest-first. Tap a sighting to share it, show it on the map, change its ID or delete it.
9. **📸 Share card.** In a sighting's detail view, *Make a share card* creates a 1080×1350 image (photo, species, rarity, date and place, Nature Radar branding) sized for an Instagram post. **Share** opens the phone's share sheet (Instagram, Messages, …); on computers it saves the image instead.

Sightings and photos are stored **only on this device** (IndexedDB). Back them up from **Account → Download backup**; the file can be restored on any device.

### Collection (Pokédex-style)
The app has three tabs: **Nearby · Community · Collection**. The Collection tab has three parts, switched at the top:
- **📖 Dex:** your species collection, described below.
- **🗺️ Life list:** every species you've ever recorded, numbered in the order you found them (#1 = your first), with 🎉 milestones (1, 10, 25, 50, 100…). A map pins where you first found each one. Tiles show your life list, this year and new this month, and year chips switch to a **year list** (species seen in that year), like eBird's life and year lists.
- **📋 Journal:** every sighting you've saved, including unidentified ones and repeats, with the group/rarity filters and newest/rarest sorting.

Collection features:
- **Level + XP:** every species earns XP by local rarity (Common 10 · Uncommon 25 · Rare 50 · Very rare 100), plus 2 XP per sighting. Levels go from *Sprout* and *Seedling* up to *Legend*.
- **🎯 Targets nearby:** dex species you still need that someone spotted near you this week.
- **Shiny catches:** Rare and Very rare species get a gold ✦ badge and a moving holographic shine on their card.
- **Dex entry page:** tap a caught species to see all your photos of it, times seen, first-caught date, best rarity and its XP.
- **Filters:** by group (with "3/47" progress) and by ✓ Caught / ? Missing.
- **Local dex:** 151 entries for the circle you're scanning on Nearby. A featured **Trees** section comes first: **#001–#050** are the 50 trees most recorded there (planted ones included, recorded at least twice), from coast live oak to Chinese pistache. **#051–#151** are the most-recorded other species. Fewer trees in an area means more of the others. A progress ring follows the chosen filter (e.g. "Trees 12/51"), and each group chip has its own progress bar. Caught tiles show in full colour with their group's colour; missing ones are greyed out with just their number. Tap a caught tile to see your photo and when and where you found it.
- **Pixel-art style:** sprite-like cards with hard borders and offset shadows, a pixel font for numbers, checkerboard silhouettes for species you still need, and a segmented XP bar.
- **Caught** species show *your own photo*. Species you haven't caught yet are dark, blurred **"?"** silhouettes. Tap one for a hint (its group, how common it is, whether someone saw it this week) and an optional **Reveal its name**.
- **✨ Beyond the local dex:** species you found that aren't in the area's dex: rarer finds, or ones from other places.
- **New species:** while identifying, AI suggestions you've never collected get a **✨ New** badge, and the save button says "· ✨ New!". Saving a first-ever species plays a full-screen **"NEW SPECIES!"** animation: a card flips in, the photo appears from a black silhouette, gold rays spin, confetti falls, and Android phones buzz. It also shows the dex number, the XP you earned and any LEVEL UP. Rare and Very rare first catches get a special **✦ RARE FIND! ✦** version with rainbow edges, extra confetti and a longer chime. Sound can be turned off on the Account page. Photographing a species you already have doesn't replay it. With "reduce motion" turned on, it's a simple fade.

### Community
A feed of shared sightings with likes, group/rarity filters, "📍 On map" and links to iNaturalist. Share from a sighting's detail view or with the **Share a sighting** button. See the Supabase section above to make it real.

In demo mode there are 13 sample people and 30 sample posts (made-up people, real local species and openly licensed photos). A **Top explorers this week** board sits above the feed. **Tap a person's name or avatar** to see their profile: level, places explored, their 6 hardest achievements and their 9 rarest species first, each with **Show all**. Their achievements are worked out from their collection with the same rules as yours, so nobody has a badge they couldn't earn.

### Account and achievements
Tap the avatar (top right). You can set your display name and avatar, and see your stats: sightings, species, current streak and posts shared. There are 29 achievements, each with a rarity tier by how hard it is (common, uncommon, rare, legendary). The page shows your best 6 first, then **Show all**. New unlocks pop up as you play:

First sighting · First bird · Green thumb (plant) · Mammal spotter · Bug hunter · Fungus among us · Getting started (5 species) · Naturalist (10 species) · Field expert (25) · Biodiversity buff (5 groups) · Rare find · Unicorn (very rare) · 3-day streak · 7-day streak · Explorer (3 places 5 km apart) · Globetrotter (5 places) · AI assist · Sharing is caring · Dex starter / devotee / master (10, 25, 50 dex species) · Tree spotter (5 trees) · Arborist (15 trees) · Forest keeper (30 trees) · Oak collector (3 oaks) · Conifer (a redwood, pine, cedar…) · Campus naturalist (10 sightings at De Anza) · Tracker (level 5) · Invader alert (a non-native species)

The look is one palette, set in the `:root` tokens of `styles.css`: a forest-green header, tab bar, dock and buttons, light-sage cards on a sand page, and terracotta for rarity highlights and "NEW" labels. Every text colour passes WCAG AA contrast, and dark mode follows your phone. The Account page also has community settings (including hiding sample posts), backup/restore, and "erase my data".

### Demo data (temporary)
For presentations, the first time the app opens it fills "your" journal with 30 sightings from [`demo-data.js`](demo-data.js): 30 species around De Anza (12 trees), across 4 places and about 3 weeks. That way the Collection, life list, XP level (6) and achievements already show progress. They use openly licensed iNaturalist photos. To start empty instead, delete `demo-data.js` and its line in `sw.js`. "Erase all my data" also leaves the app empty (the demo only loads once).

---

## Network failures and offline use

| Situation | What the app does |
|---|---|
| Slow connection | Every request has a 15-second time limit, so nothing hangs forever. |
| Rate limit (429), server error (5xx), timeout, network blip | Retries twice with increasing waits. |
| iNaturalist can't be reached | Shows the **last saved copy** of that area's data (kept across visits in the browser's Cache Storage) with a notice: "Showing saved data from 2 h ago". |
| Nothing saved for that area | Friendly "You're offline" card with **Retry**. |
| Phone goes offline | A banner says so; requests fail fast instead of waiting. |
| Connection comes back | "Back online": failed or stale data reloads by itself, unrated sightings get rated, and waiting community posts upload. |
| App opened with no connection | The service worker ([`sw.js`](sw.js)) serves the app, the AI model and map tiles you've viewed. |
| A photo from the internet fails to load | A 🌿 placeholder is shown instead of a broken image. |
| Storage full or blocked (private browsing) | Caches are optional, and saving shows a clear message instead of crashing. |

---

## How rarity is calculated

For each species, the app counts how many times it has **ever** been recorded inside the circle (the "baseline", fetched as up to 3 pages of 500 species). The most-recorded species there sets `max`.

```
rarity = 1 − log(1 + localCount) / log(1 + max)
```

- Counts are very skewed (2,000 records of the common lizard, 1–5 of most species), so log scaling keeps "very rare" meaningful.
- The most-recorded species scores **0**, and a single local record scores close to **1**. A species missing from the baseline gets **1**.
- Taxa identified only to genus or family (e.g. *Sciurus*) are labeled **Unranked**, because the baseline only lists the most specific IDs.

| Score | Label |
|-------|-------|
| ≥ 0.85 | **Very rare** |
| 0.65 – 0.85 | **Rare** |
| 0.40 – 0.65 | **Uncommon** |
| < 0.40 | **Common** |

"Rare" means **rarely recorded in this circle on iNaturalist**. That reflects where people go and what they photograph, not just what lives there.

## Data requests (iNaturalist API)

Requests go one at a time, about 1 per second, and are cached in `sessionStorage` (keyed by lat/lng/radius/date) plus a longer-lived "last good" copy for offline use.

| Request | Purpose |
|---|---|
| `/observations/species_counts?lat&lng&radius&d1=<7 days ago>&quality_grade=research,needs_id` | Species seen this week |
| `/observations?…&d1=<7 days ago>&photos=true&per_page=100` | Recent photos for the map |
| `/observations/species_counts?lat&lng&radius&per_page=500&page=1..3` | All-time local baseline |
| `/taxa/autocomplete?q=…` | Name search when identifying |

---

## Run it on your computer

Phones need the GitHub Pages link, but on a computer you can serve the folder locally:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Opening `index.html` by double-clicking doesn't work, because browsers block the app's code from `file://` pages; the page tells you this.

## Files

```
index.html            page structure
styles.css            look and feel (light + dark)
app.js                startup, navigation, Nearby tab (map, list, filters)
sightings.js          Journal (every sighting) + camera, identify (AI + nearby + search), save, rarity, backup
ai.js                 loads and runs the offline AI model
ai-labels.js          what each of the model's 1,000 categories means (wildlife taxon / pet / scene / other)
community.js          Community feed: demo mode, Supabase mode, outbox for offline posts
community-seed.js     sample people, profiles and posts (made-up people, real species + openly licensed photos)
demo-data.js          TEMPORARY: pre-filled demo journal (delete to start empty)
account.js            account page: profile, stats, achievements, settings
shared.js             iNaturalist requests (rate limit, timeouts, retries, offline fallback), rarity, filters
store.js              on-device storage (IndexedDB)
config.js             your settings (Supabase URL + key for the Community tab)
sw.js                 service worker (offline support)
manifest.webmanifest  "Add to Home Screen" app info
icons/                app icons
models/mobilenet/     general AI model: wildlife or not? (16 MB, 2 files)
models/species/       species AI models trained on iNaturalist photos: birds, plants, insects (12 MB)
species-labels.js     what each species model output means (iNaturalist taxon)
share-card.js         makes the Instagram-style share card image
collection.js         the Collection page (local dex) and the "NEW SPECIES!" celebration
vendor/               Leaflet (map), TensorFlow.js and its TFLite runtime, copied in so the app needs no outside servers
supabase/setup.sql    database setup for the real Community feed
```

## Credits and licenses

- Observation data, species names and photos: **[iNaturalist](https://www.inaturalist.org)** and its observers. Photos remain © their owners under each observer's license, and every post and marker links back. This app follows the [API recommended practices](https://www.inaturalist.org/pages/api+recommended+practices) (about 1 request/second, cached).
- Sample community photos: openly licensed (CC0 / CC BY / CC BY-NC, with variants) iNaturalist photos, credited on each post.
- Map tiles © **[OpenStreetMap](https://www.openstreetmap.org/copyright)** contributors ([tile usage policy](https://operations.osmfoundation.org/policies/tiles/)).
- [Leaflet](https://leafletjs.com) 1.9.4 (BSD-2-Clause) · [TensorFlow.js](https://www.tensorflow.org/js) 4.22.0 (Apache 2.0) · MobileNet v1 1.0/224 weights from Google’s TensorFlow.js model hosting (Apache 2.0) · TFLite web runtime 0.0.1-alpha.10 (Apache 2.0) · AIY Vision birds/plants/insects V1 classifiers by Google, trained on iNaturalist data (Apache 2.0).
