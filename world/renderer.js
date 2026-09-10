import * as T from 'three';
import {createLife,constructionProgress} from './life.js';
export {constructionProgress};
import {itemModel,houseModel,adventureBoat,material,random,disposeModel,Builder,houseDefaults} from './models.js';
import {coastRadius,landDistance,footprint,itemPosition,placementResult} from './placement.js';
export {footprint,itemPosition,placementResult,houseDefaults};

import {groundY,terrain,ocean,atmosphere} from './environment.js';
function skyTexture(){const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const c=canvas.getContext('2d'),g=c.createLinearGradient(0,0,0,512);g.addColorStop(0,'#279fea');g.addColorStop(.52,'#a6e5f1');g.addColorStop(1,'#298fbf');c.fillStyle=g;c.fillRect(0,0,512,512);const glow=c.createRadialGradient(100,90,3,100,90,90);glow.addColorStop(0,'rgba(255,250,220,.95)');glow.addColorStop(.18,'rgba(255,245,210,.7)');glow.addColorStop(1,'rgba(255,246,221,0)');c.fillStyle=glow;c.fillRect(0,0,512,512);const t=new T.CanvasTexture(canvas);t.colorSpace=T.SRGBColorSpace;return t}
function pathStrip(points){
 const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(p.x-9.5,groundY+.007,p.y-9.5))),v=[],idx=[];
 for(let i=0;i<=70;i++){const p=curve.getPoint(i/70),tan=curve.getTangent(i/70),width=.30+.04*Math.sin(i*.35);v.push(p.x-tan.z*width,p.y,p.z+tan.x*width,p.x+tan.z*width,p.y,p.z-tan.x*width);if(i<70){let j=i*2;idx.push(j,j+2,j+1,j+1,j+2,j+3)}}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(v,3));g.setIndex(idx);g.computeVertexNormals();const mesh=new T.Mesh(g,material('#ecd591'));mesh.receiveShadow=true;return mesh;
}
function lighting(scene){scene.add(new T.HemisphereLight('#d9f1ff','#698c46',1.45));const sun=new T.DirectionalLight('#fff1d3',3.5);sun.position.set(-10,19,8);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-13,right:13,top:13,bottom:-13,near:1,far:65});sun.shadow.bias=-.001;sun.shadow.normalBias=.04;sun.shadow.radius=4;scene.add(sun);return sun}
export function createWorld(host,{onSelect=()=>{},onDrop=()=>{},onHint=()=>{},onError=()=>{},onCameraChange=()=>{},onBoat=()=>{}}={}){
 const renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.65));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.07;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
 const canvas=renderer.domElement;canvas.className='w14-canvas';canvas.setAttribute('aria-label','Je eiland in 3D. Houd een object vast om het te verplaatsen.');canvas.tabIndex=0;host.appendChild(canvas);
 const scene=new T.Scene();scene.background=skyTexture();scene.fog=new T.Fog('#88d4e4',40,85);const camera=new T.PerspectiveCamera(34,1,.1,140),ray=new T.Raycaster(),plane=new T.Plane(new T.Vector3(0,1,0),-groundY),target=new T.Vector3(0,0,0),objects=new Map();
 const contactGeometry=new T.PlaneGeometry(1,1);contactGeometry.rotateX(-Math.PI/2);
 const contactMaterial=new T.ShaderMaterial({transparent:true,depthWrite:false,vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,fragmentShader:`varying vec2 vUv;void main(){float r=length((vUv-.5)*2.);float opacity=(1.-smoothstep(.0,1.,r))*.24;gl_FragColor=vec4(.09,.16,.08,opacity);}`});
 let contactShadows=null;
 function updateContactShadows(items){if(contactShadows){scene.remove(contactShadows);contactShadows.dispose()}
  const solid=items.filter(i=>!/(pond|pool|stream|dock|bridge)/.test(i.item_key));contactShadows=new T.InstancedMesh(contactGeometry,contactMaterial,Math.max(1,solid.length));contactShadows.count=solid.length;
  const transform=new T.Object3D();solid.forEach((it,i)=>{const p=itemPosition(it),f=footprint(it.item_key,Number(it.rotation||0));transform.position.set(p.x+f.ox-9.5,groundY+.016,p.y+f.oy-9.5);transform.scale.set(f.w*1.5,1,f.h*1.5);transform.updateMatrix();contactShadows.setMatrixAt(i,transform.matrix)});contactShadows.instanceMatrix.needsUpdate=true;scene.add(contactShadows);
 }
 const sun=lighting(scene);scene.add(terrain(),atmosphere());const life=createLife(scene);const water=ocean();scene.add(water);const boat=adventureBoat();boat.position.set(7,-.37,7);boat.rotation.y=-.35;scene.add(boat);let paths=new T.Group();scene.add(paths);
 let awaitingPlacement=false,lastPlacement=null,committingPlacement=false;
 let data=null,edit=false,selected=null,zoom=1,pan=new T.Vector2(),frame=0,disposed=false,paused=false,last=0,slow=0,frames=0,ms=0,drag=null,hold=null,down=null,pinch=null,ghost=null,ghostKey=null;
 const points=new Map();const ring=new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({color:'#42e298',transparent:true,opacity:.32,side:T.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=groundY+.028;ring.visible=false;scene.add(ring);
 function resize(){const r=host.getBoundingClientRect();if(!r.width||!r.height)return;renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();updateCamera()}
 function updateCamera(){const fit=23/Math.max(.55,camera.aspect);const distance=Math.max(27,fit)/zoom;camera.position.set(pan.x,distance*.61,distance*.79+pan.y);target.set(pan.x,0,pan.y);camera.lookAt(target);onCameraChange();}
 function ground(clientX,clientY){const r=canvas.getBoundingClientRect();ray.setFromCamera(new T.Vector2((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1),camera);const p=new T.Vector3();return ray.ray.intersectPlane(plane,p)?{x:Math.round((p.x+9.5)*100)/100,y:Math.round((p.z+9.5)*100)/100}:null;}
 function hit(e){ground(e.clientX,e.clientY);const hits=ray.intersectObjects([...objects.values()],true);for(const h of hits){let o=h.object;while(o&&!o.userData.item)o=o.parent;if(o)return o.userData.item}return null;}
 function clearHold(){clearTimeout(hold);hold=null}
 function clearDrag(){if(drag?.id&&objects.has(drag.id))objects.get(drag.id).visible=true;drag=null;if(ghost){scene.remove(ghost);disposeModel(ghost);ghost=null}ghostKey=null;ring.visible=false;canvas.classList.remove('dragging');}
 function showGhost(key){if(ghostKey===key)return;if(ghost){scene.remove(ghost);disposeModel(ghost)}ghost=itemModel(key,data?.world?.house);ghost.traverse(o=>{if(o.isMesh){o.castShadow=false}});scene.add(ghost);ghostKey=key;}
 function preview(x,y){if(!drag||!data)return null;const p=ground(x,y);if(!p){ring.visible=false;return null}const q={key:drag.key,id:drag.id,rotation:drag.rotation,...p},result=placementResult(q,data.items);showGhost(drag.key);ghost.position.set(p.x-9.5,groundY+.1,p.y-9.5);ghost.rotation.y=-drag.rotation*Math.PI/180;ring.visible=true;ring.material.color.set(result.valid?'#2fe797':'#ff4e52');const f=footprint(drag.key,drag.rotation);ring.scale.set(f.w,f.h,1);ring.position.set(p.x+f.ox-9.5,groundY+.04,p.y+f.oy-9.5);onHint(result.reason,result.valid);lastPlacement={...q,...result};return lastPlacement;}
 function startDrag(key,id,e){if(!edit||!data?.isOwner)return;clearHold();const item=data.items.find(i=>i.id===id);drag={key,id,rotation:Number(item?.rotation||0)};if(id&&objects.has(id))objects.get(id).visible=false;canvas.classList.add('dragging');preview(e.clientX,e.clientY);}
 async function finish(e){const q=preview(e.clientX,e.clientY);clearDrag();if(q?.valid)await onDrop(q);else if(q)onHint(q.reason,false)}
 const abort=new AbortController(),opts={signal:abort.signal};
 canvas.addEventListener('pointerdown',e=>{if(e.button!==0||committingPlacement||awaitingPlacement&&points.size>0)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);points.set(e.pointerId,{x:e.clientX,y:e.clientY});if(points.size===2){clearHold();clearDrag();const a=[...points.values()];pinch={distance:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),zoom};return}if(awaitingPlacement){preview(e.clientX,e.clientY);return}const item=hit(e);down={x:e.clientX,y:e.clientY,item,pan:pan.clone(),at:performance.now()};if(edit&&item&&data?.isOwner){hold=setTimeout(()=>{startDrag(item.item_key,item.id,e);onSelect(item.id)},320)}},opts);
 canvas.addEventListener('pointermove',e=>{if(!points.has(e.pointerId))return;points.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pinch&&points.size===2){const a=[...points.values()];zoom=T.MathUtils.clamp(pinch.zoom*Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)/pinch.distance,.75,2.25);updateCamera();return}if(drag){preview(e.clientX,e.clientY);return}if(!down)return;const dx=e.clientX-down.x,dy=e.clientY-down.y;if(Math.hypot(dx,dy)>9){clearHold();const scale=24/canvas.clientWidth/zoom;pan.set(T.MathUtils.clamp(down.pan.x-dx*scale,-7,7),T.MathUtils.clamp(down.pan.y-dy*scale,-7,7));updateCamera()}},opts);
 canvas.addEventListener('pointerup',e=>{if(!points.has(e.pointerId))return;clearHold();points.delete(e.pointerId);if(awaitingPlacement)preview(e.clientX,e.clientY);else if(drag)void finish(e);else if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<9){if(edit)onSelect(down.item?.id||null);else{ground(e.clientX,e.clientY);if(ray.intersectObject(boat,true).length)onBoat()}}down=null;if(points.size<2)pinch=null},opts);
 canvas.addEventListener('pointercancel',()=>{clearHold();if(!awaitingPlacement)clearDrag();down=null;points.clear();pinch=null},opts);
 for(const event of ['contextmenu','selectstart','dragstart'])canvas.addEventListener(event,e=>e.preventDefault(),opts);
 canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=T.MathUtils.clamp(zoom*Math.exp(-e.deltaY*.001),.75,2.25);updateCamera()},{...opts,passive:false});
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();paused=true;onError('De 3D-weergave is onderbroken. Open je wereld opnieuw.')},opts);
 const observer=new ResizeObserver(resize);observer.observe(host);
 document.addEventListener('visibilitychange',()=>{last=0;cancelAnimationFrame(frame);frame=0;if(!document.hidden&&!paused&&!disposed)frame=requestAnimationFrame(render)},opts);
 function render(now){frame=0;if(disposed||paused||document.hidden||!canvas.isConnected){last=0;return}frame=requestAnimationFrame(render);const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;if(last&&now-last<(reduced?100:1000/30))return;const dt=last?now-last:33;last=now;water.material.uniforms.time.value=reduced?0:now/1000;boat.position.y=-.37+(reduced?0:Math.sin(now*.0013)*.045);boat.rotation.z=reduced?0:Math.sin(now*.0009)*.025;life.tick(now,Math.min(dt/1000,.1),reduced,edit);renderer.render(scene,camera);if(frames%6===0)onCameraChange();frames++;ms+=dt;if(frames===90){const fps=90000/ms;canvas.dataset.fps=fps.toFixed(1);canvas.dataset.drawCalls=renderer.info.render.calls;canvas.dataset.triangles=renderer.info.render.triangles;if(fps<23&&renderer.getPixelRatio()>1){renderer.setPixelRatio(1);resize();slow++}frames=0;ms=0}}
 function updatePaths(){scene.remove(paths);disposeModel(paths);paths=new T.Group();const h=data.items.find(i=>i.item_key==='house_main'),dock=data.items.find(i=>i.item_key==='dock_wood');if(h&&dock){const a=itemPosition(h),b=itemPosition(dock),angle=-(h.rotation||0)*Math.PI/180,start={x:a.x+Math.sin(angle)*1.6,y:a.y+Math.cos(angle)*1.6};paths.add(pathStrip([start,{x:9.3,y:11.3},{x:10.3,y:14.5},b]),pathStrip([{x:4.4,y:11.4},{x:7,y:12.2},{x:9.3,y:11.3}]))}scene.add(paths)}
 function update(next){const changedOwner=data?.owner?.id!==next.owner?.id;data=next;const ids=new Set(next.items.map(i=>i.id));for(const[id,g]of objects)if(!ids.has(id)){scene.remove(g);disposeModel(g);objects.delete(id)}
 for(const it of next.items){const signature=it.item_key+(it.item_key==='house_main'?JSON.stringify(next.world.house):'');let group=objects.get(it.id);if(group?.userData.signature!==signature){if(group){scene.remove(group);disposeModel(group)}group=itemModel(it.item_key,next.world.house);group.userData={item:it,signature};objects.set(it.id,group);scene.add(group)}group.userData.item=it;const p=itemPosition(it);group.position.set(p.x-9.5,groundY,p.y-9.5);group.rotation.y=-(Number(it.rotation)||0)*Math.PI/180}
 life.update(next);renderer.shadowMap.needsUpdate=true;updateContactShadows(next.items);updatePaths();if(changedOwner){awaitingPlacement=false;lastPlacement=null;zoom=1;pan.set(0,0);updateCamera();clearDrag()} }
 resize();frame=requestAnimationFrame(render);
 return {canvas,update,people:life.people,project:life.project,point:ground,select(id){selected=id},setEdit(value){edit=value;if(!edit){awaitingPlacement=false;clearDrag()}},setZoom(delta){zoom=T.MathUtils.clamp(zoom+delta,.75,2.25);updateCamera()},reset(){zoom=1;pan.set(0,0);updateCamera()},pause(v){paused=v||!!document.querySelector?.('.w16-album,.w15-browser,.w14-house-sheet,.w18-harbour');last=0;cancelAnimationFrame(frame);frame=0;if(!paused&&!disposed&&!document.hidden)frame=requestAnimationFrame(render)},mount(node){host=node;host.appendChild(canvas);observer.disconnect();observer.observe(host);resize()},project(x,y,height=.5){const p=new T.Vector3(x-9.5,height,y-9.5).project(camera);return{x:(p.x+1)/2*canvas.clientWidth,y:(1-p.y)/2*canvas.clientHeight}},
 beginPlacement(key){
  if(!edit||!data?.isOwner)return false;
  clearDrag();awaitingPlacement=true;
  const rect=canvas.getBoundingClientRect();startDrag(key,null,{clientX:rect.left+rect.width/2,clientY:rect.top+rect.height*.55});return true;
 },
 async commitPlacement(){
  if(committingPlacement||!awaitingPlacement||!lastPlacement)return false;
  const q=lastPlacement,check=placementResult(q,data.items);
  if(!check.valid){onHint(check.reason,false);return false}
  committingPlacement=true;try{const saved=await onDrop(q);
  if(saved){awaitingPlacement=false;clearDrag()}
  return !!saved;}finally{committingPlacement=false}
 },
 cancelPlacement(){awaitingPlacement=false;lastPlacement=null;clearDrag()},
 beginInventoryDrag(key,e){startDrag(key,null,e);const move=ev=>preview(ev.clientX,ev.clientY),stop=ev=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',stop);document.removeEventListener('pointercancel',cancel);void finish(ev)},cancel=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',stop);document.removeEventListener('pointercancel',cancel);clearDrag()};document.addEventListener('pointermove',move);document.addEventListener('pointerup',stop);document.addEventListener('pointercancel',cancel);return cancel},
 dispose(){disposed=true;cancelAnimationFrame(frame);abort.abort();observer.disconnect();clearHold();clearDrag();life.dispose();scene.traverse(o=>o.geometry?.dispose());scene.background.dispose();scene.traverse(o=>{if(o.material?.customProgramCacheKey?.()==='island-ground-20')o.material.dispose()});water.material.dispose();ring.material.dispose();contactShadows?.dispose();contactGeometry.dispose();contactMaterial.dispose();renderer.dispose();canvas.remove()}};
}
export function createHousePreview(host,house){
 const renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;host.appendChild(renderer.domElement);
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(33,1,.1,40);lighting(scene);let model=null,angle=.42,disposed=false;
 function draw(){const r=host.getBoundingClientRect();if(!r.width||!r.height||disposed)return;renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;const distance=Math.max(8,5.2/camera.aspect);camera.position.set(Math.sin(angle)*distance,4,Math.cos(angle)*distance);camera.lookAt(0,1.4,0);camera.updateProjectionMatrix();renderer.render(scene,camera)}
 function update(h){if(model){scene.remove(model);disposeModel(model)}model=houseModel(h);scene.add(model);draw()}
 const resize=new ResizeObserver(draw);resize.observe(host);update(house);
 return{update,rotate(delta){angle+=delta;draw()},dispose(){disposed=true;resize.disconnect();disposeModel(model);renderer.dispose();renderer.domElement.remove()}};
}

