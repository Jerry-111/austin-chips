// A single geographic camera and a nested stack of registered USGS orthoimages.
// Orbit, descent, and the final move past the factory fence all use the same projection.
import * as THREE from './vendor/three.module.min.js';
import { createFlightPhotoLoader } from './flight-photo-loader.js?v=14';
import { earthFile, imagery } from './flight-layers.js?v=13';
import { countyCamera, flightLens } from './county-camera.js?v=13';

const RADIUS = 6378137;
const RADIANS = Math.PI / 180;
const AUSTIN = [-97.7431, 30.2672];
const mercatorNorthing = lat => RADIUS * Math.asinh(Math.tan(lat * RADIANS));
const originY = mercatorNorthing(AUSTIN[1]);
const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
function smooth(a, b, x) {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

function offset(lon, lat) {
  return [(lon - AUSTIN[0]) * RADIANS * RADIUS, mercatorNorthing(lat) - originY];
}

// p, projected field width (metres along the long edge), centre east/north of
// downtown Austin, camera bearing. The last camera move goes west into housing
// visible in the USDA photograph; these coordinates do not encode health data.
const stops = [
  [0,     24500000, ...offset(-60, 18),  -13],
  [.10,   16900000, ...offset(-78, 24),   -8],
  [.20,    6000000, ...offset(-94, 29),   -3],
  [.29,    1600000, ...offset(-97.75, 30.24), 0],
  [.38,     280000, 0, 0, 1],
  [.47,      78000, 0, 0, 2],
  [.54,      35500, 1200, 1500, 3],
  [.62,      15700, 6300, 7300, 4],
  [.70,       6100, 10400, 12000, 3],
  [.765,      2450, 11660, 13580, 1],
  [.811,      1940, 11635, 13685, 0],
  [.854,      1840, 11405, 13720, -.5],
  [.924,      1775, 10560, 13700, -.9],
  [1,         1760, 10065, 13645, -.8]
].map(([p, span, x, y, bank]) => [p, Math.log(span), x, y, bank]);

// Shape-preserving Hermite curves give every stop a shared arrival/departure
// velocity. Scale is interpolated logarithmically so speed feels consistent.
function tangent(index, column) {
  if (index === 0 || index === stops.length - 1) return 0;
  const a = stops[index - 1], b = stops[index], c = stops[index + 1];
  const before = (b[column] - a[column]) / (b[0] - a[0]);
  const after = (c[column] - b[column]) / (c[0] - b[0]);
  if (before * after <= 0) return 0;
  return 2 / (1 / before + 1 / after);
}

function cameraAt(p) {
  let i = 0;
  while (i < stops.length - 2 && p > stops[i + 1][0]) i++;
  const a = stops[i], b = stops[i + 1], duration = b[0] - a[0];
  const t = clamp((p - a[0]) / duration);
  const u = 1 - t;
  function interpolate(column) {
    return (1 + 2 * t) * u * u * a[column] + t * u * u * duration * tangent(i, column)
      + t * t * (3 - 2 * t) * b[column] - t * t * u * duration * tangent(i + 1, column);
  }
  return {span: Math.exp(interpolate(1)), x: interpolate(2), y: interpolate(3), bank: interpolate(4) * RADIANS};
}

// Six addressable insets accommodate the overlapping campus and neighborhood
// footprints. The coarsest opaque photograph underneath them stays bound.
const earthPreviewFile = 'flight13/earth-preview.webp';
const district = imagery.find(layer => layer.file.endsWith('/industrial-district.webp'));
const districtPreview = {...district, file: 'flight13/industrial-preview.webp', pixels:480};
const flightImages = imagery.slice();
// In a cold street-level jump this thumbnail goes in ahead of full photographs.
// Place it beneath photographs with better ground resolution.
const nextFiner = flightImages.findIndex(layer => layer.span / layer.pixels < districtPreview.span / districtPreview.pixels);
flightImages.splice(nextFiner, 0, districtPreview);
const imageBytes = new Map(flightImages.map(layer => [layer.file, 4 * layer.pixels ** 2]));
imageBytes.set(earthFile, 4096 * 2048 * 4);
imageBytes.set(earthPreviewFile, 768 * 384 * 4);
const samplerCount = 6;
const samplerNames = Array.from({length:samplerCount}, (_, index) => 'detail' + index);

const vertexShader = `
  varying vec2 screenUV;
  void main() {
    screenUV = position.xy;
    gl_Position = vec4(position.xy, 0., 1.);
  }`;

// Ray/sphere intersection expressed in a camera-centred east/north/up basis.
// c/(d+sqrt(discriminant)) avoids cancellation close to the ground. The small-
// argument branch for Mercator latitude keeps street imagery stable below 1 km.
const fragmentShader = `
  precision highp float;
  varying vec2 screenUV;
  uniform sampler2D earthMap, overviewMap;
  ${samplerNames.map(name => 'uniform sampler2D ' + name + '; uniform vec4 ' + name + 'Bounds;').join('\n  ')}
  uniform vec2 viewportRatio, compositionOffset, rotation, sineCosineLatitude;
  uniform float longitude, altitude, lens, earthReady, atmosphere, travel;

  const float PI = 3.14159265359;
  const float EARTH_RADIUS = 6378137.;
  float logLatitudeDelta(float x) {
    if (abs(x) < .05) return x * (1. + x*x*(.33333333 + .2*x*x));
    x = clamp(x, -.999999, .999999);
    return .5 * log((1.+x)/(1.-x));
  }

  float speck(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  vec3 photograph(vec3 previous, sampler2D imageMap, vec4 bounds, vec2 metres) {
    if (bounds.w <= 0.) return previous;
    vec2 uv = (metres + bounds.xy) * bounds.z + .5;
    vec2 edge = min(uv, 1. - uv);
    float inside = smoothstep(0., .072, min(edge.x, edge.y));
    vec3 sampleColor = texture2D(imageMap, clamp(uv, 0., 1.)).rgb;
    return mix(previous, sampleColor, bounds.w * inside);
  }

  void main() {
    vec2 ray = (screenUV - compositionOffset) * viewportRatio * lens * .5;
    ray = mat2(rotation.x, rotation.y, -rotation.y, rotation.x) * ray;
    float distanceFromCentre = 1. + altitude;
    float c = altitude * (2. + altitude);
    float disc = 1. - dot(ray, ray) * c;
    vec2 grid = (screenUV * viewportRatio + vec2(.08,-.02)*travel) * 380.;
    float stars = step(.998, speck(floor(grid))) * (1.-smoothstep(.05, .48, length(fract(grid)-.5)));
    vec3 space = vec3(.0008, .0018, .0035) + stars * vec3(.25,.31,.37);
    space += atmosphere * vec3(.016,.070,.16) * exp(min(disc, 0.) * 22.);
    if (disc < 0.) {
      gl_FragColor = vec4(space, 1.);
    } else {
      float depth = c / (distanceFromCentre + sqrt(disc));
      vec2 en = depth * ray;
      float up = distanceFromCentre - depth;
      float cosLat = sineCosineLatitude.y;
      float sinLat = sineCosineLatitude.x;
      float deltaLongitude = atan(en.x, cosLat * up - sinLat * en.y);
      float changeInSine = en.y * cosLat - sinLat * dot(en,en) / max(1.+up,.001);
      float newSine = clamp(sinLat + changeInSine, -1., 1.);
      vec2 earthUV = vec2(fract(.5 + (longitude + deltaLongitude)/(2.*PI)), .5 + asin(newSine)/PI);
      vec3 earth = mix(texture2D(overviewMap, earthUV).rgb, texture2D(earthMap, earthUV).rgb, earthReady);
      vec3 normal = vec3(en, up);
      float key = max(dot(normal, normalize(vec3(-.62, .48, .77))), 0.);
      float light = mix(1., .24 + .94*key, atmosphere);
      vec3 color = earth;
      vec2 projectedMetres = EARTH_RADIUS * vec2(deltaLongitude, logLatitudeDelta(changeInSine / max(cosLat*cosLat - sinLat*changeInSine, .000001)));
      ${samplerNames.map(name => 'color = photograph(color, ' + name + ', ' + name + 'Bounds, projectedMetres);').join('\n      ')}
      color *= light;
      float rim = pow(1.-sqrt(disc), 3.);
      color += rim * atmosphere * vec3(.025,.12,.29);
      color *= 1. - .085*smoothstep(.42,1.35,length(screenUV*vec2(.9,1.)));
      gl_FragColor = vec4(color,1.);
    }
    #include <colorspace_fragment>
  }`;

function viewAt(progress, width, height) {
  return progress <= 1 ? cameraAt(progress) : countyCamera(progress - 1, width, height);
}

// Start filtering a photograph into the middle of the frame while its pixels
// are still smaller than screen pixels. Its own geographic border feathers
// per pixel; the entire frame never has to wait for the image to fill it.
function visibleLayers(view, width, height) {
  const longest = Math.max(width, height);
  const cosine = Math.abs(Math.cos(view.bank));
  const sine = Math.abs(Math.sin(view.bank));
  const halfWidth = view.span * (width * cosine + height * sine) / (2 * longest);
  const halfHeight = view.span * (height * cosine + width * sine) / (2 * longest);
  const layers = [];
  for (const layer of flightImages) {
    const weight = smooth(.38, .80, layer.span / view.span);
    if (weight === 0) continue;
    const dx = Math.abs(view.x - layer.x), dy = Math.abs(view.y - layer.y);
    const radius = layer.span / 2;
    if (dx >= radius + halfWidth || dy >= radius + halfHeight) continue;
    // Leave room for the feather and for perspective curvature near the horizon.
    const safeInterior = radius * .81;
    const covers = view.span < 3000000 && weight === 1 &&
      dx + halfWidth < safeInterior && dy + halfHeight < safeInterior;
    layers.push({layer, weight, covers});
  }
  return layers;
}

function drawStack(candidates) {
  const base = candidates.findLastIndex(item => item.covers && item.weight === 1);
  const stack = candidates.slice(Math.max(0, base));
  if (stack.length <= samplerCount) return stack;
  // Preserve the background in the few views where multiple partial footprints
  // overlap. It fills the edges outside the five most detailed photographs.
  return [stack[0], ...stack.slice(1 - samplerCount)];
}

function photoCache(onReady, release, forWebGL) {
  const loader = createFlightPhotoLoader(forWebGL);
  const assets = new Map();
  let wanted = [], pending = 0, stopped = false, serial = 0;
  const workingSet = matchMedia('(max-width:700px)').matches ? 8 : 10;
  const cpuLimit = matchMedia('(max-width:700px)').matches ? 180e6 : 270e6;

  function trim() {
    const decoded = [...assets.values()].filter(item => item.image);
    let bytes = decoded.reduce((total, item) => total + item.bytes, 0);
    const protectedFiles = new Set(wanted);
    const removable = decoded.filter(item => !protectedFiles.has(item.file))
      .sort((a, b) => a.used - b.used);
    let count = decoded.length;
    for (const item of removable) {
      if (count <= workingSet && bytes <= cpuLimit) break;
      assets.delete(item.file);
      release(item);
      item.image.close?.();
      count--;
      bytes -= item.bytes;
    }
  }

  function pump() {
    if (stopped) return;
    for (const file of wanted) {
      if (pending >= 3) break;
      if (assets.has(file)) continue;
      const item = {file, image:null, texture:null, readyAt:0, bytes:0, used:++serial};
      assets.set(file, item);
      pending++;
      loader.load(file).then(image => {
        if (stopped) { image.close?.(); return; }
        item.image = image;
        item.bytes = image.width * image.height * 4;
        item.readyAt = performance.now();
        onReady();
      }).catch(() => { /* The coarser photograph remains available. */ })
        .finally(() => { pending--; pump(); });
    }
    trim();
  }

  return {
    want(visible, speculative = []) {
      // Every queued request has a residency slot. In particular, a held
      // camera cannot evict and reload a speculative image indefinitely.
      const selected = new Set(visible);
      let reserved = [...selected].reduce((sum, file) => sum + imageBytes.get(file), 0);
      for (const file of speculative) {
        if (selected.has(file)) continue;
        if (selected.size >= workingSet || reserved + imageBytes.get(file) > cpuLimit) continue;
        selected.add(file);
        reserved += imageBytes.get(file);
      }
      wanted = [...selected];
      pump();
    },
    get(file) { return assets.get(file); },
    touch(item) { item.used = ++serial; },
    dispose() {
      stopped = true;
      loader.dispose();
      for (const item of assets.values()) {
        release(item);
        item.image?.close?.();
      }
      assets.clear();
    }
  };
}

function flightController(canvas, draw, release, size, cleanup, forWebGL = false) {
  let width = 1, height = 1, progress = 0, direction = 1;
  let active = false, queued = 0, destroyed = false;
  function invalidate() {
    if (active && !destroyed && !queued) queued = requestAnimationFrame(paint);
  }
  const cache = photoCache(invalidate, release, forWebGL);

  function paint(now) {
    queued = 0;
    if (!active || destroyed) return;
    const view = viewAt(progress, width, height);
    const candidates = visibleLayers(view, width, height);
    const needed = drawStack(candidates);
    const seesDistrict = candidates.some(item => item.layer === districtPreview);
    const seesWorld = view.span >= 3000000 || !needed.length;
    const requested = [earthPreviewFile];
    if (seesDistrict) requested.push(districtPreview.file);
    if (seesWorld) requested.push(earthFile);
    for (const item of needed) requested.push(item.layer.file);
    const speculative = [];
    // Warm the next scales before moving into them. Also keep the previous
    // scale available for a quick change of scroll direction.
    for (const step of [.045, .11, -.045]) {
      const ahead = clamp(progress + direction * step, 0, 2);
      const stack = drawStack(visibleLayers(viewAt(ahead, width, height), width, height));
      for (const item of stack) speculative.push(item.layer.file);
    }
    const ready = [];
    let stillFading = false;
    for (const candidate of candidates) {
      const asset = cache.get(candidate.layer.file);
      if (!asset?.image) continue;
      const age = smooth(0, 180, now - asset.readyAt);
      stillFading ||= age < 1;
      ready.push({...candidate, asset, weight: candidate.weight * age});
    }
    const stack = drawStack(ready);
    for (const item of stack) cache.touch(item.asset);
    // A resident parent remains available while a child is downloading.
    cache.want([...requested, ...stack.map(item => item.layer.file)], speculative);
    const overview = cache.get(earthPreviewFile);
    const root = cache.get(earthFile);
    const rootBlend = root?.image ? smooth(0, 220, now - root.readyAt) : 0;
    draw(view, progress, overview, root, rootBlend, stack, width, height);
    if (stillFading || (root?.image && rootBlend < 1)) invalidate();
  }

  function resize() {
    const newWidth = Math.max(1, Math.round(canvas.clientWidth || innerWidth));
    const newHeight = Math.max(1, Math.round(canvas.clientHeight || innerHeight));
    if (width === newWidth && height === newHeight) return;
    width = newWidth;
    height = newHeight;
    size(width, height);
    invalidate();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  cache.want([earthPreviewFile]);
  return {
    setProgress(value) {
      const next = clamp(Number(value) || 0, 0, 2);
      if (next === progress) return;
      direction = Math.sign(next - progress);
      progress = next;
      invalidate();
    },
    setActive(value) {
      active = Boolean(value);
      if (active) invalidate();
      else { cancelAnimationFrame(queued); queued = 0; }
    },
    resize,
    dispose() {
      destroyed = true;
      observer.disconnect();
      cancelAnimationFrame(queued);
      cache.dispose();
      cleanup();
    }
  };
}

// A flat photographic flight for browsers without WebGL. Both legs use this
// one canvas and camera. Paint the world atlas in Mercator latitude bands so
// its coastlines line up with the regional photographs as they come into view.
function aerialFallback(canvas) {
  const photo = document.createElement('canvas');
  photo.setAttribute('aria-hidden', 'true');
  canvas.after(photo);
  const context = photo.getContext('2d');
  const resolution = Math.min(devicePixelRatio || 1, 1.5);
  const world = 2 * Math.PI * RADIUS;
  const left = -world / 2 - AUSTIN[0] * RADIANS * RADIUS;
  function draw(view, progress, overview, root, rootBlend, stack, width, height) {
    context.setTransform(resolution, 0, 0, resolution, 0, 0);
    context.clearRect(0, 0, width, height);
    context.translate(width / 2, height / 2);
    context.rotate(view.bank);
    const scale = Math.max(width, height) / view.span;
    context.scale(scale, scale);
    context.translate(-view.x, view.y);
    for (const [snapshot, alpha] of [[overview, 1], [root, rootBlend]]) {
      if (!snapshot?.image || !alpha) continue;
      const image = snapshot.image;
      context.globalAlpha = alpha;
      for (let lat = -82; lat < 82; lat += 2) {
        const north = originY - mercatorNorthing(lat + 2);
        const south = originY - mercatorNorthing(lat);
        context.drawImage(image, 0, (88 - lat) / 180 * image.height, image.width, image.height / 90,
          left, north, world, south - north);
      }
    }
    for (const {layer, weight, asset} of stack) {
      context.globalAlpha = weight;
      context.drawImage(asset.image, layer.x - layer.span / 2, -layer.y - layer.span / 2, layer.span, layer.span);
    }
    context.globalAlpha = 1;
  }
  return flightController(canvas, draw, () => {}, (w, h) => {
    photo.width = Math.round(w * resolution);
    photo.height = Math.round(h * resolution);
  }, () => photo.remove());
}

export function createGlobeScene(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({canvas, antialias:false, alpha:false, powerPreference:'high-performance'});
  } catch {
    return aerialFallback(canvas);
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const empty = new THREE.DataTexture(new Uint8Array([0,0,0,255]), 1, 1);
  empty.needsUpdate = true;
  const uniforms = {
    earthMap:{value:empty}, overviewMap:{value:empty}, earthReady:{value:0},
    viewportRatio:{value:new THREE.Vector2(1,1)}, compositionOffset:{value:new THREE.Vector2()},
    rotation:{value:new THREE.Vector2(1,0)}, sineCosineLatitude:{value:new THREE.Vector2()},
    lens:{value:flightLens}, altitude:{value:1}, longitude:{value:0}, atmosphere:{value:1}, travel:{value:0}
  };
  for (const name of samplerNames) {
    uniforms[name] = {value:empty};
    uniforms[name + 'Bounds'] = {value:new THREE.Vector4()};
  }
  const material = new THREE.ShaderMaterial({vertexShader, fragmentShader, uniforms, depthWrite:false,
    depthTest:false, toneMapped:false});
  const geometry = new THREE.PlaneGeometry(2, 2);
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  scene.add(new THREE.Mesh(geometry, material));
  const gpuAssets = new Set();
  function texture(asset) {
    if (!asset.texture) {
      const map = new THREE.Texture(asset.image);
      map.colorSpace = THREE.SRGBColorSpace;
      map.minFilter = THREE.LinearMipmapLinearFilter;
      map.magFilter = THREE.LinearFilter;
      // Worker and in-page bitmap paths prepare their vertical orientation
      // before upload. Native HTML images still use WebGL's ordinary flip.
      map.flipY = asset.image instanceof HTMLImageElement;
      map.needsUpdate = true;
      asset.texture = map;
      gpuAssets.add(asset);
    }
    return asset.texture;
  }
  function release(asset) {
    asset.texture?.dispose();
    asset.texture = null;
    gpuAssets.delete(asset);
  }
  function draw(view, progress, overview, root, rootBlend, stack, width, height) {
    const latitude = Math.atan(Math.sinh((originY + view.y) / RADIUS));
    uniforms.sineCosineLatitude.value.set(Math.sin(latitude), Math.cos(latitude));
    uniforms.longitude.value = AUSTIN[0] * RADIANS + view.x / RADIUS;
    uniforms.altitude.value = view.span * Math.cos(latitude) / (RADIUS * flightLens);
    const compose = 1 - smooth(.12, .29, progress);
    uniforms.compositionOffset.value.set(.12 * compose, .06 * compose);
    uniforms.rotation.value.set(Math.cos(view.bank), Math.sin(view.bank));
    uniforms.atmosphere.value = 1 - smooth(.18, .35, progress);
    uniforms.travel.value = Math.min(progress, 1);
    uniforms.earthMap.value = root?.image ? texture(root) : empty;
    uniforms.overviewMap.value = overview?.image ? texture(overview) : empty;
    uniforms.earthReady.value = rootBlend;
    const longest = Math.max(width, height);
    uniforms.viewportRatio.value.set(width / longest, height / longest);
    for (const [i, name] of samplerNames.entries()) {
      const item = stack[i];
      const bounds = uniforms[name + 'Bounds'].value;
      if (item) {
        const {layer, weight, asset} = item;
        uniforms[name].value = texture(asset);
        bounds.set(view.x - layer.x, view.y - layer.y, 1 / layer.span, weight);
      } else {
        uniforms[name].value = empty;
        bounds.set(0, 0, 1, 0);
      }
    }
    renderer.render(scene, camera);
    // Keep decoded photographs for scrubbing. Retire older GPU textures before
    // memory from a long zoom can accumulate on high-DPI phones.
    const pinned = new Set([overview, root, ...stack.map(item => item.asset)]);
    const removable = [...gpuAssets].filter(item => !pinned.has(item)).sort((a, b) => a.used - b.used);
    const budget = width < 700 ? 148e6 : 220e6;
    let bytes = [...gpuAssets].reduce((n, item) => n + item.bytes * 4 / 3, 0);
    for (const item of removable) {
      if (bytes <= budget) break;
      release(item);
      bytes -= item.bytes * 4 / 3;
    }
  }
  function size(width, height) {
    // The aerials supply about two megapixels of detail in a typical crop.
    // Use a constant budget through the shot, including when the camera stops.
    const ratio = Math.min(devicePixelRatio || 1, 2, Math.sqrt(2400000 / (width * height)));
    renderer.setDrawingBufferSize(width, height, ratio);
  }
  return flightController(canvas, draw, release, size, () => {
    empty.dispose();
    geometry.dispose();
    material.dispose();
    renderer.dispose();
  }, true);
}
