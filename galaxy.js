// Shared ASCII sky and motion preference for every page: the Milky Way here, and on the homepage the planets
// app.js places. Stars and planets share one canvas and one text grid, with exactly one character per cell.
(() => {
  'use strict';
  let starCanvas=document.querySelector('#stars');
  if(!starCanvas)return;
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
  const COLON=2,PLUS=6,STAR=7;
  // After the ramp, the sheet holds extra dots for faint stars at different spots in the cell (CSS px from its
  // centre), so a crowded star field looks scattered instead of lined up on the grid. Each is still one character.
  const DOT_SPOTS=[[0,0],[-2,-3],[2,-3],[-2,3],[2,3],[0,-3.5],[0,3.5]],DOTS=RAMP.length;
  // Like the photos: mostly white and blue-white stars, some orange and red ones, a golden core, rust-coloured light
  // along the edges of the dust lanes, dim brown specks in the dust itself, and pink-red nebulae. Each star keeps its
  // colour as it flows.
  const STAR_COLORS=['#f4f6ff','#c4d8ff','#86b6ff','#fff0d6','#e58f6c','#ffd99a','#ff6b5e','#ff8fb4','#ffb070','#b86e55'];
  const WHITE=0,BLUE_WHITE=1,BLUE=2,CREAM=3,RUST=4,GOLD=5,RED=6,PINK=7,ORANGE=8,DUST=9;
  // The planets' colours follow (app.js and sky-renderer.js count from PLANET_ROW): Saturn gold and cream; its B, A,
  // and C rings; Jupiter's zones, belts, and Great Red Spot; Earth's land, clouds, and ocean.
  const PLANET_COLORS=['#e3c88f','#f0e2bf','#efe0bd','#cdb48a','#9d8f76','#f2e3c6','#c98a63','#e3654a','#87e5a2','#e1eff7','#369cff'];
  const PLANET_ROW=STAR_COLORS.length,COLORS=[...STAR_COLORS,...PLANET_COLORS];
  // The same monospace font on every device: the pages load JetBrains Mono with just these characters.
  // Until it arrives (or if it can't), the system's monospace stands in.
  const GLYPH_FONT='"JetBrains Mono",ui-monospace,"SF Mono",Menlo,Consolas,monospace',GLYPH_SIZE=11;
  // Every character in every colour, cached once per screen density and drawn at the screen's real pixel density,
  // so it is copied 1:1 and stays sharp. Each character's ink is centred in its tile (a little larger than a cell),
  // so dots and dashes sit in the middle of their cell like points of light.
  function glyphSheet(scale){
    const tileW=Math.ceil((CELL_WIDTH+4)*scale),tileH=Math.ceil((CELL_HEIGHT+4)*scale),canvas=document.createElement('canvas');
    canvas.width=tileW*(RAMP.length+DOT_SPOTS.length);canvas.height=tileH*COLORS.length;
    const ink=canvas.getContext('2d');
    ink.font=`500 ${GLYPH_SIZE*scale}px ${GLYPH_FONT}`;
    RAMP.forEach((character,col)=>{
      const m=ink.measureText(character);
      const x=Math.round((col+.5)*tileW-(m.actualBoundingBoxRight-m.actualBoundingBoxLeft)/2);
      const lift=(m.actualBoundingBoxAscent-m.actualBoundingBoxDescent)/2;
      COLORS.forEach((color,row)=>{ink.fillStyle=color;ink.fillText(character,x,Math.round((row+.5)*tileH+lift));});
    });
    const m=ink.measureText('.'),dotX=(m.actualBoundingBoxRight-m.actualBoundingBoxLeft)/2,dotY=(m.actualBoundingBoxAscent-m.actualBoundingBoxDescent)/2;
    DOT_SPOTS.forEach(([dx,dy],i)=>COLORS.forEach((color,row)=>{
      ink.fillStyle=color;ink.fillText('.',Math.round((DOTS+i+.5)*tileW+dx*scale-dotX),Math.round((row+.5)*tileH+dy*scale+dotY));
    }));
    return {canvas,tileW,tileH,scale};
  }

  // Drawn by the GPU when it can (sky-renderer.js), otherwise cell by cell on a 2D canvas. ?2d forces the 2D one.
  let gpu=null;
  if(window.createSkyRenderer&&!new URLSearchParams(location.search).has('2d')){
    const gl=starCanvas.getContext('webgl2',{alpha:true,antialias:false,depth:false,stencil:false});
    if(gl)try{gpu=window.createSkyRenderer(gl,{cellWidth:CELL_WIDTH,cellHeight:CELL_HEIGHT,planetRow:PLANET_ROW});}catch(error){
      console.warn('Using the compatible text renderer.',error.message);
      // A canvas keeps the first kind of context it was given, so the 2D renderer gets a fresh one.
      const replacement=starCanvas.cloneNode(true);starCanvas.replaceWith(replacement);starCanvas=replacement;
    }
  }
  const sctx=gpu?null:starCanvas.getContext('2d');
  // The device-pixel box of the cell centred at (x, y) in CSS pixels: [left, top, width, height].
  const box=[0,0,0,0];
  function cellBox(x,y,s){
    box[0]=Math.round((x-CELL_WIDTH/2)*s);box[1]=Math.round((y-CELL_HEIGHT/2)*s);
    box[2]=Math.round((x+CELL_WIDTH/2)*s)-box[0];box[3]=Math.round((y+CELL_HEIGHT/2)*s)-box[1];
    return box;
  }

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
  // with it, so the clouds, dust lanes, and nebulae travel across the screen too.
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
  // Glowing pink-red nebulae along the band, like the Lagoon or Carina nebulae in photos: [s, v, length, width].
  const NEBULAE=[[.2,-.05,.042,.24],[.52,.32,.058,.32],[.86,-.42,.036,.2],[1.14,.12,.052,.28],[1.47,-.22,.046,.26],[1.79,.36,.04,.22]];

  // Stars live in flat number arrays, FIELDS numbers each, so tens of thousands are quick to make and to move.
  // Band stars keep their place along and across the band (S, V); sky stars keep a screen position (S = x, V = y).
  const FIELDS=9,S=0,V=1,BRIGHT=2,RANK=3,WARM=4,PHASE=5,RATE=6,COLOUR=7,SPOT=8;
  let band=new Float32Array(0),sky=new Float32Array(0),columns=0,lines=0,sheet=null;
  let glow,peak,tone,haze,hazeTone,spot,crowd,quiet,cells,starCodes,previous;
  let colCentre,colWidth,colIndex,colCore,resumeLine=0;
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
    // Band stars are scattered across the band's clouds and mostly kept out of its dust (a few foreground stars
    // still show through); a few are orange or red.
    const wanted=Math.round(total*2),nebulaStars=Math.round(total*.03),specks=Math.round(total*.18);
    const nextBand=new Float32Array((wanted+nebulaStars*NEBULAE.length+specks)*FIELDS);
    let made=0;
    const add=(s,v,brightness,rank,colour)=>{
      const o=made++*FIELDS;
      nextBand[o+S]=(s%LOOP+LOOP)%LOOP;nextBand[o+V]=v;nextBand[o+BRIGHT]=brightness;nextBand[o+RANK]=rank;nextBand[o+WARM]=rand();
      nextBand[o+PHASE]=rand()*7;nextBand[o+RATE]=.003+rand()*.006;nextBand[o+SPOT]=Math.floor(rand()*DOT_SPOTS.length);nextBand[o+COLOUR]=colour;
    };
    for(let tries=1;made<wanted&&tries<wanted*10;tries++){
      if(tries%5000===0)yield;
      const s=rand()*LOOP,v=gauss()*(rand()<.25?1.05:.5);
      if(v<=-V_MAX||v>=V_MAX)continue;
      const k=fieldIndex(s,v);
      if(rand()>(.3+.7*clouds[k])*(1-.88*dust[k]))continue;
      const brightness=.15+.85*rand()**4,pick=rand(),hot=rand();
      const colour=hot<.04+.12*brightness?(hot<.015+.05*brightness?RED:ORANGE):dust[k]>.2&&pick<.3?RUST:Math.abs(v)>.9?(pick<.6?BLUE_WHITE:BLUE):pick<.6?WHITE:BLUE_WHITE;
      add(s,v,brightness,rand(),colour);
    }
    // Each nebula is a cloud of pink stars with a redder heart; they nearly always show.
    for(const [s0,v0,along,across] of NEBULAE){
      for(let i=0;i<nebulaStars;i++){
        const ds=gauss(),dv=gauss(),heart=ds*ds+dv*dv<.5;
        add(s0+ds*along,v0+dv*across,.3+.55*rand()**2,rand()*.35,heart&&rand()<.55?RED:rand()<.85?PINK:WHITE);
      }
      yield;
    }
    // Sparse, dim brown specks inside the dust, so the lanes read as dark clouds rather than holes.
    for(let tries=1,count=0;count<specks&&tries<specks*40;tries++){
      if(tries%5000===0)yield;
      const s=rand()*LOOP,v=gauss()*.6,k=fieldIndex(s,Math.max(-V_MAX,Math.min(V_MAX,v)));
      if(rand()>smooth(.25,.8,dust[k]))continue;
      add(s,v,.14+.12*rand(),rand(),DUST);count++;
    }
    // The rest of the sky: many faint stars, a few brighter, in every star colour.
    const nextSky=new Float32Array(Math.round(total*.065)*FIELDS);
    for(let o=0;o<nextSky.length;o+=FIELDS){
      const pick=rand();
      nextSky[o+S]=rand()*1.4-.2;nextSky[o+V]=rand();nextSky[o+BRIGHT]=.14+.6*rand()**5;nextSky[o+PHASE]=rand()*7;nextSky[o+RATE]=.003+rand()*.006;
      nextSky[o+SPOT]=Math.floor(rand()*DOT_SPOTS.length);
      nextSky[o+COLOUR]=pick<.5?WHITE:pick<.75?BLUE_WHITE:pick<.84?BLUE:pick<.91?ORANGE:pick<.95?RED:CREAM;
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
          if(profiling)console.info('Milky Way stars: '+(performance.now()-started).toFixed(0)+' ms in slices, '+band.length/FIELDS+' band stars');
          starsMade=true;if(ready)updateStars(spaceTime);
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
    if(!sheet||sheet.scale!==dpr)useSheet();
    starCanvas.width=width;starCanvas.height=height;
    const nextColumns=Math.ceil(innerWidth/CELL_WIDTH)+1,nextLines=Math.ceil(starH/CELL_HEIGHT)+1,total=nextColumns*nextLines;
    // New stars only when the grid itself changes size.
    if(nextColumns!==columns||nextLines!==lines){
      columns=nextColumns;lines=nextLines;resumeLine=0;
      glow=new Float32Array(total);peak=new Float32Array(total);tone=new Uint8Array(total);haze=new Float32Array(total);hazeTone=new Uint8Array(total);
      spot=new Uint8Array(total);crowd=new Uint8Array(total);quiet=new Float32Array(total);cells=new Uint8Array(total*4);
      starCodes=new Uint16Array(total);previous=new Uint16Array(total);
      colCentre=new Float32Array(columns);colWidth=new Float32Array(columns);colIndex=new Int32Array(columns);colCore=new Float32Array(columns);
      build(makeStars(total));
    }
    // Dimmer behind the homepage's opening text.
    for(let l=0;l<lines;l++){for(let c=0;c<columns;c++){
      const qx=(c*CELL_WIDTH-innerWidth*.26)/(innerWidth*.39),qy=(l*CELL_HEIGHT-starH*.43)/(starH*.36);
      quiet[l*columns+c]=.35+.65*smooth(.25,1.2,Math.sqrt(qx*qx+qy*qy));
    }}
    previous.fill(0);dirty=true;
    if(ready&&starsMade)updateStars(spaceTime);
  }
  // Works out every cell's star (or none) for time t: its character, colour, and brightness.
  function updateStars(t){
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
    glow.fill(0);peak.fill(0);haze.fill(0);spot.fill(0);crowd.fill(0);
    // Each cell adds up the light that lands in it, like a photo's pixel, and remembers its brightest star (by the
    // star's own brightness, before the core brightens it) and that star's colour. Haze lights cells too, in its
    // own colour where no star has landed.
    const add=(index,light,star,colour,where)=>{glow[index]+=light;crowd[index]++;if(star>peak[index]){peak[index]=star;tone[index]=colour;spot[index]=where;}};
    const addHaze=(index,light,colour)=>{glow[index]+=light;if(light>haze[index]){haze[index]=light;hazeTone[index]=colour;}};
    // A soft haze in the core, darkened where dust crosses it.
    for(let c=0;c<columns;c++){
      if(colCore[c]<.05)continue;
      for(let l=0;l<lines;l++){
        const v=(l*CELL_HEIGHT-colCentre[c])/colWidth[c],core=colCore[c]*coreAcross(v);
        if(core<.1||v<=-V_MAX||v>=V_MAX)continue;
        const index=l*columns+c;
        addHaze(index,core*core*(1-dust[colIndex[c]+Math.round((v/V_MAX+1)*.5*(V_STEPS-1))])*.5*quiet[index]*dim,WHITE);
      }
    }
    // Where each star has flowed to: its place along the band plus the flow so far, wrapped into one loop.
    const shift=(flow%LOOP+LOOP)%LOOP,perCell=W/CELL_WIDTH;
    const place=s=>{let u=s+shift;if(u>=LOOP)u-=LOOP;if(u>LOOP-.01)u-=LOOP;return u;};
    // The nebulae's glow, faint and pink, around their stars.
    for(const [s0,v0,along,across] of NEBULAE){
      const u0=place((s0%LOOP+LOOP)%LOOP);
      if(u0<-.1||u0>1.1)continue;
      const c0=Math.round(u0*perCell),reach=Math.ceil(2.4*along*perCell);
      for(let c=Math.max(0,c0-reach);c<=Math.min(columns-1,c0+reach);c++){
        const du=(c*CELL_WIDTH/W-u0)/along;
        for(let l=0;l<lines;l++){
          const dv=((l*CELL_HEIGHT-colCentre[c])/colWidth[c]-v0)/across,g=Math.exp(-(du*du+dv*dv)*.6);
          if(g>.05){const index=l*columns+c;addHaze(index,g*.75*quiet[index]*dim,PINK);}
        }
      }
    }
    for(let o=0;o<band.length;o+=FIELDS){
      const u=place(band[o+S]);
      if(u>1.01)continue;
      const c=Math.round(u*perCell);
      if(c<0||c>=columns)continue;
      const v=band[o+V],l=Math.round((colCentre[c]+v*colWidth[c])/CELL_HEIGHT);
      if(l<0||l>=lines)continue;
      // More stars show, brighter and warmer, as they pass through the core; fewer behind the opening text.
      const index=l*columns+c,core=colCore[c]>.01?colCore[c]*coreAcross(v):0,q=quiet[index];
      if(band[o+RANK]>(.55+.5*core)*(.45+.55*q))continue;
      // Bright stars twinkle: their light rises and falls, so their character steps up and down (+ to *).
      const brightness=band[o+BRIGHT],shine=brightness>.7?brightness*(1+.35*Math.sin(t*band[o+RATE]+band[o+PHASE])):brightness;
      const light=shine*(1+1.6*core)*q*dim,colour=band[o+COLOUR];
      // Faint stars stay white or blue-grey: a faint warm colour turns brown.
      add(index,light,shine,light<.35&&(colour===RUST||colour===ORANGE||colour===RED)?WHITE:core>.35&&colour<=BLUE_WHITE&&light>=.35?(band[o+WARM]>.6?GOLD:CREAM):colour,band[o+SPOT]);
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
    // In a crowded cell a star has to be brighter still to show as + or *. Where haze gives most of a cell's light
    // (a nebula's pink wins sooner), the cell takes the haze's colour, and a nebula's bright heart shows as : so
    // it reads as a glowing cloud rather than more stars.
    for(let index=0;index<glow.length;index++){
      const light=glow[index],o=index*4;
      if(light<=.12){cells[o]=0;starCodes[index]=0;continue;}
      const bar=.1*Math.max(0,crowd[index]-1),star=peak[index];
      const nebula=hazeTone[index]===PINK,colour=star&&haze[index]<light*(nebula?.35:.55)?tone[index]:hazeTone[index];
      const character=star>=1.3+bar?STAR:star>=.86+bar?PLUS:colour===PINK&&nebula&&haze[index]>.4?COLON:DOTS+spot[index];
      const alpha=Math.min(.95,.16+.55*light);
      cells[o]=character+1;cells[o+1]=colour;cells[o+2]=Math.round(alpha*255);
      starCodes[index]=(character+1)|(colour<<5)|(Math.round(alpha*31)<<10);
    }
    starsChanged=true;dirty=true;
    if(profiling){drawTimings.push(performance.now()-started);if(drawTimings.length===60){const sorted=[...drawTimings].sort((a,b)=>a-b);console.info('Milky Way update: mean '+(drawTimings.reduce((a,b)=>a+b,0)/60).toFixed(1)+' ms; p95 '+sorted[56].toFixed(1)+' ms');drawTimings.length=0;}}
  }

  // What the canvas shows: the stars, plus the planets app.js places on the homepage. On the GPU the renderer works
  // out the planets' cells itself; for the 2D canvas app.js hands over finished planet cells (EMPTY marks a planet
  // cell that shows nothing, like the gap in Saturn's rings).
  const EMPTY=1<<15;
  let planets=null,starFade=1,dirty=true,starsChanged=false;
  function render(){
    dirty=false;
    if(gpu){
      if(starsChanged){gpu.uploadStars(cells,columns,lines);starsChanged=false;}
      gpu.render(starFade,planets);
      return;
    }
    // Only cells whose character, colour, or brightness changed are redrawn, a few thousand per frame at most;
    // when the whole sky changes (on load, a resize, or the font arriving) the rest follow over the next frames.
    const s=starDpr,planetCells=planets?.cells;
    let budget=4000;
    for(let n=0;n<lines&&budget>0;n++){
      const l=(resumeLine+n)%lines;
      for(let c=0;c<columns;c++){
        const index=l*columns+c,code=planetCells?.[index]||starCodes[index];
        if(code===previous[index])continue;
        const x=c*CELL_WIDTH,y=l*CELL_HEIGHT,[left,top,width,height]=cellBox(x,y,s);
        sctx.clearRect(left,top,width,height);
        if(code&&code!==EMPTY){
          const {canvas,tileW,tileH}=sheet;
          sctx.globalAlpha=((code>>10)&31)/31;
          sctx.drawImage(canvas,((code&31)-1)*tileW+left-Math.round(x*s-tileW/2),((code>>5)&31)*tileH+top-Math.round(y*s-tileH/2),width,height,left,top,width,height);
        }
        previous[index]=code;
        budget--;
      }
      if(budget<=0){resumeLine=(l+1)%lines;dirty=true;}
    }
    sctx.globalAlpha=1;
  }
  function useSheet(){
    sheet=glyphSheet(starDpr||devicePixelRatio||1);
    gpu?.uploadGlyphs(sheet);
    previous?.fill(65535);dirty=true;
  }

  // The first frame waits briefly for the site's monospace (usually instant once cached), so the stars aren't
  // all drawn twice; after 400 ms the system's monospace stands in, and the font replaces it when it arrives.
  let ready=false,fontApplied=false;
  const applyFont=faces=>{if(!fontApplied&&faces?.length){fontApplied=true;useSheet();}};
  const fontLoad=document.fonts?document.fonts.load(`500 ${GLYPH_SIZE}px "JetBrains Mono"`,RAMP.join('')).catch(()=>[]):Promise.resolve([]);
  Promise.race([fontLoad,new Promise(done=>setTimeout(done,400,[]))]).then(faces=>{applyFont(faces);ready=true;if(starsMade)updateStars(spaceTime);});
  fontLoad.then(applyFont);
  // iOS browsers can run this before styles.css applies, while the canvas is still its default 150px tall.
  // Measure again once the page (and its stylesheets) has loaded so the stars aren't stretched until a resize.
  // Only then watch the canvas's exact device-pixel size: before styles apply, its size follows its own pixels.
  stars();addEventListener('resize',stars);
  addEventListener('load',()=>{
    stars();
    try{new ResizeObserver(([entry])=>{const size=entry.devicePixelContentBoxSize?.[0];if(size){deviceW=size.inlineSize;deviceH=size.blockSize;stars();}}).observe(starCanvas,{box:'device-pixel-content-box'});}catch{}
  });
  const frameHooks=[];
  window.portfolioGalaxy={
    cell:[CELL_WIDTH,CELL_HEIGHT],planetRow:PLANET_ROW,gpu:!!gpu,empty:EMPTY,media,
    get paused(){return paused;},
    grid:()=>({columns,lines}),
    // Runs every frame before the sky is drawn (app.js moves the planets and the opening text here).
    onFrame:hook=>frameHooks.push(hook),
    // On the GPU: {saturn, jupiter, earth, time, far, near, clouds}; on the 2D canvas: {cells}; null for none.
    setPlanets(next){planets=next;dirty=true;},
    // Dims the stars (not the planets) as the homepage scrolls on.
    setStarFade(value){if(gpu){if(value!==starFade){starFade=value;dirty=true;}}else starCanvas.style.opacity=String(value);},
    setLand(pixels){if(gpu){gpu.uploadLand(pixels);dirty=true;}}
  };
  let lastTime=0,frame=0;
  function animate(t){
    const elapsed=t-lastTime||16;lastTime=t;
    if(!paused&&!document.hidden){
      spaceTime+=Math.min(elapsed,64)*GALAXY_SPEED;
      // The sky moves about a cell a second, so 15 updates a second are plenty.
      if(ready&&starsMade&&t-frame>66){updateStars(spaceTime);frame=t;}
    }
    frameHooks.forEach(hook=>hook(t));
    if(dirty&&ready&&starsMade)render();
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
})();
