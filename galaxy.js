// Shared Milky Way background and motion preference for every page.
(() => {
  'use strict';
  const starCanvas=document.querySelector('#stars');
  if(!starCanvas)return;
  const sctx=starCanvas.getContext('2d');
  const CELL_WIDTH=6, CELL_HEIGHT=9;
  const SHARED_STAR_FLOW=true;
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
  // White starlight, blue stars, and red nebula-like accents around a warm core.
  // Color stays attached to each star as it moves through the character grid.
  const starColors=['#f3eadb','#81baff','#e6bf87','#b4a4df','#ed8793','#f8f9ff'];
  // Cache the colored glyphs once, keeping the animation on the same text grid.
  const glyphSheet=document.createElement('canvas');
  const glyphChars=['.',':','+','*','#','■'];
  glyphSheet.width=720;glyphSheet.height=starColors.length*12;
  const glyphCtx=glyphSheet.getContext('2d');
  glyphCtx.font='8px monospace';glyphCtx.textAlign='center';glyphCtx.textBaseline='middle';
  starColors.forEach((color,row)=>{
    glyphChars.forEach((character,col)=>{
      for(let shade=0;shade<12;shade++){
        glyphCtx.fillStyle=color;glyphCtx.globalAlpha=(shade+1)/12;
        glyphCtx.fillText(character,(col*12+shade)*10+5,row*12+6);
      }
    });
  });

  let starPoints=[],columns=0,lines=0,cellAlpha,cellGlyph,cellTone,previousStars;
  // The star canvas is sized to the tallest viewport (toolbar hidden), so starH stays put while the toolbar moves.
  let starW=0,starH=0,starDpr=0;
  function galaxyCurve(u,t){return starH*(.92-u*.93+.09*Math.sin(u*Math.PI*1.8+t*.000017));}
  function stars(){
    const dpr=Math.min(devicePixelRatio,1.5),h=starCanvas.clientHeight||innerHeight;
    if(innerWidth===starW&&h===starH&&dpr===starDpr)return;
    starW=innerWidth;starH=h;starDpr=dpr;
    starCanvas.width=innerWidth*dpr;starCanvas.height=starH*dpr;sctx.setTransform(dpr,0,0,dpr,0,0);
    columns=Math.ceil(innerWidth/CELL_WIDTH)+1;lines=Math.ceil(starH/CELL_HEIGHT)+1;
    cellAlpha=new Float32Array(columns*lines);cellGlyph=new Uint8Array(columns*lines);cellTone=new Uint8Array(columns*lines);previousStars=new Uint16Array(columns*lines);
    let seed=23;const rand=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
    starPoints=[];
    const count=innerWidth<650?1300:2800,coreCount=Math.round(count*.22);
    for(let i=0;i<count+coreCount;i++){
      const inCore=i>=count;
      const across=Math.sqrt(-2*Math.log(Math.max(.0001,rand())))*Math.cos(rand()*Math.PI*2)*(inCore?.4:1);
      const spread=inCore||i<count*.83,choice=rand(),core=Math.exp(-across*across*.6);
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
      const width=starH*(.255+.035*Math.sin(u*3+t*(SHARED_STAR_FLOW?.000022:.000009)));
      const current=Math.sin(u*5.5-t*.000065)*starH*.026;
      const y=SHARED_STAR_FLOW?(p.spread?galaxyCurve(u,t)+p.v*width+current:p.v*starH+current*.3):(p.spread?galaxyCurve(u,t)+p.v*width+Math.sin(u*7+p.phase+t*.000045)*9:p.v*starH+Math.sin(t*.00005+p.phase)*5);
      if(y<-10||y>starH+10)continue;
      const distance=Math.hypot((x-innerWidth*.26)/(innerWidth*.39),(y-starH*.43)/(starH*.36));
      const quiet=.48+.52*smooth(.25,1.2,distance);
      const shapeBrightness=p.character===5?.95:p.character===3?.77:p.character===2?.6:.45;
      const intensity=p.spread?( .17+.73*p.core)*shapeBrightness:.14+p.tone*.2;
      const shimmer=.91+.09*Math.sin(t*.00025+p.phase);
      const alpha=intensity*quiet*shimmer;
      let row;
      if(!p.spread)row=p.tone<.35?1:p.tone>.8?0:5;
      else if(p.core>.64)row=p.tone<.43?5:p.tone<.66?2:p.tone<.85?1:4;
      else if(p.tone>.78&&p.core>.15)row=4;
      else if(p.v<0)row=p.tone>.25?1:3;
      else row=p.tone>.54?3:p.tone>.27?5:1;
      // The flow is sampled into fixed terminal cells; symbols never slide between cells.
      const column=Math.round(x/CELL_WIDTH),line=Math.round(y/CELL_HEIGHT);
      if(column<0||column>=columns||line<0||line>=lines)continue;
      const index=line*columns+column;
      if(alpha>cellAlpha[index]){cellAlpha[index]=alpha;cellGlyph[index]=p.character;cellTone[index]=row;}
    }
    for(let line=0;line<lines;line++){for(let column=0;column<columns;column++){
      const index=line*columns+column,opacity=Math.round(cellAlpha[index]*31);
      const code=opacity?((cellGlyph[index]+1)|(cellTone[index]<<3)|(opacity<<6)):0;
      if(code===previousStars[index])continue;
      const x=column*CELL_WIDTH,y=line*CELL_HEIGHT;
      sctx.clearRect(x-CELL_WIDTH/2,y-CELL_HEIGHT/2,CELL_WIDTH,CELL_HEIGHT);
      if(code){sctx.globalAlpha=opacity/31;sctx.drawImage(glyphSheet,(cellGlyph[index]*12+11)*10,cellTone[index]*12,10,12,x-5,y-6,10,12);}
      previousStars[index]=code;
    }}
    sctx.globalAlpha=1;
  }
  // iOS browsers can run this before styles.css applies, while the canvas is still its default 150px tall.
  // Measure again once the page (and its stylesheets) has loaded so the stars aren't stretched until a resize.
  stars();addEventListener('resize',stars);addEventListener('load',stars);
  window.portfolioGalaxy={canvas:starCanvas,glyphSheet,media,get paused(){return paused;}};
  let lastTime=0,frame=0;
  function animate(t){
    const elapsed=t-lastTime||16;lastTime=t;
    if(!paused&&!document.hidden){
      spaceTime+=Math.min(elapsed,64)*GALAXY_SPEED;
      if(t-frame>33){drawStars(spaceTime);frame=t;}
    }
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
})();
