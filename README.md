# Austin Chips

A scroll-directed film by Jerry Chen about the people who live and work near chip factories in Austin, Texas. The opening shot follows a processor die back to its silicon wafer. Later scenes take the viewer down from Earth orbit to a neighborhood, into Austin’s 1928 city plan, and through a factory air-permit notice.

[Watch the film](https://austin-chips.jerryc33.chatgpt.site/) · [Read the essay](https://austin-chips.jerryc33.chatgpt.site/essay.html) · [Explore the sources and visual credits](https://austin-chips.jerryc33.chatgpt.site/credits.html)

## Run locally

From a terminal with Git and Python 3 installed, run

```sh
git clone https://github.com/Jerry-111/austin-chips.git
cd austin-chips
python3 -m http.server 4173 --bind 127.0.0.1
```

Open [localhost:4173](http://127.0.0.1:4173/). Scroll in either direction, or select **Play** to watch the timed cut. **Read this section** opens the corresponding passage from the essay. The site serves its JavaScript, fonts, and scene assets locally. It runs without a build step or map API key.

## How the film works

- [story.js](story.js) maps scroll position to the timeline shared by the camera, chapter navigation, titles, and playback.
- [chip-scene.js](chip-scene.js) and [silicon-model.js](silicon-model.js) build the opening package, die, and wafer in Three.js. [globe-scene.js](globe-scene.js) blends georeferenced images at different resolutions as the camera descends. A [worker](flight-photo-worker.js) prepares images ahead of drawing to keep scrolling responsive.
- [archive-film.js](archive-film.js), [workbench-film.js](workbench-film.js), and [permit-film.js](permit-film.js) stage the archival map, soldering bench, and permit notice. [reading-panel.js](reading-panel.js) connects each chapter to the author’s essay and references.

## Code, essay, and media

The original implementation, including the JavaScript, CSS, and HTML structure, is available under the [MIT License](LICENSE). Jerry Chen retains copyright in his essay, including the passages in `essay-content.json`. The code license excludes editorial text, quotations, and media assets.

| Material | Credit and terms |
| --- | --- |
| Three.js | MIT. See the [bundled license](vendor/THREE-LICENSE.txt). |
| DM Sans and Space Grotesk | SIL Open Font License 1.1. See the notices for [DM Sans](assets/fonts/DM-Sans-OFL.txt) and [Space Grotesk](assets/fonts/Space-Grotesk-OFL.txt). |
| Travis County study map | Unmodified Figure 1, © the authors, from Chambliss et al. (2026). The figure is included for noncommercial educational use. [Study](https://doi.org/10.1007/s11111-026-00524-y) · [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/) |
| Geographic imagery and boundary | NASA Earth Observatory and GIBS, USDA and USGS imagery, and the U.S. Census Bureau. The film aligns and color-matches the imagery. Map services and data available from U.S. Geological Survey, National Geospatial Program. [Source details](credits.html) |
| Planning and permit records | Koch & Fowler’s public-domain 1928 Austin city plan and a 2025 Texas Commission on Environmental Quality permit notice. [Scans and original documents](https://austin-chips.jerryc33.chatgpt.site/credits.html) |
