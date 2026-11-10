import { createBenchModel } from './workbench-model.js?v=14';

const report = 'https://download.semiconductor.samsung.com/resources/others/Samsung_Austin_Semiconductor_2024_Economic_Impact_Report_10149411000944.pdf#page=6';
const interview = 'https://spectrumlocalnews.com/tx/south-texas-el-paso/news/2022/07/28/workforce-organizations-helping-fill-key-roles-for-samsung-semiconductor-in-austin-and-taylor';
const course = 'https://skillpointalliance.org/job-training/austin-training/manufacturing/';
const clamp = value => Math.min(1, Math.max(0, value));
function ease(start, end, progress) {
  const t = clamp((progress - start) / (end - start));
  return t * t * (3 - 2 * t);
}
const appear = (p, enter, present, leave, gone) => ease(enter,present,p) * (1-ease(leave,gone,p));

export function createWorkbenchFilm(mount) {
  const film = document.createElement('div');
  film.className = 'wb-film';
  film.innerHTML = `
    <div class="wb-bench" role="img" aria-label="Illustration of a soldering iron and wire touching a component lead on a practice circuit board. As the joint forms, the iron lifts away."><canvas class="wb-canvas" aria-hidden="true"></canvas></div>
    <img class="wb-site" src="assets/samsung-austin-campus.jpg" alt="Historical aerial photograph of Samsung’s Austin campus." decoding="async">
    <div class="wb-scrim" aria-hidden="true"></div>
    <section class="wb-panel wb-jobs">
      <p class="wb-context">Samsung’s Austin campus · 2024</p>
      <div class="wb-number-reel"><div class="wb-first-total"><p class="wb-figure">4,907</p><h2>direct jobs at the factory</h2></div><div class="wb-last-total"><p class="wb-figure">16,198</p><h2>jobs supported in total</h2></div></div>
      <figure class="wb-breakdown" aria-label="4,907 direct jobs plus an estimated 11,291 indirect and induced jobs sum to 16,198 jobs supported.">
        <div class="wb-rule" aria-hidden="true"><i class="wb-direct-line"></i><i class="wb-supported-line"></i></div>
        <figcaption class="wb-scale-labels"><p>Direct jobs</p><p class="wb-secondary-label"><strong>+11,291</strong>Other jobs supported through suppliers and spending</p></figcaption>
      </figure>
      <a class="wb-source" href="${report}" target="_blank" rel="noopener noreferrer">Economic impact estimate · Impact DataSource, p. 6 ↗</a>
    </section>
    <section class="wb-panel wb-training">
      <p class="wb-context">Skillpoint Alliance · Austin</p>
      <h2>Training for<br>factory jobs</h2>
      <p class="wb-detail">Students practice soldering components to circuit boards. Samsung visited the program to meet potential hires.</p>
      <a class="wb-source" href="${course}" target="_blank" rel="noopener noreferrer">See the manufacturing course ↗</a>
    </section>
    <figure class="wb-panel wb-quote">
      <figcaption><strong>Scott Williams</strong><span>While training at Skillpoint, he hoped a tech job would help him pay off debt.</span></figcaption>
      <blockquote>“treading water, making minimum payments most of the time”</blockquote>
      <a class="wb-source" href="${interview}" target="_blank" rel="noopener noreferrer">Williams’s interview · Ortiz (2022) ↗</a>
    </figure>
    <section class="wb-panel wb-hiring">
      <p class="wb-context">Skillpoint’s production technician program</p>
      <strong>About 3 in 10</strong>
      <h2>graduates were hired by Samsung, on average, according to Skillpoint.</h2>
      <a class="wb-source" href="${interview}" target="_blank" rel="noopener noreferrer">Program interview · Ortiz (2022) ↗</a>
    </section>`;
  mount.replaceChildren(film);
  const $ = selector => film.querySelector(selector);
  const panels = ['.wb-jobs','.wb-training','.wb-quote','.wb-hiring'].map($);
  const photo = $('.wb-site'), bench = $('.wb-bench');
  const first = $('.wb-first-total'), total = $('.wb-last-total'), extra = $('.wb-secondary-label');
  const directRule = $('.wb-direct-line'), widerRule = $('.wb-supported-line');
  const directLabel = $('.wb-scale-labels p:first-child');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let model, attempted = false, active = false, disposed = false, frame = 0, idle = 0, progress = 0;
  let w = 0, h = 0;
  function prepare() {
    idle = 0;
    if (attempted || disposed || !active) return;
    attempted = true;
    try {
      model = createBenchModel($('.wb-canvas')); model.resize(w,h); model.draw(Math.max(.385,progress),reduced.matches);
    } catch {
      $('.wb-canvas').hidden = true;
    }
  }
  function opacity(element, value, interactive = false) {
    element.style.opacity = value.toFixed(3);
    element.setAttribute('aria-hidden', String(value < .1));
    if(interactive) { element.inert = value < .1; element.style.visibility = value <= .001 ? 'hidden':'visible'; }
  }
  function draw() {
    frame = 0;
    if (!active || disposed) return;
    const p = progress;
    const switchToBench = ease(.365,.43,p);
    opacity(photo,1-switchToBench); opacity(bench,switchToBench);
    photo.style.transform = reduced.matches ? 'none' : `scale(${(1.04+.16*ease(0,.43,p)).toFixed(4)}) translateX(${(-1.5*ease(.07,.4,p)).toFixed(3)}%)`;
    if (switchToBench > 0) {
      prepare(); model?.draw(p,reduced.matches);
    }
    opacity(first,1-ease(.198,.218,p)); opacity(total,ease(.22,.244,p));
    const labels = ease(.133,.176,p); opacity(extra,labels);
    directRule.style.transform = `scaleX(${reduced.matches ? 1 : ease(-.02,.084,p)})`;
    widerRule.style.transform = `scaleX(${reduced.matches ? Number(p > .15) : ease(.126,.232,p)})`;
    const label = p > .218 ? '4,907 direct' : 'Direct jobs';
    if (directLabel.textContent !== label) directLabel.textContent = label;
    const visibility = [1-ease(.35,.397,p), appear(p,.399,.445,.561,.583), appear(p,.602,.624,.723,.744), ease(.758,.791,p)];
    panels.forEach((panel,index) => {
      opacity(panel,visibility[index],true);
      panel.style.transform = reduced.matches ? 'none' : `translateY(${((1-visibility[index])*11).toFixed(2)}px)`;
    });
  }
  function requestDraw() { if(active && !frame && !disposed) frame = requestAnimationFrame(draw); }
  function resize() {
    const r = mount.getBoundingClientRect(); w=Math.round(r.width);h=Math.round(r.height);
    model?.resize(w,h);requestDraw();
  }
  const observer = new ResizeObserver(resize); observer.observe(mount); resize();
  reduced.addEventListener('change', requestDraw);
  return {
    setProgress(value) {const next=clamp(value);if(next!==progress){progress=next;requestDraw();}},
    setActive(value) {
      if(active===value||disposed)return;
      active=value;
      if(value){
        resize();requestDraw();
        if(!attempted && !idle && 'requestIdleCallback' in window)idle=window.requestIdleCallback(prepare,{timeout:650});
      } else if(frame) {cancelAnimationFrame(frame);frame=0;}
    },
    resize,
    dispose() {
      disposed=true;cancelAnimationFrame(frame);if(idle)window.cancelIdleCallback?.(idle);
      observer.disconnect();reduced.removeEventListener('change',requestDraw);model?.dispose();film.remove();
    }
  };
}
