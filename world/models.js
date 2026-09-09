import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const palette=new Map(),batchPalette=new Map();
export function material(color,roughness=.8,metalness=0,emissive=0) {
  const key=[color,roughness,metalness,emissive].join(':');
  if(!palette.has(key))palette.set(key,new T.MeshStandardMaterial({color,roughness,metalness,emissive,emissiveIntensity:emissive?.45:0}));
  return palette.get(key);
}
export function random(seed=1){return()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return (seed>>>0)/4294967296;};}
const cube=new T.BoxGeometry(1,1,1),sphere=new T.IcosahedronGeometry(1,1),round=new T.SphereGeometry(1,12,8),cylinder=new T.CylinderGeometry(1,1,1,10);
class Builder {
  constructor(){this.parts=new Map()}
  add(geo,mat,x=0,y=0,z=0,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0){
    const m=new T.Matrix4().compose(new T.Vector3(x,y,z),new T.Quaternion().setFromEuler(new T.Euler(rx,ry,rz)),new T.Vector3(sx,sy,sz));
    const g=(geo.index?geo.toNonIndexed():geo.clone()).applyMatrix4(m);if(!this.parts.has(mat))this.parts.set(mat,[]);this.parts.get(mat).push(g);
  }
  box(c,x,y,z,w,h,d,rx=0,ry=0,rz=0){this.add(cube,typeof c==='object'?c:material(c),x,y,z,w,h,d,rx,ry,rz)}
  ball(c,x,y,z,w,h=w,d=w,smooth=false){this.add(smooth?round:sphere,typeof c==='object'?c:material(c),x,y,z,w,h,d)}
  pole(c,x,y,z,r,h,rx=0,ry=0,rz=0){this.add(cylinder,typeof c==='object'?c:material(c),x,y,z,r,h,r,rx,ry,rz)}
  end(){
    const batches=new Map();
    for(const [mat,parts] of this.parts){
      const key=[mat.roughness,mat.metalness,mat.emissive.getHex(),mat.emissiveIntensity].join(':');
      if(!batchPalette.has(key))batchPalette.set(key,new T.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:mat.roughness,metalness:mat.metalness,emissive:mat.emissive,emissiveIntensity:mat.emissiveIntensity}));
      if(!batches.has(key))batches.set(key,[]);
      for(const g of parts){
        const count=g.attributes.position.count,colors=g.attributes.color?.array.slice()||new Float32Array(count*3);
        if(!g.attributes.color)for(let i=0;i<count;i++){colors[i*3]=mat.color.r;colors[i*3+1]=mat.color.g;colors[i*3+2]=mat.color.b;}
        g.setAttribute('color',new T.BufferAttribute(colors,3));batches.get(key).push(g);
      }
    }
    const group=new T.Group();
    for(const[key,parts]of batches){const geo=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());if(!geo)throw new Error('Incompatible model geometry');const mesh=new T.Mesh(geo,batchPalette.get(key));mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh)}
    return group;
  }
}
function flowers(b,x,z,seed=1,scale=1,y=0){
 const rng=random(seed);const colors=['#fff4ce','#ffe9f1','#f279ab','#ffd955'];
 for(let i=0;i<14;i++){const a=rng()*Math.PI*2,r=Math.sqrt(rng())*.43*scale,xx=x+Math.cos(a)*r,zz=z+Math.sin(a)*r,h=(.15+rng()*.19)*scale;
 b.pole('#477928',xx,y+h/2,zz,.013*scale,h);b.ball('#629e34',xx+.04*scale,y+h*.45,zz,.09*scale,.024*scale,.05*scale);
 for(let j=0;j<5;j++){const q=j*Math.PI*2/5;b.ball(colors[i%4],xx+Math.cos(q)*.045*scale,y+h,zz+Math.sin(q)*.045*scale,.039*scale,.022*scale,.039*scale)}b.ball('#f2bd26',xx,y+h+.016*scale,zz,.025*scale,.02*scale,.025*scale);
 }
}
function bush(b,x,y,z,s=1,seed=5){const rng=random(seed),cs=['#398530','#54a02e','#72b83b','#a4cf42'];for(let i=0;i<28;i++){const a=rng()*6.283,r=Math.sqrt(rng())*.35*s;b.ball(cs[i%4],x+Math.cos(a)*r,y+rng()*.22*s,z+Math.sin(a)*r,.14*s,.11*s,.12*s)}}
function windowPane(b,x,y,z,h,side=false){
 const frames=({white:'#fff4da',wood:'#995e32',dark:'#30444a'})[h.frames]||'#fff4da',w=h.windows==='wide'?.78:.53,wh=h.windows==='modern'?.82:.63;
 const g=new Builder(),glow=material('#ffcb6c',.2,.05,'#e39426');
 if(h.windows==='round'){g.add(new T.CylinderGeometry(.34,.34,.1,24),material(frames),0,0,0,1,1,1,Math.PI/2);g.add(new T.CylinderGeometry(.26,.26,.12,24),glow,0,0,.01,1,1,1,Math.PI/2)}
 else {g.box(frames,0,0,0,w+.12,wh+.12,.13);g.box(glow,0,0,.08,w,wh,.06)}
 g.box(frames,0,0,.13,.045,wh,.045);g.box(frames,0,0,.14,w,.045,.045);g.box('#f8edcf',0,-wh/2-.1,.05,w+.23,.12,.25);
 const group=g.end();group.position.set(x,y,z);if(side)group.rotation.y=Math.PI/2;group.updateMatrixWorld(true);
 group.children.forEach(mesh=>{b.add(mesh.geometry,mesh.material,0,0,0);const arr=b.parts.get(mesh.material);arr[arr.length-1].applyMatrix4(mesh.matrixWorld);mesh.geometry.dispose()});
}
export const houseDefaults={style:'cottage',roofShape:'gable',roof:'blue',walls:'wood',door:'oak',windows:'classic',frames:'white',chimney:'brick',fence:'wood',decor:'flowers',level:1};
export function houseModel(raw={}) {
 const h={...houseDefaults,...raw},b=new Builder(),roof=({blue:'#2772c6',red:'#b84933',green:'#477f4d',purple:'#7764a0',gold:'#c49333'})[h.roof],wall=({wood:'#f5e3ba',stone:'#c7ccc3',modern:'#e7eee9',colorful:'#eec3c0'})[h.walls],trim=h.style==='coastal'?'#fdf4dc':'#b78352',w=h.style==='modern'?2.95:2.75,d=h.style==='coastal'?2.25:2.4,top=2.05;
 b.box('#bfac8d',0,.12,0,w+.17,.24,d+.16);b.box(wall,0,1.1,0,w,1.96,d);
 // Real façade panels, corner posts and stone foundation.
 for(let row=0;row<9;row++)b.box(h.walls==='stone'?'#b1b9af':'#e4cca2',0,.28+row*.195,d/2+.009,w,.019,.025);
 for(const x of [-w/2,w/2])for(const z of [-d/2,d/2])b.box(trim,x,1.08,z,.13,1.98,.13);
 b.box('#fff0cf',0,top+.02,0,w+.2,.18,d+.19);
 const rise=h.roofShape==='soft'?1.12:h.roofShape==='hip'?.97:1.4;
 if(h.roofShape!=='hip'){
  const triangle=new T.Shape().moveTo(-w/2,0).lineTo(w/2,0).lineTo(0,rise).closePath();
  const geo=new T.ExtrudeGeometry(triangle,{depth:d,bevelEnabled:false});b.add(geo,material(wall),0,top,-d/2);geo.dispose();
 }
 // Shingles form the roof, including an overlapping eave and rounded ridge.
 const rng=random(71),roofmat=[0,.035,-.04,.065].map(v=>material(new T.Color(roof).offsetHSL(0,0,v).getHex(),.67));
 if(h.roofShape==='hip'){
  const geo=new T.CylinderGeometry(.15,2.27,rise,4,1,false,Math.PI/4);b.add(geo,material(roof),0,top+rise/2,0,1,1,.9);geo.dispose();
  for(let r=0;r<5;r++){const f=1-r/5;b.box(roofmat[r%4],0,top+r*rise/5,0,3.25*f,.045,2.94*f)}
 }else{
  const half=w/2+.27,rows=7,cols=11;
  for(const sign of [-1,1])for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){
   const f=(i+.5)/rows,x=sign*f*half,y=top+rise*(1-f)+(h.roofShape==='soft'?-.18*Math.sin(f*Math.PI):0),angle=sign*Math.atan2(rise,half);
   b.box(roofmat[Math.floor(rng()*4)],x,y,-d/2-.22+(j+.5)*(d+.44)/cols,Math.hypot(half,rise)/rows+.045,.08,(d+.44)/cols+.018,0,0,-angle);
  }
  b.pole(roofmat[0],0,top+rise+.025,0,.11,d+.5,Math.PI/2);
  for(const z of [-d/2-.25,d/2+.25])for(const sign of [-1,1])b.box('#e6cb91',sign*half/2,top+rise/2-.10,z,Math.hypot(half,rise)+.1,.115,.13,0,0,-sign*Math.atan2(rise,half));
 }
 const door=({oak:'#9b612f',blue:'#356da0',round:'#905329',modern:'#344b52'})[h.door];
 b.box('#fdf0d0',0,.78,d/2+.07,.81,1.55,.17);
 if(h.door==='round'){
  const sh=new T.Shape().moveTo(-.33,0).lineTo(.33,0).lineTo(.33,.93).absarc(0,.93,.33,0,Math.PI,false).lineTo(-.33,0);const g=new T.ExtrudeGeometry(sh,{depth:.09,bevelEnabled:false});b.add(g,material(door),0,.1,d/2+.18);g.dispose();
 }else b.box(door,0,.76,d/2+.17,.65,1.37,.13);
 for(let i=0;i<4;i++)b.box('#714825',-.24+i*.16,.71,d/2+.24,.014,1.17,.018);
 b.ball(material('#dcae40',.32,.65),.22,.75,d/2+.28,.055);
 b.ball('#417996',0,1.21,d/2+.27,.12,.13,.025,true);
 windowPane(b,-.91,1.24,d/2+.05,h);windowPane(b,.91,1.24,d/2+.05,h);windowPane(b,w/2+.02,1.2,.3,h,true);
 if(h.roofShape!=='hip')windowPane(b,0,top+.5,d/2+.01,{...h,windows:'round'});
 for(let step=0;step<3;step++)b.box('#ddc69a',0,.07+step*.063,d/2+.7-step*.19,1.08,.13,.3);
 if(h.chimney!=='none'){
  const col=h.chimney==='brick'?'#ad6849':'#e7e1cd';b.box(col,.77,top+1.08,-.5,.42,1.43,.48);
  for(let y=0;y<7;y++)b.box('#d9bea0',.77,top+.45+y*.18,-.5,.44,.022,.5);
  b.box('#e9d1aa',.77,top+1.82,-.5,.58,.14,.63);b.box('#4d463d',.77,top+1.9,-.5,.32,.025,.35);
 }
 if(h.fence!=='none'){
  const c=h.fence==='white'?'#f4ecd5':'#b17b44';for(const side of [-1,1]){for(let i=0;i<3;i++)b.pole(c,side*1.54,.4,.1+i*.53,.055,.8);for(let y of [.24,.53])b.box(c,side*1.54,y,.61,.06,.08,1.23)}
 }
 if(h.decor==='flowers')for(const x of [-.96,.96]){b.box('#9c663c',x,.7,d/2+.27,.64,.16,.32);flowers(b,x,d/2+.27,Math.round((x+2)*10),.58,.77)}
 else if(h.decor==='hedge')for(const x of [-.97,.97])bush(b,x,.23,d/2+.28,1.1);
 if(h.style==='coastal'){for(const x of [-1.25,1.25])b.pole('#f4ecd8',x,.76,d/2+.28,.04,1.45)}
 if(h.style==='modern')b.box('#5b716e',w/2+.04,1,-.66,.15,1.8,.5);
 return b.end();
}
function tree(b,palm=false,special=false){
 const rng=random(special?27:14);b.pole('#80502b',0,1,0,.16,2);
 b.pole('#ac703d',-.1,.65,.02,.07,1.3,0,0,-.17);
 for(let i=0;i<4;i++){const a=i*1.57;b.pole('#84502b',Math.sin(a)*.19,1.65,Math.cos(a)*.19,.07,.9,Math.cos(a)*.65,0,Math.sin(a)*.65)}
 if(palm){for(let i=0;i<9;i++){const a=i*6.283/9;for(let j=0;j<5;j++){const d=(j+.5)*.25;b.ball(j%2?'#609d38':'#397c39',Math.sin(a)*d,2.25+.3*Math.sin(j*.7)-j*.055,Math.cos(a)*d,.27,.07,.22)}}return}
 const cs=special?['#38874c','#52a04e','#8ec851','#b9d26b']:['#357f2e','#569d2c','#79b62f','#add447'];
 for(let i=0;i<140;i++){const a=rng()*6.283,z=rng()*2-1,r=Math.sqrt(1-z*z),rad=Math.cbrt(rng());const x=r*Math.cos(a)*1.1*rad,y=2.24+z*.94*rad,zz=r*Math.sin(a)*1.03*rad;
  b.ball(cs[Math.min(3,Math.max(0,Math.floor((y-1.4)*1.7+rng())))],x,y,zz,.24+rng()*.11,.16+rng()*.06,.2+rng()*.1);
 }
 for(let i=0;i<6;i++){const a=i*1.05;b.pole('#80502b',Math.sin(a)*.14,.08,Math.cos(a)*.14,.07,.42,Math.cos(a)*.9,0,Math.sin(a)*.9)}
}
function pond(b,large){
 const rx=large?1.5:.89,rz=large?1.2:.66,rng=random(91);
 b.add(new T.CylinderGeometry(1,1,.03,48),material('#159cc2',.18,.3,'#073c51'),0,.025,0,rx,1,rz);
 for(let i=0;i<24;i++){const a=i*6.283/24;b.ball(['#c4bb9f','#d4c9ac','#abb7af'][i%3],Math.cos(a)*rx,.14,Math.sin(a)*rz,.20+rng()*.06,.20,.16)}
 for(let i=0;i<3;i++){const x=(i-1)*rx*.5,z=(i%2-.5)*rz*.8;b.add(new T.CylinderGeometry(.23,.23,.025,20,1,false,.2,5.8),material('#80b634'),x,.065,z);for(let j=0;j<6;j++){const a=j*6.283/6;b.ball('#f5a9cd',x+Math.cos(a)*.08,.11,z+Math.sin(a)*.08,.07,.025,.06)}b.ball('#ffdc6c',x,.12,z,.035)}
}
export function itemModel(key,house={}){
 if(key==='house_main')return houseModel(house);
 const originalKey=key;
 key=({flowers_white:'flowers_pink',tropical_bush:'bush_round',pond_lily:'pond_small',fountain_gold:'fountain',fence_white:'fence_wood',bookshelf_small:'knowledge_stack',knowledge_library:'knowledge_house',social_house:'knowledge_house',training_house:'growth_zone',streak_house60:'knowledge_house',knowledge_stand:'growth_zone',trophy_bronze:'trophy_battle',trophy_silver:'trophy_battle',trophy_gold:'trophy_battle',trophy_champion:'trophy_battle',streak_palm7:'palm_tree',streak_beach14:'bench_wood',streak_lights30:'lamp_glow',streak_legend100:'trophy_battle',activity_garden:'social_flag',sign_meplus:'social_flag'})[key]||key;
 const b=new Builder();
 if(/tree/.test(key))tree(b,key==='palm_tree',key.includes('streak'));
 else if(key==='pond_garden'||key==='pond_small')pond(b,key==='pond_garden');
 else if(key==='dock_wood'||key.includes('bridge')){
  const long=key==='dock_wood'?2.6:1.7;for(let i=0;i<12;i++)b.box(i%3?'#b67a43':'#d39555',0,.13,-long/2+(i+.5)*long/12,1.42,.14,long/12-.016);
  for(const x of [-.63,.63])for(const z of [-long/2+.16,long/2-.16]){b.pole('#8c5c36',x,-.22,z,.09,1.3);b.pole('#e0c68e',x,.47,z,.115,.1)}
  for(const x of [-.54,.54])b.box('#825532',x,-.02,0,.12,.22,long);
 }
 else if(key==='beach_chair'){
  for(const x of [-.33,.33]){b.pole('#d1ae79',x,.36,0,.026,.85,0,0,.24);b.pole('#bd9b69',x,.36,0,.026,.85,0,0,-.24)}
  b.box('#f0e8cb',0,.46,.13,.7,.045,.65);b.box('#faf3de',0,.81,-.26,.7,.72,.055,-.28);for(const x of [-.22,0,.22])b.box('#6aa8a0',x,.81,-.22,.10,.72,.018,-.28);
 }
 else if(key==='parasols'){
  b.pole('#c7a67a',0,.85,0,.027,1.7);b.pole('#d5c399',0,.05,0,.22,.1);
  const g=new T.ConeGeometry(.65,.38,12);b.add(g,material('#efe3be'),0,1.85,0);g.dispose();
  for(let i=0;i<6;i++){const a=i*Math.PI/3;b.pole('#91b8a0',Math.sin(a)*.27,1.86,Math.cos(a)*.27,.018,.7,Math.cos(a)*1.05,0,Math.sin(a)*1.05)}
  b.ball('#ae8b5a',0,2.1,0,.04);
 }
 else if(key==='pool_small'){
  b.box('#d9d4bc',0,.08,0,2.7,.16,2.1);b.box(material('#389ec3',.15,.25),0,.17,0,2.35,.04,1.76);
  for(const x of [-1.22,1.22])b.box('#f4ebd2',x,.20,0,.19,.15,2);for(const z of [-.92,.92])b.box('#f4ebd2',0,.20,z,2.7,.15,.18);
  for(const x of [-.33,.33])b.pole(material('#bfc9bf',.28,.6),x,.4,.68,.025,.5);for(const y of [.25,.4])b.box('#bfc9bf',0,y,.68,.68,.03,.04);
 }
 else if(key==='stream_stones'){
  b.box(material('#48b9c5',.2,.2),0,.025,0,2.6,.035,.5);
  for(let i=0;i<14;i++){const x=-1.25+i*.19;for(const z of [-.35,.35])b.ball('#c0bba6',x,.1,z+Math.sin(i)*.05,.12,.1,.12)}
 }
 else if(key==='waterfall_garden'){
  pond(b,true);for(let i=0;i<9;i++)b.ball(i%2?'#b5b7a6':'#cbcab4',Math.sin(i*1.7)*.5,.3+i*.09,-.55,.4,.28,.3);
  b.box(material('#9ae2dc',.16,.2,'#296d76'),0,.58,-.16,.43,.91,.045);b.ball('#d6f7e7',0,.15,-.10,.30,.04,.15);
 }
 else if(key==='flowers_pink')flowers(b,0,0,9);
 else if(key==='bush_round')bush(b,0,.22,0,1.12);
 else if(key==='bench_wood'){
  for(let i=0;i<4;i++)b.box('#cb8a47',0,.44,-.23+i*.13,1.3,.075,.105);
  for(let i=0;i<3;i++)b.box(i%2?'#b67338':'#d39a58',0,.65+i*.13,-.23,1.3,.1,.06,0,0,0);
  for(const x of [-.5,.5]){for(const z of [-.2,.2])b.pole('#293f3b',x,.22,z,.034,.43);b.pole('#263e39',x,.71,-.24,.03,.7);b.box('#283f3b',x,.66,.05,.045,.045,.5)}
 }
 else if(key==='lamp_glow'){
  b.pole('#30453e',0,.07,0,.14,.14);b.pole('#2c3d3c',0,.81,0,.04,1.55);b.pole('#3c5150',0,1.51,0,.11,.1);b.box(material('#ffe1a1',.2,.2,'#ffd474'),0,1.7,0,.23,.32,.23);
  for(const x of [-.14,.14])for(const z of [-.14,.14])b.pole('#253b3b',x,1.7,z,.018,.4);
  const geo=new T.ConeGeometry(.24,.2,4,1,false,Math.PI/4);b.add(geo,material('#233d3d'),0,1.97,0);geo.dispose();b.ball('#bda263',0,2.1,0,.04);
 }
 else if(originalKey==='knowledge_stand'){
  for(const x of [-.66,.66])b.pole('#987044',x,.75,0,.045,1.5);
  b.box('#c49459',0,.59,.12,1.55,.12,.74);b.box('#e4bf84',0,.3,.08,1.4,.54,.57);
  b.box('#5a9273',0,1.52,0,1.75,.09,1.10,-.13);
  for(const x of [-.55,-.18,.18,.55])b.box('#f3e6c7',x,1.53,.02,.16,.04,1.04,-.13);
  for(let i=0;i<6;i++){const x=-.52+i*.2;b.box(['#b97555','#558b8d','#b8a05e'][i%3],x,.79,.06,.13,.3+i%2*.04,.23,0,0,(i%2-.5)*.15);b.box('#f4ebce',x,.79,.19,.095,.25,.025)}
  b.box('#f5dfac',0,1.15,.07,.68,.30,.055);
  for(const x of [-.105,.105])b.box('#709584',x,1.16,.105,.17,.19,.018,0,0,x>0?-.10:.10);
 }
 else if(key==='knowledge_house'||key==='growth_zone'){const g=houseModel({...houseDefaults,style:originalKey==='social_house'?'cottage':key==='knowledge_house'?'coastal':'modern',roof:originalKey==='social_house'?'red':originalKey==='streak_house60'?'gold':key==='knowledge_house'?'purple':'green',decor:'hedge',chimney:'none'});g.scale.setScalar(.58);return g}
 else if(key==='fountain'){
  b.pole('#c8c4ac',0,.16,0,.7,.32);b.pole(material('#57b7cb',.2,.3),0,.33,0,.57,.04);b.pole('#ded6b9',0,.6,0,.15,.6);b.add(new T.ConeGeometry(.37,.16,24),material('#ede2c4'),0,.89,0);b.ball(material('#a3e3e7',.16,.2),0,1.02,0,.12,.2,.12);
 }
 else if(key==='campfire'){
  for(let i=0;i<8;i++){const a=i*.785;b.ball('#b6aaa1',Math.sin(a)*.4,.12,Math.cos(a)*.4,.14,.11,.12)}for(const s of [-1,1])b.pole('#815238',0,.15,0,.095,.73,Math.PI/2,s*.7);
  b.add(new T.ConeGeometry(.19,.63,7),material('#ffad47',.5,0,'#f88425'),0,.46,0);b.ball(material('#ffd17b',.4,0,'#ffc95d'),0,.28,0,.12,.2,.12);
 }
 else if(key==='trophy_battle'){
  const gold=material('#dfb245',.3,.65);b.box('#655940',0,.12,0,.55,.24,.55);b.pole(gold,0,.42,0,.09,.38);b.add(new T.CylinderGeometry(.27,.1,.35,16),gold,0,.72,0);for(const s of [-1,1])b.add(new T.TorusGeometry(.16,.028,6,16),gold,s*.26,.73,0);b.ball(gold,0,.97,0,.055);
 }
 else if(key==='social_flag'){b.pole('#977453',0,.72,0,.035,1.45);b.box('#f49d60',.26,1.18,0,.51,.38,.026);b.pole('#b3aa89',0,.055,0,.16,.11)}
 else if(key==='knowledge_stack'){for(let i=0;i<4;i++){b.box(['#609999','#d4b055','#9b729d','#cd8461'][i],0,.08+i*.105,0,.61,.08,.43,0,i%2*.1);b.box('#f6eacf',0,.086+i*.105,.017,.55,.04,.41)}}
 else if(key==='golden_duck'){const gold=material('#e8b541',.32,.6);b.ball(gold,0,.25,0,.31,.23,.23,true);b.ball(gold,0,.49,.19,.15,.15,.15,true);b.ball('#e98e30',0,.47,.36,.11,.04,.1);for(const x of [-.085,.085])b.ball('#313b38',x,.54,.3,.019)}
 else if(key.includes('fence')){for(const x of [-.58,0,.58])b.pole('#bb8a53',x,.36,0,.045,.72);for(const y of [.23,.52])b.box('#ad763d',0,y,0,1.3,.085,.065)}
 else b.ball('#b5b9a5',0,.24,0,.36,.32,.32);
 return b.end();
}
export function disposeModel(group){group.traverse(o=>{if(o.geometry)o.geometry.dispose()})}
export function disposeMaterials(){for(const mat of palette.values())mat.dispose();palette.clear()}
export {Builder,flowers};
