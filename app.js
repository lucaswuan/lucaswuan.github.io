(() => {
  'use strict';
  // The planets share the Milky Way's text grid, characters, and font (galaxy.js).
  const {canvas:starCanvas,glyphSheet,cellBox,drawGlyph,cell:[CELL_WIDTH,CELL_HEIGHT],media,onGlyphs}=window.portfolioGalaxy;
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
  // Each planet has its own palette, independent of the Milky Way's star colors.
  const earthColors=['#87e5a2','#e1eff7','#369cff','#9bd2f0']; // land, clouds, ocean, rim
  const planetColors=['#d8b77e','#ecdbb8','#f1d6cc','#ee9c92',...earthColors];
  // Rows 0–1: Saturn gold/cream; 2–3: Jupiter pale cream/coral; 4–7: Earth. Rebuilt if the screen density changes.
  // Characters come from galaxy.js's faint-to-dense ramp (. , : ; - = + * # % @); Saturn's ring uses - and =.
  const DASH=4,EQUALS=5,DENSEST=10;
  // Each planet and ring keeps a thin gap of empty (black) cells around it, so it stands apart from the Milky Way.
  const HALO=CELL_WIDTH*1.2,BLANK=-1;
  let sheet=null,dpr=1;
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
  // The canvas matches the screen's real pixel density (and, once known, its exact device-pixel size), so glyphs stay sharp.
  let deviceW=0,deviceH=0;
  function sizeEarth(){dpr=devicePixelRatio||1;earth.width=deviceW||Math.round(innerWidth*dpr);earth.height=deviceH||Math.round(viewportHeight*dpr);if(!sheet||sheet.scale!==dpr){sheet=glyphSheet(planetColors,dpr);if(gpu)gpu.uploadGlyphs(sheet);}sceneColumns=Math.ceil(innerWidth/CELL_WIDTH)+1;sceneLines=Math.ceil(viewportHeight/CELL_HEIGHT)+1;nextScene=new Uint16Array(sceneColumns*sceneLines);previousScene=new Uint16Array(sceneColumns*sceneLines);}
  sizeEarth();addEventListener('resize',sizeEarth);
  // Mobile toolbars can resize the stage without a window resize event, so watch the stage itself.
  // Start after load: iOS can run this before styles.css applies, when the stage is only as tall as its content,
  // this canvas included, so each resize would make the stage taller and trigger another one.
  const resizeStage=()=>{if(stage.clientHeight!==viewportHeight){measure();sizeEarth();}};
  addEventListener('load',()=>{
    resizeStage();
    if('ResizeObserver' in window)new ResizeObserver(resizeStage).observe(stage);
    try{new ResizeObserver(([entry])=>{const box=entry.devicePixelContentBoxSize?.[0];if(box&&(box.inlineSize!==earth.width||box.blockSize!==earth.height)){deviceW=box.inlineSize;deviceH=box.blockSize;sizeEarth();drawEarth();}}).observe(earth,{box:'device-pixel-content-box'});}catch{}
  });
  // Once the site's monospace font arrives, galaxy.js redraws its characters; redraw the planets' too.
  onGlyphs(()=>{sheet=null;sizeEarth();drawEarth();});
  if(gl){try{gpu=window.createPlanetRenderer(gl,sheet,CELL_WIDTH,CELL_HEIGHT);}catch(error){console.warn('Using the compatible text renderer.',error.message);const replacement=earth.cloneNode(true);earth.replaceWith(replacement);earth=replacement;gl=null;ctx=earth.getContext('2d',{alpha:true});sizeEarth();}}
  function drawEarth() {
    if(gpu){gpu.render(otherWorlds,earthState,rotation,spaceTime,1-smooth(.05,.6,progress),1-smooth(90,300,earthState.r));return;}
    const started=profiling?performance.now():0;
    nextScene.fill(0);
    const farOpacity=1-smooth(.05,.6,progress);
    otherWorlds.forEach(world=>{world.opacity=farOpacity;if(world.kind==='saturn')drawRings(world,false);drawBody(world);if(world.kind==='saturn')drawRings(world,true);});
    drawBody({...earthState,kind:'earth',spin:rotation});
    ctx.fillStyle='#000';
    // Only paint terminal cells whose glyph, brightness, or occupancy changed, on whole device pixels.
    for(let index=0;index<nextScene.length;index++){
      const code=nextScene[index];if(code===previousScene[index])continue;
      const x=(index%sceneColumns)*CELL_WIDTH,y=Math.floor(index/sceneColumns)*CELL_HEIGHT;
      const [left,top,width,height]=cellBox(x,y,dpr);
      ctx.clearRect(left,top,width,height);
      if(code){
        const opacity=(code>>11)/31;
        ctx.globalAlpha=opacity;
        ctx.fillRect(left,top,width,height);
        const character=(code&15)-1;
        if(character!==BLANK){ctx.globalAlpha=opacity*(((code>>7)&15)+1)/16;drawGlyph(ctx,sheet,character,(code>>4)&7,x,y);}
      }
      previousScene[index]=code;
    }
    ctx.globalAlpha=1;
    if(profiling){renderTimings.push(performance.now()-started);if(renderTimings.length===120){const sorted=[...renderTimings].sort((a,b)=>a-b);console.info('Scene render: mean '+(renderTimings.reduce((a,b)=>a+b,0)/120).toFixed(1)+' ms; p95 '+sorted[114].toFixed(1)+' ms');renderTimings.length=0;}}
  }
  // A cell holds its character, colour row, character opacity (16 steps), and the planet's fade (32 steps) in one number.
  // A gap cell (BLANK) only fills cells nothing else has drawn in.
  function writeSceneCell(x,y,character,row,alpha,opacity=1){
    const column=Math.round(x/CELL_WIDTH),line=Math.round(y/CELL_HEIGHT);
    if(column<0||column>=sceneColumns||line<0||line>=sceneLines||opacity<.02)return;
    const index=line*sceneColumns+column;
    if(character===BLANK&&nextScene[index])return;
    const level=Math.max(0,Math.min(15,Math.round(alpha*16)-1));
    nextScene[index]=(character+1)|(row<<4)|(level<<7)|(Math.round(opacity*31)<<11);
  }
  // Sunlight from the upper left and a little in front: a lit side, a clear line where day turns to night, and a
  // dark side. 0 on the night side, up to 1 in full sun. planet-renderer.js uses the same light.
  const sunlight=(nx,ny,z)=>{const l=-nx*.55-ny*.42+z*.72;return smooth(-.03,.16,l)*(.25+.75*Math.max(0,l));};
  function drawRings(world,front){
    // A shallow tilt keeps the ring from stepping across the character grid like a staircase.
    const angle=-.12+Math.sin(spaceTime*.00009)*.03;
    const ca=Math.cos(angle),sa=Math.sin(angle);
    const rx=world.r*2.65,ry=world.r*.71;
    const minX=Math.floor((world.x-rx*1.1)/CELL_WIDTH)*CELL_WIDTH,maxX=world.x+rx*1.1;
    const minY=Math.floor((world.y-rx*1.1)/CELL_HEIGHT)*CELL_HEIGHT,maxY=world.y+rx*1.1;
    for(let y=minY;y<maxY;y+=CELL_HEIGHT){for(let x=minX;x<maxX;x+=CELL_WIDTH){
      const dx=x-world.x,dy=y-world.y,localX=dx*ca+dy*sa,localY=-dx*sa+dy*ca;
      if((localY>0)!==front)continue;
      const band=Math.sqrt((localX/rx)**2+(localY/ry)**2);
      if(band<.6||band>1.1)continue;
      if(band<.69||band>1){writeSceneCell(x,y,BLANK,0,1,world.opacity);continue;}
      // Line glyphs (= in the bright core, - outside) in pale cream, fainter than the planet so it stands out in front.
      const core=1-Math.abs(band-.84)/.16;
      writeSceneCell(x,y,core>.6?EQUALS:DASH,1,(4+Math.floor(core*3))/12,world.opacity);
    }}
  }
  function drawBody(world){
    const {x:cx,y:cy,r:radius}=world;
    // Keep distant cloud detail, then dissolve it into the ocean as Earth fills the view.
    const cloudStrength=1-smooth(90,300,radius);
    const outer=radius+HALO;
    const minY=Math.max(0,Math.ceil((cy-outer)/CELL_HEIGHT)*CELL_HEIGHT),maxY=Math.min(viewportHeight,cy+outer);
    const minX=Math.max(0,Math.ceil((cx-outer)/CELL_WIDTH)*CELL_WIDTH),maxX=Math.min(innerWidth,cx+outer);
    // The screen-space text grid never scales, even when the camera approaches Earth.
    for(let y=minY;y<maxY;y+=CELL_HEIGHT){for(let x=minX;x<maxX;x+=CELL_WIDTH){
      const dx=x-cx,dy=y-cy,nx=dx/radius,ny=dy/radius,d=nx*nx+ny*ny;
      if(d>1){if(dx*dx+dy*dy<outer*outer)writeSceneCell(x,y,BLANK,0,1,world.opacity);continue;}
      const z=Math.sqrt(1-d),tilt=-.16,px=nx*Math.cos(tilt)-ny*Math.sin(tilt),py=nx*Math.sin(tilt)+ny*Math.cos(tilt);
      const lat=Math.asin(-py),lon=Math.atan2(px,z)+world.spin+.4;
      const light=sunlight(nx,ny,z),noise=(Math.sin(nx*129.89+ny*78.233)*43758.5453)%1;
      const row0=world.kind==='earth'?6:world.kind==='jupiter'?2:1;
      let character,alpha,row;
      // Cells on the outline (a neighbour falls outside the disc): + or * on the sunlit edge, a faint dot at night.
      if((Math.abs(dx)+CELL_WIDTH)**2+dy*dy>radius*radius||dx*dx+(Math.abs(dy)+CELL_HEIGHT)**2>radius*radius){
        if(light>.05){character=6+Math.round(light);alpha=.3+.4*light;row=world.kind==='earth'?7:row0;}
        else{character=0;alpha=.22;row=row0;}
      }
      else if(world.kind!=='earth'){
        const bands=.5+.5*Math.sin(lat*(world.kind==='jupiter'?17:23)+Math.sin(lon*3+lat*6)*.75);
        const value=light*(.5+.5*bands);
        row=world.kind==='jupiter'?(bands>.48?2:3):(bands>.45?1:0);
        if(light<.01){character=1;alpha=.12;}else{character=1+Math.round(value*9);alpha=.25+.65*value;}
      }
      else{
        const u=((lon/(Math.PI*2)+.5)%1+1)%1,v=.5-lat/Math.PI;
        const land=landPixels&&landPixels[(Math.floor(v*511)*1024+Math.floor(u*1023))*4+3]>60;
        const cloud=Math.sin(lon*12+lat*9+Math.sin(lat*7))*Math.sin(lat*18-lon*5)>.66;
        if(light<.01){character=land?1:0;alpha=.14;row=land?4:6;}
        else if(land){character=4+Math.round(light*4);alpha=.4+.55*light;row=4;}
        else if(cloud&&cloudStrength>0&&noise-Math.floor(noise)<cloudStrength){character=1+Math.round(light*3);alpha=.2+.45*light+.08*cloudStrength;row=5;}
        // Ocean blue runs from : in shadow to + in full sun.
        else{character=2+Math.round(light*4);alpha=.24+.5*light;row=6;}
      }
      writeSceneCell(x,y,Math.min(DENSEST,character),row,alpha,world.opacity);
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
