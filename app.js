(() => {
  'use strict';
  // Places Saturn, Jupiter, and Earth in the shared ASCII sky (galaxy.js draws them, one character per cell, on the
  // GPU through sky-renderer.js) and moves the opening text as the page scrolls. Scrolling turns Earth to Calgary
  // and dives in, past the whole city, to its centre, as night falls and the city's lights come on.
  const galaxy=window.portfolioGalaxy;
  if(!galaxy)return;
  const {cell:[CELL_WIDTH,CELL_HEIGHT],media,planetRow:PLANET,empty:EMPTY}=galaxy;
  // Colour rows, counted from galaxy.js's PLANET_COLORS: Saturn's golden zones and cream equator; its outer B, A,
  // and C rings; Jupiter's zones, belts, and Great Red Spot; Earth's land, clouds, and ocean; Saturn's belts, pole,
  // and inner B ring; Earth's city lights, twilight band, and the warm grey of cities and bare ground up close.
  const SATURN=0,SATURN_CREAM=1,RING_B=2,RING_A=3,RING_C=4,ZONE=5,BELT=6,SPOT=7,LAND=8,CLOUD=9,OCEAN=10;
  const SATURN_BELT=11,SATURN_POLE=12,RING_B_INNER=13,LIGHTS=14,TWILIGHT=15,GROUND=16;
  // Earth is drawn from photos on the GPU, and in the site's green and blue on the 2D canvas.
  const RAD=Math.PI/180;
  // At rest Earth spins with its axis leaning 23.4° and the view a little north of the equator. The dive ends over
  // central Calgary (latitude, longitude), north up, with about 12 km across the shorter side of the screen.
  const REST_LAT=12*RAD,TILT=23.44*RAD,TARGET=[51.05,-114.07],FINAL_SPAN=12/6371;
  // The sharper photos the dive passes through: around Alberta, southern Alberta, the Calgary area, and central
  // Calgary, each [west, east, south, north] in degrees as in tools/make-earth-maps.py.
  const PHOTOS=[[-125,-103,44,58],[-119.6,-108.6,48.28,53.78],[-115.3,-112.9,50.55,51.5],[-114.33,-113.81,50.915,51.185]];
  const map=document.createElement('canvas');
  map.width=1024;map.height=512;
  const mapCtx=map.getContext('2d',{willReadFrequently:true});
  // mapsAt: when Earth's maps arrived (or stopped being waited for); Earth appears cell by cell from then.
  // closeAt: when the close-up photos (by day and by night) arrived.
  let landPixels=null,cloudPixels=null,lightPixels=null,mapsAt=0,closeAt=0,rotation=0,frame=0;
  const photoPixels=[null,null,null,null];
  const journey=document.querySelector('.journey');
  const stage=document.querySelector('.space-stage');
  const hero=document.querySelector('.hero-content');
  const bottom=document.querySelector('.hero-bottom');
  const arrival=document.querySelector('.arrival');
  let spaceTime=0,progress=0,lastTime=0,pointerX=0,pointerY=0,trackLength=1,viewportHeight=innerHeight,shown=false;
  const clamp=n=>Math.max(0,Math.min(1,n));
  const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
  const mix=(a,b,t)=>a+(b-a)*t;
  // Use the stage's real height, not innerHeight: on phones it tracks the browser toolbar sliding in and out.
  function measure(){viewportHeight=stage.clientHeight||innerHeight;trackLength=Math.max(1,journey.offsetHeight-viewportHeight);}
  media.addEventListener('change',measure);
  measure();
  addEventListener('resize',measure);
  // Mobile toolbars can resize the stage without a window resize event, so watch the stage itself (from load on:
  // iOS can run this before styles.css applies, when the stage is only as tall as its content).
  addEventListener('load',()=>{measure();if('ResizeObserver' in window)new ResizeObserver(measure).observe(stage);});
  addEventListener('pointermove',e=>{if(e.pointerType==='mouse'){pointerX=(e.clientX/innerWidth-.5)*8;pointerY=(e.clientY/innerHeight-.5)*8;}},{passive:true});

  // How Earth is turned, as the column-major 3×3 matrix sky-renderer.js uses: it takes a point of the view (x right,
  // y up, z towards the viewer) to Earth's own frame, with the given latitude and longitude facing the viewer and the
  // axis leaning by roll on screen.
  const times=(a,b)=>a.map(row=>[0,1,2].map(j=>row[0]*b[0][j]+row[1]*b[1][j]+row[2]*b[2][j]));
  function earthTurn(lat,lon,roll){
    const c=Math.cos(roll),s=Math.sin(roll),c1=Math.cos(lat),s1=Math.sin(lat),c2=Math.cos(lon),s2=Math.sin(lon);
    const m=times(times([[c2,0,s2],[0,1,0],[-s2,0,c2]],[[1,0,0],[0,c1,s1],[0,-s1,c1]]),[[c,-s,0],[s,c,0],[0,0,1]]);
    return Float32Array.of(m[0][0],m[1][0],m[2][0],m[0][1],m[1][1],m[2][1],m[0][2],m[1][2],m[2][2]);
  }
  const wrap=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));

  // For the 2D canvas (no WebGL2), the planets' cells are worked out here as sky-renderer.js does on the GPU (Earth in
  // the site's green and blue).
  // Planets use the smoother half of the ramp, from 0 (.) to 1 (#): . : - = + * #
  const shade=v=>{const i=Math.round(clamp(v)*6);return i===0?0:i===1?2:i+2;};
  // Saturn's body skips the line characters (- =), which belong to its rings: . : + * #
  const saturnShade=v=>{const i=Math.round(clamp(v)*4);return i===0?0:i===1?2:i+4;};
  // Close-up photos use the whole ramp, from 0 (.) to 1 (@): . , : ; - = + * # % @
  const ramp=v=>Math.round(clamp(v)*10);
  const sunlight=(nx,ny,z)=>{const l=-nx*.55-ny*.42+z*.72;return smooth(-.03,.16,l)*(.25+.75*Math.max(0,l));};
  // A fading planet gives its cells back to the stars one by one, in this order.
  const threshold=(c,l)=>{const h=Math.sin(c*12.9898+l*78.233)*43758.5453;return h-Math.floor(h);};
  // One channel of a map read into memory ([width, height, pixels]) at u, v from 0 to 1.
  const sample=([w,h,data],u,v,channel=0)=>data[(Math.max(0,Math.min(h-1,Math.floor(v*h)))*w+Math.max(0,Math.min(w-1,Math.floor(u*w))))*4+channel]/255;
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
  // The photo under a cell as the camera comes down (as photo() in sky-renderer.js): each sharper photo laid over the
  // last by how far it has faded in, averaged across the cell. Returns [r, g, b] from 0 to 1.
  function photoAt(lat,lon,state){
    const colour=[0,0,0],cell=CELL_WIDTH/state.earth.r;
    PHOTOS.forEach(([west,east,south,north],i)=>{
      const pixels=photoPixels[i],weight=i?state.layers[i]:1;
      const u=(lon/RAD-west)/(east-west),v=(north-lat/RAD)/(north-south);
      if(!pixels||!weight||u<=0||u>=1||v<=0||v>=1)return;
      const du=cell/RAD/Math.cos(lat)/(east-west)*.3,dv=cell/RAD*CELL_HEIGHT/CELL_WIDTH/(north-south)*.3;
      for(let channel=0;channel<3;channel++){
        let sum=0;
        for(const [a,b] of [[du,dv],[-du,-dv],[du,-dv],[-du,dv]])sum+=sample(pixels,u+a,v+b,channel);
        colour[channel]=mix(colour[channel],sum/4,weight);
      }
    });
    return colour;
  }
  // Earth at a point of its disc: city lights at night, clouds, land and sea (with the sun's glint and an orange
  // twilight band), and close in, the photos shaded in the site's colours. cut is the cell's place in the order
  // cells change. Returns [character, colour row, opacity].
  function earthCell(nx,ny,z,state,cut){
    const t=state.earthTurn,y=-ny;
    const px=t[0]*nx+t[3]*y+t[6]*z,py=t[1]*nx+t[4]*y+t[7]*z,pz=t[2]*nx+t[5]*y+t[8]*z;
    const lat=Math.asin(Math.max(-1,Math.min(1,py))),lon=Math.atan2(px,pz),u=lon/(Math.PI*2)+.5,v=.5-lat/Math.PI;
    const water=!(landPixels&&landPixels[(Math.floor(v*511)*1024+Math.floor(u*1023))*4+3]>60);
    const lam=-nx*.55-ny*.42+z*.72,light=sunlight(nx,ny,z);
    if(light<.01){
      const glow=lightPixels?sample(lightPixels,u,v):0;
      return glow>.1?[glow>.45?2:0,LIGHTS,.3+.7*glow]:[0,water?OCEAN:LAND,.14];
    }
    const noise=Math.sin(nx*129.89+ny*78.233)*43758.5453;
    const cloud=(cloudPixels?sample(cloudPixels,((u-state.cloudShift)%1+1)%1,v):
      Math.sin(lon*12+lat*9+Math.sin(lat*7))*Math.sin(lat*18-lon*5)>.66&&noise-Math.floor(noise)<.6?1:0)*state.clouds;
    const glint=water?Math.max(0,-nx*.297-ny*.227+z*.928)**90*(1-smooth(300,900,state.earth.r)):0;
    const dusk=smooth(-.05,.02,lam)*(1-smooth(.02,.16,lam));
    let part;
    if(cloud>.42)part=[shade(.2+.45*light*cloud),CLOUD,.35+.55*light];
    else if(photoPixels[0]&&state.layers[0]>cut){
      // The site's green and blue, with warm grey for the city and bare ground, shaded by the photo: its brightness
      // spread over the ramp, and water (dark, with little red) drawn blue.
      const [r,g,b]=photoAt(lat,lon,state),tone=clamp((.299*r+.587*g+.114*b-.15)/.19);
      const wet=r<g*.7&&(b>g*.65||r<g*.3);
      part=[state.layers[1]>cut?ramp(.4+.6*tone):shade(.4+.6*tone),wet?OCEAN:g>r*1.02&&g>b*1.05?LAND:GROUND,.75+.25*tone];
    }
    else if(!water)part=[shade(.33+.67*light),LAND,.55+.45*light];
    else part=[shade(.22+.55*light+glint*.5),glint>.5?CLOUD:OCEAN,.45+.5*light+glint*.3];
    if(dusk>.3&&cloud<=.42)part[1]=TWILIGHT;
    return part;
  }
  // A planet's character at (dx, dy) from its centre, shaded by sunlight: Earth (above), and bands on Saturn and
  // Jupiter (with the Great Red Spot). Returns [character, colour row, opacity], or null outside.
  function body(kind,dx,dy,world,state,cut){
    const nx=dx/world.r,ny=dy/world.r,d=nx*nx+ny*ny;
    if(d>1)return null;
    const z=Math.sqrt(1-d);
    if(kind==='earth')return earthCell(nx,ny,z,state,cut);
    const px=nx*.987227283+ny*.159318207,py=-nx*.159318207+ny*.987227283;
    const lat=Math.asin(clamp(-py*.5+.5)*2-1),lon=Math.atan2(px,z)+world.spin+.4,light=sunlight(nx,ny,z);
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
        const cut=threshold(c,l);
        if(fade<=cut)continue;
        const dx=c*CELL_WIDTH-world.x,dy=l*CELL_HEIGHT-world.y;
        const rings=kind==='saturn'?ring(dx,dy,world.r):null,disc=body(kind,dx,dy,world,state,cut);
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
  // Earth's maps (tools/make-earth-maps.py): clouds, night lights, the photo around Alberta, and on the GPU the
  // whole globe; then, once the page has loaded, the close-up photos for the dive (and on the GPU their night
  // versions). The 2D canvas reads the ones it uses into memory. Earth waits up to 2.5 seconds for the first set, so
  // it doesn't change style just after appearing.
  const load=name=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src='assets/earth/'+name;});
  const loadMaps=files=>Promise.all(Object.entries(files).map(([key,name])=>load(name).then(image=>[key,image]))).then(entries=>{
    const maps=Object.fromEntries(entries);
    if(galaxy.gpu){galaxy.setEarthMaps(maps);return;}
    // Clouds and lights are read at a small size, averaging them as the GPU does for a far-off Earth.
    const read=(image,scale=1)=>{
      const canvas=document.createElement('canvas'),ink=canvas.getContext('2d',{willReadFrequently:true});
      canvas.width=image.naturalWidth*scale;canvas.height=image.naturalHeight*scale;
      ink.imageSmoothingQuality='high';ink.drawImage(image,0,0,canvas.width,canvas.height);
      return [canvas.width,canvas.height,ink.getImageData(0,0,canvas.width,canvas.height).data];
    };
    if(maps.cloudMap){cloudPixels=read(maps.cloudMap,.5);lightPixels=read(maps.lightMap,.25);}
    ['region','area','calgary','centre'].forEach((key,i)=>{if(maps[key])photoPixels[i]=read(maps[key]);});
  });
  loadMaps({region:'region.jpg',cloudMap:'clouds.jpg',lightMap:'lights.jpg',...(galaxy.gpu&&{surface:'surface.jpg'})})
    .catch(()=>{}).finally(()=>{mapsAt||=performance.now();});
  setTimeout(()=>{mapsAt||=performance.now();},2500);
  const loadCloseUps=()=>loadMaps({area:'area.webp',calgary:'calgary.webp',centre:'centre.webp',
    ...(galaxy.gpu&&{areaNight:'area-night.webp',calgaryNight:'calgary-night.webp',centreNight:'centre-night.webp'})})
    .then(()=>{closeAt=performance.now();},()=>{});
  if(document.readyState==='complete')loadCloseUps();else addEventListener('load',loadCloseUps,{once:true});

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
    arrival.style.opacity=paused?'0':String(smooth(.28,.43,progress)*(1-smooth(.56,.74,progress)));
    arrival.style.transform=`translate3d(0,${(1-smooth(.28,.6,progress))*20}px,0)`;
    galaxy.setStarFade(1-.48*smooth(.45,1,clamp(scrollY/trackLength)));
    const active=progress<.98&&scrollY<journey.offsetHeight;
    // The dive is one motion, from the first bit of scroll to 80% of the opening scroll: the zoom, the turn towards
    // Calgary, the axis straightening, and Earth gliding to the middle of the screen all run the whole way and settle
    // together. Earth starts dissolving (at 76%) as the words finish fading, while the camera is still settling, so
    // the scroll never goes still.
    const focus=paused?0:smooth(.03,.8,progress),dissolve=smooth(.76,.97,progress);
    // Earth spins only while the page is at the top, so the turn towards Calgary is always the short way round.
    if(!paused&&!document.hidden&&t-frame>33){
      if(active&&focus===0)rotation+=.000022*Math.min(t-frame,100);
      frame=t;
    }
    if(!active){if(shown){galaxy.setPlanets(null);shown=false;}return;}
    // The planets live in the opening stage, so they scroll with it when it isn't pinned (as with reduced motion).
    const top=stage.getBoundingClientRect().top;
    const mobile=innerWidth<=650;
    const baseX=innerWidth*(mobile?.69:innerWidth<=1000?.76:.74);
    const baseY=viewportHeight*(mobile?.73:innerWidth<=1000?.53:.52);
    const driftX=Math.sin(spaceTime*.00019)*innerWidth*(mobile?.075:.09);
    const driftY=Math.sin(spaceTime*.00014)*viewportHeight*.055;
    const centre=1-(1-focus)**1.5;
    const moveX=(innerWidth*.5-baseX)*centre+(driftX+(paused?0:pointerX))*(1-centre);
    const moveY=(viewportHeight*.5-baseY)*centre+(driftY+(paused?0:pointerY))*(1-centre);
    const diameter=mobile?117:Math.max(143,Math.min(innerWidth*.1365,208)),radius=diameter*.44;
    // Zooming at an even pace (each bit of scroll multiplies the size by the same amount) until central Calgary fills
    // the screen.
    const final=Math.max(radius,Math.min(innerWidth,viewportHeight)/FINAL_SPAN),depth=Math.log(final/radius);
    const earth={x:baseX+moveX,y:baseY+moveY+top,r:radius*Math.exp(depth*focus),spin:rotation};
    // How much of the turn is left: it shrinks a little faster than Earth grows, so the globe turns quickly while it
    // is small and, up close, the ground keeps drifting gently until Calgary settles in the middle. The axis
    // straightens at an even pace all the way down. Earth turns west to east, so its surface moves left to right.
    const left=(1-focus)*Math.exp(-.75*depth*focus),roll=TILT*(1-focus),restLon=.4-rotation;
    const turned=earthTurn(REST_LAT+(TARGET[0]*RAD-REST_LAT)*(1-left),restLon+wrap(TARGET[1]*RAD-restLon)*(1-left),roll);
    // Each sharper photo fades in only once it covers the whole screen (turned by the roll, around the ground in the
    // middle of it), so its edges never show; the close-up ones also wait until they have loaded.
    const closeUps=closeAt?paused?1:smooth(0,600,t-closeAt):0;
    const nx=(innerWidth/2-earth.x)/earth.r,ny=(top+viewportHeight/2-earth.y)/earth.r,nz=Math.sqrt(Math.max(0,1-nx*nx-ny*ny));
    const lat=Math.asin(Math.max(-1,Math.min(1,turned[1]*nx-turned[4]*ny+turned[7]*nz)))/RAD;
    const lon=Math.atan2(turned[0]*nx-turned[3]*ny+turned[6]*nz,turned[2]*nx-turned[5]*ny+turned[8]*nz)/RAD;
    const spanX=innerWidth/2*Math.abs(Math.cos(roll))+viewportHeight/2*Math.abs(Math.sin(roll));
    const spanY=innerWidth/2*Math.abs(Math.sin(roll))+viewportHeight/2*Math.abs(Math.cos(roll));
    const covered=PHOTOS.map(([west,east,south,north])=>{
      const halfWidth=Math.min(lon-west,east-lon)*Math.cos(north*RAD)*RAD,halfHeight=Math.min(lat-south,north-lat)*RAD;
      return nz&&halfWidth>0&&halfHeight>0?1.05*Math.max(spanX/halfWidth,spanY/halfHeight):Infinity;
    });
    const layers=covered.map((radius,i)=>radius<final?smooth(radius,Math.min(radius*1.35,final),earth.r)*(i?closeUps:1):0);
    // The sun sets during the dive: the line between day and night sweeps across the globe from the east, the sun
    // goes down as the camera comes in over Alberta, and the evening deepens into night over Calgary, the sun sinking
    // further below the horizon as the lights come on. Close up the ground is brighter than the globe (no sea), so it
    // dims as it fills the screen and the view only ever gets darker. The sun's height over the middle of the screen
    // (afternoon at the start), and the way it turns round the screen's vertical to get there:
    const evening=paused?0:.1*smooth(.02,.3,progress)+.45*smooth(.24,.37,progress)+.45*smooth(.4,.72,progress)+.2*smooth(.6,.78,progress);
    const overhead=.72-.87*evening,side=Math.sqrt(1-.42*.42);
    const bearing=-Math.acos(clamp(overhead/side*.5+.5)*2-1),sun=[Math.sin(bearing)*side,-.42,Math.cos(bearing)*side];
    const arrive=mapsAt?paused?1:smooth(0,700,t-mapsAt):0;
    // Saturn and Jupiter drift slowly around their places; both step aside as the camera closes in on Earth.
    const state={
      saturn:{x:innerWidth*(mobile?.22:.23)+Math.sin(spaceTime*.00008)*innerWidth*.05-focus*130,y:viewportHeight*(mobile?.64:.79)+Math.sin(spaceTime*.00009)*24+focus*100+top,r:mobile?24:36,spin:-spaceTime*.00012},
      jupiter:{x:innerWidth*(mobile?.82:.84)+Math.sin(spaceTime*.000085+1)*innerWidth*.035+focus*120,y:viewportHeight*(mobile?.17:.23)+Math.sin(spaceTime*.00007)*22-focus*130+top,r:mobile?28:44,spin:-spaceTime*.00015},
      earth,time:spaceTime,near:(1-dissolve)*arrive,clouds:1-smooth(150,900,earth.r),
      earthTurn:turned,
      cloudShift:spaceTime*6e-7,layers,sun
    };
    state.far=(1-smooth(.05,.6,progress))*(1-dissolve);
    galaxy.setPlanets(galaxy.gpu?state:cellsFor(state));
    shown=true;
  });
})();
