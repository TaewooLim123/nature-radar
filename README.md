# Nature Radar

A mobile web app for spotting wildlife: see what plants and animals were recorded near you this week, ranked by how rare they are locally, and identify what you photograph.

**Live app:** https://taewoolim123.github.io/nature-radar/ (best on a phone)

**Demo video:** https://www.youtube.com/watch?v=HuQe_GywwqE

<p>
<img src="https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/601/866/datas/gallery.jpg" width="30%" alt="Nature Radar screenshot">
<img src="https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/601/867/datas/gallery.jpg" width="30%" alt="Nature Radar screenshot">
<img src="https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/005/601/868/datas/gallery.jpg" width="30%" alt="Nature Radar screenshot">
</p>

## Features

- **Nearby:** a map and list of species recorded within 1–5 km in the past week, with a local rarity rating.
- **Photo identification:** suggests what a plant or animal is from a photo, using AI models that run in the browser and work offline.
- **Collection:** a Pokédex-style record of the species you've found, with levels and achievements.
- **Community:** a feed for sharing sightings. It runs in demo mode with sample posts.
- **Offline support:** the app installs to the home screen and keeps working without a connection.

The live app opens with demo data (sample sightings) so the collection and achievements can be seen in use. It's labeled in the app and can be cleared from the Account page.

## Tech stack

- HTML, CSS and JavaScript (ES modules), no build step
- TensorFlow.js and TensorFlow Lite for the web (MobileNet and Google AIY vision classifiers)
- iNaturalist API for observation data
- Leaflet and OpenStreetMap for maps
- Service worker and IndexedDB for offline use and on-device storage
- Supabase-ready community backend (not connected)
- GitHub Pages hosting

## Run locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Credits

Observation data and photos from [iNaturalist](https://www.inaturalist.org) and its observers. Map tiles © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors. Built with Claude Code.
