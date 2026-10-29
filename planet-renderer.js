// GPU projection into a fixed terminal grid, with separate Saturn, Jupiter, and Earth palettes.
// The glyph sheet is drawn at the screen's pixel density; glyphs land on whole device pixels and are sampled 1:1.
window.createPlanetRenderer = function(gl, sheet, cellWidth, cellHeight) {
  const vertex = `#version 300 es
  void main(){ vec2 p=vec2((gl_VertexID==1)?3.0:-1.0,(gl_VertexID==2)?3.0:-1.0);gl_Position=vec4(p,0,1);}`;
  const fragment = `#version 300 es
  precision highp float;
  uniform vec2 bufferSize;
  uniform float pixelRatio;
  uniform vec2 tile;
  uniform vec2 cellSize;
  uniform vec4 worlds[3];
  uniform float farOpacity;
  uniform float cloudStrength;
  uniform float time;
  uniform sampler2D glyphs;
  uniform sampler2D land;
  out vec4 outputColor;
  const float PI=3.14159265359;
  // Characters follow galaxy.js's faint-to-dense ramp: . , : ; - = + * # % @ (0 to 10).
  vec4 character(int ch,int row,float alpha,vec2 offset,float visibility){
    vec2 uv=(vec2(float(min(ch,10)),float(row))*tile+offset+.5)/vec2(textureSize(glyphs,0));
    vec4 ink=texture(glyphs,uv);
    return vec4(ink.rgb*ink.a*clamp(alpha,0.0,1.0)*visibility,visibility);
  }
  // Sunlight from the upper left and a little in front, as in app.js: 0 on the night side, up to 1 in full sun.
  float sunlight(vec2 n,float z){float l=-n.x*.55-n.y*.42+z*.72;return smoothstep(-.03,.16,l)*(.25+.75*max(0.0,l));}
  bool ring(vec2 cell,vec4 world,out float strength,out bool front,out bool near){
    float a=-.12+sin(time*.00009)*.03;
    vec2 d=cell-world.xy;
    vec2 local=vec2(d.x*cos(a)+d.y*sin(a),-d.x*sin(a)+d.y*cos(a));
    float band=length(local/vec2(world.z*2.65,world.z*.71));
    front=local.y>0.0;
    strength=1.0-abs(band-.84)/.16;
    near=band>=.6&&band<=1.1;
    return band>=.69&&band<=1.0;
  }
  void main(){
    vec2 device=vec2(gl_FragCoord.x,bufferSize.y-gl_FragCoord.y);
    vec2 pixel=device/pixelRatio;
    vec2 cell=floor(pixel/cellSize+.5)*cellSize;
    // This pixel's place in its cell's glyph tile, with the tile snapped to whole device pixels.
    vec2 offset=clamp(floor(device)-floor(cell*pixelRatio-tile*.5+.5),vec2(0),tile-1.0);
    vec4 result=vec4(0);
    for(int k=0;k<3;k++){
      vec4 world=worlds[k];
      float visibility=k==2?1.0:farOpacity;
      if(world.z<1.0||visibility<.02)continue;
      bool hasRing=false; bool ringFront=false; bool nearRing=false; float ringStrength=0.0;
      if(k==0){
        hasRing=ring(cell,world,ringStrength,ringFront,nearRing);
        // Match the CPU renderer's ring: = and - glyphs in pale cream, fainter than the planet.
        if(hasRing&&!ringFront)result=character(ringStrength>.6?5:4,1,(4.0+floor(ringStrength*3.0))/12.0,offset,visibility);
      }
      vec2 delta=cell-world.xy;
      vec2 n=delta/world.z;
      float d=dot(n,n);
      if(d<=1.0){
        float z=sqrt(1.0-d);
        float ct=.987227283,st=-.159318207;
        vec2 rotated=vec2(n.x*ct-n.y*st,n.x*st+n.y*ct);
        float lat=asin(clamp(-rotated.y,-1.0,1.0));
        float lon=atan(rotated.x,z)+world.w+.4;
        float light=sunlight(n,z);
        int row0=k==2?6:k==1?2:1;
        int ch=0;int row=row0;float alpha=.5;
        float r2=world.z*world.z;
        vec2 edge=abs(delta)+cellSize;
        // Cells on the outline (a neighbour falls outside the disc): + or * on the sunlit edge, a faint dot at night.
        if(edge.x*edge.x+delta.y*delta.y>r2||delta.x*delta.x+edge.y*edge.y>r2){
          if(light>.05){ch=6+int(floor(light+.5));alpha=.3+.4*light;row=k==2?7:row0;}
          else{ch=0;alpha=.22;}
        }else if(k==2){
          vec2 uv=vec2(fract(lon/(PI*2.0)+.5),.5-lat/PI);
          bool isLand=texture(land,uv).a>.24;
          bool cloud=sin(lon*12.0+lat*9.0+sin(lat*7.0))*sin(lat*18.0-lon*5.0)>.66;
          float noise=fract(sin(n.x*129.89+n.y*78.233)*43758.5453);
          if(light<.01){ch=isLand?1:0;alpha=.14;row=isLand?4:6;}
          else if(isLand){ch=4+int(floor(light*4.0+.5));alpha=.4+.55*light;row=4;}
          else if(cloud&&cloudStrength>0.0&&noise<cloudStrength){ch=1+int(floor(light*3.0+.5));alpha=.2+.45*light+.08*cloudStrength;row=5;}
          // Ocean blue runs from : in shadow to + in full sun, as in app.js.
          else{ch=2+int(floor(light*4.0+.5));alpha=.24+.5*light;row=6;}
        }else{
          float bands=.5+.5*sin(lat*(k==1?17.0:23.0)+sin(lon*3.0+lat*6.0)*.75);
          float value=light*(.5+.5*bands);
          row=k==1?(bands>.48?2:3):(bands>.45?1:0);
          if(light<.01){ch=1;alpha=.12;}else{ch=1+int(floor(value*9.0+.5));alpha=.25+.65*value;}
        }
        result=character(ch,row,alpha,offset,visibility);
      }
      if(k==0&&hasRing&&ringFront)result=character(ringStrength>.6?5:4,1,(4.0+floor(ringStrength*3.0))/12.0,offset,visibility);
      // A thin gap of empty (black) cells around each planet and ring, as in app.js, so it stands apart from the Milky Way.
      float outer=world.z+cellSize.x*1.2;
      if(result.a==0.0&&(dot(delta,delta)<outer*outer||nearRing))result=vec4(0,0,0,visibility);
    }
    outputColor=result;
  }`;
  function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
  const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  function texture(unit){const t=gl.createTexture();gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;}
  const glyphTexture=texture(0),tileSize=gl.getUniformLocation(program,'tile');
  function uploadGlyphs(next){gl.useProgram(program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,glyphTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,next.canvas);gl.uniform2f(tileSize,next.tileW,next.tileH);}
  uploadGlyphs(sheet);
  gl.uniform1i(gl.getUniformLocation(program,'glyphs'),0);
  gl.uniform2f(gl.getUniformLocation(program,'cellSize'),cellWidth,cellHeight);
  const mapTexture=texture(1);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));
  gl.uniform1i(gl.getUniformLocation(program,'land'),1);
  const positions=gl.getUniformLocation(program,'worlds[0]'),buffer=gl.getUniformLocation(program,'bufferSize'),ratio=gl.getUniformLocation(program,'pixelRatio'),opacity=gl.getUniformLocation(program,'farOpacity'),clock=gl.getUniformLocation(program,'time'),clouds=gl.getUniformLocation(program,'cloudStrength');
  const values=new Float32Array(12);
  gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.clearColor(0,0,0,0);
  return {
    uploadGlyphs,
    uploadLand(pixels){gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,mapTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1024,512,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);},
    render(worlds,earth,rotation,time,farOpacity,cloudStrength){
      for(let k=0;k<3;k++){const w=k===2?earth:worlds[k];values[k*4]=w?.x||0;values[k*4+1]=w?.y||0;values[k*4+2]=w?.r||0;values[k*4+3]=k===2?rotation:w?.spin||0;}
      gl.viewport(0,0,gl.canvas.width,gl.canvas.height);gl.useProgram(program);gl.uniform4fv(positions,values);gl.uniform2f(buffer,gl.canvas.width,gl.canvas.height);gl.uniform1f(ratio,gl.canvas.width/innerWidth);gl.uniform1f(opacity,farOpacity);gl.uniform1f(clock,time);gl.uniform1f(clouds,cloudStrength);gl.drawArrays(gl.TRIANGLES,0,3);
    }
  };
};