// One temporary renderer produces static pictures, rather than one live canvas per card.
export async function renderItemPictures(keys,onImage,signal){
 const renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
 renderer.setSize(240,180,false);renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;
 renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.07;
 const scene=new T.Scene();scene.background=new T.Color('#edf3e7');lighting(scene);
 const camera=new T.OrthographicCamera(-1,1,1,-1,.01,100);
 try{for(const key of keys){
  if(signal?.aborted)break;
  await new Promise(resolve=>setTimeout(resolve,20));if(signal?.aborted)break;
  const model=itemModel(key);scene.add(model);
  try{
   const box=new T.Box3().setFromObject(model),center=box.getCenter(new T.Vector3());
   const radius=Math.max(.2,box.getSize(new T.Vector3()).length()/2),half=radius*1.13;
   camera.left=-half*4/3;camera.right=half*4/3;camera.top=half;camera.bottom=-half;
   camera.position.copy(center).add(new T.Vector3(1,.8,1.5).normalize().multiplyScalar(radius*4));
   camera.lookAt(center);camera.updateProjectionMatrix();renderer.render(scene,camera);
   onImage(key,renderer.domElement.toDataURL('image/png'));
  }finally{scene.remove(model);disposeModel(model)}
 }}finally{renderer.dispose();renderer.forceContextLoss()}
}
export {sharedIslandData} from './adventure.js';
