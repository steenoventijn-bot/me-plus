import * as T from 'three';
import {Builder,random} from './models.js';
import {coastRadius} from './placement.js';
export const groundY=.32;
const noiseGLSL=`float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float softNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash21(i),hash21(i+vec2(1.,0.)),f.x),mix(hash21(i+vec2(0.,1.)),hash21(i+1.),f.x),f.y);}`;
export function groundMaterial(){
 const mat=new T.MeshStandardMaterial({vertexColors:true,roughness:.96,side:T.DoubleSide});
 mat.onBeforeCompile=shader=>{
  shader.vertexShader='varying vec3 islandPoint;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nislandPoint=position;');
  shader.fragmentShader='varying vec3 islandPoint;\n'+noiseGLSL+'\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   float broad=softNoise(islandPoint.xz*.85);float fine=softNoise(islandPoint.xz*16.);
   float detailFade=1.-smoothstep(20.,48.,length(vViewPosition));
   diffuseColor.rgb*=.91+.15*broad+(fine-.5)*.07*detailFade;`);
 };mat.customProgramCacheKey=()=> 'island-ground-20';return mat;
}
export function terrain(){
 const n=128,rings=[0,.12,.24,.36,.48,.60,.72,.81,.87,.90,.925,.95,.97,.99,1.015,1.045];
 const positions=[],colors=[],indices=[],color=new T.Color();
 for(let row=0;row<rings.length;row++)for(let i=0;i<=n;i++){
  const a=i/n*Math.PI*2,f=rings[row],r=coastRadius(a),x=Math.cos(a)*8.7*r*f,z=Math.sin(a)*8.15*r*f;
  // All editable land stays at the same height; extra shore is outside its boundary.
  const y=f<=.925?groundY:f<=.97?groundY-(f-.925)*2.1:.2255-(f-.97)*9;
  positions.push(x,y,z);const grassEdge=.917+.007*Math.sin(a*11)+.004*Math.cos(a*19);
  const sand=T.MathUtils.smoothstep(f,grassEdge,grassEdge+.02);
  color.set('#8bc448').lerp(new T.Color('#efd5a1'),sand);
  if(f>.985)color.lerp(new T.Color('#b8aa86'),T.MathUtils.smoothstep(f,.985,1.045));
  color.offsetHSL(0,0,Math.sin(x*.81+z*.32)*Math.cos(z*.67)*.018);colors.push(color.r,color.g,color.b);
  if(row<rings.length-1&&i<n){const v=row*(n+1)+i;indices.push(v,v+1,v+n+1,v+1,v+n+2,v+n+1)}
 }
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.setIndex(indices);geo.computeVertexNormals();
 const land=new T.Mesh(geo,groundMaterial());land.receiveShadow=true;land.name='continuous-grass-and-sand';
 const rock=new Builder(),rng=random(713);
 // Broken clusters, with exposed beach between them, instead of an even bead border.
 for(let i=0;i<38;i++){const a=i/38*Math.PI*2+.04*rng();if(i%7===3||i%7===4)continue;const r=coastRadius(a)*(1.003+rng()*.014);rock.ball(['#b6b5a5','#cfc7b2','#a2aca5'][i%3],Math.cos(a)*8.7*r,-.05,Math.sin(a)*8.15*r,.28+rng()*.24,.28+rng()*.25,.24+rng()*.13)}
 const group=new T.Group();group.name='island-terrain';group.add(land,rock.end());return group;
}
export function ocean(){
 const uniforms={time:{value:0}};
 const material=new T.ShaderMaterial({uniforms,vertexShader:`varying vec3 wp;void main(){wp=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`
 varying vec3 wp;uniform float time;
 ${noiseGLSL}
 void main(){
  vec2 p=wp.xz,d=p/vec2(8.7,8.15);float a=atan(d.y,d.x);float edge=1.+.045*sin(3.*a+.7)+.028*cos(5.*a-1.2)+.018*sin(9.*a);float coast=length(d)/edge;
  float depth=smoothstep(1.,2.5,coast);vec3 col=mix(vec3(.12,.77,.76),vec3(.012,.32,.61),depth);
  float n=softNoise(p*.85+vec2(time*.07,-time*.045));
  vec2 q=p+vec2(n*1.1,softNoise(p*.7-time*.035)*.85);
  float w1=sin(q.x*2.3+q.y*3.1-time*.65),w2=sin(q.x*4.1-q.y*1.7+time*.45);
  vec3 normal=normalize(vec3(-.10*cos(q.x*2.3+q.y*3.1-time*.65)-.08*cos(q.x*4.1-q.y*1.7+time*.45),1.,-.13*cos(q.x*2.3+q.y*3.1-time*.65)+.05*cos(q.x*4.1-q.y*1.7+time*.45)));
  vec3 eye=normalize(cameraPosition-vec3(p.x,-.19,p.y));vec3 halfLight=normalize(eye+normalize(vec3(-.4,.85,.3)));
  float spec=pow(max(dot(normal,halfLight),0.),110.);float fresnel=pow(1.-max(dot(normal,eye),0.),3.);
  col+=vec3(.035,.065,.075)*(w1*.4+w2*.2);col=mix(col,vec3(.56,.82,.92),fresnel*.48);
  float threads=pow(1.-abs(sin(q.x*3.5+q.y*.7)*sin(q.y*3.8-q.x*.4)),14.);
  col+=vec3(.12,.22,.16)*threads*(1.-depth)*.50;
  col+=vec3(1.,.90,.68)*spec*.72;
  float swash=1.025+.008*sin(time*.65+n*4.);
  float foam=(1.-smoothstep(.004,.025,abs(coast-swash)))*(.35+.65*n);
  float crest=pow(max(0.,sin((coast-1.02)*145.-time*.65+n*3.)),16.);
  foam+=crest*(1.-smoothstep(1.04,1.23,coast))*smoothstep(1.03,1.05,coast)*.48;
  col=mix(col,vec3(.88,.98,.95),clamp(foam,0.,.9));
  col=mix(col,vec3(.35,.73,.87),smoothstep(18.,48.,-p.y));
  gl_FragColor=vec4(col,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
 }`});
 const geo=new T.PlaneGeometry(120,120);geo.rotateX(-Math.PI/2);const mesh=new T.Mesh(geo,material);mesh.position.y=-.19;mesh.name='ocean-shallows-reflections-foam';return mesh;
}
export function atmosphere(){
 const group=new T.Group(),b=new Builder();
 // Distant cloud banks are real soft silhouettes, rendered in one opaque batch.
 for(const [x,y,z,s] of [[-22,3,-28,1.6],[19,4,-35,2],[-8,2,-42,1.1],[29,3,-19,1.3]])for(let i=0;i<5;i++)b.ball(i<2?'#d6edf2':'#f6fbef',x+(i-2)*s,y+(i%3)*.65*s,z,.95*s,.72*s,.7*s,true);
 const clouds=b.end();clouds.traverse(o=>{o.castShadow=false;o.receiveShadow=false});group.add(clouds);
 return group;
}
