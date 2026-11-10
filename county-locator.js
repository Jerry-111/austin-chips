import {countyCamera, flightLens} from './county-camera.js?v=13';

const earthRadius = 6378137;
const austinLatitude = 30.2672 * Math.PI / 180;
const originNorthing = Math.asinh(Math.tan(austinLatitude));
const boundaryURL = new URL('./assets/geo/travis-county-2020.json', import.meta.url);

function smooth(start, end, value) {
  const t = Math.min(1, Math.max(0, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

// Ground points and the globe shader use Mercator metres relative to downtown.
function groundPoint(x, y) {
  const longitude = x / earthRadius;
  const latitude = Math.atan(Math.sinh(originNorthing + y / earthRadius));
  const cosLatitude = Math.cos(latitude);
  return [cosLatitude * Math.cos(longitude), cosLatitude * Math.sin(longitude), Math.sin(latitude)];
}

const campus = groundPoint(11662.609, 13686.795);
const downtown = groundPoint(0, 0);

// Project just the boundary and labels onto the same curved surface as the
// live flight. The aerial photography stays in the original WebGL canvas.
function projector(pose, width, height) {
  const latitude = Math.atan(Math.sinh(originNorthing + pose.y / earthRadius));
  const cosLat = Math.cos(latitude);
  const sinLat = Math.sin(latitude);
  const cosLon = Math.cos(pose.x / earthRadius);
  const sinLon = Math.sin(pose.x / earthRadius);
  const cosBank = Math.cos(pose.bank);
  const sinBank = Math.sin(pose.bank);
  const distance = 1 + pose.span * cosLat / (earthRadius * flightLens);
  const focalLength = Math.max(width, height) / flightLens;
  return ([x, y, z]) => {
    const equatorial = x * cosLon + y * sinLon;
    const east = -x * sinLon + y * cosLon;
    const north = z * cosLat - equatorial * sinLat;
    const up = z * sinLat + equatorial * cosLat;
    const scale = focalLength / (distance - up);
    return [
      width / 2 + (cosBank * east + sinBank * north) * scale,
      height / 2 + (sinBank * east - cosBank * north) * scale
    ];
  };
}

export function createCountyLocator(mount) {
  mount.classList.add('county-locator');
  mount.innerHTML = `<canvas role="img" aria-label="Travis County boundary, downtown Austin, and the Samsung Austin campus on the aerial photography."></canvas>
    <div class="county-locator-shade" aria-hidden="true"></div>
    <section class="county-locator-copy">
      <h2>Travis County</h2><p>Researchers studied four chip factories across 217 census tracts, small areas used to report neighborhood data.</p>
      <button type="button">View the study map ↗</button>
    </section>`;
  const canvas = mount.querySelector('canvas');
  const context = canvas.getContext('2d');
  const copy = mount.querySelector('.county-locator-copy');
  const shade = mount.querySelector('.county-locator-shade');
  const button = copy.querySelector('button');
  const abort = new AbortController();
  let width = 1, height = 1, pixelRatio = 1, progress = 0;
  let frame = 0, destroyed = false, labelsVisible = true, points = [];

  function askForFigure() {
    mount.dispatchEvent(new CustomEvent('open-study-map', {bubbles: true}));
  }
  button.addEventListener('click', askForFigure);

  function requestDraw() {
    if (!destroyed && !frame) frame = requestAnimationFrame(draw);
  }

  fetch(boundaryURL, {signal: abort.signal})
    .then(response => response.ok ? response.json() : null)
    .then(data => {
      if (destroyed || !Array.isArray(data?.ring)) return;
      points = data.ring.map(([x, y]) => groundPoint(x, y));
      requestDraw();
    })
    .catch(() => { /* The caption and source map remain available. */ });

  function drawPlace(label, [x, y], alpha, toRight) {
    if (!labelsVisible || alpha <= .001) return;
    if (x < 15 || x > width - 15 || y < 45 || y > height - 70) return;
    context.save();
    context.globalAlpha = alpha;
    context.fillStyle = '#ffdab0';
    context.strokeStyle = '#191d19';
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(x, y, 3.25, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.textBaseline = 'middle';
    context.textAlign = toRight ? 'left' : 'right';
    context.font = '500 ' + (width < 600 ? 12 : 14) + 'px DM, Arial, sans-serif';
    context.lineJoin = 'round';
    context.strokeStyle = 'rgba(12,18,15,.92)';
    context.lineWidth = 3;
    context.fillStyle = '#fff5dd';
    const labelX = x + (toRight ? 9 : -9);
    context.strokeText(label, labelX, y);
    context.fillText(label, labelX, y);
    context.restore();
  }

  function draw() {
    frame = 0;
    if (!context || destroyed || !width || !height) return;
    const project = projector(countyCamera(progress, width, height), width, height);
    const outlineAlpha = smooth(.42, .69, progress);
    const copyAlpha = smooth(.56, .74, progress) * Number(labelsVisible);
    copy.style.opacity = copyAlpha.toFixed(3);
    copy.inert = copyAlpha < .5;
    copy.setAttribute('aria-hidden', String(copyAlpha < .5));
    shade.style.opacity = (.92 * outlineAlpha).toFixed(3);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    if (points.length && outlineAlpha > .001) {
      const ring = new Path2D();
      ring.moveTo(...project(points[0]));
      for (let i = 1; i < points.length; i++) ring.lineTo(...project(points[i]));
      ring.closePath();
      const outside = new Path2D();
      outside.rect(0, 0, width, height);
      outside.addPath(ring);
      context.save();
      context.globalAlpha = outlineAlpha;
      context.fillStyle = 'rgba(10,18,17,.60)';
      context.fill(outside, 'evenodd');
      context.lineJoin = 'round';
      context.lineWidth = 4.3;
      context.strokeStyle = 'rgba(21,23,18,.85)';
      context.stroke(ring);
      context.lineWidth = 1.85;
      context.strokeStyle = '#f8daa6';
      context.stroke(ring);
      context.restore();
    }
    const campusAlpha = smooth(.12, .26, progress) * (1 - smooth(.52, .67, progress));
    drawPlace('Samsung Austin campus', project(campus), campusAlpha, false);
    drawPlace('Austin', project(downtown), smooth(.52, .68, progress), true);
  }

  function resize() {
    width = mount.clientWidth;
    height = mount.clientHeight;
    pixelRatio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    requestDraw();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(mount);
  resize();
  return {
    setProgress(next) { if (next !== progress) { progress = next; requestDraw(); } },
    setLabelsVisible(next) { if (next !== labelsVisible) { labelsVisible = next; requestDraw(); } },
    resize,
    dispose() {
      destroyed = true;
      abort.abort();
      cancelAnimationFrame(frame);
      observer.disconnect();
      button.removeEventListener('click', askForFigure);
    }
  };
}
