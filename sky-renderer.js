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
  out vec4 outputColor;
  const vec2 CELL=vec2(${cellWidth}.0,${cellHeight}.0);
  const int PLANET=${planetRow};
  const float PI=3.14159265359;
  // Characters are galaxy.js's ramp (. , : ; - = + * # % @ = 0 to 10); colour rows from PLANET are the planets'.
  vec4 character(int ch,int row,float alpha,vec2 offset){
    vec2 uv=(vec2(float(ch),float(row))*tile+offset+.5)/vec2(textureSize(glyphs,0));
    vec4 ink=texture(glyphs,uv);
    float a=ink.a*clamp(alpha,0.0,1.0);
    return vec4(ink.rgb*a,a);
  }
  // Planets use the smoother half of the ramp, from 0 (.) to 1 (#): . : - = + * #
  int shade(float v){int i=int(floor(clamp(v,0.0,1.0)*6.0+.5));return i==0?0:i==1?2:i+2;}
  // Sunlight from the upper left and a little in front: 0 on the night side, up to 1 in full sun.
  float sunlight(vec2 n,float z){float l=-n.x*.55-n.y*.42+z*.72;return smoothstep(-.03,.16,l)*(.25+.75*max(0.0,l));}
  // Saturn's rings, tilted a little: the faint C ring, the bright B ring, the dark Cassini division, the A ring.
  bool ring(vec2 d,float r,out int ch,out int row,out float alpha,out bool front){
    float a=-.12+sin(time*.00009)*.03;
    vec2 local=vec2(d.x*cos(a)+d.y*sin(a),-d.x*sin(a)+d.y*cos(a));
    float rx=r*2.3,band=length(local/vec2(rx,rx*.36));
    front=local.y>0.0;ch=-1;row=PLANET;alpha=0.0;
    if(band<.55||band>1.0)return false;
    if(band<.67){ch=0;row=PLANET+4;alpha=.5;}
    else if(band<.86){ch=5;row=PLANET+2;alpha=.82;}
    else if(band>.895){ch=4;row=PLANET+3;alpha=.66;}
    return true;
  }
  // A planet's character at offset d from its centre, shaded by sunlight: bands on Saturn and Jupiter (with the
  // Great Red Spot), land, ocean, and clouds on Earth.
  bool body(int k,vec2 d,vec4 world,out int ch,out int row,out float alpha){
    vec2 n=d/world.z;float dd=dot(n,n);
    if(dd>1.0)return false;
    float z=sqrt(1.0-dd),ct=.987227283,st=-.159318207;
    vec2 rotated=vec2(n.x*ct-n.y*st,n.x*st+n.y*ct);
    float lat=asin(clamp(-rotated.y,-1.0,1.0)),lon=atan(rotated.x,z)+world.w+.4,light=sunlight(n,z);
    if(k==2){
      vec2 uv=vec2(fract(lon/(PI*2.0)+.5),.5-lat/PI);
      bool isLand=texture(land,uv).a>.24;
      bool cloud=sin(lon*12.0+lat*9.0+sin(lat*7.0))*sin(lat*18.0-lon*5.0)>.66;
      float noise=fract(sin(n.x*129.89+n.y*78.233)*43758.5453);
      if(light<.01){ch=0;alpha=.14;row=PLANET+(isLand?8:10);}
      else if(isLand){ch=shade(.33+.67*light);alpha=.55+.45*light;row=PLANET+8;}
      else if(cloud&&cloudStrength>0.0&&noise<cloudStrength){ch=shade(.17+.33*light);alpha=.35+.55*light+.08*cloudStrength;row=PLANET+9;}
      else{ch=shade(.22+.55*light);alpha=.45+.5*light;row=PLANET+10;}
      return true;
    }
    float value;
    if(k==1){
      float bands=sin(lat*7.8+sin(lon*2.0+lat*5.0)*.6),spotLon=mod(lon-1.1+PI,PI*2.0)-PI;
      bool spot=(spotLon/.34)*(spotLon/.34)+((lat+.38)/.16)*((lat+.38)/.16)<1.0;
      value=light*(spot?1.0:.55+.45*(bands*.5+.5));
      row=PLANET+(spot?7:bands>-.15?5:6);
    }else{
      float bands=sin(lat*9.0+sin(lon*2.0)*.3);
      value=light*(.62+.38*(bands*.5+.5));
      row=PLANET+(bands>.2?1:0);
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
    int ch=-1,row=0;float alpha=0.0;bool covered=false;
    for(int k=0;k<3;k++){
      vec4 world=worlds[k];
      float fade=k==2?fades.y:fades.x;
      if(world.z<1.0||fade<=threshold)continue;
      vec2 d=cell-world.xy;
      int rc,rr,bc,br;float ra,ba;bool front=false;
      bool hasRing=k==0&&ring(d,world.z,rc,rr,ra,front);
      if(hasRing&&!front){covered=true;ch=rc;row=rr;alpha=ra*fade;}
      if(body(k,d,world,bc,br,ba)){covered=true;ch=bc;row=br;alpha=ba*fade;}
      if(hasRing&&front){covered=true;ch=rc;row=rr;alpha=ra*fade;}
    }
    vec4 result=vec4(0);
    if(covered){if(ch>=0)result=character(ch,row,alpha*.94,offset);}
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
  function texture(unit){const t=gl.createTexture();gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;}
  const uniform=name=>gl.getUniformLocation(program,name);
  const glyphTexture=texture(0),starTexture=texture(1),landTexture=texture(2);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));
  gl.uniform1i(uniform('glyphs'),0);gl.uniform1i(uniform('stars'),1);gl.uniform1i(uniform('land'),2);
  const tileSize=uniform('tile'),buffer=uniform('bufferSize'),ratio=uniform('pixelRatio'),fade=uniform('starFade');
  const positions=uniform('worlds[0]'),planetFades=uniform('fades'),clouds=uniform('cloudStrength'),clock=uniform('time');
  const values=new Float32Array(12);
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
    // planets: {saturn, jupiter, earth (each {x, y, r, spin} in CSS px), time, far, near, clouds} or null.
    render(starFade,planets){
      values.fill(0);
      if(planets)[planets.saturn,planets.jupiter,planets.earth].forEach((w,k)=>{values[k*4]=w.x;values[k*4+1]=w.y;values[k*4+2]=w.r;values[k*4+3]=w.spin;});
      gl.viewport(0,0,gl.canvas.width,gl.canvas.height);gl.useProgram(program);
      gl.uniform2f(buffer,gl.canvas.width,gl.canvas.height);gl.uniform1f(ratio,gl.canvas.width/innerWidth);gl.uniform1f(fade,starFade);
      gl.uniform4fv(positions,values);gl.uniform2f(planetFades,planets?planets.far:0,planets?planets.near:0);
      gl.uniform1f(clouds,planets?planets.clouds:0);gl.uniform1f(clock,planets?planets.time:0);
      gl.drawArrays(gl.TRIANGLES,0,3);
    }
  };
};
