// World coordinates are the existing continuous pos_x / pos_y domain (0..19).
// All rendering and validation use these ground shapes, never screen-space boxes.
export const FEATURE_DEFAULTS = [{item_key:'house_main',pos_x:9.5,pos_y:6.6,rotation:0},{item_key:'pond_garden',pos_x:15.2,pos_y:10.7,rotation:0},{item_key:'dock_wood',pos_x:14.3,pos_y:15.9,rotation:0}];
export function coastRadius(a) { return 1 + .045*Math.sin(3*a+.7) + .028*Math.cos(5*a-1.2) + .018*Math.sin(9*a); }
export function landDistance(x,y) {
  const dx=(x-9.5)/8.7,dy=(y-9.5)/8.15;
  return Math.hypot(dx,dy)/coastRadius(Math.atan2(dy,dx));
}
export function footprint(key,rotation=0) {
  key = ({flowers_white:'flowers_pink',tropical_bush:'bush_round',pond_lily:'pond_small',fountain_gold:'fountain',fence_white:'fence_wood',bookshelf_small:'knowledge_stack',knowledge_library:'knowledge_house',social_house:'knowledge_house',training_house:'growth_zone',streak_house60:'knowledge_house',knowledge_stand:'growth_zone',trophy_bronze:'trophy_battle',trophy_silver:'trophy_battle',trophy_gold:'trophy_battle',trophy_champion:'trophy_battle',streak_palm7:'palm_tree',streak_beach14:'bench_wood',streak_lights30:'lamp_glow',streak_legend100:'trophy_battle',activity_garden:'social_flag',sign_meplus:'social_flag'})[key] || key;
  let [w,h] = ({house_main:[3.45,3.5],pond_garden:[3.5,2.8],beach_chair:[.76,.98],parasols:[.44,.44],pool_small:[2.7,2.1],stream_stones:[2.8,.95],waterfall_garden:[3.5,2.8],dock_wood:[1.5,2.6],tree_oak:[.62,.62],tree_streak7:[.7,.7],palm_tree:[.58,.58],flowers_pink:[.85,.62],bush_round:[.85,.78],bench_wood:[1.35,.55],lamp_glow:[.32,.32],pond_small:[1.9,1.45],campfire:[.95,.95],fountain:[1.4,1.4],knowledge_house:[2,1.7],growth_zone:[1.8,1.6],trophy_battle:[.65,.65],social_flag:[.32,.32],knowledge_stack:[.65,.5],golden_duck:[.65,.48],fence_wood:[1.3,.23],bridge_wood:[1.8,.9]})[key]||[.7,.7];
  if(/tree/.test(key)&&!['tree_oak','tree_streak7','palm_tree'].includes(key))w=h=.62;
  let ox=0,oy=key==='house_main'?.35:0;
  if(rotation===90||rotation===270)[w,h]=[h,w];
  if(rotation===90)[ox,oy]=[-oy,ox];else if(rotation===180)[ox,oy]=[-ox,-oy];else if(rotation===270)[ox,oy]=[oy,-ox];
  return {w,h,ox,oy};
}
export function itemPosition(item) {return {x:Number(item.pos_x??item.grid_x),y:Number(item.pos_y??item.grid_y)};}
export function overlaps(a,b) {return Math.abs(a.x-b.x)<(a.w+b.w)/2-.005 && Math.abs(a.y-b.y)<(a.h+b.h)/2-.005;}
export function validLand(x,y,shape,key='') {
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>19||y<0||y>19)return false;
  x+=shape.ox||0;y+=shape.oy||0;
  // Sample every footprint edge, so corners cannot straddle an inlet.
  for(let i=0;i<=4;i++)for(const [dx,dy] of [[(i/4-.5)*shape.w,-shape.h/2],[(i/4-.5)*shape.w,shape.h/2],[-shape.w/2,(i/4-.5)*shape.h],[shape.w/2,(i/4-.5)*shape.h]])if(landDistance(x+dx,y+dy)>(key==='dock_wood'?1.19:.94))return false;
  return true;
}
export function placementResult({key,x,y,rotation=0,id=null},items=[]) {
  const fp=footprint(key,rotation),shape={...fp,x:x+fp.ox,y:y+fp.oy};
  if(![0,90,180,270].includes(rotation)||!validLand(x,y,shape,key))return {valid:false,reason:'Plaats het hele object op het gras.'};
  if(items.some(it=>it.id!==id&&overlaps(shape,itemShape(it))))return {valid:false,reason:'Er staat al een object op deze plek.'};
  return {valid:true,reason:'Vrije plek'};
}

export function itemShape(it){const p=itemPosition(it),f=footprint(it.item_key,Number(it.rotation||0));return {...f,x:p.x+f.ox,y:p.y+f.oy}}
