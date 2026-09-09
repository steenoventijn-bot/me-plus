import * as T from 'three';
import {itemModel,houseModel,material,random,disposeModel,Builder,houseDefaults} from './models.js';
import {coastRadius,landDistance,footprint,itemPosition,placementResult} from './placement.js';
export {footprint,itemPosition,placementResult,houseDefaults};

const groundY=.32;
function terrain(){
 const positions=[],colors=[],indices=[],n=128,rings=26,color=new T.Color();
 for(let row=0;row<=rings;row++)for(let i=0;i<=n;i++){
  const a=i/n*Math.PI*2,f=row/rings,rr=coastRadius(a),x=Math.cos(a)*8.7*rr*f,z=Math.sin(a)*8.15*rr*f;
  let y=f<.94?groundY:groundY-(f-.94)/.06*.7;
  const noise=Math.sin(x*17.2+z*11.1)*Math.cos(x*9.7-z*19.8)*.035;
  positions.push(x,y,z);
  color.set(f>.947?'#e9cb85':f>.92?'#d6d480':'#83b940');color.offsetHSL(0,noise*.5,noise+(1-f)*.035);colors.push(color.r,color.g,color.b);
  if(row<rings&&i<n){const v=row*(n+1)+i;indices.push(v,v+1,v+n+1,v+1,v+n+2,v+n+1)}
 }
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();
 const mesh=new T.Mesh(g,new T.MeshStandardMaterial({vertexColors:true,roughness:1,side:T.DoubleSide}));mesh.receiveShadow=true;return mesh;
}
function ocean(){
 const uniforms={time:{value:0}};
 const mat=new T.ShaderMaterial({uniforms,vertexShader:`varying vec3 wp;void main(){wp=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`
 varying vec3 wp;uniform float time;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
 void main(){vec2 p=wp.xz;vec2 d=p/vec2(8.7,8.15);float a=atan(d.y,d.x);float edge=1.+.045*sin(3.*a+.7)+.028*cos(5.*a-1.2)+.018*sin(9.*a);float coast=length(d)/edge;
 float depth=smoothstep(.98,1.8,coast);vec3 col=mix(vec3(.10,.76,.80),vec3(.015,.38,.64),depth);
 float n=noise(p*2.1+vec2(time*.12,time*.07));float w=sin(p.x*2.8+p.y*3.7+n*5.+time*.7);float cross=sin(p.x*5.-p.y*2.6+n*3.-time*.52);
 float glint=pow(max(0.,w*cross),14.);col+=vec3(.43,.68,.68)*glint*.43;
 float caustic=pow(1.-abs(sin(p.x*3.1+n*4.+time*.2)*sin(p.y*4.3+n*2.)),13.);col+=caustic*vec3(.1,.21,.15)*(1.-depth)*.32;
 float foam=smoothstep(.10,.01,abs(coast-(.987+.012*sin(time*.48+n*5.))))*smoothstep(.34,.66,n);col=mix(col,vec3(.82,.96,.89),foam*.65);
 float haze=smoothstep(17.,45.,-p.y);col=mix(col,vec3(.34,.74,.85),haze);
 gl_FragColor=vec4(col,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>}`});
 const geo=new T.PlaneGeometry(100,100,1,1);geo.rotateX(-Math.PI/2);const mesh=new T.Mesh(geo,mat);mesh.position.y=-.19;return mesh;
}
function grass(){
 const rng=random(24),geo=new T.ConeGeometry(.025,.15,3),mat=material('#719f36');
 const count=1600,mesh=new T.InstancedMesh(geo,mat,count),obj=new T.Object3D();let n=0;
 while(n<count){const x=rng()*18-9,z=rng()*17-8.5;if(landDistance(x+9.5,z+9.5)>.91)continue;obj.position.set(x,groundY+.035,z);obj.rotation.set((rng()-.5)*.3,rng()*Math.PI,(rng()-.5)*.5);obj.scale.setScalar(.6+rng()*.8);obj.updateMatrix();mesh.setMatrixAt(n,obj.matrix);mesh.setColorAt(n,new T.Color().setHSL(.19+rng()*.05,.48,.35+rng()*.16));n++}mesh.instanceMatrix.needsUpdate=true;return mesh;
}
function skyTexture(){const canvas=document.createElement('canvas');canvas.width=2;canvas.height=256;const c=canvas.getContext('2d'),g=c.createLinearGradient(0,0,0,256);g.addColorStop(0,'#2cacf0');g.addColorStop(.42,'#97dfef');g.addColorStop(1,'#167cb5');c.fillStyle=g;c.fillRect(0,0,2,256);const t=new T.CanvasTexture(canvas);t.colorSpace=T.SRGBColorSpace;return t}
function pathStrip(points){
 const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(p.x-9.5,groundY+.007,p.y-9.5))),v=[],idx=[];
 for(let i=0;i<=70;i++){const p=curve.getPoint(i/70),tan=curve.getTangent(i/70),width=.30+.04*Math.sin(i*.35);v.push(p.x-tan.z*width,p.y,p.z+tan.x*width,p.x+tan.z*width,p.y,p.z-tan.x*width);if(i<70){let j=i*2;idx.push(j,j+2,j+1,j+1,j+2,j+3)}}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(v,3));g.setIndex(idx);g.computeVertexNormals();const mesh=new T.Mesh(g,material('#ecd591'));mesh.receiveShadow=true;return mesh;
}
function lighting(scene){scene.add(new T.HemisphereLight('#e0f5ff','#7c8050',2.5));const sun=new T.DirectionalLight('#fff0cc',3.6);sun.position.set(-11,24,12);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-13,right:13,top:13,bottom:-13,near:1,far:65});sun.shadow.bias=-.001;sun.shadow.normalBias=.04;sun.shadow.radius=3;scene.add(sun);return sun}
export function createWorld(host,{onSelect=()=>{},onDrop=()=>{},onHint=()=>{},onError=()=>{},onCameraChange=()=>{}}={}){
 const renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.65));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.07;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
 const canvas=renderer.domElement;canvas.className='w14-canvas';canvas.setAttribute('aria-label','Je eiland in 3D. Houd een object vast om het te verplaatsen.');canvas.tabIndex=0;host.appendChild(canvas);
 const scene=new T.Scene();scene.background=skyTexture();scene.fog=new T.Fog('#88d4e4',40,85);const camera=new T.PerspectiveCamera(34,1,.1,140),ray=new T.Raycaster(),plane=new T.Plane(new T.Vector3(0,1,0),-groundY),target=new T.Vector3(0,0,0),objects=new Map();
 lighting(scene);scene.add(terrain(),grass());const water=ocean();scene.add(water);let paths=new T.Group();scene.add(paths);
 let data=null,edit=false,selected=null,zoom=1,pan=new T.Vector2(),frame=0,disposed=false,paused=false,last=0,slow=0,frames=0,ms=0,drag=null,hold=null,down=null,pinch=null,ghost=null,ghostKey=null;
 const points=new Map();const ring=new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({color:'#42e298',transparent:true,opacity:.32,side:T.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=groundY+.028;ring.visible=false;scene.add(ring);
 function resize(){const r=host.getBoundingClientRect();if(!r.width||!r.height)return;renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();updateCamera()}
 function updateCamera(){const fit=23/Math.max(.55,camera.aspect);const distance=Math.max(27,fit)/zoom;camera.position.set(pan.x,distance*.61,distance*.79+pan.y);target.set(pan.x,0,pan.y);camera.lookAt(target);onCameraChange();}
 function ground(clientX,clientY){const r=canvas.getBoundingClientRect();ray.setFromCamera(new T.Vector2((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1),camera);const p=new T.Vector3();return ray.ray.intersectPlane(plane,p)?{x:Math.round((p.x+9.5)*100)/100,y:Math.round((p.z+9.5)*100)/100}:null;}
 function hit(e){ground(e.clientX,e.clientY);const hits=ray.intersectObjects([...objects.values()],true);for(const h of hits){let o=h.object;while(o&&!o.userData.item)o=o.parent;if(o)return o.userData.item}return null;}
 function clearHold(){clearTimeout(hold);hold=null}
 function clearDrag(){if(drag?.id&&objects.has(drag.id))objects.get(drag.id).visible=true;drag=null;if(ghost){scene.remove(ghost);disposeModel(ghost);ghost=null}ghostKey=null;ring.visible=false;canvas.classList.remove('dragging');}
 function showGhost(key){if(ghostKey===key)return;if(ghost){scene.remove(ghost);disposeModel(ghost)}ghost=itemModel(key,data?.world?.house);ghost.traverse(o=>{if(o.isMesh){o.castShadow=false}});scene.add(ghost);ghostKey=key;}
 function preview(x,y){if(!drag||!data)return null;const p=ground(x,y);if(!p){ring.visible=false;return null}const q={key:drag.key,id:drag.id,rotation:drag.rotation,...p},result=placementResult(q,data.items);showGhost(drag.key);ghost.position.set(p.x-9.5,groundY+.1,p.y-9.5);ghost.rotation.y=-drag.rotation*Math.PI/180;ring.visible=true;ring.material.color.set(result.valid?'#2fe797':'#ff4e52');const f=footprint(drag.key,drag.rotation);ring.scale.set(f.w,f.h,1);ring.position.set(p.x+f.ox-9.5,groundY+.04,p.y+f.oy-9.5);onHint(result.reason,result.valid);return{...q,...result};}
 function startDrag(key,id,e){if(!edit||!data?.isOwner)return;clearHold();const item=data.items.find(i=>i.id===id);drag={key,id,rotation:Number(item?.rotation||0)};if(id&&objects.has(id))objects.get(id).visible=false;canvas.classList.add('dragging');preview(e.clientX,e.clientY);}
 async function finish(e){const q=preview(e.clientX,e.clientY);clearDrag();if(q?.valid)await onDrop(q);else if(q)onHint(q.reason,false)}
 const abort=new AbortController(),opts={signal:abort.signal};
 canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;canvas.setPointerCapture(e.pointerId);points.set(e.pointerId,{x:e.clientX,y:e.clientY});if(points.size===2){clearHold();clearDrag();const a=[...points.values()];pinch={distance:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),zoom};return}const item=hit(e);down={x:e.clientX,y:e.clientY,item,pan:pan.clone(),at:performance.now()};if(edit&&item&&data?.isOwner){hold=setTimeout(()=>{startDrag(item.item_key,item.id,e);onSelect(item.id)},320)}},opts);
 canvas.addEventListener('pointermove',e=>{if(!points.has(e.pointerId))return;points.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pinch&&points.size===2){const a=[...points.values()];zoom=T.MathUtils.clamp(pinch.zoom*Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)/pinch.distance,.75,2.25);updateCamera();return}if(drag){preview(e.clientX,e.clientY);return}if(!down)return;const dx=e.clientX-down.x,dy=e.clientY-down.y;if(Math.hypot(dx,dy)>9){clearHold();const scale=24/canvas.clientWidth/zoom;pan.set(T.MathUtils.clamp(down.pan.x-dx*scale,-7,7),T.MathUtils.clamp(down.pan.y-dy*scale,-7,7));updateCamera()}},opts);
 canvas.addEventListener('pointerup',e=>{clearHold();points.delete(e.pointerId);if(drag)void finish(e);else if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<9&&edit)onSelect(down.item?.id||null);down=null;if(points.size<2)pinch=null},opts);
 canvas.addEventListener('pointercancel',()=>{clearHold();clearDrag();down=null;points.clear();pinch=null},opts);
 canvas.addEventListener('contextmenu',e=>e.preventDefault(),opts);
 canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=T.MathUtils.clamp(zoom*Math.exp(-e.deltaY*.001),.75,2.25);updateCamera()},{...opts,passive:false});
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();paused=true;onError('De 3D-weergave is onderbroken. Open je wereld opnieuw.')},opts);
 const observer=new ResizeObserver(resize);observer.observe(host);
 document.addEventListener('visibilitychange',()=>{last=0},opts);
 function render(now){if(disposed)return;frame=requestAnimationFrame(render);if(paused||document.hidden||!canvas.isConnected){last=0;return}const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;if(last&&now-last<(reduced?100:1000/30))return;const dt=last?now-last:33;last=now;water.material.uniforms.time.value=reduced?0:now/1000;renderer.render(scene,camera);frames++;ms+=dt;if(frames===90){const fps=90000/ms;canvas.dataset.fps=fps.toFixed(1);canvas.dataset.drawCalls=renderer.info.render.calls;canvas.dataset.triangles=renderer.info.render.triangles;if(fps<23&&renderer.getPixelRatio()>1){renderer.setPixelRatio(1);resize();slow++}frames=0;ms=0}}
 function updatePaths(){scene.remove(paths);disposeModel(paths);paths=new T.Group();const h=data.items.find(i=>i.item_key==='house_main'),dock=data.items.find(i=>i.item_key==='dock_wood');if(h&&dock){const a=itemPosition(h),b=itemPosition(dock),angle=-(h.rotation||0)*Math.PI/180,start={x:a.x+Math.sin(angle)*1.6,y:a.y+Math.cos(angle)*1.6};paths.add(pathStrip([start,{x:9.3,y:11.3},{x:10.3,y:14.5},b]),pathStrip([{x:4.4,y:11.4},{x:7,y:12.2},{x:9.3,y:11.3}]))}scene.add(paths)}
 function update(next){const changedOwner=data?.owner?.id!==next.owner?.id;data=next;const ids=new Set(next.items.map(i=>i.id));for(const[id,g]of objects)if(!ids.has(id)){scene.remove(g);disposeModel(g);objects.delete(id)}
 for(const it of next.items){const signature=it.item_key+(it.item_key==='house_main'?JSON.stringify(next.world.house):'');let group=objects.get(it.id);if(group?.userData.signature!==signature){if(group){scene.remove(group);disposeModel(group)}group=itemModel(it.item_key,next.world.house);group.userData={item:it,signature};objects.set(it.id,group);scene.add(group)}group.userData.item=it;const p=itemPosition(it);group.position.set(p.x-9.5,groundY,p.y-9.5);group.rotation.y=-(Number(it.rotation)||0)*Math.PI/180}
 renderer.shadowMap.needsUpdate=true;updatePaths();if(changedOwner){zoom=1;pan.set(0,0);updateCamera();clearDrag()} }
 resize();frame=requestAnimationFrame(render);
 return {canvas,update,point:ground,select(id){selected=id},setEdit(value){edit=value;if(!edit)clearDrag()},setZoom(delta){zoom=T.MathUtils.clamp(zoom+delta,.75,2.25);updateCamera()},reset(){zoom=1;pan.set(0,0);updateCamera()},pause(v){paused=v},mount(node){host=node;host.appendChild(canvas);observer.disconnect();observer.observe(host);resize()},project(x,y,height=.5){const p=new T.Vector3(x-9.5,height,y-9.5).project(camera);return{x:(p.x+1)/2*canvas.clientWidth,y:(1-p.y)/2*canvas.clientHeight}},
 beginInventoryDrag(key,e){startDrag(key,null,e);const move=ev=>preview(ev.clientX,ev.clientY),stop=ev=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',stop);document.removeEventListener('pointercancel',cancel);void finish(ev)},cancel=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',stop);document.removeEventListener('pointercancel',cancel);clearDrag()};document.addEventListener('pointermove',move);document.addEventListener('pointerup',stop);document.addEventListener('pointercancel',cancel);return cancel},
 dispose(){disposed=true;cancelAnimationFrame(frame);abort.abort();observer.disconnect();clearHold();clearDrag();scene.traverse(o=>o.geometry?.dispose());scene.background.dispose();water.material.dispose();ring.material.dispose();renderer.dispose();canvas.remove()}};
}
export function createHousePreview(host,house){
 const renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;host.appendChild(renderer.domElement);
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(33,1,.1,40);lighting(scene);let model=null,angle=.42,disposed=false;
 function draw(){const r=host.getBoundingClientRect();if(!r.width||!r.height||disposed)return;renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;const distance=Math.max(8,5.2/camera.aspect);camera.position.set(Math.sin(angle)*distance,4,Math.cos(angle)*distance);camera.lookAt(0,1.4,0);camera.updateProjectionMatrix();renderer.render(scene,camera)}
 function update(h){if(model){scene.remove(model);disposeModel(model)}model=houseModel(h);scene.add(model);draw()}
 const resize=new ResizeObserver(draw);resize.observe(host);update(house);
 return{update,rotate(delta){angle+=delta;draw()},dispose(){disposed=true;resize.disconnect();disposeModel(model);renderer.dispose();renderer.domElement.remove()}};
}
