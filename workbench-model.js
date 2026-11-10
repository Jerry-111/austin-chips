import * as THREE from './vendor/three.module.min.js';

const width = 4.5;
const depth = 3;
const boardTop = .31;
const joint = new THREE.Vector3(.72, boardTop + .018, .47);
const up = new THREE.Vector3(0, 1, 0);
const ramp = (a, b, p) => THREE.MathUtils.smoothstep(p, a, b);

function canvasMap(w, h, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  paint(canvas.getContext('2d'), w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// These three static textures are lossless exports of this model's
// board artwork, bench mat and prefiltered studio lighting. Static light
// convolution and procedural grain do not need to run on the viewer's GPU.
const benchAsset = name => new URL('./assets/bench/' + name, import.meta.url).href;

async function loadStudio(signal) {
  const response = await fetch(benchAsset('studio.rgba16.gz'), {signal});
  if (!response.ok) throw new Error('Studio lighting could not be loaded.');
  const input = await response.arrayBuffer();
  const bytes = new Uint8Array(input);
  const data = bytes[0] === 31 && bytes[1] === 139
    ? await new Response(new Blob([input]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
    : input;
  if (data.byteLength !== 768 * 1024 * 8) throw new Error('Incomplete studio lighting.');
  const texture = new THREE.DataTexture(new Uint16Array(data), 768, 1024, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.mapping = THREE.CubeUVReflectionMapping;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function lightBench(scene, environment) {
  scene.environment = environment;
  scene.add(new THREE.HemisphereLight(0xbdd4d7,0x122329,.78));
  const key = new THREE.DirectionalLight(0xffe7c3, 3.28); key.position.set(-3,6,4);key.castShadow=true;
  Object.assign(key.shadow.camera,{left:-5,right:5,top:4,bottom:-4,near:.5,far:18});key.shadow.mapSize.set(1024,1024);key.shadow.normalBias=.009;scene.add(key);
  const fill = new THREE.DirectionalLight(0x9bd9ea, 2.55); fill.position.set(4,3,-5);scene.add(fill);
}

function buildBench(canvas, environment, boardArt, matArt) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:false, powerPreference:'high-performance'});
  renderer.setClearColor(0x101a1a); renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.02;
  renderer.shadowMap.enabled=true; renderer.shadowMap.autoUpdate=false; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.fog=new THREE.FogExp2(0x172221,.035);
  const camera = new THREE.PerspectiveCamera(38,1,.02,70);
  lightBench(scene, environment);
  const standard=(color,metalness=0,roughness=.5)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
  const bronze=standard(0xc7aa63,.78,.31), silver=standard(0xc5c9c6,.94,.23), graphite=standard(0x222926,.43,.39);
  const ic=standard(0x303232,.2,.52), ceramic=standard(0xa98762,.12,.5),black=standard(0x111615,.04,.78), brass=standard(0xc5a66c,.8,.28);
  const toolsTeal=standard(0x304f51,.3,.42), hotCopper=standard(0xb27c4d,.82,.34);
  boardArt.colorSpace = matArt.colorSpace = THREE.SRGBColorSpace;
  boardArt.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);
  matArt.wrapS=matArt.wrapT=THREE.RepeatWrapping; matArt.repeat.set(16,16);matArt.anisotropy=4;
  function put(parent, geo, mat, x, y, z) {
    const mesh=new THREE.Mesh(geo,mat);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  function box(group,w,h,d,x,y,z,mat){return put(group,new THREE.BoxGeometry(w,h,d),mat,x,y,z);}
  function cyl(group,rt,rb,h,x,y,z,mat,segments=40){return put(group,new THREE.CylinderGeometry(rt,rb,h,segments),mat,x,y,z);}
  function cable(points,radius,material,parent=scene){const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));return put(parent,new THREE.TubeGeometry(curve,48,radius,8,false),material,0,0,0);}
  const floor=put(scene,new THREE.PlaneGeometry(50,50),new THREE.MeshStandardMaterial({map:matArt,roughness:.9}),0,-.025,0);floor.rotation.x=-Math.PI/2;floor.castShadow=false;
  const pcb=new THREE.Group();scene.add(pcb);
  const boardSide=standard(0x676543,.14,.62);box(pcb,width,.085,depth,0,boardTop-.044,0,boardSide);
  const surface=put(pcb,new THREE.PlaneGeometry(width,depth),new THREE.MeshStandardMaterial({map:boardArt,metalness:.27,roughness:.43,bumpMap:boardArt,bumpScale:.009}),0,boardTop,0);surface.rotation.x=-Math.PI/2;
  for(const x of [-1.98,1.98])for(const z of [-1.25,1.25]){
    cyl(pcb,.115,.115,.23,x,.11,z,brass,6);cyl(pcb,.114,.12,.026,x,boardTop+.013,z,silver);
    box(pcb,.13,.006,.017,x,boardTop+.029,z,black).rotation.y=.2;
  }
  // Molded IC package with plated gull-wing leads. Adjacent rows are discrete passives.
  box(pcb,.71,.126,.75,-1.02,boardTop+.093,-.35,ic);
  const icPrint=canvasMap(256,256,(ctx,w,h)=>{
    ctx.clearRect(0,0,w,h);ctx.fillStyle='#90958a';ctx.font='22px monospace';
    ctx.fillText('SOIC–18',35,104);ctx.fillText('TEST BOARD',35,135);
    ctx.fillStyle='#777c72';ctx.beginPath();ctx.arc(25,228,6,0,Math.PI*2);ctx.fill();
  });
  const icTop=put(pcb,new THREE.PlaneGeometry(.7,.74),new THREE.MeshBasicMaterial({map:icPrint,transparent:true,depthWrite:false}),-1.02,boardTop+.158,-.35);icTop.rotation.x=-Math.PI/2;icTop.castShadow=false;
  for(let i=0;i<9;i++) for(const side of [-1,1]) {
    const z=-.658+i*.079;
    box(pcb,.12,.026,.038,-1.02+side*.396,boardTop+.06,z,silver);
    box(pcb,.055,.022,.049,-1.02+side*.459,boardTop+.019,z,silver);
  }
  for(let i=0;i<15;i++){
    const x=(i%5)*.235-.44, z=Math.floor(i/5)*.22-.77;
    box(pcb,.116,.057,.06,x,boardTop+.031,z,i%3?ceramic:graphite);
    for(const side of [-1,1])box(pcb,.027,.061,.067,x+side*.066,boardTop+.032,z,silver);
  }
  for(let i=0;i<7;i++){
    const x=-1.91+i*.19;
    box(pcb,.165,.105,.14,x,boardTop+.055,1.17,graphite);box(pcb,.051,.29,.052,x,boardTop+.2,1.17,brass);
  }
  for(const [x,z] of [[.72,.47],[.72,.86],[.3,.47],[.3,.86]]) {
    cyl(pcb,.119,.119,.009,x,boardTop+.007,z,bronze);
    cyl(pcb,.044,.044,.014,x,boardTop+.014,z,black);
    const lead=cyl(pcb,.027,.032,.118,x,boardTop+.067,z,silver,12);lead.rotation.z=.05;
  }
  // Concave through-hole fillet. Its footprint broadens as the wire reaches the hot lead.
  const profile=[[.001,.004],[.111,.004],[.109,.012],[.093,.023],[.072,.035],[.053,.051],[.040,.070],[.032,.094],[.026,.102],[.001,.096]];
  const jointMesh=put(pcb,new THREE.LatheGeometry(profile.map(([r,h])=>new THREE.Vector2(r,h)),48),silver,joint.x,boardTop+.012,joint.z);
  const wireGroup=new THREE.Group(); scene.add(wireGroup);
  cable([[-2.88,.89,1.18],[-2.38,1.05,1.39],[-1.36,.8,1.35],[-.39,.53,1.07],[.34,.414,.72],[.715,.36,.49]],.021,silver,wireGroup);
  const iron=new THREE.Group();scene.add(iron);
  iron.quaternion.setFromUnitVectors(up,new THREE.Vector3(.79,.72,-.14).normalize());
  function shaft(start,end,nose,back,mat){return cyl(iron,back,nose,end-start,0,(start+end)/2,0,mat,48);}
  shaft(0,.23,.013,.071,silver);shaft(.23,.58,.071,.105,hotCopper);shaft(.58,1.26,.106,.116,silver);
  shaft(1.23,1.36,.145,.145,graphite);shaft(1.35,1.43,.15,.16,silver);
  shaft(1.43,1.59,.163,.201,toolsTeal);shaft(1.57,2.64,.209,.233,black);
  for(let i=0;i<12;i++)shaft(1.58+i*.079,1.615+i*.079,.218+i*.0016,.219+i*.0016,graphite);
  shaft(2.64,3.63,.238,.216,toolsTeal);shaft(3.62,3.8,.213,.128,black);shaft(3.79,4.05,.12,.07,graphite);
  cable([[0,4,0],[.1,4.6,-.05],[.35,5.25,-.5],[.23,5.65,-1.3]],.064,black,iron);
  // A wiper stand and a coiled holder break the machine's silhouette.
  const holderPoints=[];
  for(let i=0;i<170;i++){
    const t=i/169, angle=t*2*Math.PI*7.5;
    holderPoints.push([-1.91+t*.5+.13*Math.cos(angle),.45+t*.52+.13*Math.sin(angle),-1.81-t*.43+.11*Math.cos(angle)]);
  }
  box(scene,.65,.11,.7,-1.76,.055,-1.91,black);cable(holderPoints,.026,silver);
  // Parked station and wire reel stay in the background as the camera travels into the joint.
  const station=new THREE.Group();station.position.set(-2.8,0,-2.8);station.rotation.y=.19;scene.add(station);
  box(station,2.28,.72,1.45,0,.36,0,graphite);box(station,2.21,.044,1.40,0,.74,0,toolsTeal);
  for(let i=0;i<16;i++)box(station,.055,.009,.48,-.97+i*.112,.769,-.27,black);
  for(const x of [-.94,.94])for(const z of [-.51,.51])cyl(station,.07,.07,.04,x,.02,z,black);
  const glass=standard(0x1c3431,.23,.26);box(station,.92,.235,.03,-.36,.47,.738,glass);
  const screenArt=canvasMap(320,96,ctx=>{ctx.fillStyle='#132a24';ctx.fillRect(0,0,320,96);ctx.fillStyle='#bce1ad';ctx.font='68px monospace';ctx.fillText('350°C',28,72);});
  const screen=put(station,new THREE.PlaneGeometry(.87,.21),new THREE.MeshBasicMaterial({map:screenArt}),-.36,.47,.759);screen.castShadow=false;
  const knob=cyl(station,.19,.19,.12,.52,.43,.78,black);knob.rotation.x=Math.PI/2;
  box(station,.025,.11,.022,.52,.51,.856,silver);
  const reel=new THREE.Group();scene.add(reel);reel.position.set(-2.8,.51,1.17);reel.rotation.z=Math.PI/2;
  cyl(reel,.37,.37,.55,0,0,0,silver);for(const side of [-1,1])cyl(reel,.5,.5,.044,0,side*.3,0,black);
  for(let i=0;i<17;i++)cyl(reel,.383,.377,.016,0,-.26+i*.032,0,silver);
  // Static pieces sharing a material are drawn together. The joint and the two tools
  // keep their own transforms so scroll can rewind the same physical operation.
  function combinePieces(group,skip) {
    const buckets=new Map();
    for(const piece of [...group.children]){
      if(!piece.isMesh || piece===skip || piece.material.transparent)continue;
      const matches=buckets.get(piece.material)||[];matches.push(piece);buckets.set(piece.material,matches);
    }
    for(const [material,pieces] of buckets){
      if(pieces.length<2)continue;
      const data={position:[],normal:[],uv:[]};
      for(const piece of pieces){
        piece.updateMatrix();const flat=piece.geometry.index?piece.geometry.toNonIndexed():piece.geometry.clone();flat.applyMatrix4(piece.matrix);
        for(const key of Object.keys(data))for(const value of flat.attributes[key].array)data[key].push(value);
        piece.removeFromParent();piece.geometry.dispose();flat.dispose();
      }
      const merged=new THREE.BufferGeometry();
      for(const [key,values] of Object.entries(data))merged.setAttribute(key,new THREE.Float32BufferAttribute(values,key==='uv'?2:3));
      put(group,merged,material,0,0,0);
    }
  }
  combinePieces(pcb,jointMesh);combinePieces(iron);combinePieces(station);combinePieces(reel);
  const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthTexture:new THREE.DepthTexture(1,1),samples:0});
  const lens=new THREE.ShaderMaterial({
    uniforms:{colorImage:{value:target.texture},depthImage:{value:target.depthTexture},pixel:{value:new THREE.Vector2()},focus:{value:1},aperture:{value:0}},
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader:`uniform sampler2D colorImage;uniform sampler2D depthImage;uniform vec2 pixel;uniform float focus;uniform float aperture;varying vec2 vUv;
    float viewDepth(float d){return 1.4/(70.-d*69.98);}
    void main(){
      float z=viewDepth(texture2D(depthImage,vUv).r);
      float circle=clamp(abs(1.-focus/z)*aperture,0.,6.);
      vec3 color=texture2D(colorImage,vUv).rgb*2.;float weights=2.;
      for(int i=0;i<14;i++){
        float n=float(i)+.5;vec2 delta=vec2(cos(n*2.39996),sin(n*2.39996))*sqrt(n/14.)*pixel*circle;
        vec2 uv=vUv+delta;float sampleZ=viewDepth(texture2D(depthImage,uv).r);
        float w=sampleZ<z-.05?.4:1.;color+=w*texture2D(colorImage,uv).rgb;weights+=w;
      }
      color/=weights;float vignette=1.-smoothstep(.25,.92,length((vUv-.5)*vec2(.88,1.)));color*=.87+.13*vignette;
      gl_FragColor=vec4(color,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
  });
  const lensScene=new THREE.Scene(); const lensQuad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),lens);lensScene.add(lensQuad);
  const lensCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const eye=new THREE.Vector3(), attention=new THREE.Vector3();
  const startEye=new THREE.Vector3(3.1,5.35,7.6), macroEye=new THREE.Vector3(1.42,1.75,2.45), endEye=new THREE.Vector3(1.72,2.13,3.06);
  const startLook=new THREE.Vector3(-.36,.26,-.27), macroLook=new THREE.Vector3(.74,.49,.48), endLook=new THREE.Vector3(.63,.42,.29);
  let portrait=false, lastWidth=0,lastHeight=0;
  let lastPose, shadowPose;
  function resize(w,h) {
    if(!w||!h||(w===lastWidth&&h===lastHeight))return;
    lastPose=undefined;
    lastWidth=w;lastHeight=h;portrait=w<740||w/h<.8;
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.65));renderer.setSize(w,h,false);
    target.setSize(canvas.width,canvas.height);lens.uniforms.pixel.value.set(1/w,1/h);camera.aspect=w/h;
    camera.setViewOffset(w,h,portrait?0:-w*.16,portrait?h*.15:0,w,h);camera.updateProjectionMatrix();
  }
  function draw(progress,reduced) {
    // The last 3% and the reduced-motion holds are stationary.
    const p=reduced?(progress<.65?.53:.72):THREE.MathUtils.clamp(progress, .375, .97);
    if (p === lastPose || !lastWidth || !lastHeight) return;
    lastPose = p;
    const shadowStep = THREE.MathUtils.clamp(p, .39, .755);
    renderer.shadowMap.needsUpdate = shadowStep !== shadowPose;
    shadowPose = shadowStep;
    const approach=ramp(.39,.58,p), wet=ramp(.57,.655,p), lift=ramp(.655,.755,p);
    const away=(1-approach)*1.3+lift*.48;
    iron.position.set(joint.x+.031+away*.64, joint.y+.027+away*.67, joint.z+.025-away*.10);
    const feed=1-ramp(.51,.59,p), withdraw=ramp(.64,.74,p);
    wireGroup.position.set(-.27*feed-.66*withdraw,.13*feed+.26*withdraw,.08*withdraw);
    jointMesh.scale.set(.18+.82*wet,.1+.9*wet,.18+.82*wet);
    const travel=ramp(.375,.63,p), drift=ramp(.67,.97,p);
    eye.lerpVectors(startEye,macroEye,travel).lerp(endEye,drift);
    attention.lerpVectors(startLook,macroLook,travel).lerp(endLook,drift);
    if(portrait){eye.sub(attention).multiplyScalar(1.24).add(attention);}
    camera.position.copy(eye);camera.lookAt(attention);
    lens.uniforms.focus.value=eye.distanceTo(attention);
    lens.uniforms.aperture.value=6+13*travel;
    renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.setRenderTarget(null);renderer.render(lensScene,lensCamera);
  }
  function dispose() {
    const textures=new Set(),materials=new Set(),geometries=new Set();
    scene.traverse(object=>{
      if(!object.isMesh)return;geometries.add(object.geometry);
      const meshMaterials=Array.isArray(object.material)?object.material:[object.material];
      for(const material of meshMaterials){materials.add(material);if(material.map)textures.add(material.map);}
    });
    geometries.forEach(item=>item.dispose());materials.forEach(item=>item.dispose());textures.forEach(item=>item.dispose());environment.dispose();target.dispose();lens.dispose();lensQuad.geometry.dispose();renderer.dispose();
  }
  async function warmShaders() {
    // Compile with the color spaces and targets actually used by both passes.
    renderer.setRenderTarget(target);
    const surfacePrograms = renderer.compileAsync(scene, camera);
    renderer.setRenderTarget(null);
    await Promise.all([surfacePrograms, renderer.compileAsync(lensScene, lensCamera)]);
  }
  return {resize,draw,dispose,warmShaders};
}


// Keep the rendered poster visible while the GPU compiles its programs.
// A scroll or resize during loading updates the first live pose.
export function createBenchModel(canvas) {
  const abort = new AbortController();
  const loader = new THREE.TextureLoader();
  let width = 0, height = 0, progress = .385, reduced = false;
  let model, ready = false, disposed = false;
  canvas.style.opacity = '0';
  Promise.all([
    loadStudio(abort.signal),
    loader.loadAsync(benchAsset('board.webp')),
    loader.loadAsync(benchAsset('mat.webp'))
  ]).then(async assets => {
    if (disposed) { for (const texture of assets) texture.dispose(); return; }
    model = buildBench(canvas, ...assets);
    model.resize(width, height);
    await model.warmShaders();
    if (disposed) { model.dispose(); return; }
    ready = true;
    model.draw(progress, reduced);
    canvas.style.opacity = '1';
  }).catch(() => { model?.dispose(); model = undefined; });

  return {
    resize(w, h) {
      width = w; height = h;
      model?.resize(w, h);
    },
    draw(p, reduceMotion) {
      progress = p; reduced = reduceMotion;
      if (ready) model.draw(p, reduceMotion);
    },
    dispose() {
      disposed = true;
      abort.abort();
      if (ready) model?.dispose();
    }
  };
}
