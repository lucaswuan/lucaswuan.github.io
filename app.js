(() => {
  'use strict';
  // Places Saturn, Jupiter, and Earth in the shared ASCII sky (galaxy.js draws them, one character per cell, on the
  // GPU through sky-renderer.js) and moves the opening text as the page scrolls.
  const galaxy=window.portfolioGalaxy;
  if(!galaxy)return;
  const {cell:[CELL_WIDTH,CELL_HEIGHT],media,planetRow:PLANET,empty:EMPTY}=galaxy;
  // Colour rows, counted from galaxy.js's PLANET_COLORS: Saturn's golden zones and cream equator; its outer B, A,
  // and C rings; Jupiter's zones, belts, and Great Red Spot; Earth's land, clouds, and ocean; Saturn's belts, pole,
  // and inner B ring.
  const SATURN=0,SATURN_CREAM=1,RING_B=2,RING_A=3,RING_C=4,ZONE=5,BELT=6,SPOT=7,LAND=8,CLOUD=9,OCEAN=10;
  const SATURN_BELT=11,SATURN_POLE=12,RING_B_INNER=13;
  const map=document.createElement('canvas');
  map.width=1024;map.height=512;
  const mapCtx=map.getContext('2d',{willReadFrequently:true});
  let landPixels=null,rotation=0,frame=0;
  const journey=document.querySelector('.journey');
  const stage=document.querySelector('.space-stage');
  const hero=document.querySelector('.hero-content');
  const bottom=document.querySelector('.hero-bottom');
  const arrival=document.querySelector('.arrival');
  let spaceTime=0,progress=0,lastTime=0,pointerX=0,pointerY=0,trackLength=1,viewportHeight=innerHeight,shown=false;
  const clamp=n=>Math.max(0,Math.min(1,n));
  const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
  // Use the stage's real height, not innerHeight: on phones it tracks the browser toolbar sliding in and out.
  function measure(){viewportHeight=stage.clientHeight||innerHeight;trackLength=Math.max(1,journey.offsetHeight-viewportHeight);}
  media.addEventListener('change',measure);
  measure();
  addEventListener('resize',measure);
  // Mobile toolbars can resize the stage without a window resize event, so watch the stage itself (from load on:
  // iOS can run this before styles.css applies, when the stage is only as tall as its content).
  addEventListener('load',()=>{measure();if('ResizeObserver' in window)new ResizeObserver(measure).observe(stage);});
  addEventListener('pointermove',e=>{if(e.pointerType==='mouse'){pointerX=(e.clientX/innerWidth-.5)*8;pointerY=(e.clientY/innerHeight-.5)*8;}},{passive:true});

  // For the 2D canvas (no WebGL2), the planets' cells are worked out here exactly as sky-renderer.js does on the GPU.
  // Planets use the smoother half of the ramp, from 0 (.) to 1 (#): . : - = + * #
  const shade=v=>{const i=Math.round(clamp(v)*6);return i===0?0:i===1?2:i+2;};
  // Saturn's body skips the line characters (- =), which belong to its rings: . : + * #
  const saturnShade=v=>{const i=Math.round(clamp(v)*4);return i===0?0:i===1?2:i+4;};
  const sunlight=(nx,ny,z)=>{const l=-nx*.55-ny*.42+z*.72;return smooth(-.03,.16,l)*(.25+.75*Math.max(0,l));};
  // A fading planet gives its cells back to the stars one by one, in this order.
  const threshold=(c,l)=>{const h=Math.sin(c*12.9898+l*78.233)*43758.5453;return h-Math.floor(h);};
  // Saturn's rings, tilted a little: the dusky C ring, the B ring (warmer inside, brightest outside), the dark
  // Cassini division, and the grey-tan A ring.
  // Returns [character, colour row, opacity, in front of the planet], with character -1 for the dark division.
  function ring(dx,dy,r){
    const a=-.12+Math.sin(spaceTime*.00009)*.03,lx=dx*Math.cos(a)+dy*Math.sin(a),ly=-dx*Math.sin(a)+dy*Math.cos(a);
    const rx=r*2.3,band=Math.hypot(lx/rx,ly/(rx*.36)),front=ly>0;
    if(band<.55||band>1)return null;
    if(band<.67)return [0,RING_C,.55,front];
    if(band<.76)return [5,RING_B_INNER,.85,front];
    if(band<.86)return [5,RING_B,.95,front];
    if(band<=.895)return [-1,0,0,front];
    return [4,RING_A,.72,front];
  }
  // A planet's character at (dx, dy) from its centre, shaded by sunlight: bands on Saturn and Jupiter (with the
  // Great Red Spot), land, ocean, and clouds on Earth. Returns [character, colour row, opacity], or null outside.
  function body(kind,dx,dy,world,clouds){
    const nx=dx/world.r,ny=dy/world.r,d=nx*nx+ny*ny;
    if(d>1)return null;
    const z=Math.sqrt(1-d),px=nx*.987227283+ny*.159318207,py=-nx*.159318207+ny*.987227283;
    const lat=Math.asin(clamp(-py*.5+.5)*2-1),lon=Math.atan2(px,z)+world.spin+.4,light=sunlight(nx,ny,z);
    if(kind==='earth'){
      const u=((lon/(Math.PI*2)+.5)%1+1)%1,v=.5-lat/Math.PI;
      const land=landPixels&&landPixels[(Math.floor(v*511)*1024+Math.floor(u*1023))*4+3]>60;
      const cloud=Math.sin(lon*12+lat*9+Math.sin(lat*7))*Math.sin(lat*18-lon*5)>.66;
      const noise=Math.sin(nx*129.89+ny*78.233)*43758.5453;
      if(light<.01)return [0,land?LAND:OCEAN,.14];
      if(land)return [shade(.33+.67*light),LAND,.55+.45*light];
      if(cloud&&clouds>0&&noise-Math.floor(noise)<clouds)return [shade(.17+.33*light),CLOUD,.35+.55*light+.08*clouds];
      // Ocean blue runs from : in shadow to * in full sun.
      return [shade(.22+.55*light),OCEAN,.45+.5*light];
    }
    let value,row;
    if(kind==='jupiter'){
      const bands=Math.sin(lat*7.8+Math.sin(lon*2+lat*5)*.6),spotLon=((lon-1.1+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;
      const spot=(spotLon/.34)**2+((lat+.38)/.16)**2<1;
      value=light*(spot?1:.55+.45*(bands*.5+.5));row=spot?SPOT:bands>-.15?ZONE:BELT;
    }else{
      // Saturn: a bright cream equator, golden zones and orange-tan belts, and a blue-grey pole.
      const bands=Math.sin(lat*9+Math.sin(lon*2)*.3),polar=Math.abs(lat);
      value=light*(.62+.38*(bands*.5+.5));row=polar>.85?SATURN_POLE:polar<.2?SATURN_CREAM:bands>.25?SATURN:SATURN_BELT;
      return light<.01?[0,row,.14]:[saturnShade(value),row,.38+.55*value];
    }
    return light<.01?[0,row,.12]:[shade(value),row,.25+.6*value];
  }
  let planetCells=null;
  function cellsFor(state){
    const {columns,lines}=galaxy.grid();
    if(!planetCells||planetCells.length!==columns*lines)planetCells=new Uint16Array(columns*lines);
    planetCells.fill(0);
    [['saturn',state.far],['jupiter',state.far],['earth',state.near]].forEach(([kind,fade])=>{
      const world=state[kind],reach=kind==='saturn'?world.r*2.3:world.r;
      if(fade<=0)return;
      const c0=Math.max(0,Math.floor((world.x-reach)/CELL_WIDTH)),c1=Math.min(columns-1,Math.ceil((world.x+reach)/CELL_WIDTH));
      const l0=Math.max(0,Math.floor((world.y-reach)/CELL_HEIGHT)),l1=Math.min(lines-1,Math.ceil((world.y+reach)/CELL_HEIGHT));
      for(let l=l0;l<=l1;l++)for(let c=c0;c<=c1;c++){
        if(fade<=threshold(c,l))continue;
        const dx=c*CELL_WIDTH-world.x,dy=l*CELL_HEIGHT-world.y;
        const rings=kind==='saturn'?ring(dx,dy,world.r):null,disc=body(kind,dx,dy,world,state.clouds);
        // The ring's near half passes in front of the planet; its far half shows only beside it.
        const part=rings?.[3]?rings:disc||rings;
        if(part)planetCells[l*columns+c]=part[0]<0?EMPTY:(part[0]+1)|((PLANET+part[1])<<5)|(Math.round(clamp(part[2]*fade*.94)*31)<<10);
      }
    });
    return {cells:planetCells};
  }

  fetch('assets/land.geojson').then(r=>{if(!r.ok)throw new Error('Map unavailable');return r.json();}).then(data=>{
    mapCtx.fillStyle='#fff';
    const ringPath=ring=>{ring.forEach(([lon,lat],i)=>{const x=(lon+180)/360*map.width,y=(90-lat)/180*map.height;i?mapCtx.lineTo(x,y):mapCtx.moveTo(x,y);});mapCtx.closePath();};
    data.features.forEach(f=>{const polys=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;polys.forEach(poly=>{mapCtx.beginPath();poly.forEach(ringPath);mapCtx.fill('evenodd');});});
    landPixels=mapCtx.getImageData(0,0,1024,512).data;galaxy.setLand(landPixels);
  }).catch(()=>{});

  const frameTimings=[],profiling=new URLSearchParams(location.search).has('profile');
  galaxy.onFrame(t=>{
    const paused=galaxy.paused,elapsed=t-lastTime||16;
    if(profiling&&elapsed<250){frameTimings.push(elapsed);if(frameTimings.length===120){const sorted=[...frameTimings].sort((a,b)=>a-b);console.info('Animation: '+(120000/frameTimings.reduce((a,b)=>a+b,0)).toFixed(1)+' fps; p95 interval '+sorted[114].toFixed(1)+' ms; '+(galaxy.gpu?'GPU':'compatible')+' grid');frameTimings.length=0;}}
    const dt=Math.min(elapsed,64);lastTime=t;
    if(!paused&&!document.hidden)spaceTime+=dt;
    const target=media.matches?0:clamp(scrollY/trackLength);
    progress=paused?target:progress+(target-progress)*(1-Math.exp(-dt/85));
    if(Math.abs(progress-target)<.00005)progress=target;
    const heroOpacity=1-smooth(.015,.28,progress);
    hero.style.opacity=String(heroOpacity);
    hero.style.transform=`translate3d(0,${paused?0:-progress*100}px,0)`;
    hero.inert=heroOpacity<.05;
    bottom.style.opacity=String(1-smooth(.01,.18,progress));
    arrival.style.opacity=paused?'0':String(smooth(.28,.43,progress)*(1-smooth(.59,.77,progress)));
    arrival.style.transform=`translate3d(0,${(1-smooth(.28,.6,progress))*20}px,0)`;
    galaxy.setStarFade(1-.48*smooth(.45,1,clamp(scrollY/trackLength)));
    const active=progress<.98&&scrollY<journey.offsetHeight;
    if(!paused&&!document.hidden&&t-frame>33){
      if(active)rotation+=.000022*Math.min(t-frame,100);
      frame=t;
    }
    if(!active){if(shown){galaxy.setPlanets(null);shown=false;}return;}
    // The planets live in the opening stage, so they scroll with it when it isn't pinned (as with reduced motion).
    const top=stage.getBoundingClientRect().top;
    const focus=smooth(.03,.8,progress),zoom=1+Math.pow(focus,2)*32;
    const mobile=innerWidth<=650;
    const baseX=innerWidth*(mobile?.69:innerWidth<=1000?.76:.74);
    const baseY=viewportHeight*(mobile?.73:innerWidth<=1000?.53:.52);
    const driftX=Math.sin(spaceTime*.00019)*innerWidth*(mobile?.075:.09);
    const driftY=Math.sin(spaceTime*.00014)*viewportHeight*.055;
    const moveX=(innerWidth*.5-baseX)*focus+(driftX+(paused?0:pointerX))*(1-focus);
    const moveY=(viewportHeight*.48-baseY)*focus+(driftY+(paused?0:pointerY))*(1-focus);
    const diameter=mobile?117:Math.max(143,Math.min(innerWidth*.1365,208));
    const earth={x:baseX+moveX,y:baseY+moveY+top,r:diameter*.44*(paused?1:zoom),spin:rotation};
    // Saturn and Jupiter drift slowly around their places; both step aside as the camera closes in on Earth.
    const state={
      saturn:{x:innerWidth*(mobile?.22:.23)+Math.sin(spaceTime*.00008)*innerWidth*.05-focus*130,y:viewportHeight*(mobile?.64:.79)+Math.sin(spaceTime*.00009)*24+focus*100+top,r:mobile?24:36,spin:spaceTime*.00012},
      jupiter:{x:innerWidth*(mobile?.82:.84)+Math.sin(spaceTime*.000085+1)*innerWidth*.035+focus*120,y:viewportHeight*(mobile?.17:.23)+Math.sin(spaceTime*.00007)*22-focus*130+top,r:mobile?28:44,spin:spaceTime*.00015},
      earth,time:spaceTime,near:1-smooth(.65,.98,progress),clouds:1-smooth(90,300,earth.r)
    };
    state.far=(1-smooth(.05,.6,progress))*state.near;
    galaxy.setPlanets(galaxy.gpu?state:cellsFor(state));
    shown=true;
  });
})();
