import * as THREE from './vendor/three.module.min.js';
import {createSiliconAssets,createWafer} from './silicon-model.js?v=9';

export function createMaterialScene(canvas) {
  const renderer = new THREE.WebGLRenderer({canvas, alpha:true, antialias:true, powerPreference:'low-power'});
  renderer.setClearColor(0x050a0c, 0); renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
  const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(42,1,.1,80);
  const group=new THREE.Group();scene.add(group);
  scene.add(new THREE.AmbientLight(0x71949c,1.8));
  const key=new THREE.DirectionalLight(0xffdc9b,5);key.position.set(-4,9,5);scene.add(key);
  const rim=new THREE.DirectionalLight(0x49b7e1,4);rim.position.set(6,1,-4);scene.add(rim);
  const assets=createSiliconAssets(renderer);
  function makeWafer(selected=false){const w=createWafer(assets,selected);group.add(w.group);return w;}
  const primary=makeWafer(true);
  // Qualitative production growth, not a quantitative chart or data claim.
  const extraPositions=[[-4.35,0,-2.15],[0,-.06,-4.9],[4.35,.08,-2.15],[-4.35,.04,2.35],[4.35,.12,2.35],[0,.03,4.9]];
  const extraWafers=extraPositions.map((position,index)=>({...makeWafer(),position,index}));
  const n=1800,positions=new Float32Array(n*3),seeds=new Float32Array(n),colors=new Float32Array(n*3);
  let seed=3423;const rand=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
  for(let i=0;i<n;i++){positions[i*3]=(rand()-.5)*12;positions[i*3+1]=(rand()-.5)*5;positions[i*3+2]=(rand()-.5)*9;seeds[i]=rand();colors.set([.5+rand()*.3,.6+rand()*.3,.5+rand()*.4],i*3);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('seed',new THREE.BufferAttribute(seeds,1));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  const pointUniforms={uTime:{value:0},uGas:{value:0},uOpacity:{value:1}};
  const pointMaterial=new THREE.ShaderMaterial({uniforms:pointUniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,vertexColors:true,
    vertexShader:`uniform float uTime;uniform float uGas;attribute float seed;varying vec3 vColor;varying float vSeed;void main(){vColor=color;vSeed=seed;vec3 p=position;p.x+=sin(uTime*.3+seed*20.)*(.2+uGas*1.4);p.y+=cos(uTime*.4+p.x)*(.1+uGas*.8);p.z+=sin(p.x*.5+uTime*.3)*uGas;vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=(1.3+seed*2.1+uGas*seed*6.)*clamp(12./-mv.z,.5,2.);gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`uniform float uGas;uniform float uOpacity;varying vec3 vColor;varying float vSeed;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;float a=pow(1.-d,2.)*(.12+uGas*.4)*uOpacity;vec3 col=mix(vec3(.8,.56,.22),vColor,uGas);gl_FragColor=vec4(col,a);}`});
  const points=new THREE.Points(geometry,pointMaterial);scene.add(points);
  let p=0,active=false,frame=0,disposed=false;const reduced=matchMedia('(prefers-reduced-motion:reduce)');
  const smooth=(a,b,x)=>{let t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
  const mix=THREE.MathUtils.lerp;
  function draw(){frame=0;if(!active||disposed||document.hidden)return;
    // 0–.28: one wafer and electrical motes. .30–.56: process-gas particles.
    // .60–1: successive wafers reveal production scale. Everything scrubs
    // reversibly; autonomous drift cannot change the displayed story state.
    const gas=smooth(.27,.35,p)*(1-smooth(.54,.64,p));
    const growth=smooth(.59,.94,p),visible=1-gas*.96;
    const cameraProgress=reduced.matches?0:p;
    group.position.set(mix(camera.aspect<.9?0:1.4,camera.aspect<.9?.3:2.0,growth),.05,0);
    group.rotation.y=reduced.matches?-.2:-.2+cameraProgress*.38;
    group.rotation.z=reduced.matches?0:.08-cameraProgress*.10;
    primary.group.scale.setScalar(mix(1,.47,growth));
    primary.group.position.set(0,mix(0,.22,growth),0);
    primary.opacity(visible);
    primary.die.position.y=mix(.70,.03,smooth(.02,.20,p));
    primary.cutLines.material.opacity=0;primary.pointer.material.opacity=0;
    extraWafers.forEach(({group:wafer,surface,edge,position,index,opacity})=>{
      const reveal=smooth(.62+index*.045,.75+index*.045,p);
      wafer.visible=reveal>.002;
      wafer.scale.setScalar(.47*(reduced.matches?1:mix(.88,1,reveal)));
      wafer.position.set(position[0],position[1]-(reduced.matches?0:(1-reveal)*.38),position[2]);
      wafer.rotation.y=index*.09;
      opacity(reveal);
    });
    pointUniforms.uTime.value=reduced.matches?0:p*17;
    pointUniforms.uGas.value=gas;
    pointUniforms.uOpacity.value=(1-growth*.85)*(.72+gas*.28);
    if(reduced.matches){camera.position.set(5.4,10.0,15.0);camera.lookAt(1.0,.1,0);}
    else{
      const approach=smooth(0,.56,p);
      camera.position.set(mix(5.7,3.5,approach)+growth*1.6,mix(6.3,7.5,approach)+growth*2.8,mix(10.4,9.6,approach)+growth*5.5);
      if(camera.aspect<.9)camera.position.multiplyScalar(1.38);
      camera.lookAt(mix(0,.8,growth),.1,0);
    }
    renderer.render(scene,camera);
  }
  function request(){if(!frame&&active&&!disposed)frame=requestAnimationFrame(draw);}
  function resize(){const r=canvas.getBoundingClientRect();renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false);camera.aspect=r.width/Math.max(1,r.height);camera.fov=camera.aspect<.9?58:42;camera.updateProjectionMatrix();request();}
  const ro=new ResizeObserver(resize);ro.observe(canvas);resize();
  const onReduced=()=>request();reduced.addEventListener('change',onReduced);
  return{setProgress(value){p=Math.max(0,Math.min(1,value));request();},setActive(value){active=value;if(active)request();else{cancelAnimationFrame(frame);frame=0;}},resize,dispose(){disposed=true;cancelAnimationFrame(frame);ro.disconnect();reduced.removeEventListener('change',onReduced);const geos=new Set(),mats=new Set();scene.traverse(o=>{if(o.geometry)geos.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])mats.add(m);});geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());assets.dispose();renderer.dispose();}};
}
