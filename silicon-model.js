import * as THREE from './vendor/three.module.min.js';

// Shared geometry and surface artwork keep the die-to-wafer match cut continuous.
// All layouts are illustrative, not a reverse-engineered product floorplan.
export const WAFER = {radius:4.2, pitchX:.525, pitchZ:.65, dieW:.49, dieD:.61, x:.7875, z:-.325};
export function createSiliconAssets(renderer) {
  const c=document.createElement('canvas');c.width=1024;c.height=1280;
  const ctx=c.getContext('2d');ctx.fillStyle='#162326';ctx.fillRect(0,0,c.width,c.height);
  const spectrum=ctx.createLinearGradient(0,0,1024,1280);
  spectrum.addColorStop(0,'#b39f72');spectrum.addColorStop(.27,'#345d65');spectrum.addColorStop(.54,'#a67c62');spectrum.addColorStop(.74,'#465f73');spectrum.addColorStop(1,'#b3a27c');
  ctx.fillStyle=spectrum;ctx.fillRect(13,13,998,1254);
  function block(x,y,w,h,tint,rows=16){
    ctx.fillStyle=tint;ctx.fillRect(x,y,w,h);ctx.strokeStyle='#c4bb8b99';ctx.lineWidth=2;ctx.strokeRect(x+3,y+3,w-6,h-6);
    for(let row=0;row<rows;row++)for(let col=0;col<8;col++){
      ctx.fillStyle=(row+col)%3===0?'#d1bd8599':'#0b262c99';ctx.fillRect(x+9+col*(w-18)/8,y+9+row*(h-18)/rows,(w-26)/8-2,(h-20)/rows-2);
    }
  }
  // Different-sized compute arrays, cache banks and edge I/O bands.
  for(let y=0;y<4;y++)for(let x=0;x<3;x++)block(47+x*235,57+y*262,215,240,['#234248cc','#6e6b4fcc','#3a5359cc'][(x+y)%3],22);
  block(776,57,190,490,'#343c5acc',48);block(776,575,190,530,'#6a4b3fcc',50);
  for(let j=0;j<4;j++)block(47+j*235,1136,215,93,'#59746bcc',7);
  ctx.strokeStyle='#e1c689aa';ctx.lineWidth=2;
  for(let i=0;i<34;i++){let x=55+i*27;ctx.beginPath();ctx.moveTo(x,24);ctx.lineTo(x,40);ctx.moveTo(x,1240);ctx.lineTo(x,1257);ctx.stroke();}
  const dieTexture=new THREE.CanvasTexture(c);dieTexture.colorSpace=THREE.SRGBColorSpace;dieTexture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  const w=document.createElement('canvas');w.width=w.height=2048;const wc=w.getContext('2d');
  wc.fillStyle='#081315';wc.fillRect(0,0,2048,2048);
  const toPX=x=>(x/8.4+.5)*2048,toPY=z=>(.5-z/8.4)*2048;
  for(let ix=-8;ix<8;ix++)for(let iz=-7;iz<7;iz++){
    const x=(ix+.5)*WAFER.pitchX,z=(iz+.5)*WAFER.pitchZ;
    wc.drawImage(c,toPX(x-WAFER.dieW/2),toPY(z+WAFER.dieD/2),WAFER.dieW/8.4*2048,WAFER.dieD/8.4*2048);
  }
  const sheen=wc.createLinearGradient(0,2048,2048,0);sheen.addColorStop(0,'#174e6222');sheen.addColorStop(.34,'#87aaa122');sheen.addColorStop(.52,'#ded5a344');sheen.addColorStop(.63,'#7b83b633');sheen.addColorStop(1,'#142d4b22');wc.fillStyle=sheen;wc.fillRect(0,0,2048,2048);
  const waferTexture=new THREE.CanvasTexture(w);waferTexture.colorSpace=THREE.SRGBColorSpace;waferTexture.anisotropy=dieTexture.anisotropy;
  return {dieTexture,waferTexture,dispose(){dieTexture.dispose();waferTexture.dispose();}};
}

