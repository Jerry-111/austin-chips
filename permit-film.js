import * as THREE from './vendor/three.module.min.js';
import { createFlightPhotoLoader } from './flight-photo-loader.js?v=14';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const COLUMNS = 64;
const ROWS = 8;
const clamp = value => Math.min(1, Math.max(0, value));

function ease(from, to, value) {
  const t = clamp((value - from) / (to - from));
  return t * t * (3 - 2 * t);
}

// The source coordinates are PDF points, measured on TCEQ notice O4088.
const passages = [
  { page: 1, x: 263, y: 520, width: 172, height: 11, from: .19, to: .31 },
  { page: 3, x: 216, y: 498, width: 114, height: 11, from: .62, to: .72 },
  { page: 3, x: 294, y: 521, width: 120, height: 11, from: .77, to: .85 },
  { page: 3, x: 71, y: 532, width: 197, height: 11, from: .83, to: .92 }
];

export function createPermitFilm(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: true, powerPreference: 'low-power' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const stage = new THREE.Scene();
  stage.background = new THREE.Color(0x192326);
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 22000);
  const paperStack = new THREE.Group();
  stage.add(paperStack);
  const paperGeometry = new THREE.PlaneGeometry(PAGE_WIDTH, PAGE_HEIGHT, COLUMNS, ROWS);
  const noticeGeometry = new THREE.PlaneGeometry(PAGE_WIDTH, PAGE_HEIGHT);
  const resources = [];
  const photographs = createFlightPhotoLoader(true, new URL('./assets/permit/', import.meta.url));
  const scans = [];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let active = false, disposed = false, frame = 0, progress = 0, width = 1, height = 1;

  function requestPaint() {
    if (active && !frame && !disposed) frame = requestAnimationFrame(paint);
  }
  function sheetTexture(number, reverse = false) {
    const texture = new THREE.Texture();
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    if (reverse) { texture.repeat.x = -1; texture.offset.x = 1; }
    resources.push(texture);
    photographs.load('notice-' + number + '.jpg').then(scan => {
      if (disposed) { scan.close?.(); return; }
      scans.push(scan);
      texture.image = scan;
      texture.flipY = scan instanceof HTMLImageElement;
      texture.needsUpdate = true;
      requestPaint();
    }).catch(() => { /* The essay panel also contains the participation section. */ });
    return texture;
  }
  function sheetMaterial(number, side, reverse = false) {
    const material = new THREE.MeshStandardMaterial({
      map: sheetTexture(number, reverse), color: 0xece7da, side, roughness: .96
    });
    resources.push(material);
    return material;
  }
  const firstPage = new THREE.Mesh(paperGeometry, sheetMaterial(1, THREE.FrontSide));
  const reversePage = new THREE.Mesh(paperGeometry, sheetMaterial(2, THREE.BackSide, true));
  const noticePage = new THREE.Mesh(noticeGeometry, sheetMaterial(3, THREE.FrontSide));
  noticePage.receiveShadow = true;
  firstPage.castShadow = true;
  paperStack.add(noticePage, firstPage, reversePage);
  const paperEdges = new THREE.MeshStandardMaterial({color: 0xcac2ae, roughness: 1});
  resources.push(paperEdges);
  for (let i = 1; i <= 3; i++) {
    const edge = new THREE.Mesh(noticeGeometry, paperEdges);
    edge.position.set(i * 1.5, -2.3 * i, -i * 1.2);
    edge.rotation.z = i * .0025;
    edge.castShadow = true;
    paperStack.add(edge);
  }

  const deskMaterial = new THREE.MeshStandardMaterial({color: 0x263031, roughness: 1});
  const deskMesh = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000), deskMaterial);
  // Keep the desk in the document's reference plane. Tilting the paper alone
  // sent its upper corners through the table and cut a dark diagonal across the text.
  deskMesh.position.z = -5.5;
  deskMesh.receiveShadow = true;
  paperStack.add(deskMesh);
  stage.add(new THREE.HemisphereLight(0xfff9e7, 0xbac8cf, 1.9));
  const keyLight = new THREE.DirectionalLight(0xffedcc, 1.5);
  keyLight.position.set(-450, 650, 900);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  Object.assign(keyLight.shadow.camera, { left: -1000, right: 1000, top: 900, bottom: -900, far: 3000 });
  keyLight.shadow.normalBias = .8;
  keyLight.shadow.bias = -.0004;
  stage.add(keyLight);

  const strips = passages.map(spec => {
    const material = new THREE.MeshBasicMaterial({color: 0xf0bc3e, transparent: true, opacity: .44, depthWrite: false});
    const geometry = new THREE.PlaneGeometry(1, 1).translate(.5, -.5, 0);
    const strip = new THREE.Mesh(geometry, material);
    strip.position.set(spec.x - PAGE_WIDTH/2, PAGE_HEIGHT/2 - spec.y, spec.page === 1 ? 3.3 : .9);
    paperStack.add(strip);
    resources.push(material, geometry);
    return strip;
  });

  // Bend the sheet along its length, preserving each strip's physical width.
  // Its edge lifts before its spine moves. The back carries the actual second page.
  function turnSheet(fraction) {
    const positions = paperGeometry.attributes.position;
    for (let row = 0; row <= ROWS; row++) {
      const normalizedY = row / ROWS;
      let x = -PAGE_WIDTH / 2;
      let z = 2.4;
      for (let col = 0; col <= COLUMNS; col++) {
        positions.setXYZ(row * (COLUMNS + 1) + col, x, PAGE_HEIGHT * (.5 - normalizedY), z);
        const u = (col + .5) / COLUMNS;
        const curl = (.56 * (u - .28) + .12 * (normalizedY - .5)) * Math.sin(Math.PI * fraction);
        const angle = Math.PI * clamp(fraction + curl);
        x += PAGE_WIDTH / COLUMNS * Math.cos(angle);
        z += PAGE_WIDTH / COLUMNS * Math.sin(angle);
      }
    }
    positions.needsUpdate = true;
    paperGeometry.computeVertexNormals();
  }

  // Source focus (PDF x/y), frame position, magnification, and table rotation.
  // The date, submission deadline, and response clause are three real locations on two pages.
  const shots = [
    [0,   300, 320, .69, .49, 1.05, -.13],
    [.12, 300, 330, .67, .49, 1.16, -.115],
    [.28, 350, 526, .59, .38, 2.95, -.032],
    [.36, 350, 526, .59, .38, 3.03, -.022],
    [.448, 280, 396, .52, .48, 1.0, -.045],
    [.525, 196, 396, .51, .48, 1.0, -.035],
    [.62,    0, 396, .50, .48, 1.0, -.025],
    [.65,    0, 396, .50, .48, 1.0, -.025],
    [.745, 280, 504, .57, .37, 2.90, -.022],
    [.84, 350, 526, .59, .37, 2.96, -.011],
    [1,   350, 528, .59, .37, 3.03, -.006]
  ];
  const focus = new THREE.Vector3();
  const view = new Float32Array(6);
  function paint() {
    frame = 0;
    if (disposed) return;
    const p = progress;
    let index = 1;
    while (index < shots.length - 1 && p > shots[index][0]) index++;
    const previous = shots[index - 1], next = shots[index];
    const t = ease(previous[0], next[0], p);
    for (let j = 0; j < view.length; j++) view[j] = THREE.MathUtils.lerp(previous[j+1], next[j+1], t);
    const [sourceX, sourceY, screenX, screenY, zoom, tilt] = view;
    const turn = reduced.matches ? Number(p >= .53) : ease(.455, .62, p);
    turnSheet(turn);
    passages.forEach((s,i) => {
      const fraction = ease(s.from, s.to, p);
      strips[i].visible = fraction > .001 && (s.page === 1 ? turn < .0001 : turn > .97);
      strips[i].scale.set(s.width * fraction, s.height, 1);
    });
    const portrait = width / height < .9;
    paperStack.rotation.set(reduced.matches ? 0 : -.10, reduced.matches ? 0 : .042, reduced.matches ? 0 : tilt);
    paperStack.updateMatrixWorld(true);
    const base = Math.min(width / 700, height / 875);
    const magnification = reduced.matches ? Math.min(2, zoom) : zoom;
    // During the turn, leave room for the opened spread and the arcing leaf.
    // The move into the next passage begins after the paper rests on the desk.
    const spreadScale = Math.min(width / (2 * PAGE_WIDTH + 120), height / (PAGE_HEIGHT * 1.45 + 120));
    const opening = ease(.36, .448, p) * (1 - ease(.65, .745, p));
    const scale = THREE.MathUtils.lerp(base * magnification, spreadScale, opening);
    focus.set(sourceX - PAGE_WIDTH/2, PAGE_HEIGHT/2 - sourceY, 0);
    paperStack.localToWorld(focus);
    const anchorX = portrait ? .51 : screenX;
    const anchorY = portrait ? THREE.MathUtils.lerp(Math.min(screenY, .35), .48, opening) : screenY;
    const distance = height / (2 * scale * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    camera.position.set(focus.x - (anchorX - .5) * width / scale, focus.y + (anchorY - .5) * height / scale, distance + focus.z);
    camera.lookAt(camera.position.x, camera.position.y, 0);
    renderer.render(stage, camera);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.65));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    requestPaint();
  }
  resize();
  return {
    setProgress(value) { progress = clamp(value); requestPaint(); },
    setActive(value) {
      active = value;
      if (value) requestPaint();
      else { cancelAnimationFrame(frame); frame = 0; }
    },
    resize,
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      photographs.dispose();
      paperGeometry.dispose(); noticeGeometry.dispose();
      deskMaterial.dispose(); deskMesh.geometry.dispose();
      resources.forEach(resource => resource.dispose());
      scans.forEach(scan => scan.close?.());
      keyLight.shadow.dispose();
      renderer.dispose();
    }
  };
}
