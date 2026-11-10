// A City Plan for Austin, Texas (1928), Plate 13 and printed page 57.
const asset = file => new URL('./assets/' + file, import.meta.url).href;
const clamp = value => Math.min(1, Math.max(0, value));
const mix = (start, end, amount) => start + (end - start) * amount;
function ease(value, start, end) {
  const fraction = clamp((value - start) / (end - start));
  return fraction * fraction * (3 - 2 * fraction);
}

// The historical plate curls around a moving cylinder. A narrow set of source-image
// strips retains the original scan, and the unprinted reverse appears around the fold.
function drawPageTurn(ctx, plate, width, height, t) {
  if (t === 0) {
    ctx.drawImage(plate, 0, 0, width, height);
    return;
  }
  if (t >= 1) return;
  const radius = width * .10;
  const seam = mix(width, -width * .8, t);
  const projected = x => {
    const distance = x - seam;
    if (distance <= 0) return {x, z: 0, angle: 0};
    const angle = Math.min(Math.PI, distance / radius);
    return {x: seam + radius * Math.sin(angle) - Math.max(0, distance - Math.PI * radius), z: radius * (1 - Math.cos(angle)), angle};
  };
  const shade = ctx.createLinearGradient(seam + radius * .2, 0, seam + radius * 1.65, 0);
  shade.addColorStop(0, 'rgba(38,27,18,0.29)');
  shade.addColorStop(1, 'rgba(38,27,18,0)');
  ctx.fillStyle = shade;
  ctx.fillRect(Math.max(0, seam + radius * .20), 0, Math.max(0, seam + radius * 1.65 - Math.max(0, seam + radius * .2)), height);
  const strips = 88;
  const step = width / strips;
  const firstFold = Math.max(0, Math.min(strips, Math.floor(seam / step)));
  const endFold = Math.max(firstFold, Math.min(strips, Math.ceil((seam + Math.PI * radius) / step)));
  // Only the curved portion needs individual strips. The flat front and
  // fully turned back each have one continuous transform.
  if (firstFold) {
    ctx.drawImage(plate, 0, 0, firstFold * plate.naturalWidth / strips, plate.naturalHeight,
      0, 0, firstFold * step + .65, height);
  }
  for (let i = firstFold; i < endFold; i++) {
    const a = projected(i * width / strips);
    const b = projected((i + 1) * width / strips);
    const x = Math.min(a.x, b.x);
    const stripWidth = Math.max(.5, Math.abs(b.x - a.x) + .65);
    const lift = a.z * .23;
    const stripHeight = height + lift * .8;
    if (a.angle < Math.PI / 2) {
      ctx.drawImage(plate, i * plate.naturalWidth / strips, 0, plate.naturalWidth / strips + .55, plate.naturalHeight, x, -lift, stripWidth, stripHeight);
      if (a.angle > 0) {
        ctx.fillStyle = `rgba(54,40,19,${Math.sin(a.angle) * .16})`;
        ctx.fillRect(x, -lift, stripWidth, stripHeight);
      }
    } else {
      const tone = Math.round(225 + 23 * -Math.cos(a.angle));
      ctx.fillStyle = `rgb(${tone},${tone - 3},${tone - 11})`;
      ctx.fillRect(x, -lift, stripWidth, stripHeight);
    }
  }
  if (endFold < strips) {
    const left = projected(width).x;
    const right = projected(endFold * step).x;
    const lift = 2 * radius * .23;
    ctx.fillStyle = 'rgb(248,245,237)';
    ctx.fillRect(left, -lift, right - left + .65, height + lift * .8);
  }
}

function drawPaperEdges(ctx, width, height) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = Math.max(8, width * .04);
  ctx.shadowOffsetX = width * .01;
  ctx.shadowOffsetY = width * .028;
  ctx.fillStyle = '#8b8778';
  ctx.fillRect(1, 3, width + 2, height + 2);
  ctx.restore();
  ctx.fillStyle = '#d1ccbd';
  ctx.fillRect(1, 1, width + 1, height + 2);
}


// Word bounds in the original 2556 × 3298 scan. The intent clause wraps:
// “as an incentive to draw ...” is on one line; its destination is on the next.
const passages = [
  { left: 1098, right: 1985, top: 1990, bottom: 2035, start: .848, end: .895 },
  { left: 1325, right: 2161, top: 2091, bottom: 2138, start: .897, end: .947 },
  { left: 419, right: 1024, top: 2190, bottom: 2241, start: .948, end: .985 }
];

function markPassages(ctx, pageWidth, pageHeight, progress) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  passages.forEach((line, index) => {
    const traced = ease(progress, line.start, line.end);
    if (!traced) return;
    // De-emphasize the policy instrument as the camera reaches its purpose.
    const alpha = index === 0 ? mix(.52, .28, ease(progress, .897, .935)) : .59;
    const x = line.left / 2556 * pageWidth;
    const y = line.top / 3298 * pageHeight;
    const inkWidth = (line.right - line.left) / 2556 * pageWidth * traced;
    const inkHeight = (line.bottom - line.top) / 3298 * pageHeight;
    ctx.fillStyle = `rgba(230,177,75,${alpha})`;
    ctx.beginPath();
    ctx.moveTo(x, y + inkHeight * .04);
    ctx.lineTo(x + inkWidth, y);
    ctx.lineTo(x + inkWidth, y + inkHeight);
    ctx.lineTo(x, y + inkHeight * .95);
    ctx.closePath();
    ctx.fill();
  });
  ctx.restore();
}

