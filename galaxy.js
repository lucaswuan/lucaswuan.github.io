// Shared Milky Way background and motion preference for every page.
(() => {
  'use strict';
  const starCanvas=document.querySelector('#stars');
  if(!starCanvas)return;
  const sctx=starCanvas.getContext('2d');
  // One text grid for the whole ASCII scene: app.js draws the planets on it too.
  const CELL_WIDTH=7, CELL_HEIGHT=11;
  const GALAXY_SPEED=.4; // Slow the drift while keeping the same rendering cadence.
  const clamp=n=>Math.max(0,Math.min(1,n));
  const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  let paused=media.matches;
  try{paused=paused||localStorage.getItem('orbit-motion')==='off';}catch{}
  const motionButton=document.querySelector('#motion-toggle');
  let spaceTime=0;
  function motionState(){document.body.classList.toggle('motion-paused',paused);motionButton.setAttribute('aria-pressed',String(paused));motionButton.setAttribute('aria-label',paused?'Resume animation':'Pause animation');motionButton.querySelector('.motion-text').textContent=paused?'Motion off':'Motion on';}
  motionButton.addEventListener('click',()=>{paused=!paused;motionState();try{localStorage.setItem('orbit-motion',paused?'off':'on');}catch{}});
  media.addEventListener('change',()=>{paused=media.matches;motionState();});
  motionState();

  // Characters from faint to dense. Like ASCII art shading a photo, a cell's brightness picks its character.
  const RAMP=['.',',',':',';','-','=','+','*','#','%','@'];
  const PLUS=6,STAR=7;
  // After the ramp, the sheet holds extra dots for faint stars at different spots in the cell (CSS px from its
  // centre), so a crowded star field looks scattered instead of lined up on the grid.
  const DOT_SPOTS=[[0,0],[-2,-3],[2,-3],[-2,3],[2,3],[0,-3.5],[0,3.5]],DOTS=RAMP.length;
  // The same monospace font on every device: the pages load JetBrains Mono with just these characters.
  // Until it arrives (or if it can't), the system's monospace stands in.
  const GLYPH_FONT='"JetBrains Mono",ui-monospace,"SF Mono",Menlo,Consolas,monospace',GLYPH_SIZE=11;
  // Every character in every colour, cached once per screen density and drawn at the screen's real pixel density,
  // so it is copied 1:1 and stays sharp. Each character's ink is centred in its tile (a little larger than a cell),
  // so dots and dashes sit in the middle of their cell like points of light.
  function glyphSheet(colors,scale){
    const tileW=Math.ceil((CELL_WIDTH+4)*scale),tileH=Math.ceil((CELL_HEIGHT+4)*scale),canvas=document.createElement('canvas');
    canvas.width=tileW*(RAMP.length+DOT_SPOTS.length);canvas.height=tileH*colors.length;
    const ink=canvas.getContext('2d');
    ink.font=`500 ${GLYPH_SIZE*scale}px ${GLYPH_FONT}`;
    RAMP.forEach((character,col)=>{
      const m=ink.measureText(character);
      const x=Math.round((col+.5)*tileW-(m.actualBoundingBoxRight-m.actualBoundingBoxLeft)/2);
      const lift=(m.actualBoundingBoxAscent-m.actualBoundingBoxDescent)/2;
      colors.forEach((color,row)=>{ink.fillStyle=color;ink.fillText(character,x,Math.round((row+.5)*tileH+lift));});
    });
    const m=ink.measureText('.'),dotX=(m.actualBoundingBoxRight-m.actualBoundingBoxLeft)/2,dotY=(m.actualBoundingBoxAscent-m.actualBoundingBoxDescent)/2;
    DOT_SPOTS.forEach(([dx,dy],i)=>colors.forEach((color,row)=>{
      ink.fillStyle=color;ink.fillText('.',Math.round((DOTS+i+.5)*tileW+dx*scale-dotX),Math.round((row+.5)*tileH+dy*scale+dotY));
    }));
    return {canvas,tileW,tileH,scale};
  }
  // The device-pixel box of the cell centred at (x, y) in CSS pixels: [left, top, width, height].
  const box=[0,0,0,0];
  function cellBox(x,y,s){
    box[0]=Math.round((x-CELL_WIDTH/2)*s);box[1]=Math.round((y-CELL_HEIGHT/2)*s);
    box[2]=Math.round((x+CELL_WIDTH/2)*s)-box[0];box[3]=Math.round((y+CELL_HEIGHT/2)*s)-box[1];
    return box;
  }
  // Copies only the part of a character's tile that covers its cell, so a character can never spill into a
  // neighbouring cell and be left behind when that cell changes.
  function drawGlyph(ctx,sheet,character,row,x,y){
    const {canvas,tileW,tileH,scale:s}=sheet,[left,top,width,height]=cellBox(x,y,s);
    ctx.drawImage(canvas,character*tileW+left-Math.round(x*s-tileW/2),row*tileH+top-Math.round(y*s-tileH/2),width,height,left,top,width,height);
  }

  // Like a photo of the Milky Way: mostly white and blue-white stars, a warm golden core, and amber light along the
  // edges of the dark dust lanes. Each star keeps its colour as it flows, so the colours stay grouped.
  const starColors=['#f4f6ff','#c4d8ff','#86b6ff','#fff0d6','#e9a867','#ffd99a'];
  const WHITE=0,BLUE_WHITE=1,BLUE=2,CREAM=3,AMBER=4,GOLD=5;

  // Smooth random patterns (value noise). They wrap around along the band, so the flow can loop without a seam.
  function hash(i,j){let h=Math.imul(i,374761393)^Math.imul(j,668265263);h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967296;}
  function noise(x,y,period){
    const xi=Math.floor(x),yi=Math.floor(y),fx=x-xi,fy=y-yi,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
    const x0=(xi%period+period)%period,x1=(x0+1)%period;
    const a=hash(x0,yi),b=hash(x1,yi),c=hash(x0,yi+1),d=hash(x1,yi+1);
    return a+(b-a)*sx+(c-a)*sy+(a-b-c+d)*sx*sy;
  }
  function fractal(x,y,period,octaves){
    let sum=0,weight=.5,total=0;
    for(let o=0;o<octaves;o++){sum+=weight*noise(x,y,period);total+=weight;x*=2;y*=2;period*=2;weight*=.5;}
    return sum/total;
  }

  // The band's structure: s runs along the band (one screen width = 1, repeating every LOOP) and v across it
  // (0 on the centre line, ±1 at its edges, negative above). Stars are scattered to match it and then flow along
  // with it, so the clouds and dust lanes travel across the screen too.
  const profiling=new URLSearchParams(location.search).has('profile'),drawTimings=[];
  const LOOP=2,S_STEPS=256,V_STEPS=96,V_MAX=2.6;
  const clouds=new Float32Array(S_STEPS*V_STEPS),dust=new Float32Array(S_STEPS*V_STEPS);
  function textureColumn(i){
    const s=i/S_STEPS*LOOP;
    // The Great Rift: a dark lane just above the centre line that weaves, widens, and fades in and out.
    const riftCentre=-.18+.14*Math.sin(s*Math.PI*3+1.3)+.2*(fractal(s*3,7,3*LOOP,2)-.5);
    const riftWidth=.14+.18*fractal(s*4,19,4*LOOP,2);
    const riftDepth=smooth(.28,.55,fractal(s*2,33,2*LOOP,2));
    for(let j=0;j<V_STEPS;j++){
      const v=(j/(V_STEPS-1)*2-1)*V_MAX,k=i*V_STEPS+j;
      // Patchy star clouds rather than an even spread.
      clouds[k]=smooth(.22,.78,fractal(s*6,v*2.2+40,6*LOOP,3));
      // Thin dark filaments branch off the rift, mostly on its upper side (the ridges of a noise pattern).
      const ridge=1-Math.abs(2*fractal(s*11,v*2.6+70,11*LOOP,3)-1);
      const filaments=smooth(.74,.9,ridge)*Math.exp(-((v+.25)**2)*1.4);
      dust[k]=Math.min(1,riftDepth*Math.exp(-(((v-riftCentre)/riftWidth)**2))+filaments);
    }
  }
  const fieldIndex=(s,v)=>{const i=Math.floor(((s%LOOP+LOOP)%LOOP)/LOOP*S_STEPS)%S_STEPS;return i*V_STEPS+Math.round((v/V_MAX+1)*.5*(V_STEPS-1));};
  // The galaxy's core: brighter, denser, and golden. It stays a little right of centre while the band flows through it.
  const CORE_U=.58,CORE_V=.1;
  const coreAlong=u=>Math.exp(-(((u-CORE_U)/.17)**2)),coreAcross=v=>Math.exp(-(((v-CORE_V)/.55)**2));

  // Stars live in flat number arrays, FIELDS numbers each, so tens of thousands are quick to make and to move.
  // Band stars keep their place along and across the band (S, V); sky stars keep a screen position (S = x, V = y).
  const FIELDS=9,S=0,V=1,BRIGHT=2,RANK=3,WARM=4,PHASE=5,RATE=6,COLOUR=7,SPOT=8;
  let band=new Float32Array(0),sky=new Float32Array(0),columns=0,lines=0,glow,peak,tone,spot,crowd,previous,quiet,sheet=null;
  let colCentre,colWidth,colIndex,colCore,resumeLine=0,pending=false;
  // The star canvas is sized to the tallest viewport (toolbar hidden), so starH stays put while the toolbar moves.
  let starW=0,starH=0,starDpr=0,deviceW=0,deviceH=0;
  function galaxyCurve(u,t){return starH*(.92-u*.93+.09*Math.sin(u*Math.PI*1.8+t*.000017));}
  // Makes the band's texture (once) and the stars for a grid of this many cells (the same stars every time, from a
  // fixed seed). It pauses (yield) every so often, so the work can be spread between frames.
  let textureMade=0;
  function* makeStars(total){
    while(textureMade<S_STEPS){for(const end=Math.min(S_STEPS,textureMade+24);textureMade<end;textureMade++)textureColumn(textureMade);yield;}
    let seed=23;const rand=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
    const gauss=()=>Math.sqrt(-2*Math.log(Math.max(.0001,rand())))*Math.cos(rand()*Math.PI*2);
    // Thousands of stars, most of them faint: together they make the band's milky glow, as in a photo.
    // Band stars are scattered across the band's clouds and kept out of its dust.
    const wanted=Math.round(total*2),nextBand=new Float32Array(wanted*FIELDS);
    let made=0;
    for(let tries=1;made<wanted&&tries<wanted*10;tries++){
      if(tries%5000===0)yield;
      const s=rand()*LOOP,v=gauss()*(rand()<.25?1.05:.5);
      if(v<=-V_MAX||v>=V_MAX)continue;
      const k=fieldIndex(s,v);
      if(rand()>(.3+.7*clouds[k])*(1-dust[k]))continue;
      const pick=rand(),o=made++*FIELDS;
      nextBand[o+S]=s;nextBand[o+V]=v;nextBand[o+BRIGHT]=.15+.85*rand()**4;nextBand[o+RANK]=rand();nextBand[o+WARM]=rand();
      nextBand[o+PHASE]=rand()*7;nextBand[o+RATE]=.003+rand()*.006;nextBand[o+SPOT]=Math.floor(rand()*DOT_SPOTS.length);
      nextBand[o+COLOUR]=dust[k]>.2&&pick<.3?AMBER:Math.abs(v)>.9?(pick<.6?BLUE_WHITE:BLUE):pick<.6?WHITE:BLUE_WHITE;
    }
    const nextSky=new Float32Array(Math.round(total*.045)*FIELDS);
    for(let o=0;o<nextSky.length;o+=FIELDS){
      const pick=rand();
      nextSky[o+S]=rand()*1.4-.2;nextSky[o+V]=rand();nextSky[o+BRIGHT]=.2+.6*rand()**4;nextSky[o+PHASE]=rand()*7;nextSky[o+RATE]=.003+rand()*.006;
      nextSky[o+SPOT]=Math.floor(rand()*DOT_SPOTS.length);nextSky[o+COLOUR]=pick<.55?WHITE:pick<.85?BLUE_WHITE:pick<.95?BLUE:CREAM;
    }
    band=nextBand.subarray(0,made*FIELDS);sky=nextSky;
  }
  // Runs makeStars in slices of a few milliseconds between frames, so the page never stalls; a newer run (after a
  // resize) replaces an older one. The sky is drawn once its stars are ready.
  let building=0,starsMade=false;
  function build(steps){
    const id=++building,started=performance.now();
    const slice=()=>{
      if(id!==building)return;
      const until=performance.now()+6;
      while(performance.now()<until){
        if(steps.next().done){
          starsMade=true;
          if(profiling)console.info('Milky Way stars: '+(performance.now()-started).toFixed(0)+' ms in slices, '+band.length/FIELDS+' band stars');
          if(ready)drawStars(spaceTime);
          return;
        }
      }
      setTimeout(slice,0);
    };
    slice();
  }
  function stars(){
    const dpr=devicePixelRatio||1,h=starCanvas.clientHeight||innerHeight;
    // The exact device-pixel size (from the observer below) avoids a sub-pixel resample at 125% or 175% scaling.
    const width=deviceW||Math.round(innerWidth*dpr),height=deviceH||Math.round(h*dpr);
    if(innerWidth===starW&&h===starH&&dpr===starDpr&&starCanvas.width===width&&starCanvas.height===height)return;
    starW=innerWidth;starH=h;starDpr=dpr;
    if(!sheet||sheet.scale!==dpr)sheet=glyphSheet(starColors,dpr);
    starCanvas.width=width;starCanvas.height=height;
    const nextColumns=Math.ceil(innerWidth/CELL_WIDTH)+1,nextLines=Math.ceil(starH/CELL_HEIGHT)+1,total=nextColumns*nextLines;
    // New stars only when the grid itself changes size.
    if(nextColumns!==columns||nextLines!==lines){
      columns=nextColumns;lines=nextLines;resumeLine=0;
      glow=new Float32Array(total);peak=new Float32Array(total);tone=new Uint8Array(total);spot=new Uint8Array(total);crowd=new Uint8Array(total);
      previous=new Uint16Array(total);quiet=new Float32Array(total);
      colCentre=new Float32Array(columns);colWidth=new Float32Array(columns);colIndex=new Int32Array(columns);colCore=new Float32Array(columns);
      build(makeStars(total));
    }
    // Dimmer behind the homepage's opening text.
    for(let l=0;l<lines;l++){for(let c=0;c<columns;c++){
      const qx=(c*CELL_WIDTH-innerWidth*.26)/(innerWidth*.39),qy=(l*CELL_HEIGHT-starH*.43)/(starH*.36);
      quiet[l*columns+c]=.35+.65*smooth(.25,1.2,Math.sqrt(qx*qx+qy*qy));
    }}
    previous.fill(0);
    if(ready&&starsMade)drawStars(spaceTime);
  }
  function drawStars(t){
    const started=profiling?performance.now():0;
    const W=innerWidth,H=starH,flow=t*.00001,dim=W<650?.8:1;
    // Per column: where the band runs, how wide it is, how close to the core, and which part of the band has
    // flowed there.
    for(let c=0;c<columns;c++){
      const u=c*CELL_WIDTH/W;
      colCentre[c]=galaxyCurve(u,t)+Math.sin(u*5.5-t*.000065)*H*.026;
      colWidth[c]=H*(.255+.035*Math.sin(u*3+t*.000022))*(1+.25*coreAlong(u));
      colIndex[c]=fieldIndex(u-flow,-V_MAX);
      colCore[c]=coreAlong(u);
    }
    glow.fill(0);peak.fill(0);spot.fill(0);crowd.fill(0);
    // Each cell adds up the light that lands in it, like a photo's pixel, and remembers its brightest star (by the
    // star's own brightness, before the core brightens it) and that star's colour.
    const add=(index,light,star,colour,where)=>{glow[index]+=light;if(star){crowd[index]++;if(star>peak[index]){peak[index]=star;tone[index]=colour;spot[index]=where;}}};
    // A soft haze in the core, darkened where dust crosses it.
    for(let c=0;c<columns;c++){
      if(colCore[c]<.05)continue;
      for(let l=0;l<lines;l++){
        const v=(l*CELL_HEIGHT-colCentre[c])/colWidth[c];
        const core=colCore[c]*coreAcross(v);
        if(core<.1||v<=-V_MAX||v>=V_MAX)continue;
        const index=l*columns+c;
        add(index,core*core*(1-dust[colIndex[c]+Math.round((v/V_MAX+1)*.5*(V_STEPS-1))])*.5*quiet[index]*dim,0,WHITE,0);
      }
    }
    // Where each star has flowed to: its place along the band plus the flow so far, wrapped into one loop.
    const shift=(flow%LOOP+LOOP)%LOOP,perCell=W/CELL_WIDTH;
    for(let o=0;o<band.length;o+=FIELDS){
      let u=band[o+S]+shift;
      if(u>=LOOP)u-=LOOP;
      if(u>LOOP-.01)u-=LOOP;
      if(u>1.01)continue;
      const c=Math.round(u*perCell);
      if(c<0||c>=columns)continue;
      const v=band[o+V],l=Math.round((colCentre[c]+v*colWidth[c])/CELL_HEIGHT);
      if(l<0||l>=lines)continue;
      // More stars show, brighter and warmer, as they pass through the core; fewer behind the opening text.
      const index=l*columns+c,core=colCore[c]>.01?colCore[c]*coreAcross(v):0,q=quiet[index];
      if(band[o+RANK]>(.45+.6*core)*(.45+.55*q))continue;
      // Bright stars twinkle: their light rises and falls, so their character steps up and down (+ to *).
      const brightness=band[o+BRIGHT],shine=brightness>.7?brightness*(1+.35*Math.sin(t*band[o+RATE]+band[o+PHASE])):brightness;
      const light=shine*(1+1.6*core)*q*dim,colour=band[o+COLOUR];
      add(index,light,shine,light<.35?(colour===AMBER?WHITE:colour):core>.35&&colour<=BLUE_WHITE?(band[o+WARM]>.6?GOLD:CREAM):colour,band[o+SPOT]);
    }
    // Stars across the rest of the sky drift more slowly than the band, so the sky has some depth.
    for(let o=0;o<sky.length;o+=FIELDS){
      const u=((sky[o+S]+.2+t*.0000035)%1.4)-.2,c=Math.round(u*perCell),l=Math.round(sky[o+V]*H/CELL_HEIGHT);
      if(c<0||c>=columns||l<0||l>=lines)continue;
      const index=l*columns+c,brightness=sky[o+BRIGHT],shine=brightness>.55?brightness*(1+.35*Math.sin(t*sky[o+RATE]+sky[o+PHASE])):brightness;
      add(index,shine*quiet[index]*dim,shine,sky[o+COLOUR],sky[o+SPOT]);
    }
    // A cell's brightest star picks its character (. for most, + and * for the brightest few), and all the light
    // in the cell sets how bright it is, so crowded parts of the band glow instead of filling up with crosses.
    // In a crowded cell a star has to be brighter still to show as + or *.
    // Drawn in device pixels: cells and glyphs land on whole pixels, so nothing is resampled. At most a few
    // thousand cells are redrawn per frame; when the whole sky changes (on load, a resize, or the font arriving)
    // the rest follow over the next frames, starting where this one stopped.
    const s=starDpr;
    let budget=4000;
    for(let n=0;n<lines&&budget>0;n++){
      const l=(resumeLine+n)%lines;
      for(let c=0;c<columns;c++){
        const index=l*columns+c,light=glow[index];
        let code=0;
        if(light>.12){
          const bar=.1*Math.max(0,crowd[index]-1),star=peak[index];
          const character=star<.86+bar?DOTS+spot[index]:star<1.3+bar?PLUS:STAR;
          code=(character+1)|(tone[index]<<5)|(Math.round(Math.min(.95,.16+.55*light)*31)<<8);
        }
        if(code===previous[index])continue;
        const x=c*CELL_WIDTH,y=l*CELL_HEIGHT,[left,top,width,height]=cellBox(x,y,s);
        sctx.clearRect(left,top,width,height);
        if(code){sctx.globalAlpha=(code>>8)/31;drawGlyph(sctx,sheet,(code&31)-1,(code>>5)&7,x,y);}
        previous[index]=code;
        budget--;
      }
      if(budget<=0)resumeLine=(l+1)%lines;
    }
    pending=budget<=0;
    sctx.globalAlpha=1;
    if(profiling){drawTimings.push(performance.now()-started);if(drawTimings.length===60){const sorted=[...drawTimings].sort((a,b)=>a-b);console.info('Milky Way draw: mean '+(drawTimings.reduce((a,b)=>a+b,0)/60).toFixed(1)+' ms; p95 '+sorted[56].toFixed(1)+' ms');drawTimings.length=0;}}
  }
  // The first frame waits briefly for the site's monospace (usually instant once cached), so the stars aren't
  // all drawn twice; after 400 ms the system's monospace stands in, and the font replaces it when it arrives.
  const glyphListeners=[];
  let ready=false,fontApplied=false;
  const applyFont=faces=>{
    if(fontApplied||!faces?.length)return;
    fontApplied=true;sheet=glyphSheet(starColors,starDpr);
    if(ready){previous.fill(65535);if(starsMade)drawStars(spaceTime);}
    glyphListeners.forEach(listener=>listener());
  };
  const fontLoad=document.fonts?document.fonts.load(`500 ${GLYPH_SIZE}px "JetBrains Mono"`,RAMP.join('')).catch(()=>[]):Promise.resolve([]);
  Promise.race([fontLoad,new Promise(done=>setTimeout(done,400,[]))]).then(faces=>{applyFont(faces);ready=true;if(starsMade)drawStars(spaceTime);});
  fontLoad.then(applyFont);
  // iOS browsers can run this before styles.css applies, while the canvas is still its default 150px tall.
  // Measure again once the page (and its stylesheets) has loaded so the stars aren't stretched until a resize.
  // Only then watch the canvas's exact device-pixel size: before styles apply, its size follows its own pixels.
  stars();addEventListener('resize',stars);
  addEventListener('load',()=>{
    stars();
    try{new ResizeObserver(([entry])=>{const size=entry.devicePixelContentBoxSize?.[0];if(size){deviceW=size.inlineSize;deviceH=size.blockSize;stars();}}).observe(starCanvas,{box:'device-pixel-content-box'});}catch{}
  });
  window.portfolioGalaxy={canvas:starCanvas,glyphSheet,cellBox,drawGlyph,cell:[CELL_WIDTH,CELL_HEIGHT],media,
    onGlyphs:listener=>glyphListeners.push(listener),get paused(){return paused;}};
  let lastTime=0,frame=0;
  function animate(t){
    const elapsed=t-lastTime||16;lastTime=t;
    if(!paused&&!document.hidden){
      spaceTime+=Math.min(elapsed,64)*GALAXY_SPEED;
      // The sky moves about a cell a second, so 15 redraws a second are plenty.
      if(ready&&starsMade&&t-frame>66){drawStars(spaceTime);frame=t;}
    }else if(pending&&t-frame>66){
      // With motion off, finish a redraw that was spread over several frames.
      drawStars(spaceTime);frame=t;
    }
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
})();
