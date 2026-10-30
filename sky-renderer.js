// Draws the whole ASCII sky in one GPU pass. Every cell of the text grid shows exactly one character: a planet's
// (worked out here from each planet's position, size, and spin) or else a star's (from a texture galaxy.js fills,
// one texel per cell). The glyph sheet holds every character in every colour at the screen's pixel density, so
// glyphs land on whole device pixels and are copied 1:1. app.js shades the planets the same way for the 2D fallback.
window.createSkyRenderer = function(gl, {cellWidth, cellHeight, planetRow}) {
  const vertex = `#version 300 es
  void main(){ vec2 p=vec2((gl_VertexID==1)?3.0:-1.0,(gl_VertexID==2)?3.0:-1.0);gl_Position=vec4(p,0,1);}`;
  const fragment = `#version 300 es
  precision highp float;
  uniform vec2 bufferSize;
  uniform float pixelRatio;
  uniform vec2 tile;
  uniform sampler2D glyphs;
  uniform sampler2D stars;
  uniform float starFade;
  uniform vec4 worlds[3];
  uniform vec2 fades;
  uniform float cloudStrength;
  uniform float time;
  uniform sampler2D land;
  // Earth: how the globe is turned (from the view to Earth's own frame), whether its maps have loaded, how far the
  // clouds have drifted, how far each sharper photo has faded in (around Alberta, southern Alberta, the Calgary area,
  // central Calgary), how far night has fallen on the way down, and the maps themselves (by day and by night).
  uniform mat3 earthTurn;
  uniform float earthMaps;
  uniform float cloudShift;
  uniform vec4 layers;
  uniform float nightfall;
  uniform sampler2D surface,region,area,calgary,centre,areaNight,calgaryNight,centreNight,cloudMap,lightMap;
  out vec4 outputColor;
  const vec2 CELL=vec2(${cellWidth}.0,${cellHeight}.0);
  const int PLANET=${planetRow};
  const float PI=3.14159265359;
  // Where the sharper photos lie: west, east, south, north in degrees (the same bounds as tools/make-earth-maps.py).
  const vec4 REGION=vec4(-125.0,-103.0,44.0,58.0),AREA=vec4(-119.6,-108.6,48.28,53.78),CALGARY=vec4(-115.3,-112.9,50.55,51.5);
  const vec4 CENTRE=vec4(-114.33,-113.81,50.915,51.185);
  // Characters are galaxy.js's ramp (. , : ; - = + * # % @ = 0 to 10); colour rows from PLANET are the planets'.
  vec4 character(int ch,int row,float alpha,vec2 offset){
    vec2 uv=(vec2(float(ch),float(row))*tile+offset+.5)/vec2(textureSize(glyphs,0));
    vec4 ink=texture(glyphs,uv);
    float a=ink.a*clamp(alpha,0.0,1.0);
    return vec4(ink.rgb*a,a);
  }
  // A character in any colour: the shape from the white row, the colour given.
  vec4 tinted(int ch,vec3 colour,float alpha,vec2 offset){
    vec4 ink=texture(glyphs,(vec2(float(ch),float(PLANET+9))*tile+offset+.5)/vec2(textureSize(glyphs,0)));
    float a=ink.a*clamp(alpha,0.0,1.0);
    return vec4(clamp(colour,0.0,1.0)*a,a);
  }
  // Planets use the smoother half of the ramp, from 0 (.) to 1 (#): . : - = + * #
  int shade(float v){int i=int(floor(clamp(v,0.0,1.0)*6.0+.5));return i==0?0:i==1?2:i+2;}
  // Saturn's body skips the line characters (- =), which belong to its rings: . : + * #
  int saturnShade(float v){int i=int(floor(clamp(v,0.0,1.0)*4.0+.5));return i==0?0:i==1?2:i+4;}
  // Close-up photos use the whole ramp, from 0 (.) to 1 (@): . , : ; - = + * # % @
  int ramp(float v){return int(floor(clamp(v,0.0,1.0)*10.0+.5));}
  // City lights at night use the ramp's point-like characters, faint to bright: . : + * # % @
  int lamp(float v){return v<.16?0:v<.28?2:v<.42?6:v<.62?7:v<.82?8:v<.94?9:10;}
  // Sunlight from the upper left and a little in front: 0 on the night side, up to 1 in full sun.
  float sunlight(vec2 n,float z){float l=-n.x*.55-n.y*.42+z*.72;return smoothstep(-.03,.16,l)*(.25+.75*max(0.0,l));}
  vec2 boxUv(vec2 deg,vec4 box){return vec2((deg.x-box.x)/(box.y-box.x),(box.w-deg.y)/(box.w-box.z));}
  bool inBox(vec2 uv){return uv.x>0.0&&uv.x<1.0&&uv.y>0.0&&uv.y<1.0;}
  // A map averaged over the patch of ground one cell covers (span: the map's width in radians; cellAngle: a cell's
  // width in radians of the globe), so a far-off Earth shows each patch's colour instead of flickering points.
  vec4 averaged(sampler2D map,vec2 uv,float span,float cellAngle){
    return textureLod(map,uv,max(0.0,log2(float(textureSize(map,0).x)/span*cellAngle)));
  }
  // The photo under a cell: the whole globe, with sharper photos laid over it as the camera comes down to Calgary
  // (each fades in only once it covers the screen, so its edges never show).
  vec3 photo(vec2 uv,vec2 deg,float cellAngle){
    vec3 colour=averaged(surface,uv,PI*2.0,cellAngle).rgb;
    vec2 at=boxUv(deg,REGION);
    if(inBox(at))colour=mix(colour,averaged(region,at,radians(REGION.y-REGION.x),cellAngle).rgb,layers.x);
    at=boxUv(deg,AREA);
    if(inBox(at))colour=mix(colour,averaged(area,at,radians(AREA.y-AREA.x),cellAngle).rgb,layers.y);
    at=boxUv(deg,CALGARY);
    if(inBox(at))colour=mix(colour,averaged(calgary,at,radians(CALGARY.y-CALGARY.x),cellAngle).rgb,layers.z);
    at=boxUv(deg,CENTRE);
    if(inBox(at))colour=mix(colour,averaged(centre,at,radians(CENTRE.y-CENTRE.x),cellAngle).rgb,layers.w);
    return colour;
  }
  // A road's brightest light anywhere in the patch a cell covers (sampled finer than averaged() and at four spots
  // around the middle as well), so a thin bright road stays an unbroken line. reach: a quarter of a cell or so, in the
  // map's own units.
  float brightest(sampler2D map,vec2 uv,float span,float cellAngle,vec2 reach){
    float lod=max(0.0,log2(float(textureSize(map,0).x)/span*cellAngle)-1.5);
    float v=max(textureLod(map,uv,lod).g,textureLod(map,uv+reach,lod).g);
    v=max(v,max(textureLod(map,uv-reach,lod).g,textureLod(map,uv+vec2(reach.x,-reach.y),lod).g));
    return max(v,textureLod(map,uv+vec2(-reach.x,reach.y),lod).g);
  }
  // A light map at a cell: homes and buildings, roads (unbroken), and the busiest places (span: the map's size in
  // degrees; cell: a cell's).
  vec3 lightsAt(sampler2D map,vec2 at,vec2 span,float cellAngle,vec2 cell){
    vec4 around=averaged(map,at,radians(span.x),cellAngle);
    return vec3(around.r,brightest(map,at,radians(span.x),cellAngle,cell/span*.25),around.b);
  }
  // Lights at night: NASA's for southern Alberta, then Calgary's. Night only falls once southern Alberta fills the
  // screen.
  vec3 nightLight(vec2 deg,float cellAngle,vec2 cell){
    vec2 span=vec2(AREA.y-AREA.x,AREA.w-AREA.z);
    vec3 light=lightsAt(areaNight,boxUv(deg,AREA),span,cellAngle,cell);
    vec2 at=boxUv(deg,CALGARY);span=vec2(CALGARY.y-CALGARY.x,CALGARY.w-CALGARY.z);
    if(inBox(at))light=mix(light,lightsAt(calgaryNight,at,span,cellAngle,cell),layers.z);
    at=boxUv(deg,CENTRE);span=vec2(CENTRE.y-CENTRE.x,CENTRE.w-CENTRE.z);
    if(inBox(at))light=mix(light,lightsAt(centreNight,at,span,cellAngle,cell),layers.w);
    return light;
  }
  // A steady random number for a spot on the ground.
  float hash(vec2 p){vec3 q=fract(p.xyx*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
  // Saturn's rings, tilted a little: the dusky C ring, the B ring (warmer inside, brightest outside), the dark
  // Cassini division, and the grey-tan A ring.
  bool ring(vec2 d,float r,out int ch,out int row,out float alpha,out bool front){
    float a=-.12+sin(time*.00009)*.03;
    vec2 local=vec2(d.x*cos(a)+d.y*sin(a),-d.x*sin(a)+d.y*cos(a));
    float rx=r*2.3,band=length(local/vec2(rx,rx*.36));
    front=local.y>0.0;ch=-1;row=PLANET;alpha=0.0;
    if(band<.55||band>1.0)return false;
    if(band<.67){ch=0;row=PLANET+4;alpha=.55;}
    else if(band<.76){ch=5;row=PLANET+13;alpha=.85;}
    else if(band<.86){ch=5;row=PLANET+2;alpha=.95;}
    else if(band>.895){ch=4;row=PLANET+3;alpha=.72;}
    return true;
  }
  // Earth at a point n of its disc (z towards the viewer), tinted with the photos' colours (before they load, in the
  // planet colour rows, with tint -1). Coming down over Calgary, sharper photos take over and the whole ramp draws
  // them (cell by cell, as their layers fade in), while night falls and the city's lights come on.
  void earth(vec2 n,float z,float radius,float threshold,out int ch,out int row,out float alpha,out vec3 tint){
    vec3 p=earthTurn*vec3(n.x,-n.y,z);
    float lat=asin(clamp(p.y,-1.0,1.0)),lon=atan(p.x,p.z);
    vec2 uv=vec2(fract(lon/(PI*2.0)+.5),.5-lat/PI),deg=degrees(vec2(lon,lat));
    float lam=-n.x*.55-n.y*.42+z*.72,light=sunlight(n,z),cellAngle=CELL.x/radius;
    bool water=texture(land,uv).a<=.24,photographed=earthMaps>.5,fine=layers.y>threshold;
    vec3 day=photographed?photo(uv,deg,cellAngle):vec3(0);
    // Water (dark, with little red) is drawn blue by day.
    bool wet=day.r<day.g*.7&&(day.b>day.g*.65||day.r<day.g*.3);
    // The photo's colour at full strength (keeping its hue); close in, colourful ground gets richer still.
    vec3 vivid=day/max(.22,max(day.r,max(day.g,day.b)));
    float saturation=1.0+1.8*(1.0-min(vivid.r,min(vivid.g,vivid.b)))*layers.y;
    vivid=clamp(mix(vec3(dot(vivid,vec3(.299,.587,.114))),vivid,saturation),0.0,1.0);
    tint=vec3(-1);
    // The night side: city lights where there are any, otherwise faint land and sea.
    if(light<.01){
      float glow=earthMaps*averaged(lightMap,uv,PI*2.0,cellAngle).r;
      if(glow>.1){ch=glow>.45?2:0;alpha=.3+.7*glow;row=PLANET+14;if(photographed)tint=vec3(1.0,.78,.42);}
      else{ch=0;alpha=.14;row=PLANET+(water?10:8);if(photographed)tint=vivid;}
      return;
    }
    // Clouds drift east a little faster than the ground, and thin out as the camera dives in.
    float cloud=earthMaps>.5?averaged(cloudMap,vec2(fract(uv.x-cloudShift),uv.y),PI*2.0,cellAngle).r:
      (sin(lon*12.0+lat*9.0+sin(lat*7.0))*sin(lat*18.0-lon*5.0)>.66&&fract(sin(n.x*129.89+n.y*78.233)*43758.5453)<.6?1.0:0.0);
    cloud*=cloudStrength;
    // Sunlight glints off the sea (seen on the whole globe, not up close), and turns orange near the day/night line.
    float glint=water?pow(max(dot(vec3(n,z),vec3(-.297,-.227,.928)),0.0),90.0)*(1.0-smoothstep(300.0,900.0,radius)):0.0;
    float twilight=smoothstep(-.05,.02,lam)*(1.0-smoothstep(.02,.16,lam));
    // Up close the ground is lit evenly and its own brightness sets the character: tone spreads the photos' usual
    // range over the ramp.
    float bright=dot(day,vec3(.299,.587,.114)),tone=clamp((bright-.15)/.19,0.0,1.0);
    light=mix(light,1.0,layers.x);
    if(cloud>.42){
      ch=shade(.2+.45*light*cloud);alpha=.35+.55*light;row=PLANET+9;
      // Clouds are the brightest thing on the globe, as in photos.
      if(photographed){ch=shade((.35+.65*cloud)*light);alpha=.45+.5*light;tint=vec3(.95,.97,1.0);}
    }else if(photographed){
      // Brighter ground gets denser characters, though the dark sea stays solid enough to read as a globe; thin
      // cloud whitens it.
      if(fine){ch=ramp(.4+.6*tone);alpha=.8+.2*tone;}
      else{ch=shade((.4+.5*sqrt(clamp(bright*2.0,0.0,1.0)))*light+glint*.5);alpha=.4+.55*light+glint*.3;}
      tint=mix(mix(vivid,vec3(.95,.97,1.0),smoothstep(.18,.42,cloud)*.55),vec3(1.0,.97,.9),glint);
      if(fine&&wet)tint=mix(tint,vec3(.3,.58,.95),.65);
      if(nightfall>0.0&&fine){
        // As night falls the ground fades to black and the lights come on, the brightest first, as seen from a plane:
        // homes and buildings glitter in warm white, orange, and some cool white (each spot its own brightness, some
        // dark); major roads are sodium-orange lines and other roads golden white; downtown is bright white with the
        // odd blue, pink, or green sign.
        vec3 night=nightLight(deg,cellAngle,degrees(CELL/radius)*vec2(1.0/max(.05,cos(lat)),1.0));
        vec2 spot=floor(deg*vec2(1000.0,1600.0));
        float sparkle=hash(spot),pick=hash(spot+vec2(17.0,31.0));
        float homes=night.x*(.15+.85*sparkle*sparkle)*step(.33,sparkle),busy=night.z*(.6+.5*sparkle),glow=max(homes,max(night.y,busy));
        if(glow>.1&&nightfall>fract(threshold*7.31)*(.75-.6*min(glow,1.0))){
          tint=pick<.55?vec3(1.0,.88,.66):pick<.85?vec3(1.0,.72,.38):vec3(.9,.94,1.0);
          if(busy>=homes&&busy>=night.y)tint=pick<.1?vec3(.42,.62,1.0):pick<.15?vec3(1.0,.42,.86):pick<.19?vec3(.48,1.0,.62):vec3(1.0,.97,.92);
          else if(night.y>=homes)tint=mix(vec3(1.0,.88,.66),vec3(1.0,.58,.2),smoothstep(.72,.95,night.y));
          ch=lamp(min(glow,1.0));alpha=(.6+.4*min(glow,1.0))*smoothstep(0.0,.35,nightfall);
        }else{
          alpha*=pow(1.0-nightfall,1.5);
          if(alpha<.04)ch=-1;
        }
      }
    }else if(!water){ch=shade(.33+.67*light);alpha=.55+.45*light;row=PLANET+8;}
    else{ch=shade(.22+.55*light+glint*.5);alpha=.45+.5*light+glint*.3;row=PLANET+(glint>.5?9:10);}
    if(twilight>.3&&cloud<=.42){if(tint.x>=0.0)tint=mix(tint,vec3(1.0,.6,.35),twilight*.6);else row=PLANET+15;}
  }
  // A planet's character at offset d from its centre, shaded by sunlight: Earth (above), bands on Saturn and
  // Jupiter (with the Great Red Spot).
  bool body(int k,vec2 d,vec4 world,float threshold,out int ch,out int row,out float alpha,out vec3 tint){
    vec2 n=d/world.z;float dd=dot(n,n);
    if(dd>1.0)return false;
    float z=sqrt(1.0-dd);
    tint=vec3(-1);
    if(k==2){earth(n,z,world.z,threshold,ch,row,alpha,tint);return true;}
    float ct=.987227283,st=-.159318207;
    vec2 rotated=vec2(n.x*ct-n.y*st,n.x*st+n.y*ct);
    float lat=asin(clamp(-rotated.y,-1.0,1.0)),lon=atan(rotated.x,z)+world.w+.4,light=sunlight(n,z),value;
    if(k==1){
      float bands=sin(lat*7.8+sin(lon*2.0+lat*5.0)*.6),spotLon=mod(lon-1.1+PI,PI*2.0)-PI;
      bool spot=(spotLon/.34)*(spotLon/.34)+((lat+.38)/.16)*((lat+.38)/.16)<1.0;
      value=light*(spot?1.0:.55+.45*(bands*.5+.5));
      row=PLANET+(spot?7:bands>-.15?5:6);
    }else{
      // Saturn: a bright cream equator, golden zones and orange-tan belts, and a blue-grey pole.
      float bands=sin(lat*9.0+sin(lon*2.0)*.3),polar=abs(lat);
      value=light*(.62+.38*(bands*.5+.5));
      row=PLANET+(polar>.85?12:polar<.2?1:bands>.25?0:11);
      if(light<.01){ch=0;alpha=.14;}else{ch=saturnShade(value);alpha=.38+.55*value;}
      return true;
    }
    if(light<.01){ch=0;alpha=.12;}else{ch=shade(value);alpha=.25+.6*value;}
    return true;
  }
  void main(){
    vec2 device=vec2(gl_FragCoord.x,bufferSize.y-gl_FragCoord.y);
    vec2 index=floor(device/pixelRatio/CELL+.5),cell=index*CELL;
    // This pixel's place in its cell's glyph tile, with the tile snapped to whole device pixels.
    vec2 offset=clamp(floor(device)-floor(cell*pixelRatio-tile*.5+.5),vec2(0),tile-1.0);
    // A fading planet gives its cells back to the stars one by one, rather than showing both at once.
    float threshold=fract(sin(dot(index,vec2(12.9898,78.233)))*43758.5453);
    int ch=-1,row=0;float alpha=0.0;bool covered=false;vec3 tint=vec3(-1);
    for(int k=0;k<3;k++){
      vec4 world=worlds[k];
      float fade=k==2?fades.y:fades.x;
      if(world.z<1.0||fade<=threshold)continue;
      vec2 d=cell-world.xy;
      int rc,rr,bc,br;float ra,ba;bool front=false;vec3 bt;
      bool hasRing=k==0&&ring(d,world.z,rc,rr,ra,front);
      if(hasRing&&!front){covered=true;ch=rc;row=rr;alpha=ra*fade;tint=vec3(-1);}
      if(body(k,d,world,threshold,bc,br,ba,bt)){covered=true;ch=bc;row=br;alpha=ba*fade;tint=bt;}
      if(hasRing&&front){covered=true;ch=rc;row=rr;alpha=ra*fade;tint=vec3(-1);}
    }
    vec4 result=vec4(0);
    if(covered){if(ch>=0)result=tint.x>=0.0?tinted(ch,tint,alpha*.94,offset):character(ch,row,alpha*.94,offset);}
    else{
      ivec2 size=textureSize(stars,0);
      if(index.x<float(size.x)&&index.y<float(size.y)){
        vec4 star=texelFetch(stars,ivec2(index),0);
        int glyph=int(star.r*255.0+.5)-1;
        if(glyph>=0)result=character(glyph,int(star.g*255.0+.5),star.b*starFade,offset);
      }
    }
    outputColor=result;
  }`;
  function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
  const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  // smooth: blend between texels, with smaller copies for averaged() (maps); wrap: repeat around the globe from
  // west to east.
  function texture(unit,{smooth=false,wrap=false}={}){
    const t=gl.createTexture();gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,smooth?gl.LINEAR_MIPMAP_LINEAR:gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,smooth?gl.LINEAR:gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,wrap?gl.REPEAT:gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));
    if(smooth)gl.generateMipmap(gl.TEXTURE_2D);
    return t;
  }
  const uniform=name=>gl.getUniformLocation(program,name);
  const glyphTexture=texture(0),starTexture=texture(1),landTexture=texture(2);
  const mapTextures={surface:texture(3,{smooth:true,wrap:true}),region:texture(4,{smooth:true}),area:texture(5,{smooth:true}),
    calgary:texture(6,{smooth:true}),centre:texture(7,{smooth:true}),areaNight:texture(8,{smooth:true}),
    calgaryNight:texture(9,{smooth:true}),centreNight:texture(10,{smooth:true}),cloudMap:texture(11,{smooth:true,wrap:true}),
    lightMap:texture(12,{smooth:true,wrap:true})};
  gl.uniform1i(uniform('glyphs'),0);gl.uniform1i(uniform('stars'),1);gl.uniform1i(uniform('land'),2);
  Object.keys(mapTextures).forEach((name,i)=>gl.uniform1i(uniform(name),3+i));
  const tileSize=uniform('tile'),buffer=uniform('bufferSize'),ratio=uniform('pixelRatio'),fade=uniform('starFade');
  const positions=uniform('worlds[0]'),planetFades=uniform('fades'),clouds=uniform('cloudStrength'),clock=uniform('time');
  const turn=uniform('earthTurn'),loaded=uniform('earthMaps'),drift=uniform('cloudShift');
  const photos=uniform('layers'),night=uniform('nightfall');
  const values=new Float32Array(12),still=new Float32Array([1,0,0,0,1,0,0,0,1]);
  let starColumns=0,starLines=0;
  gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.clearColor(0,0,0,0);
  return {
    uploadGlyphs(sheet){gl.useProgram(program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,glyphTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,sheet.canvas);gl.uniform2f(tileSize,sheet.tileW,sheet.tileH);},
    // One RGBA texel per cell: character + 1 (0 = empty), colour row, and opacity.
    uploadStars(cells,columns,lines){
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,starTexture);
      if(columns!==starColumns||lines!==starLines){starColumns=columns;starLines=lines;gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,columns,lines,0,gl.RGBA,gl.UNSIGNED_BYTE,cells);}
      else gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,columns,lines,gl.RGBA,gl.UNSIGNED_BYTE,cells);
    },
    uploadLand(pixels){gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,landTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1024,512,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);},
    // Images from assets/earth (any of mapTextures' names; the close-up photos, by day and by night, come later than
    // the rest).
    uploadEarthMaps(maps){
      gl.useProgram(program);
      Object.entries(mapTextures).forEach(([name,t],i)=>{
        if(!maps[name])return;
        gl.activeTexture(gl.TEXTURE3+i);gl.bindTexture(gl.TEXTURE_2D,t);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,maps[name]);
        gl.generateMipmap(gl.TEXTURE_2D);
      });
      gl.uniform1f(loaded,1);
    },
    // planets: {saturn, jupiter, earth (each {x, y, r, spin} in CSS px), earthTurn (a column-major 3×3 matrix),
    // cloudShift, layers ([region, area, calgary, centre], each 0 to 1), nightfall (0 to 1), time, far, near, clouds}
    // or null.
    render(starFade,planets){
      values.fill(0);
      if(planets)[planets.saturn,planets.jupiter,planets.earth].forEach((w,k)=>{values[k*4]=w.x;values[k*4+1]=w.y;values[k*4+2]=w.r;values[k*4+3]=w.spin;});
      gl.viewport(0,0,gl.canvas.width,gl.canvas.height);gl.useProgram(program);
      gl.uniform2f(buffer,gl.canvas.width,gl.canvas.height);gl.uniform1f(ratio,gl.canvas.width/innerWidth);gl.uniform1f(fade,starFade);
      gl.uniform4fv(positions,values);gl.uniform2f(planetFades,planets?planets.far:0,planets?planets.near:0);
      gl.uniform1f(clouds,planets?planets.clouds:0);gl.uniform1f(clock,planets?planets.time:0);
      gl.uniformMatrix3fv(turn,false,planets?planets.earthTurn:still);gl.uniform1f(drift,planets?planets.cloudShift:0);
      gl.uniform4fv(photos,planets?planets.layers:[0,0,0,0]);gl.uniform1f(night,planets?planets.nightfall:0);
      gl.drawArrays(gl.TRIANGLES,0,3);
    }
  };
};
