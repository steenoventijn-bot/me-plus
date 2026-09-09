import * as T from 'three';
import {Builder,material,disposeModel,houseModel,houseDefaults} from './models.js';
import {placementResult,footprint,itemPosition,validLand} from './placement.js';

export function constructionProgress(data){
 const unlocked=new Set((data.unlocks||[]).map(x=>x.item_key));
 const count=Math.max(0,Number(data.stats?.knowledge)||0);
 const goals=[['knowledge_house','Knowledge House',10],['knowledge_stand','Knowledge Stand',25],['knowledge_library','Knowledge Library',100]];
 const goal=goals.find(([key,,total])=>!unlocked.has(key)&&count<total);
 if(!goal)return null;
 const [key,name,total]=goal;return {key,name,total,count,ratio:Math.min(1,count/total)};
}
export function avatarModel(profile={}){
 const c=profile.avatarConfig||{},skin=({light:'#f2c8a6',warm:'#e8ad80',medium:'#c88761',deep:'#82513d'})[c.tone]||'#e8ad80';
 const hair=({black:'#231f20',darkbrown:'#3a2923',brown:'#654331',blonde:'#d9b86d',darkblonde:'#a88752',red:'#a44d35',grey:'#87898e',white:'#e8e7e2',blue:'#3f72b5',purple:'#7354a7',pink:'#c55e88',green:'#477d60'})[c.hairColor]||'#3a2923';
 const shirt=({fresh:'#478b70',ocean:'#4b83ab',dream:'#9474b4',energy:'#db9253',pink:'#c87996'})[profile.accentTheme]||'#478b70';
 const root=new T.Group(),body=new Builder(),head=new Builder();
 const wide=c.body==='broad'?1.2:c.body==='slim'?.85:1,headWidth=c.presentation==='masculine'?.25:c.presentation==='feminine'?.225:.24;
 body.ball(shirt,0,.67,0,.23*wide,.29,.15,true);body.pole(skin,0,.94,0,.085,.17);
 if(c.outfit==='hoodie'){body.ball(shirt,0,.87,-.075,.22,.13,.14,true);for(const x of [-.07,.07])body.pole('#e9e3cc',x,.81,.15,.012,.18)}
 if(c.outfit==='jacket'||c.outfit==='premium'){for(const x of [-.12,.12])body.box(c.outfit==='premium'?'#e0be64':'#e8d7b6',x,.75,.145,.025,.30,.016)}
 if(c.outfit==='sport')body.box('#f6e4b4',0,.75,.15,.34,.05,.02);
 if(c.outfit==='sweater')for(const y of [.61,.70,.79])body.box('#8db59a',0,y,.145,.32,.017,.018);
 root.add(body.end());
 head.ball(skin,0,0,0,headWidth,.28,.225,true);for(const x of [-headWidth,headWidth])head.ball(skin,x,-.01,0,.043,.07,.035,true);
 // Crown sits above the forehead; back hair never covers the face.
 head.ball(hair,0,.14,-.047,.25,.18,.22,true);
 if(c.hair==='long'){for(const x of [-.205,.205])head.ball(hair,x,-.14,-.055,.077,.27,.13,true)}
 else if(c.hair==='curl'){for(let i=0;i<11;i++){const a=i*Math.PI*2/11;head.ball(hair,Math.cos(a)*.19,.15+Math.sin(a)*.09,-.005,.10,.095,.11,true)}}
 else if(c.hair==='messy'){for(let i=0;i<5;i++)head.ball(hair,-.18+i*.085,.23+(i%2)*.03,.045,.065,.10,.075,true)}
 else if(c.hair!=='buzz'){head.ball(hair,c.hair==='undercut'?.095:-.05,.15,.16,['short','fade'].includes(c.hair)?.14:.20,.07,.085,true)}
 for(const x of [-.085,.085]){head.ball('#fff7e5',x,.0,.213,.034,.043,.015,true);head.ball('#263a35',x,-.004,.228,.018,.026,.01,true);head.box(hair,x,.073,.21,.064,.015,.017,0,0,x*.5)}
 head.ball(skin,0,-.05,.235,.035,.045,.044,true);head.ball('#ae6f59',0,-.135,.206,.065,.017,.018,true);
 if(['glasses','sunglasses'].includes(c.accessory)){for(const x of [-.085,.085]){head.box(c.accessory==='sunglasses'?'#263a35':'#b4c9bb',x,0,.25,.135,.093,.026)}head.box('#34443d',0,.01,.25,.045,.017,.02)}
 if(c.accessory==='earring')head.ball('#e6be58',-.26,-.06,0,.026,.035,.025,true);
 if(c.accessory==='headphones'){for(const x of [-.265,.265])head.ball('#344944',x,0,0,.047,.10,.075,true);head.ball('#344944',0,.285,-.045,.255,.032,.095,true)}
 if(c.accessory==='necklace'){const jewel=new Builder();jewel.pole('#d6af55',0,.8,.16,.10,.025,Math.PI/2);jewel.ball('#e6bb60',0,.75,.18,.025);root.add(jewel.end())}
 if(c.accessory==='sport')head.box('#ece7cb',0,.1,.22,.40,.045,.03);
 if(c.head==='cap'){head.ball(shirt,0,.24,-.03,.255,.09,.24,true);head.box(shirt,0,.23,.20,.32,.035,.25)}
 if(c.head==='beanie'){head.ball(shirt,0,.25,-.015,.26,.15,.24,true);head.ball('#e2d8be',0,.40,-.03,.06,.055,.06,true)}
 if(c.head==='crown'){for(let i=0;i<5;i++){const a=i*Math.PI*2/5;head.box('#e4bd5b',Math.cos(a)*.17,.31,Math.sin(a)*.17,.065,.15,.07)}}
 const headGroup=head.end();headGroup.position.y=1.17;root.add(headGroup);
 const arms=[],legs=[];
 for(const side of [-1,1]){
  const arm=new Builder(),bare=c.outfit==='tank';arm.pole(bare?skin:shirt,0,-.12,0,.067,.25);arm.ball(skin,0,-.28,0,.062,.08,.062,true);const g=arm.end();g.position.set(side*.26*wide,.82,0);root.add(g);arms.push(g);
  const leg=new Builder();leg.pole('#415a59',0,-.13,0,.072,.27);leg.ball('#e3e3d6',0,-.28,.045,.085,.055,.14,true);const l=leg.end();l.position.set(side*.105,.34,0);root.add(l);legs.push(l);
 }
 if(c.effect&&c.effect!=='none'){const ring=new Builder();for(let i=0;i<8;i++){const a=i*Math.PI/4;ring.ball(c.effect==='battle'?'#dfa14e':'#c6d78f',Math.cos(a)*.34,.04,Math.sin(a)*.34,.021)}root.add(ring.end())}
 root.traverse(o=>{if(o.isMesh)o.castShadow=false});
 return {root,arms,legs};
}
export function createLife(scene){
 const group=new T.Group();scene.add(group);const actors=new Map();let data=null,flowers=[],chimney=null,site=null,project=null,sitePosition=null;
 const wingGeometry=new T.SphereGeometry(1,6,4),butterflies=[];
 for(let i=0;i<5;i++){const butterfly=new T.Group(),wings=[];for(const side of [-1,1]){const wing=new T.Mesh(wingGeometry,material(i%2?'#f7c46c':'#edabd2'));wing.scale.set(.07,.012,.105);wing.position.x=side*.045;butterfly.add(wing);wings.push(wing)}group.add(butterfly);butterflies.push({root:butterfly,wings})}
 const smokeGeometry=new T.SphereGeometry(1,7,5),smokeMaterial=new T.MeshBasicMaterial({color:'#fff3db',transparent:true,opacity:.16,depthWrite:false}),smoke=new T.InstancedMesh(smokeGeometry,smokeMaterial,7);group.add(smoke);
 function free(x,y){return placementResult({key:'lamp_glow',x,y},data?.items||[]).valid}
 function findFree(exclude=null){for(let y=12;y<=16;y+=.5)for(let x=7;x<=13;x+=.5)if(free(x,y)&&![...actors.values()].some(a=>a.id!==exclude&&Math.hypot(a.x-x,a.y-y)<.5))return {x,y};return {x:9.5,y:12}}
 function update(next){
  data=next;const people=[next.owner,...(!next.isOwner&&next.viewer?[next.viewer]:[]),...(next.visitors||[])].filter((p,i,a)=>p&&a.findIndex(q=>q?.id===p.id)===i).slice(0,4),ids=new Set(people.map(p=>p.id));
  for(const [id,a] of actors)if(!ids.has(id)){group.remove(a.root);disposeModel(a.root);actors.delete(id)}
  people.forEach((p,i)=>{const signature=JSON.stringify([p.avatarConfig,p.accentTheme]);let a=actors.get(p.id);if(a?.signature!==signature){if(a){group.remove(a.root);disposeModel(a.root)}const model=avatarModel(p),point=findFree();a={...model,id:p.id,name:p.name||'Bezoeker',signature,x:point.x,y:point.y,phase:i*2.3,angle:i};actors.set(p.id,a);group.add(a.root)}if(!free(a.x,a.y))Object.assign(a,findFree(a.id))});
  flowers=(next.items||[]).filter(i=>/flowers|bush/.test(i.item_key));const h=next.items.find(i=>i.item_key==='house_main');chimney=h&&next.world.house?.chimney!=='none'?h:null;
  project=next.isOwner?constructionProgress(next):null;
  if(site){group.remove(site);disposeModel(site);site=null}sitePosition=null;
  if(project){for(let y=5;y<15&&!sitePosition;y+=.5)for(let x=4;x<16;x+=.5)if(placementResult({key:'knowledge_house',x,y},next.items).valid){sitePosition={x,y};break}
   if(sitePosition){const b=new Builder();b.box('#c8b38b',0,.035,0,1.9,.07,1.6);for(const x of [-.8,.8])for(const z of [-.65,.65])b.pole('#b38d56',x,.50,z,.04,1);for(const x of [-.8,.8])for(const y of [.35,.85])b.box('#c5a16c',x,y,0,.04,.045,1.4);
    for(let i=0;i<Math.ceil(project.ratio*8);i++)b.box(i%2?'#d5bb8c':'#e4cf9f',0,.1+i*.09,0,1.5,.075,1.18);
    site=b.end();site.position.set(sitePosition.x-9.5,.32,sitePosition.y-9.5);group.add(site)}
  }
 }
 function tick(time,dt,reduced=false,editing=false){if(!data)return;const t=time/1000;
  for(const a of actors.values()){
   const walk=!reduced&&!editing&&Math.sin(t*.31+a.phase)>.0;
   if(walk){const angle=a.angle+Math.sin(t*.22+a.phase)*.4,x=a.x+Math.sin(angle)*dt*.33,y=a.y+Math.cos(angle)*dt*.33;if(free(x,y)){a.x=x;a.y=y;a.root.rotation.y=angle}else a.angle+=1.5}
   a.root.position.set(a.x-9.5,.32+(reduced?0:Math.sin(t*2+a.phase)*.007),a.y-9.5);
   for(let i=0;i<2;i++){a.legs[i].rotation.x=walk?Math.sin(t*6+a.phase+i*Math.PI)*.32:0;a.arms[i].rotation.x=walk?-a.legs[i].rotation.x:0;a.arms[i].rotation.z=!walk&&!reduced&&i===1&&Math.sin(t*.25+a.phase)>.75?-2.1+Math.sin(t*7)*.2:0}
  }
  butterflies.forEach((b,i)=>{b.root.visible=!reduced&&flowers.length>0;if(!b.root.visible)return;const p=itemPosition(flowers[i%flowers.length]);b.root.position.set(p.x-9.5+Math.sin(t*.7+i)*.5,.7+Math.sin(t*1.5+i)*.15,p.y-9.5+Math.cos(t*.6+i)*.4);b.wings.forEach((w,j)=>w.rotation.z=Math.sin(t*16+i)*(j?1:-1))});
  smoke.visible=!!chimney&&!reduced;if(smoke.visible){const p=itemPosition(chimney),angle=-(chimney.rotation||0)*Math.PI/180,obj=new T.Object3D();for(let i=0;i<7;i++){const rise=(t*.3+i/7)%1;obj.position.set(p.x-9.5+.77*Math.cos(angle)-.5*Math.sin(angle)+rise*.3,.32+3.1+rise*1.3,p.y-9.5-.77*Math.sin(angle)-.5*Math.cos(angle));obj.scale.setScalar(.07+rise*.16);obj.updateMatrix();smoke.setMatrixAt(i,obj.matrix)}smoke.instanceMatrix.needsUpdate=true}
 }
 return {update,tick,people:()=>[...actors.values()].map(a=>({id:a.id,name:a.name,x:a.x,y:a.y})),project:()=>project&&sitePosition?{...project,...sitePosition}:null,dispose(){for(const a of actors.values())disposeModel(a.root);if(site)disposeModel(site);wingGeometry.dispose();smokeGeometry.dispose();smokeMaterial.dispose();smoke.dispose();scene.remove(group)}};
}