export function createWafer(assets,selected=false) {
  const group=new THREE.Group();
  const shape=new THREE.Shape();
  for(let i=0;i<=160;i++){
    const a=i/160*Math.PI*2,r=Math.abs(a-Math.PI*1.5)<.025?4.10:4.2;
    if(!i)shape.moveTo(Math.cos(a)*r,Math.sin(a)*r);else shape.lineTo(Math.cos(a)*r,Math.sin(a)*r);
  }
  if(selected){const hole=new THREE.Path(),x=WAFER.x,z=-WAFER.z,w=WAFER.dieW/2,d=WAFER.dieD/2;hole.moveTo(x-w,z-d);hole.lineTo(x-w,z+d);hole.lineTo(x+w,z+d);hole.lineTo(x+w,z-d);hole.closePath();shape.holes.push(hole);}
  const geo=new THREE.ShapeGeometry(shape);const pos=geo.getAttribute('position'),uv=geo.getAttribute('uv');
  for(let i=0;i<uv.count;i++)uv.setXY(i,pos.getX(i)/8.4+.5,pos.getY(i)/8.4+.5);
  // A stable baked optical surface avoids a lighting jump across renderers.
  const surface=new THREE.MeshBasicMaterial({map:assets.waferTexture,side:THREE.DoubleSide,transparent:true});
  const disc=new THREE.Mesh(geo,surface);disc.rotation.x=-Math.PI/2;disc.position.y=.012;group.add(disc);
  const edge=new THREE.MeshStandardMaterial({color:0x849997,metalness:.85,roughness:.24,transparent:true});
  const rim=new THREE.Mesh(new THREE.TorusGeometry(4.2,.018,6,160),edge);rim.rotation.x=Math.PI/2;group.add(rim);
  const die=new THREE.Group();die.position.set(WAFER.x,.03,WAFER.z);die.visible=selected;
  const silicon=new THREE.MeshStandardMaterial({color:0x22363d,metalness:.8,roughness:.23,transparent:true});
  die.add(new THREE.Mesh(new THREE.BoxGeometry(WAFER.dieW,.035,WAFER.dieD),silicon));
  const dieSurface=new THREE.MeshBasicMaterial({map:assets.dieTexture,transparent:true});
  const tile=new THREE.Mesh(new THREE.PlaneGeometry(WAFER.dieW,WAFER.dieD),dieSurface);tile.rotation.x=-Math.PI/2;tile.position.y=.0185;die.add(tile);group.add(die);
  const lines=[];const w=WAFER.dieW/2+.017,d=WAFER.dieD/2+.017;
  for(const x of [WAFER.x-w,WAFER.x+w])lines.push(x,.025,-3.9,x,.025,3.9);
  for(const z of [WAFER.z-d,WAFER.z+d])lines.push(-3.9,.025,z,3.9,.025,z);
  const lineGeo=new THREE.BufferGeometry();lineGeo.setAttribute('position',new THREE.Float32BufferAttribute(lines,3));
  const cutLines=new THREE.LineSegments(lineGeo,new THREE.LineBasicMaterial({color:0xeac17c,transparent:true,opacity:0,depthWrite:false}));group.add(cutLines);
  const pointerGeo=new THREE.BufferGeometry();pointerGeo.setAttribute('position',new THREE.Float32BufferAttribute([WAFER.x,.04,WAFER.z,WAFER.x,1,WAFER.z],3));
  const pointer=new THREE.Line(pointerGeo,new THREE.LineDashedMaterial({color:0xeac17c,transparent:true,opacity:0,dashSize:.04,gapSize:.04}));pointer.computeLineDistances();group.add(pointer);
  function opacity(value){surface.opacity=value;edge.opacity=value;silicon.opacity=value;dieSurface.opacity=value;}
  return {group,surface,edge,die,cutLines,pointer,opacity};
}
