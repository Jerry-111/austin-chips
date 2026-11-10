import * as THREE from './vendor/three.module.min.js';
import {createSiliconAssets, createWafer, WAFER} from './silicon-model.js?v=9';

// Conceptual semiconductor package. Its geometry is a visual explanation,
// not a reproduction of a named chip or a claim about its manufacturing origin.
const clamp = THREE.MathUtils.clamp;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = THREE.MathUtils.lerp;

export function createChipScene(canvas) {
  if (!canvas) throw new Error('A canvas is required for the chip scene.');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (error) {
    canvas.dataset.webgl = 'unavailable';
    return { ready: false, error, setProgress() {}, setActive() {}, resize() {}, dispose() {} };
  }
  renderer.setClearColor(0x07090b, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x07090b, 0.026);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.025, 80);
  const assembly = new THREE.Group(); scene.add(assembly);
  const allocatedTextures = [];
  const studio = new THREE.Scene(); studio.background = new THREE.Color(0x10171b);
  function lightPanel(w, h, color, strength, position, rotation) {
    const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }); mat.color.multiplyScalar(strength);
    const obj = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); obj.position.set(...position); obj.rotation.set(...rotation); studio.add(obj);
  }
  lightPanel(11, 3.5, 0xe8f3f4, 3.5, [-3, 8, 0], [-Math.PI / 2, 0, 0]);
  lightPanel(1.8, 12, 0x58e7f6, 3.0, [-7, 2, -1], [0, Math.PI / 2, 0]);
  lightPanel(2.0, 10, 0xf2bc65, 2.7, [7, 1, 0], [0, -Math.PI / 2, 0]);
  lightPanel(8, 1.5, 0xd9e8ed, 2.2, [0, 4, -7], [0, 0, 0]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(studio, 0.035); scene.environment = env.texture;
  studio.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); pmrem.dispose();

  scene.add(new THREE.HemisphereLight(0xa4c3d5, 0x070709, 0.55));
  const key = new THREE.DirectionalLight(0xe2edf3, 3.3); key.position.set(-3, 8, 4); scene.add(key);
  const cyanRim = new THREE.DirectionalLight(0x46d9ef, 5.2); cyanRim.position.set(-5, 3, -3); scene.add(cyanRim);
  const goldRim = new THREE.DirectionalLight(0xffbf62, 2.8); goldRim.position.set(6, 2, 1); scene.add(goldRim);
  const lowFill = new THREE.DirectionalLight(0x7297c5, 1.4); lowFill.position.set(0, -3, 4); scene.add(lowFill);
  const dieLight = new THREE.PointLight(0x63dced, 2.2, 8, 2); dieLight.position.set(0, 3.0, -1.2); scene.add(dieLight);

  const mats = {
    ceramic: new THREE.MeshStandardMaterial({ color: 0x15191b, metalness: 0.48, roughness: 0.31 }),
    edge: new THREE.MeshStandardMaterial({ color: 0x354046, metalness: 0.88, roughness: 0.26 }),
    substrate: new THREE.MeshStandardMaterial({ color: 0x15221d, metalness: 0.58, roughness: 0.39 }),
    silver: new THREE.MeshStandardMaterial({ color: 0x96a3aa, metalness: 1, roughness: 0.23 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xc29b50, metalness: 0.88, roughness: 0.28 }),
    silicon: new THREE.MeshPhysicalMaterial({ color: 0x081117, metalness: 0.79, roughness: 0.19, clearcoat: 0.9, clearcoatRoughness: 0.18 }),
    memory: new THREE.MeshStandardMaterial({ color: 0x192b34, metalness: 0.8, roughness: 0.25 }),
    cyan: new THREE.MeshStandardMaterial({ color: 0x38a9bc, emissive: 0x1cc9ee, emissiveIntensity: 1.0, metalness: 0.4, roughness: 0.33 }),
  };

  function slab(w, h, d, material, radius = 0.045) {
    const r = Math.min(radius, w / 3, d / 3), s = new THREE.Shape();
    s.moveTo(-w / 2 + r, -d / 2); s.lineTo(w / 2 - r, -d / 2); s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
    s.lineTo(w / 2, d / 2 - r); s.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2); s.lineTo(-w / 2 + r, d / 2);
    s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r); s.lineTo(-w / 2, -d / 2 + r); s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
    const geo = new THREE.ExtrudeGeometry(s, { depth: h, steps: 1, bevelEnabled: true, bevelSize: Math.min(0.022, h / 4), bevelThickness: Math.min(0.022, h / 4), bevelSegments: 2, curveSegments: 3 });
    geo.rotateX(-Math.PI / 2); geo.translate(0, -h / 2, 0);
    return new THREE.Mesh(geo, material);
  }
  function box(parent, w, h, d, x, y, z, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  }
  function instanceGrid(parent, geometry, material, values) {
    const mesh = new THREE.InstancedMesh(geometry, material, values.length);
    const transform = new THREE.Object3D();
    values.forEach((v, i) => { transform.position.set(v[0], v[1], v[2]); transform.rotation.set(0, v[3] || 0, 0); transform.scale.set(1, 1, 1); transform.updateMatrix(); mesh.setMatrixAt(i, transform.matrix); });
    parent.add(mesh); return mesh;
  }


  const assets=createSiliconAssets(renderer);
  allocatedTextures.push(assets.dieTexture,assets.waferTexture);
  const base=new THREE.Group(),carrier=new THREE.Group(),middle=new THREE.Group(),frameGroup=new THREE.Group();
  assembly.add(base,carrier,middle,frameGroup);
  base.add(slab(4.85,.17,4.5,mats.substrate,.10));
  const underside=slab(4.67,.022,4.32,mats.ceramic,.08);underside.position.y=-.10;base.add(underside);
  // Modern packages connect below: a ball grid rather than decorative side pins.
  const balls=[];
  for(let x=0;x<26;x++)for(let z=0;z<24;z++)if(!(x>8&&x<17&&z>8&&z<15))balls.push([(x-12.5)*.166,-.145,(z-11.5)*.167]);
  instanceGrid(base,new THREE.SphereGeometry(.035,6,4),mats.gold,balls);
  for(let y=0;y<3;y++){
    box(base,4.7,.008,.008,0,-.055+y*.045,2.25,mats.gold);
    box(base,.008,.008,4.36,2.425,-.055+y*.045,0,mats.gold);
  }
  carrier.add(slab(4.64,.075,4.28,mats.substrate,.07));
  middle.add(slab(3.98,.045,3.25,mats.silicon,.04));
  const tracePoints=[];
  for(let side=0;side<4;side++)for(let i=0;i<42;i++){
    const angle=side*Math.PI/2,rot=(x,z)=>[Math.cos(angle)*x-Math.sin(angle)*z,.055,Math.sin(angle)*x+Math.cos(angle)*z];
    const n=(i-20.5)*.094,bend=1.45+(i%4)*.08;
    const a=rot(n,2.05),b=rot(n,bend),c=rot(n*.78,bend-.16),d=rot(n*.78,.8);
    tracePoints.push(...a,...b,...b,...c,...c,...d);
  }
  const traceGeo=new THREE.BufferGeometry();traceGeo.setAttribute('position',new THREE.Float32BufferAttribute(tracePoints,3));
  carrier.add(new THREE.LineSegments(traceGeo,new THREE.LineBasicMaterial({color:0xb8985f,transparent:true,opacity:.56})));
  const caps=[],contacts=[];
  for(let side=0;side<4;side++)for(let i=0;i<(side%2?24:18);i++){
    const n=(i-(side%2?11.5:8.5))*.16;
    const x=side<2?n:side===2?-2.16:2.16,z=side<2?side===0?-1.91:1.91:n,angle=side<2?0:Math.PI/2;
    // Small unequal gaps and banks are deliberate physical details, not debris.
    if((side===0&&i>5&&i<9)||(side===3&&i>13))continue;
    caps.push([x,.093,z,angle]);contacts.push([x,.098,z+.047,angle],[x,.098,z-.047,angle]);
  }
  instanceGrid(carrier,new THREE.BoxGeometry(.075,.055,.10),mats.ceramic,caps);
  instanceGrid(carrier,new THREE.BoxGeometry(.08,.056,.019),mats.silver,contacts);
  // Pin-one marker: one small gold triangle at a single corner.
  const markerShape=new THREE.Shape();markerShape.moveTo(0,0);markerShape.lineTo(.2,0);markerShape.lineTo(0,.2);markerShape.closePath();
  const marker=new THREE.Mesh(new THREE.ShapeGeometry(markerShape),mats.gold);marker.rotation.x=-Math.PI/2;marker.position.set(-2.22,.06,2.03);carrier.add(marker);
  function makeDie(){
    const g=new THREE.Group();g.add(slab(1.47,.095,1.82,mats.silicon,.012));
    const surface=new THREE.MeshBasicMaterial({map:assets.dieTexture});
    const plane=new THREE.Mesh(new THREE.PlaneGeometry(1.45,1.80),surface);plane.rotation.x=-Math.PI/2;plane.position.y=.073;g.add(plane);
    const dots=[];for(let x=0;x<13;x++)for(let z=0;z<16;z++)dots.push([(x-6)*.104,-.07,(z-7.5)*.105]);
    instanceGrid(g,new THREE.SphereGeometry(.013,4,3),mats.gold,dots);
    assembly.add(g);return g;
  }
  const die=makeDie(),twin=makeDie();
  const bridge=new THREE.Group();assembly.add(bridge);bridge.add(slab(.16,.035,1.63,mats.gold,.008));
  const memories=[];
  for(let bank=0;bank<2;bank++)for(let i=0;i<4;i++){
    const g=new THREE.Group();
    g.add(slab(.65,.09,.65,mats.ceramic,.015));
    for(let layer=0;layer<6;layer++){const m=slab(.59,.018,.59,layer%2?mats.memory:mats.silicon,.007);m.position.y=.065+layer*.026;g.add(m);}
    const cap=slab(.60,.018,.60,mats.edge,.012);cap.position.y=.23;g.add(cap);
    const seam=box(g,.004,.003,.54,0,.246,0,mats.gold);
    assembly.add(g);memories.push({g,x:bank===0?-1.78:1.78,z:(i-1.5)*.76,i,bank});
  }
  // A connected stiffener frame moves as one object, not four unrelated bars.
  for(const z of [-2.07,2.07]){const rail=slab(4.55,.11,.16,mats.silver,.025);rail.position.z=z;frameGroup.add(rail);}
  for(const x of [-2.20,2.20]){const rail=slab(.16,.11,4.02,mats.silver,.025);rail.position.x=x;frameGroup.add(rail);}
  const wafer=createWafer(assets,true);assembly.add(wafer.group);wafer.die.visible=false;
  const dustPositions=[];let seed=941;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<100;i++)dustPositions.push((random()-.5)*24,(random()-.5)*15,(random()-.5)*18);
  const dustGeo=new THREE.BufferGeometry();dustGeo.setAttribute('position',new THREE.Float32BufferAttribute(dustPositions,3));
  const dust=new THREE.Points(dustGeo,new THREE.PointsMaterial({color:0x6c9aa5,size:.012,transparent:true,opacity:.20,depthWrite:false}));scene.add(dust);
  let active=true,disposed=false,frame=0,lastTime=0,pTarget=0,pShown=0,aspect=1,mobile=false;
  const look=new THREE.Vector3(),orbitPosition=new THREE.Vector3(),dieWorld=new THREE.Vector3(),closePosition=new THREE.Vector3();
  const orbitLook=new THREE.Vector3(),finalCamera=new THREE.Vector3(),finalLook=new THREE.Vector3(0,.1,0);
  function applyProgress(progress,time=0){
    const p=progress;
    const explode=smooth(.12,.43,p),isolate=smooth(.43,.66,p),reveal=smooth(.66,.92,p);
    const pose=reduceMotion.matches?0:explode;
    assembly.position.set(lerp(mobile?.18:1.05,mobile?0:1.4,reveal),lerp(.22,.05,reveal),0);
    assembly.rotation.set(0,lerp(-.16+.13*pose,-.2,reveal),lerp(-.10-.055*pose,.08,reveal));
    base.position.set(-.48*pose-isolate*5,-1.24*pose-isolate*4,.35*pose);
    base.rotation.set(.12*pose,-.13*pose,-.09*pose);
    carrier.position.set(.15*pose+isolate*5,.16-.35*pose-isolate*2,-.18*pose);
    carrier.rotation.set(-.09*pose,.10*pose,.03*pose);
    middle.position.set(-.18*pose-isolate*4,.27+.25*pose-isolate*2.5,.16*pose);
    middle.rotation.y=-.05*pose;
    frameGroup.position.set(.28*pose+isolate*4,.39+2.7*pose+isolate*3,-.6*pose-isolate*2);
    frameGroup.rotation.set(-.20*pose,.12*pose,.18*pose);
    const dieScale=lerp(1,WAFER.dieW/1.47,reveal);
    die.position.set(lerp(-.77,WAFER.x,reveal),lerp(.43+1.22*pose,.70,reveal),lerp(-.10,WAFER.z,reveal));
    die.scale.setScalar(dieScale);die.rotation.set(0,0,0);
    twin.position.set(.77+.7*pose+isolate*5,.43+.9*pose+isolate*2,-.10-.55*pose-isolate*3);
    twin.rotation.set(-.06*pose,-.08*pose,.08*pose);
    bridge.position.set(.0,.38+.62*pose-isolate*3,-.1);bridge.rotation.y=.06*pose;
    memories.forEach(({g,x,z,i,bank})=>{
      const q=reduceMotion.matches?0:smooth(.18+(i%2)*.035+bank*.018,.49+(i%2)*.025,p);
      g.position.set(x*(1+.43*q)+(bank?1:-1)*isolate*5,.40+(.64+i*.23+(bank?.25:0))*q+isolate*(bank?3:-2),z*(1+.28*q)+(bank?-.3:.2)*q);
      g.rotation.set((bank?-.12:.09)*q,(bank?-.12:.14)*q,(bank?.10:-.08)*q);
      g.visible=isolate<.995;
    });
    [base,carrier,middle,frameGroup,twin,bridge].forEach(g=>g.visible=isolate<.995);
    wafer.group.visible=reveal>.001;wafer.opacity(smooth(.65,.80,p));wafer.die.visible=false;
    const cut=smooth(.76,.84,p)*(1-smooth(.94,1,p));wafer.cutLines.material.opacity=cut*.65;
    wafer.cutLines.geometry.setDrawRange(0,Math.floor(smooth(.76,.87,p)*4)*2);
    wafer.pointer.material.opacity=cut*.65;wafer.pointer.scale.y=.65;
    // One continuous camera: package portrait, exploded orbit, one die, its wafer.
    const angle=lerp(.65,-.42,pose),dist=lerp(8.5,10.8,pose)*(mobile?1.38:1);
    orbitPosition.set(Math.sin(angle)*dist,lerp(6.0,7.6,pose)*(mobile?1.2:1),Math.cos(angle)*dist);
    assembly.updateMatrixWorld(true);die.getWorldPosition(dieWorld);
    closePosition.copy(dieWorld).add(new THREE.Vector3(2.7,4.2,mobile?6.5:4.4));
    camera.position.copy(orbitPosition).lerp(closePosition,isolate);
    finalCamera.set(5.7,6.3,10.4);if(mobile)finalCamera.multiplyScalar(1.38);
    camera.position.lerp(finalCamera,reveal);
    orbitLook.set(0,.45+.3*pose,0);look.copy(orbitLook).lerp(dieWorld,isolate);look.lerp(finalLook,reveal);camera.lookAt(look);
    camera.fov=lerp(mobile?45:38,mobile?58:42,reveal);camera.updateProjectionMatrix();
    dust.material.opacity=.20*(1-isolate);if(!reduceMotion.matches)dust.rotation.y=Math.sin(time*.000045)*.08;
    scene.fog.density=lerp(.018,0,reveal);dieLight.intensity=2.2*(1-reveal);
    renderer.toneMappingExposure=lerp(1.12,1.1,reveal);
    canvas.dataset.beat=p<.12?'package':p<.43?'exploded':p<.66?'die':'wafer';
    renderer.render(scene,camera);
  }
  function tick(time) {
    frame = 0; if (!active || disposed) return;
    const dt = Math.min((time - (lastTime || time)) / 1000, 0.06); lastTime = time;
    const response = 1;
    pShown += (pTarget - pShown) * response;
    applyProgress(pShown, time);
    if (Math.abs(pShown - pTarget) > 0.0005) schedule();
  }
  function schedule() { if (!frame && active && !disposed) frame = requestAnimationFrame(tick); }
  function resize() {
    if (disposed) return;
    const rect = canvas.getBoundingClientRect(); const w = Math.max(1, rect.width || window.innerWidth), h = Math.max(1, rect.height || window.innerHeight);
    aspect = w / h; mobile = aspect < 0.9;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.7));
    renderer.setSize(w, h, false); camera.aspect = aspect; camera.updateProjectionMatrix();
    if (active) applyProgress(pShown); schedule();
  }
  function setProgress(p) { pTarget = clamp(Number(p) || 0, 0, 1); schedule(); }
  function setActive(value) {
    active = !!value; lastTime = 0;
    if (active) { pShown = pTarget; schedule(); }
    else if (frame) { cancelAnimationFrame(frame); frame = 0; }
  }
  const onMotion = () => { pShown = pTarget; schedule(); };
  reduceMotion.addEventListener('change', onMotion);
  const onLost = e => { e.preventDefault(); setActive(false); canvas.dataset.webgl = 'lost'; };
  canvas.addEventListener('webglcontextlost', onLost);
  function dispose() {
    if (disposed) return; disposed = true; active = false; if (frame) cancelAnimationFrame(frame);
    reduceMotion.removeEventListener('change', onMotion); canvas.removeEventListener('webglcontextlost', onLost);
    const geometries = new Set(), materials = new Set();
    scene.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)); });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); allocatedTextures.forEach(t => t.dispose()); env.dispose(); renderer.dispose();
  }
  canvas.dataset.webgl = 'ready'; resize(); applyProgress(0); schedule();
  return { ready: true, setProgress, setActive, resize, dispose, renderer, scene, camera };
}
