import {createChipScene} from './chip-scene.js?v=9';
import {createMaterialScene} from './material-scene.js?v=9';
import {createGlobeScene} from './globe-scene.js?v=14';
import {createHealthFilm} from './health-film.js?v=14';
import {createWorkbenchFilm} from './workbench-film.js?v=14';
import {createPermitFilm} from './permit-film.js?v=14';
import {connectReadingPanel} from './reading-panel.js?v=14';
import {countyProgress} from './county-camera.js?v=13';

const byId = id => document.getElementById(id);
const clamp = value => Math.min(1, Math.max(0, value));
const span = (value, start, end) => clamp((value - start) / (end - start));
const mix = (a,b,t) => a + (b-a)*t;
function ease(start, end, value) {
  const u = span(value, start, end);
  return u * u * (3 - 2 * u);
}
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
history.scrollRestoration = 'manual';

const shots = [
  ['intro',0,.027,.006], ['package',.028,.068,.006], ['die',.069,.093,.004],
  ['wafer',.094,.116,.004], ['energy',.116,.139,.004], ['gases',.139,.166,.004],
  ['growth',.166,.209,.005], ['tpu',.209,.249,.006], ['earth',.249,.29,.007],
  ['austin',.304,.350,.009], ['campus',.367,.391,.004], ['residential',.395,.420,.006],
  ['notice-title',.811,.836,.005], ['notice-window',.837,.868,.006],
  ['notice-reply',.909,.939,.006], ['conclusion',.953,1,.013]
].map(([name,start,end,edge]) => ({
  element: document.querySelector('[data-overlay="' + name + '"]'), start, end, edge, lastAlpha: -1
}));

const chapters = [
  // Stable links, title, start of the chapter, landing frame, essay section.
  ['introduction','The chip',0,0,'introduction'],
  ['manufacturing','Manufacturing',.116,.127,'manufacturing'],
  ['austin','Austin, Texas',.249,.330,'introduction'],
  ['health','Pollution and health',.417,.475,'health'],
  ['equity','Unequal exposure',.492,.512,'health'],
  ['jobs','Economic opportunity',.622,.650,'jobs'],
  ['training','Training and hiring',.699,.722,'jobs'],
  ['participation','Public comments on the permit',.811,.832,'participation'],
  ['conclusion','What Austin shows',.943,.985,'conclusion']
].map(([id,name,start,land,reading]) => ({id,name,start,land,reading}));
function readingAt(progress, chapter) {
  if (progress >= .028 && progress < .249) return 'manufacturing';
  if (progress >= .395 && progress < .622) return 'health';
  return chapter.reading;
}
const links = Object.fromEntries(chapters.map(chapter => [chapter.id,chapter.land]));
Object.assign(links, {
  start:0, chip:0, package:.046, die:.079, wafer:.104, climate:.127, gases:.152, growth:.183,
  tpu:.23, earth:.267, campus:.377, neighborhood:.405, map:.455, exposure:.512, insurance:.520,
  plan:.554, history:.615, papers:.891, direct:.644, total:.683, solder:.718, testimony:.751, interview:.751, hiring:.788,
  voice:.832, permit:.832, window:.853, response:.925, question:.985, questions:.985
});

function scene(name,factory,mount) {
  const host = byId('scene-'+name);
  host.inert = true;
  host.setAttribute('aria-hidden','true');
  return {name,factory,host,mount:byId(mount ?? 'scene-'+name),model:null,attempted:false,active:false,lastOpacity:-1,lastProgress:-1};
}
const scenes = {
  chip: scene('chip', createChipScene, 'chip-canvas'),
  material: scene('material', createMaterialScene, 'material-canvas'),
  globe: scene('globe', createGlobeScene, 'globe-canvas'),
  health: scene('health', createHealthFilm),
  workbench: scene('workbench', createWorkbenchFilm),
  permit: scene('permit', createPermitFilm, 'permit-canvas')
};

function prepare(item) {
  if (item.attempted) return;
  item.attempted = true;
  try {
    item.model = item.factory(item.mount);
    if (item.model.ready !== false) document.documentElement.classList.add(item.name + '-ready');
    item.model.setActive(false);
  } catch (error) {
    console.warn('Could not initialize scene: ' + item.name, error);
  }
}

function display(item, opacity, progress) {
  const visible = opacity > .001 && !document.hidden;
  if (visible) prepare(item);
  if (visible !== item.active) {
    item.host.classList.toggle('active',visible);
    item.host.inert = !visible;
    item.host.setAttribute('aria-hidden',String(!visible));
    item.active = visible;
    if (visible) item.model?.setProgress(progress);
    item.model?.setActive(visible);
  }
  if (Math.abs(opacity-item.lastOpacity) > .0005) {
    item.host.style.opacity = opacity.toFixed(4);
    item.lastOpacity = opacity;
  }
  if (visible && Math.abs(progress-item.lastProgress) > .00001) {
    item.model?.setProgress(progress);
    item.lastProgress = progress;
  }
}

