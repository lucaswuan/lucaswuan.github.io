(() => {
  'use strict';
  const CELL_WIDTH=6, CELL_HEIGHT=9;
  let earth = document.querySelector('#earth');
  let gl=earth.getContext('webgl2',{alpha:true,antialias:false,depth:false,stencil:false,powerPreference:'high-performance'});
  let ctx=gl?null:earth.getContext('2d', {alpha:true});
  let gpu=null;
  const map = document.createElement('canvas');
  map.width = 1024; map.height = 512;
  const mapCtx = map.getContext('2d', {willReadFrequently:true});
  let landPixels = null;
  let rotation = 0;
  let frame = 0;
  const {canvas:starCanvas,glyphSheet:sourceGlyphSheet,media}=window.portfolioGalaxy;
  // Each planet has its own palette, independent of the Milky Way's star colors.
  const earthColors=['#87e5a2','#e1eff7','#369cff','#9bd2f0']; // land, clouds, ocean, rim
  const planetColors=['#d8b77e','#ecdbb8','#f1d6cc','#ee9c92',...earthColors];
  // Rows 0–1: Saturn gold/cream; 2–3: Jupiter pale cream/coral; 4–7: Earth.
  const glyphSheet=document.createElement('canvas');
  glyphSheet.width=sourceGlyphSheet.width;glyphSheet.height=planetColors.length*12;
  const planetGlyphCtx=glyphSheet.getContext('2d');
  planetColors.forEach((color,row)=>{
    const strip=document.createElement('canvas');
    strip.width=glyphSheet.width;strip.height=12;
    const ink=strip.getContext('2d');
    ink.drawImage(sourceGlyphSheet,0,0,strip.width,12,0,0,strip.width,12);
    ink.globalCompositeOperation='source-in';
    ink.fillStyle=color;ink.fillRect(0,0,strip.width,12);
    planetGlyphCtx.drawImage(strip,0,row*12);
  });
  const journey = document.querySelector('.journey');
  const stage = document.querySelector('.space-stage');
  const scene = document.querySelector('.planet-scene');
  const hero = document.querySelector('.hero-content');
  const bottom = document.querySelector('.hero-bottom');
  const arrival = document.querySelector('.arrival');
  let spaceTime = 0;
  let progress = 0, lastTime = 0, pointerX = 0, pointerY = 0;
  let trackLength = 1, viewportHeight = innerHeight;
  const clamp = n => Math.max(0,Math.min(1,n));
  const smooth = (a,b,x) => {const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
  // Use the stage's real height, not innerHeight: on phones it tracks the browser toolbar sliding in and out.
  function measure(){viewportHeight=stage.clientHeight||innerHeight;trackLength=Math.max(1,journey.offsetHeight-viewportHeight);}
  media.addEventListener('change',measure);
  measure();
  addEventListener('resize',measure);
  addEventListener('pointermove',e=>{if(e.pointerType==='mouse'){pointerX=(e.clientX/innerWidth-.5)*8;pointerY=(e.clientY/innerHeight-.5)*8;}},{passive:true});
  let earthState={x:innerWidth*.74,y:innerHeight*.52,r:innerWidth*.1056};
  let otherWorlds=[];
  let sceneColumns=0,sceneLines=0,nextScene,previousScene;
  const renderTimings=[],profiling=new URLSearchParams(location.search).has('profile');
  function sizeEarth(){const dpr=Math.min(devicePixelRatio,1.5);earth.width=innerWidth*dpr;earth.height=viewportHeight*dpr;if(ctx)ctx.setTransform(dpr,0,0,dpr,0,0);sceneColumns=Math.ceil(innerWidth/CELL_WIDTH)+1;sceneLines=Math.ceil(viewportHeight/CELL_HEIGHT)+1;nextScene=new Uint16Array(sceneColumns*sceneLines);previousScene=new Uint16Array(sceneColumns*sceneLines);}
  sizeEarth();addEventListener('resize',sizeEarth);
  // Mobile toolbars can resize the stage without a window resize event, so watch the stage itself.
  // Start after load: iOS can run this before styles.css applies, when the stage is only as tall as its content,
  // this canvas included, so each resize would make the stage taller and trigger another one.
  const resizeStage=()=>{if(stage.clientHeight!==viewportHeight){measure();sizeEarth();}};
  addEventListener('load',()=>{resizeStage();if('ResizeObserver' in window)new ResizeObserver(resizeStage).observe(stage);});
  if(gl){try{gpu=window.createPlanetRenderer(gl,glyphSheet);}catch(error){console.warn('Using the compatible text renderer.',error.message);const replacement=earth.cloneNode(true);earth.replaceWith(replacement);earth=replacement;gl=null;ctx=earth.getContext('2d',{alpha:true});sizeEarth();}}
  function drawEarth() {
    if(gpu){gpu.render(otherWorlds,earthState,rotation,spaceTime,1-smooth(.05,.6,progress),1-smooth(90,300,earthState.r));return;}
    const started=profiling?performance.now():0;
    nextScene.fill(0);
    const farOpacity=1-smooth(.05,.6,progress);
    otherWorlds.forEach(world=>{world.opacity=farOpacity;if(world.kind==='saturn')drawRings(world,false);drawBody(world);if(world.kind==='saturn')drawRings(world,true);});
    drawBody({...earthState,kind:'earth',spin:rotation});
    ctx.fillStyle='#000';
    // Only paint terminal cells whose glyph, brightness, or occupancy changed.
    for(let index=0;index<nextScene.length;index++){
      const code=nextScene[index];if(code===previousScene[index])continue;
      const x=(index%sceneColumns)*CELL_WIDTH,y=Math.floor(index/sceneColumns)*CELL_HEIGHT;
      ctx.clearRect(x-CELL_WIDTH/2,y-CELL_HEIGHT/2,CELL_WIDTH,CELL_HEIGHT);
      if(code){
        const character=(code&7)-1,row=(code>>3)&7,shade=(code>>6)&15;
        ctx.globalAlpha=((code>>10)&31)/31;
        ctx.fillRect(x-CELL_WIDTH/2,y-CELL_HEIGHT/2,CELL_WIDTH,CELL_HEIGHT);
        ctx.drawImage(glyphSheet,(character*12+shade)*10,row*12,10,12,x-5,y-6,10,12);
      }
      previousScene[index]=code;
    }
    ctx.globalAlpha=1;
    if(profiling){renderTimings.push(performance.now()-started);if(renderTimings.length===120){const sorted=[...renderTimings].sort((a,b)=>a-b);console.info('Scene render: mean '+(renderTimings.reduce((a,b)=>a+b,0)/120).toFixed(1)+' ms; p95 '+sorted[114].toFixed(1)+' ms');renderTimings.length=0;}}
  }
  function writeSceneCell(x,y,character,row,shade,opacity=1){
    const column=Math.round(x/CELL_WIDTH),line=Math.round(y/CELL_HEIGHT);
    if(column<0||column>=sceneColumns||line<0||line>=sceneLines||opacity<.02)return;
    nextScene[line*sceneColumns+column]=(character+1)|(row<<3)|(shade<<6)|(Math.round(opacity*31)<<10);
  }
  function drawRings(world,front){
    const angle=-.28+Math.sin(spaceTime*.00009)*.07;
    const ca=Math.cos(angle),sa=Math.sin(angle);
    const rx=world.r*2.65,ry=world.r*.71;
    const minX=Math.floor((world.x-rx)/CELL_WIDTH)*CELL_WIDTH,maxX=world.x+rx;
    const minY=Math.floor((world.y-rx)/CELL_HEIGHT)*CELL_HEIGHT,maxY=world.y+rx;
    for(let y=minY;y<maxY;y+=CELL_HEIGHT){for(let x=minX;x<maxX;x+=CELL_WIDTH){
      const dx=x-world.x,dy=y-world.y,localX=dx*ca+dy*sa,localY=-dx*sa+dy*ca;
      if((localY>0)!==front)continue;
      const band=Math.sqrt((localX/rx)**2+(localY/ry)**2);
      if(band<.69||band>1)continue;
      const core=1-Math.abs(band-.84)/.16;
      const character=core>.6?3:2;
      const shade=Math.min(11,Math.floor(7+core*3));
      writeSceneCell(x,y,character,core>.6?1:0,shade,world.opacity);
    }}
  }
  function drawBody(world){
    const {x:cx,y:cy,r:radius}=world;
    // Keep distant cloud detail, then dissolve it into the ocean as Earth fills the view.
    const cloudStrength=1-smooth(90,300,radius);
    const minY=Math.max(0,Math.ceil((cy-radius)/CELL_HEIGHT)*CELL_HEIGHT),maxY=Math.min(viewportHeight,cy+radius);
    const minX=Math.max(0,Math.ceil((cx-radius)/CELL_WIDTH)*CELL_WIDTH),maxX=Math.min(innerWidth,cx+radius);
    // The screen-space text grid never scales, even when the camera approaches Earth.
    for(let y=minY;y<maxY;y+=CELL_HEIGHT){for(let x=minX;x<maxX;x+=CELL_WIDTH){
      const nx=(x-cx)/radius,ny=(y-cy)/radius,d=nx*nx+ny*ny;if(d>1)continue;
      const z=Math.sqrt(1-d),tilt=-.16,px=nx*Math.cos(tilt)-ny*Math.sin(tilt),py=nx*Math.sin(tilt)+ny*Math.cos(tilt);
      const p={x,y,lat:Math.asin(-py),lon:Math.atan2(px,z),light:Math.max(.08,-nx*.45-ny*.35+z*.8),z,noise:(Math.sin(nx*129.89+ny*78.233)*43758.5453)%1};
      const lon = p.lon+world.spin+.4;
      const u = ((lon/(Math.PI*2)+.5)%1+1)%1;
      const v = .5-p.lat/Math.PI;
      const land = world.kind==='earth' && landPixels && landPixels[(Math.floor(v*511)*1024+Math.floor(u*1023))*4+3]>60;
      const cloud = Math.sin(lon*12+p.lat*9+Math.sin(p.lat*7))*Math.sin(p.lat*18-lon*5)>.66;
      const brightness = Math.min(1,p.light);
      let character, alpha, row;
      if(world.kind!=='earth'){
        const bands=.5+.5*Math.sin(p.lat*(world.kind==='jupiter'?17:23)+Math.sin(lon*3+p.lat*6)*.75);
        const texture=.54+.46*bands;
        const value=brightness*texture;
        character=value>.65?4:value>.42?3:value>.22?2:1;
        alpha=.22+.65*value;row=world.kind==='jupiter'?(bands>.48?2:3):(bands>.45?1:0);
      }
      else if(land){character=brightness>.6?4:brightness>.32?3:2;alpha=.43+.57*brightness;row=4;}
      else if(cloud&&cloudStrength>0&&p.noise-Math.floor(p.noise)<cloudStrength){character=p.noise>.3?2:1;alpha=.17+.42*brightness+.08*cloudStrength;row=5;}
      // Broader + glyphs carry the ocean blue; shaded water stays lighter with :.
      else{character=brightness>.25?2:1;alpha=.24+.5*brightness;row=6;}
      if(p.z<.1){character=0;alpha=.5;row=world.kind==='earth'?7:world.kind==='jupiter'?2:1;}
      const shade=Math.max(0,Math.min(11,Math.round(alpha*12)-1));
      writeSceneCell(p.x,p.y,character,row,shade,world.opacity);
    }}
  }
  fetch('assets/land.geojson').then(r=>{if(!r.ok)throw new Error('Map unavailable');return r.json();}).then(data=>{
    mapCtx.fillStyle='#fff';
    const ringPath = ring=>{ring.forEach(([lon,lat],i)=>{const x=(lon+180)/360*map.width,y=(90-lat)/180*map.height;i?mapCtx.lineTo(x,y):mapCtx.moveTo(x,y);});mapCtx.closePath();};
    data.features.forEach(f=>{const polys=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;polys.forEach(poly=>{mapCtx.beginPath();poly.forEach(ringPath);mapCtx.fill('evenodd');});});
    landPixels=mapCtx.getImageData(0,0,1024,512).data;if(gpu)gpu.uploadLand(landPixels);drawEarth();
  }).catch(()=>drawEarth());
  const frameTimings=[];
  function animate(t){
    const paused=window.portfolioGalaxy.paused;
    const elapsed=t-lastTime||16;
    if(profiling&&elapsed<250){frameTimings.push(elapsed);if(frameTimings.length===120){const sorted=[...frameTimings].sort((a,b)=>a-b);console.info('Animation: '+(120000/frameTimings.reduce((a,b)=>a+b,0)).toFixed(1)+' fps; p95 interval '+sorted[114].toFixed(1)+' ms; '+(gpu?'GPU':'compatible')+' grid');frameTimings.length=0;}}
    const dt=Math.min(elapsed,64);lastTime=t;
    if(!paused&&!document.hidden)spaceTime+=dt;
    const target=media.matches?0:clamp(scrollY/trackLength);
    progress=paused?target:progress+(target-progress)*(1-Math.exp(-dt/85));
    if(Math.abs(progress-target)<.00005)progress=target;
    const focus=smooth(.03,.8,progress),zoom=1+Math.pow(focus,2)*32;
    const mobile=innerWidth<=650;
    const baseX=innerWidth*(mobile?.69:innerWidth<=1000?.76:.74);
    const baseY=viewportHeight*(mobile?.73:innerWidth<=1000?.53:.52);
    const driftX=Math.sin(spaceTime*.00019)*innerWidth*(mobile?.075:.09);
    const driftY=Math.sin(spaceTime*.00014)*viewportHeight*.055;
    const moveX=(innerWidth*.5-baseX)*focus+(driftX+(paused?0:pointerX))*(1-focus);
    const moveY=(viewportHeight*.48-baseY)*focus+(driftY+(paused?0:pointerY))*(1-focus);
    const diameter=mobile?117:Math.max(143,Math.min(innerWidth*.1365,208));
    earthState={x:baseX+moveX,y:baseY+moveY,r:diameter*.44*(paused?1:zoom)};
    otherWorlds=[
      {kind:'saturn',x:innerWidth*(mobile?.22:.23)+Math.sin(spaceTime*.00016)*innerWidth*.055-focus*130,y:viewportHeight*(mobile?.64:.79)+Math.sin(spaceTime*.00018)*30+focus*100,r:mobile?20:29,spin:spaceTime*.00012},
      {kind:'jupiter',x:innerWidth*(mobile?.82:.84)+Math.sin(spaceTime*.00017+1)*innerWidth*.04+focus*120,y:viewportHeight*(mobile?.17:.23)+Math.sin(spaceTime*.00014)*28-focus*130,r:mobile?26:40,spin:spaceTime*.00015}
    ];
    scene.style.opacity=String(1-smooth(.65,.98,progress));
    const heroOpacity=1-smooth(.015,.28,progress);
    hero.style.opacity=String(heroOpacity);
    hero.style.transform=`translate3d(0,${paused?0:-progress*100}px,0)`;
    hero.inert=heroOpacity<.05;
    bottom.style.opacity=String(1-smooth(.01,.18,progress));
    arrival.style.opacity=paused?'0':String(smooth(.28,.43,progress)*(1-smooth(.59,.77,progress)));
    arrival.style.transform=`translate3d(0,${(1-smooth(.28,.6,progress))*20}px,0)`;
    starCanvas.style.opacity=String(1-.48*smooth(.45,1,clamp(scrollY/trackLength)));
    if(!paused&&!document.hidden&&t-frame>33){
      if(progress<.98&&scrollY<journey.offsetHeight){rotation+=.000022*Math.min(t-frame,100);}
      frame=t;
    }
    if(progress<.98&&scrollY<journey.offsetHeight)drawEarth();
    requestAnimationFrame(animate);
  }

  drawEarth();requestAnimationFrame(animate);
})();
