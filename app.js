(() => {
  'use strict';
  const CELL_WIDTH=6, CELL_HEIGHT=9;
  // Turn off only this flag to restore the previous star motion, keeping the zoom fixes.
  const SHARED_STAR_FLOW=true;
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
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = media.matches;
  try { paused = paused || localStorage.getItem('orbit-motion') === 'off'; } catch {}
  const motionButton = document.querySelector('#motion-toggle');
  const journey = document.querySelector('.journey');
  const scene = document.querySelector('.planet-scene');
  const hero = document.querySelector('.hero-content');
  const label = document.querySelector('.planet-label');
  const bottom = document.querySelector('.hero-bottom');
  const arrival = document.querySelector('.arrival');
  let spaceTime = 0;
  let progress = 0, lastTime = 0, pointerX = 0, pointerY = 0;
  let trackLength = 1, viewportHeight = innerHeight;
  const clamp = n => Math.max(0,Math.min(1,n));
  const smooth = (a,b,x) => {const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
  function measure(){viewportHeight=innerHeight;trackLength=Math.max(1,journey.offsetHeight-viewportHeight);}
  function motionState(){document.body.classList.toggle('motion-paused',paused);motionButton.setAttribute('aria-pressed',String(paused));motionButton.setAttribute('aria-label',paused?'Resume animation':'Pause animation');motionButton.querySelector('.motion-text').textContent=paused?'Motion off':'Motion on';motionButton.querySelector('.pause-symbol').textContent=paused?'▷':'Ⅱ';}
  motionButton.addEventListener('click',()=>{paused=!paused;motionState();try{localStorage.setItem('orbit-motion',paused?'off':'on');}catch{}});
  media.addEventListener('change',()=>{paused=media.matches;motionState();measure();});
  motionState();measure();
  addEventListener('resize',measure);
  addEventListener('pointermove',e=>{if(e.pointerType==='mouse'){pointerX=(e.clientX/innerWidth-.5)*8;pointerY=(e.clientY/innerHeight-.5)*8;}},{passive:true});
  let earthState={x:innerWidth*.74,y:innerHeight*.52,r:innerWidth*.1056};
  let otherWorlds=[];
  let sceneColumns=0,sceneLines=0,nextScene,previousScene;
  const renderTimings=[],profiling=new URLSearchParams(location.search).has('profile');
  function sizeEarth(){const dpr=Math.min(devicePixelRatio,1.5);earth.width=innerWidth*dpr;earth.height=viewportHeight*dpr;if(ctx)ctx.setTransform(dpr,0,0,dpr,0,0);sceneColumns=Math.ceil(innerWidth/CELL_WIDTH)+1;sceneLines=Math.ceil(viewportHeight/CELL_HEIGHT)+1;nextScene=new Uint16Array(sceneColumns*sceneLines);previousScene=new Uint16Array(sceneColumns*sceneLines);}
  sizeEarth();addEventListener('resize',sizeEarth);
  // Cache the glyphs once so rotation does not rasterize thousands of letters every frame.
  const glyphSheet=document.createElement('canvas');
  const glyphChars=['.',':','+','*','#','■'];
  glyphSheet.width=720;glyphSheet.height=48;
  const glyphCtx=glyphSheet.getContext('2d');
  glyphCtx.font='8px monospace';glyphCtx.textAlign='center';glyphCtx.textBaseline='middle';
  ['250,251,253','227,230,235','175,181,191','211,229,248'].forEach((color,row)=>{
    glyphChars.forEach((character,col)=>{
      for(let shade=0;shade<12;shade++){
        glyphCtx.fillStyle=`rgba(${color},${(shade+1)/12})`;
        glyphCtx.fillText(character,(col*12+shade)*10+5,row*12+6);
      }
    });
  });
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
        const character=(code&7)-1,row=(code>>3)&3,shade=(code>>5)&15;
        ctx.globalAlpha=((code>>9)&31)/31;
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
    nextScene[line*sceneColumns+column]=(character+1)|(row<<3)|(shade<<5)|(Math.round(opacity*31)<<9);
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
      writeSceneCell(x,y,character,1,shade,world.opacity);
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
        alpha=.22+.65*value;row=world.kind==='jupiter'?1:0;
      }
      else if(land){character=brightness>.6?4:brightness>.32?3:2;alpha=.43+.57*brightness;row=0;}
      else if(cloud&&cloudStrength>0&&p.noise-Math.floor(p.noise)<cloudStrength){character=p.noise>.3?2:1;alpha=.17+.42*brightness+.08*cloudStrength;row=1;}
      else{character=p.noise>.3?1:0;alpha=.17+.42*brightness;row=2;}
      if(p.z<.1){character=0;alpha=.5;row=0;}
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
    const diameter=mobile?90:Math.max(110,Math.min(innerWidth*.105,160));
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
    label.style.opacity=bottom.style.opacity=String(1-smooth(.01,.18,progress));
    label.style.transform=`translate3d(${driftX*.45}px,${driftY*.45}px,0)`;
    arrival.style.opacity=paused?'0':String(smooth(.28,.43,progress)*(1-smooth(.59,.77,progress)));
    arrival.style.transform=`translate3d(0,${(1-smooth(.28,.6,progress))*20}px,0)`;
    starCanvas.style.opacity=String(1-.48*smooth(.45,1,clamp(scrollY/trackLength)));
    if(!paused&&!document.hidden&&t-frame>33){
      if(progress<.98&&scrollY<journey.offsetHeight){rotation+=.000022*Math.min(t-frame,100);}
      drawStars(spaceTime);frame=t;
    }
    if(progress<.98&&scrollY<journey.offsetHeight)drawEarth();
    requestAnimationFrame(animate);
  }
  const starCanvas=document.querySelector('#stars'),sctx=starCanvas.getContext('2d');
  let starPoints=[],columns=0,lines=0,cellAlpha,cellGlyph,cellTone,previousStars;
  function galaxyCurve(u,t){return innerHeight*(.92-u*.93+.09*Math.sin(u*Math.PI*1.8+t*.000017));}
  function stars(){
    const dpr=Math.min(devicePixelRatio,1.5);starCanvas.width=innerWidth*dpr;starCanvas.height=innerHeight*dpr;sctx.setTransform(dpr,0,0,dpr,0,0);
    columns=Math.ceil(innerWidth/CELL_WIDTH)+1;lines=Math.ceil(innerHeight/CELL_HEIGHT)+1;
    cellAlpha=new Float32Array(columns*lines);cellGlyph=new Uint8Array(columns*lines);cellTone=new Uint8Array(columns*lines);previousStars=new Uint16Array(columns*lines);
    let seed=23;const rand=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
    starPoints=[];
    const count=innerWidth<650?1300:2800;
    for(let i=0;i<count;i++){
      const across=Math.sqrt(-2*Math.log(Math.max(.0001,rand())))*Math.cos(rand()*Math.PI*2);
      const spread=i<count*.83,choice=rand(),core=Math.exp(-across*across*.6);
      const character=spread&&core>.7&&choice>.87?5:choice>.77?3:choice>.42?2:choice>.25?1:0;
      starPoints.push({u:rand()*1.4-.2,v:spread?across:rand(),spread,character,tone:rand(),phase:rand()*Math.PI*2,speed:.6+rand()*.6,core});
    }
    drawStars(spaceTime);
  }
  function drawStars(t){
    cellAlpha.fill(0);
    // The galaxy is made entirely of text: no painted haze, gradients, or glow.
    sctx.font='8px monospace';sctx.textAlign='center';sctx.textBaseline='middle';
    for(const p of starPoints){
      const flowSpeed=SHARED_STAR_FLOW?(p.spread?.000010*(1+.08*Math.sin(p.v*1.5)):.0000035):.000006*p.speed;
      const u=((p.u+.2+t*flowSpeed)%1.4)-.2,x=u*innerWidth;
      const width=innerHeight*(.255+.035*Math.sin(u*3+t*(SHARED_STAR_FLOW?.000022:.000009)));
      const current=Math.sin(u*5.5-t*.000065)*innerHeight*.026;
      const y=SHARED_STAR_FLOW?(p.spread?galaxyCurve(u,t)+p.v*width+current:p.v*innerHeight+current*.3):(p.spread?galaxyCurve(u,t)+p.v*width+Math.sin(u*7+p.phase+t*.000045)*9:p.v*innerHeight+Math.sin(t*.00005+p.phase)*5);
      if(y<-10||y>innerHeight+10)continue;
      const distance=Math.hypot((x-innerWidth*.26)/(innerWidth*.39),(y-innerHeight*.43)/(innerHeight*.36));
      const quiet=.48+.52*smooth(.25,1.2,distance);
      const shapeBrightness=p.character===5?.95:p.character===3?.77:p.character===2?.6:.45;
      const intensity=p.spread?( .17+.73*p.core)*shapeBrightness:.14+p.tone*.2;
      const shimmer=.91+.09*Math.sin(t*.00025+p.phase);
      const alpha=intensity*quiet*shimmer;
      const row=p.character===5||p.tone>.72?3:0;
      // The flow is sampled into fixed terminal cells; symbols never slide between cells.
      const column=Math.round(x/CELL_WIDTH),line=Math.round(y/CELL_HEIGHT);
      if(column<0||column>=columns||line<0||line>=lines)continue;
      const index=line*columns+column;
      if(alpha>cellAlpha[index]){cellAlpha[index]=alpha;cellGlyph[index]=p.character;cellTone[index]=row;}
    }
    for(let line=0;line<lines;line++){for(let column=0;column<columns;column++){
      const index=line*columns+column,opacity=Math.round(cellAlpha[index]*31);
      const code=opacity?((cellGlyph[index]+1)|(cellTone[index]<<3)|(opacity<<5)):0;
      if(code===previousStars[index])continue;
      const x=column*CELL_WIDTH,y=line*CELL_HEIGHT;
      sctx.clearRect(x-CELL_WIDTH/2,y-CELL_HEIGHT/2,CELL_WIDTH,CELL_HEIGHT);
      if(code){sctx.globalAlpha=opacity/31;sctx.drawImage(glyphSheet,(cellGlyph[index]*12+11)*10,cellTone[index]*12,10,12,x-5,y-6,10,12);}
      previousStars[index]=code;
    }}
    sctx.globalAlpha=1;
  }
  stars();addEventListener('resize',stars);
  drawEarth();requestAnimationFrame(animate);
  const wave=document.querySelector('.waveform');for(let i=0;i<87;i++){const b=document.createElement('span');b.style.height=(8+Math.abs(Math.sin(i*.46)*Math.cos(i*.13))*92)+'%';wave.append(b);}
  const observer=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target);}});},{threshold:.08});
  document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));
  document.body.classList.add('js-ready');
  document.querySelector('#year').textContent=String(new Date().getFullYear());
  const projects=[
    {name:'Atlas',type:'01 / WEB APP',summary:'A home for places worth remembering.',tags:['Travel journal','Maps','Personal project'],body:'A place to collect the cafés, quiet streets, and little discoveries that make a trip your own. Atlas brings your saved places and personal notes into one thoughtful travel journal.',details:['Save places alongside the stories behind them.','Organize discoveries into collections for each trip.','Revisit a journey through a map of your memories.']},
    {name:'Frequency',type:'02 / EXPERIMENT',summary:'A quieter internet, one sound at a time.',tags:['Creative coding','Sound','Interaction design'],body:'An exploration of how sound and a simple interface can make room for focus. Frequency imagines a small, calm listening space built around ambient textures and gentle visual feedback.',details:['Mix ambient layers to create a personal soundscape.','Set aside a little time for uninterrupted focus.','Watch a subtle visualization respond to the sound.']},
    {name:'Commonplace',type:'03 / PERSONAL TOOL',summary:'A little garden for links, notes, and passing thoughts.',tags:['Digital garden','Knowledge','Personal project'],body:'Good ideas rarely arrive fully formed. Commonplace gives passing thoughts, interesting links, and unfinished notes a home where connections can gradually grow.',details:['Capture an idea before it gets away.','Connect notes through shared themes and curiosity.','Return to older thoughts and see them in a new light.']}
  ];
  const dialog=document.querySelector('#project-dialog');
  let lastFocused=null;
  document.querySelectorAll('[data-project]').forEach(card=>card.addEventListener('click',()=>{
    const p=projects[Number(card.dataset.project)];lastFocused=card;
    document.querySelector('#dialog-title').textContent=p.name;
    document.querySelector('#dialog-type').textContent=p.type;
    document.querySelector('#dialog-summary').textContent=p.summary;
    document.querySelector('#dialog-body').textContent=p.body;
    const tags=document.querySelector('#dialog-tags');tags.replaceChildren(...p.tags.map(t=>{const el=document.createElement('span');el.textContent=t;return el;}));
    const details=document.querySelector('#dialog-details');details.replaceChildren(...p.details.map(t=>{const el=document.createElement('li');el.textContent=t;return el;}));
    dialog.showModal();document.body.style.overflow='hidden';dialog.scrollTop=0;
  }));
  document.querySelector('.dialog-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  dialog.addEventListener('close',()=>{document.body.style.overflow='';lastFocused?.focus({preventScroll:true});});
})();