const nav = document.querySelector('.chapter-nav');
const navButtons = chapters.map(chapter => {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', chapter.name);
  const dot = document.createElement('i');
  dot.setAttribute('aria-hidden','true');
  const label = document.createElement('span');
  label.textContent = chapter.name;
  button.append(dot,label);
  button.addEventListener('click',() => jump(chapter.land, chapter.id));
  nav.append(button);
  return button;
});
const scrollCue = byId('scroll-cue'), replay = byId('replay');
const filmProgress = byId('film-progress-fill');
let current = 0, target = 0, maxScroll = 1, chapterIndex = -1;
let playing = false, frame = 0, lastTime = 0, lastPaint = -1;
const duration = 210;

// Prepare the next set while the current shot is still on screen. On fast
// chapter jumps the visible set always takes priority over an idle warm-up.
const warmups = [[.12, scenes.material], [.247, scenes.globe], [.413, scenes.health],
                 [.622, scenes.workbench], [.808, scenes.permit], [.928, scenes.chip]];
let queuedSet = null;
function warmNextSet(p) {
  if (queuedSet || document.hidden) return;
  const next = warmups.find(([at, item]) => at > p && at-p < .075 && !item.attempted);
  if (!next) return;
  const [at,item] = next;
  queuedSet = item;
  const warm = () => {
    queuedSet = null;
    if (item.attempted || current > at || at-current > .1 || document.hidden) return;
    prepare(item);
    if (!item.model || item.active) return;
    item.model.setProgress(0);
    item.model.setActive(true);
    requestAnimationFrame(() => { if (!item.active) item.model.setActive(false); });
  };
  if ('requestIdleCallback' in window) requestIdleCallback(warm,{timeout:700});
  else setTimeout(warm,60);
}

function drawTitles(p) {
  for (const shot of shots) {
    const enter = shot.start === 0 ? 1 : ease(shot.start, shot.start+shot.edge, p);
    const leave = shot.end === 1 ? 1 : 1-ease(shot.end-shot.edge, shot.end, p);
    const alpha = enter * leave;
    if (alpha === 0 && shot.lastAlpha === 0) continue;
    if (alpha !== shot.lastAlpha) {
      shot.element.style.opacity = alpha.toFixed(4);
      shot.element.classList.toggle('active',alpha > .005);
      shot.element.setAttribute('aria-hidden',String(alpha < .12));
      shot.element.inert = alpha < .12;
      shot.lastAlpha = alpha;
    }
    const y = reduced.matches ? 0 : (1-alpha)*12 - span(p,shot.start,shot.end)*6;
    shot.element.style.transform = 'translate3d(0,' + y.toFixed(2) + 'px,0)';
  }
}
function render(p) {
  const coda = p >= .928;
  const chipAlpha = coda ? ease(.928,.941,p) : Number(p < .125);
  const chipPose = coda ? .315*(1-ease(.934,.975,p)) : span(p,0,.120);
  display(scenes.chip,chipAlpha,chipPose);
  scenes.chip.host.style.setProperty('--coda-shade', ease(.943,.978,p).toFixed(3));

  let waferProgress = .59 + .41*span(p,.166,.208);
  if (p < .139) waferProgress = .27*span(p,.125,.139);
  else if (p < .166) waferProgress = .27 + .32*span(p,.139,.166);
  display(scenes.material, ease(.120,.125,p)*(1-ease(.248,.257,p)), waferProgress);
  if (p > .119 && p < .258) scenes.material.host.style.setProperty('--shade',ease(.128,.15,p).toFixed(3));
  // Stay over the final street corner as the lens changes direction. The only
  // new layer at this boundary is the county line, drawn over the same Earth.
  const healthProgress = span(p, .416, .610);
  const pullback = countyProgress(healthProgress);
  const flightProgress = span(p, .247, .416) + pullback;
  const endOfCounty = 1 - ease(.622, .624, p);
  display(scenes.globe, ease(.247, .256, p) * endOfCounty, flightProgress);
  if (scenes.globe.active) {
    const titleShade = 1 - ease(.42, .69, pullback);
    scenes.globe.host.style.setProperty('--flight-title-shade', titleShade.toFixed(3));
  }
  display(scenes.health, ease(.416, .420, p) * endOfCounty, healthProgress);
  display(scenes.workbench,ease(.622,.624,p)*(1-ease(.808,.820,p)),span(p,.622,.811));
  display(scenes.permit,ease(.808,.820,p)*(1-ease(.933,.947,p)),span(p,.810,.941));
  drawTitles(p);
  warmNextSet(p);

  const selected = chapters.findLastIndex(chapter => p >= chapter.start);
  if (selected !== chapterIndex) {
    navButtons[chapterIndex]?.removeAttribute('aria-current');
    navButtons[selected].setAttribute('aria-current','step');
    const chapter = chapters[selected];
    document.body.dataset.chapter = chapter.id;
    chapterIndex = selected;
  }
  filmProgress.style.transform = 'scaleX(' + p.toFixed(5) + ')';
  scrollCue.hidden = p > .982;
  replay.hidden = !scrollCue.hidden;
}

