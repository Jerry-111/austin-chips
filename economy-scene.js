// One point per reported job. The layout is a diagram, not a location map.
export function createEconomyScene(canvas){
 const ctx=canvas.getContext('2d',{alpha:true});if(!ctx)throw new Error('Canvas unavailable');
 const direct=4907,total=16198,points=[];let seed=1817;
 const rand=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
 for(let i=0;i<total;i++){
  const a=rand()*Math.PI*2,r=Math.sqrt(rand());
  points.push({x:i<direct?(i%71-35)/36:Math.cos(a)*(.5+r*.65),y:i<direct?(Math.floor(i/71)-34)/35:Math.sin(a)*(.5+r*.65),z:rand(),phase:rand()*6.28});
 }
 let active=false,p=0,frame=0,w=1,h=1,disposed=false;const reduced=matchMedia('(prefers-reduced-motion:reduce)');
 const clamp=v=>Math.max(0,Math.min(1,v)),smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
 function draw(){frame=0;if(!active||disposed)return;ctx.clearRect(0,0,w,h);
  const mobile=w/h<.9,expand=smooth((p-.32)/.42),entrance=smooth(p/.2),cx=w*(mobile?.57:.72),cy=h*(mobile?.28:.48),sx=mobile?w*.37:w*.25,sy=mobile?h*.14:h*.32;
  ctx.save();ctx.translate(cx,cy);ctx.rotate(reduced.matches?0:-.15+expand*.22);
  // The direct-job grid spreads slightly as its supported economic network appears.
  for(let group=0;group<2;group++){
   ctx.fillStyle=group?'#93d6d5':'#ffda95';ctx.globalAlpha=(group?expand*.82:entrance);ctx.beginPath();
   const begin=group?direct:0,end=group?total:direct;
   for(let i=begin;i<end;i++){
    const q=points[i],arrive=group?smooth((expand-q.z*.3)/.7):entrance;
    const scale=group?1+(1-arrive)*1.5:.51+expand*.08;
    let x=q.x*sx*scale,y=q.y*sy*scale;
    if(!reduced.matches){x+=Math.sin(q.phase+p*2.4)*expand*2;y+=Math.cos(q.phase+p)*expand*2;}
    const size=mobile?(group?.8:1.15):(group?1.2:1.75);
    ctx.rect(x,y,size,size);
   }ctx.fill();
  }
  ctx.restore();
 }
 function request(){if(active&&!frame&&!disposed)frame=requestAnimationFrame(draw);}
 function resize(){const r=canvas.getBoundingClientRect();w=r.width;h=r.height;const dpr=Math.min(devicePixelRatio||1,1.6);canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);request();}
 const ro=new ResizeObserver(resize);ro.observe(canvas);resize();
 return {setProgress(v){p=clamp(v);request();},setActive(v){active=v;if(v)request();else{cancelAnimationFrame(frame);frame=0;}},resize,dispose(){disposed=true;cancelAnimationFrame(frame);ro.disconnect();}};
}