export function createArchiveFilm(mount) {
  mount.classList.add('af-archive');
  mount.innerHTML = `
    <canvas class="af-page" role="img" aria-label="Plate 13 from Austin’s 1928 city plan turns to page 57. Two highlights show the services the planners proposed and their intention to draw Black residents into one district."></canvas>
    <div class="af-legibility" aria-hidden="true"></div>
    <div class="af-caption af-plate">
      <p class="af-citation">A City Plan for Austin, Texas · Plate 13</p>
      <h2>Austin’s 1928 city plan</h2>
      <p>This map shows existing and proposed schools and playgrounds. The plan also set out where the city should provide public services.</p>
    </div>
    <div class="af-caption af-policy">
      <p class="af-citation">Austin’s 1928 city plan · p. 57</p>
      <h2>A plan for segregation</h2>
      <p>Planners proposed concentrating services for Black residents in one East Austin district to draw them there.</p>
    </div>`;
  const canvas = mount.querySelector('canvas');
  const plateCaption = mount.querySelector('.af-plate');
  const policyCaption = mount.querySelector('.af-policy');
  const ctx = canvas.getContext('2d', {alpha: true});
  const plate = new Image();
  const page = new Image();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let width = 0, height = 0, scale = 1, position = 0, active = false;
  let previousPaperPose;

  function paintArchive(p) {
    if (!ctx || !plate.naturalWidth || !page.naturalWidth) return;
    if (p >= .68 && p <= .749) p = .68;
    if (p >= .985) p = .985;
    if (p === previousPaperPose) return;
    previousPaperPose = p;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const mobile = width <= 760;
    const focus = ease(p, .816, .933);
    const arrival = ease(p, .575, .68);
    const turn = ease(p, .749, .841);
    const paperTurn = reduced.matches ? Number(p > .795) : turn;
    const paperWidth = mobile ? Math.min(width * .82, height * .355) : Math.min(width * .50, height * .74);
    const macroWidth = mobile ? Math.min(width * 2.38, 1200) : Math.min(width * 1.20, 1960);
    const readIntent = ease(p, .887, .946);
    const readNextLine = ease(p, .945, .984);
    // Keep the ink legible on phones by following the line break in reading order.
    // On wide frames the completed clause fits on screen in one view.
    const w = mix(paperWidth, macroWidth, focus);
    const h = w * page.naturalHeight / page.naturalWidth;
    const firstFocusX = .603;
    const intentFocusX = mobile ? mix(.672, .29, readNextLine) : .512;
    const aimX = mix(firstFocusX, intentFocusX, readIntent);
    const aimY = mix(.611, .651, readIntent);
    const cx = width * mix(mobile ? .48 : .716, .50, readIntent);
    const cy = height * mix(mobile ? .34 : .465, mobile ? .36 : .385, readIntent);
    const x = cx - w * mix(.5, aimX, focus);
    const y = cy - h * mix(.5, aimY, focus);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(reduced.matches ? 0 : (-.099 + .068 * arrival + .031 * focus));
    const entry = reduced.matches ? 0 : (1 - arrival) * width * .24;
    ctx.translate(x - cx + entry, y - cy);
    drawPaperEdges(ctx, w, h);
    if (paperTurn > 0) {
      ctx.drawImage(page, 0, 0, w, h);
      markPassages(ctx, w, h, p);
    }
    drawPageTurn(ctx, plate, w, h, paperTurn);
    ctx.restore();
  }

  function caption(element, alpha) {
    element.style.opacity = alpha.toFixed(4);
    element.style.visibility = alpha < .001 ? 'hidden' : 'visible';
    element.setAttribute('aria-hidden', String(alpha < .15));
    element.style.transform = reduced.matches ? 'none' : `translateY(${(1 - alpha) * 9}px)`;
  }
  function render() {
    if (!active || !width || !height) return;
    const p = position;
    const alpha = ease(p, .575, .657);
    mount.style.opacity = alpha.toFixed(4);
    mount.style.visibility = alpha > .001 ? 'visible' : 'hidden';
    mount.setAttribute('aria-hidden', String(alpha < .1));
    if (alpha <= .001) return;
    paintArchive(p);
    caption(plateCaption, ease(p, .61, .628) * (1 - ease(p, .789, .809)));
    caption(policyCaption, ease(p, .819, .851));
    mount.style.setProperty('--af-focus', ease(p, .812, .879).toFixed(4));
  }
  function resize() {
    const w = mount.clientWidth, h = mount.clientHeight, dpr = Math.min(devicePixelRatio || 1, 1.8);
    if (w === width && h === height && dpr === scale) return;
    width = w; height = h; scale = dpr;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    previousPaperPose = undefined;
    render();
  }

  function invalidatePaper() { previousPaperPose = undefined; render(); }
  plate.onload = page.onload = invalidatePaper;
  plate.src = asset('austin-1928-schools-map.jpg');
  page.src = asset('austin-1928-p57-scan.png');
  reduced.addEventListener('change', invalidatePaper);
  resize();
  return {
    setProgress(next) {
      const value = clamp(next);
      if (value === position) return;
      position = value;
      render();
    },
    setActive(next) {
      if (active === next) return;
      active = next;
      if (active) render();
    },
    resize,
    dispose() {
      plate.onload = page.onload = null;
      reduced.removeEventListener('change', invalidatePaper);
      mount.replaceChildren();
    }
  };
}