function measure() {
  maxScroll = Math.max(1, document.documentElement.scrollHeight-innerHeight);
  for (const item of Object.values(scenes)) item.model?.resize();
}
function schedule() {
  if (!frame && !document.hidden) frame = requestAnimationFrame(tick);
}
function tick(time) {
  frame = 0;
  if (dialog.open) return;
  const dt = Math.min(.08, (time-(lastTime || time-16.7))/1000);
  lastTime = time;
  if (playing) {
    target = clamp(target+dt/duration);
    scrollTo(0,target*maxScroll);
    if (target >= 1) setPlay(false);
  } else target = clamp(scrollY/maxScroll);
  current = reduced.matches ? target : mix(current,target,1-Math.exp(-dt*15));
  if (Math.abs(current-target)<.000035) current = target;
  if (Math.abs(current-lastPaint)>.000008) { render(current); lastPaint=current; }
  if (playing || current!==target) schedule();
  else lastTime=0;
}
function setPlay(value) {
  playing = value && !reduced.matches;
  if (playing && target > .993) { current=target=0; scrollTo(0,0); }
  byId('play-toggle').setAttribute('aria-label',playing?'Pause automatic preview':'Play automatic preview');
  byId('play-label').textContent=playing?'Pause':'Play';
  byId('play-icon').textContent=playing?'Ⅱ':'▷';
  lastTime=0;
  schedule();
}
const shutter = byId('edit-shutter');
let cutAnimation, cutNumber = 0;
function cancelCut() {
  cutNumber++;
  cutAnimation?.cancel();
  cutAnimation = null;
}
async function jump(value, hash) {
  setPlay(false);
  cancelCut();
  const cut = cutNumber;
  const distance = Math.abs(value-current);
  // A distant chapter change is a cut. Flying over every intermediate chapter
  // would force several renderers to start up and flash past in under a second.
  if (!reduced.matches && distance > .04) {
    cutAnimation = shutter.animate([{opacity:0},{opacity:1}], {duration:135, fill:'forwards', easing:'ease-in'});
    try { await cutAnimation.finished; } catch { return; }
  }
  if (cut !== cutNumber) return;
  if (hash) history.replaceState(null,'','#'+hash);
  scrollTo({top:value*maxScroll,behavior:'instant'});
  current = target = clamp(scrollY/maxScroll);
  render(current);
  lastPaint = current;
  if (cutAnimation) {
    cutAnimation.cancel();
    cutAnimation = shutter.animate([{opacity:1},{opacity:1,offset:.18},{opacity:0}], {duration:280,easing:'ease-out'});
  }
  schedule();
}
const dialog = connectReadingPanel({
  getSectionId: () => readingAt(current, chapters[Math.max(0,chapterIndex)]),
  pause: () => setPlay(false),
  restore: y => { measure(); scrollTo(0,y); lastPaint=-1; schedule(); }
});
byId('restart-link').addEventListener('click',event => { event.preventDefault(); jump(0,'start'); });
replay.addEventListener('click',() => jump(0,'start'));
byId('play-toggle').addEventListener('click',() => setPlay(!playing));
window.addEventListener('scroll',schedule,{passive:true});
function pauseOnInput() { cancelCut(); if (playing) setPlay(false); }
window.addEventListener('wheel',pauseOnInput,{passive:true});
window.addEventListener('touchstart',pauseOnInput,{passive:true});
window.addEventListener('keydown',event => {
  if (dialog.open || event.target.closest('button,a,input,textarea,select')) return;
  if (event.code==='Space') { event.preventDefault(); setPlay(!playing); }
  if (event.code==='ArrowRight' || event.code==='ArrowLeft') {
    event.preventDefault();
    const step = event.code==='ArrowRight' ? 1 : -1;
    const chapter = chapters[Math.max(0,Math.min(chapters.length-1,chapterIndex+step))];
    jump(chapter.land,chapter.id);
  }
});
window.addEventListener('resize',() => {
  const at = clamp(scrollY/maxScroll);
  measure();
  if (!dialog.open) scrollTo(0, at*maxScroll);
  lastPaint=-1; schedule();
});
window.addEventListener('hashchange',() => {
  const value = links[location.hash.slice(1)];
  if (value!==undefined) jump(value);
});
reduced.addEventListener('change',() => { setPlay(false); lastPaint=-1; schedule(); });
document.addEventListener('visibilitychange',() => {
  if (document.hidden) {
    setPlay(false);
    for (const item of Object.values(scenes)) {
      if (item.active) item.model?.setActive(false);
    }
  } else {
    for (const item of Object.values(scenes)) {
      if (item.active) item.model?.setActive(true);
    }
    lastPaint=-1; lastTime=0; schedule();
  }
});
window.addEventListener('pagehide',event => {
  for (const item of Object.values(scenes)) {
    item.model?.setActive(false);
    if (!event.persisted) item.model?.dispose();
  }
});
window.addEventListener('pageshow',event => {
  if (!event.persisted) return;
  measure();
  for (const item of Object.values(scenes)) if (item.active) item.model?.setActive(true);
  lastPaint=-1; schedule();
});

measure();
current = target = links[location.hash.slice(1)] ?? 0;
scrollTo(0,current*maxScroll);
render(current);
lastPaint=current;
schedule();
