import { createCountyLocator } from './county-locator.js?v=14';
import { countyProgress } from './county-camera.js?v=13';
import { createArchiveFilm } from './archive-film.js?v=14';

const clamp = value => Math.min(1, Math.max(0, value));
function ease(start, end, progress) {
  const t = clamp((progress - start) / (end - start));
  return t * t * (3 - 2 * t);
}

// Table 2 reports the mean resident share across tracts within each group.
// Comparison groups and percentage denominators stay fixed for all three rows.
const rows = [
  ['Black residents', '12.4%', '7.2%'],
  ['Latinx residents', '45.8%', '30.4%'],
  ['Residents without health insurance', '21.4%', '13.8%']
];

function show(element, amount, interactive = false) {
  element.style.opacity = amount.toFixed(4);
  element.style.visibility = amount > .001 ? 'visible' : 'hidden';
  element.setAttribute('aria-hidden', String(amount < .15));
  if (interactive) element.inert = amount < .5;
}

export function createHealthFilm(mount) {
  mount.classList.add('hf-film');
  mount.innerHTML = `
    <div class="hf-locator"></div>
    <div class="hf-exposure-shadow" aria-hidden="true"></div>
    <section class="hf-health-result">
      <p class="hf-context">Travis County · 2016–2017 health data</p>
      <h2><strong>9.3%</strong><span>higher rate of ER visits for asthma</span></h2>
      <p class="hf-interpretation">Researchers scored neighborhoods using factory emissions and distance. A one-standard-deviation increase in estimated exposure was associated with this higher emergency visit rate.</p>
      <p class="hf-citation">Chambliss et al. (2026), Table 3</p>
    </section>
    <section class="hf-neighbors">
      <h2>Who lived near the factories?</h2>
      <p class="hf-definition">The study grouped census tracts by whether any part lay within 2 km of a factory.</p>
      <table>
        <caption>Average share of residents per census tract</caption>
        <thead><tr><td></td><th scope="col">Within 2 km</th><th scope="col">Other tracts</th></tr></thead>
        <tbody>${rows.map(([group, near, other]) => `<tr><th scope="row">${group}</th><td>${near}</td><td>${other}</td></tr>`).join('')}</tbody>
      </table>
      <p class="hf-citation">Travis County · Chambliss et al. (2026), Table 2</p>
    </section>
    <div class="hf-history-stage"></div>`;
  const locatorHost = mount.querySelector('.hf-locator');
  const locator = createCountyLocator(locatorHost);
  const historyHost = mount.querySelector('.hf-history-stage');
  const archive = createArchiveFilm(historyHost);
  const contrast = mount.querySelector('.hf-exposure-shadow');
  const result = mount.querySelector('.hf-health-result');
  const neighbors = mount.querySelector('.hf-neighbors');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let active = false, progress = 0, archiveRunning = false;

  function render() {
    if (!active) return;
    const p = progress;
    // The study is county-wide. Hold that established geography behind both findings.
    locator.setProgress(countyProgress(p));
    locator.setLabelsVisible(p < .233);
    locatorHost.inert = p >= .233;
    locatorHost.setAttribute('aria-hidden',String(p >= .233));
    const archiveArrival = ease(.577, .63, p);
    contrast.style.opacity = (.85*ease(.215,.26,p) + .1*archiveArrival).toFixed(3);
    const rate = ease(.237, .258, p) * (1-ease(.374,.394,p));
    const groups = ease(.396,.42,p) * (1-ease(.573,.60,p));
    show(result, rate);
    show(neighbors, groups);
    if (!reduced.matches) {
      result.style.transform = 'translateY(' + ((1-rate)*10).toFixed(1) + 'px)';
      neighbors.style.transform = 'translateY(' + ((1-groups)*10).toFixed(1) + 'px)';
    }
    const inArchive = p > .573;
    if (archiveRunning !== inArchive) {
      archiveRunning = inArchive;
      archive.setActive(inArchive);
    }
    historyHost.style.visibility = inArchive ? 'visible' : 'hidden';
    historyHost.setAttribute('aria-hidden', String(!inArchive));
    if (inArchive) archive.setProgress(p);
  }
  function resize() {
    locator.resize();
    archive.resize();
    render();
  }
  resize();
  return {
    setProgress(value) { progress = clamp(value); render(); },
    setActive(value) {
      active = value;
      if (active) render();
      else { archive.setActive(false); archiveRunning = false; }
    },
    resize,
    dispose() { locator.dispose(); archive.dispose(); mount.replaceChildren(); }
  };
}
