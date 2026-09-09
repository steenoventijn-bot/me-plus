import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene,Box3,Color} from 'three';
import {avatarModel,createLife,constructionProgress} from '../world/life.js';
import {disposeModel} from '../world/models.js';
import {placementResult} from '../world/placement.js';
import {canSeePhoto} from '../supabase/functions/me-plus-api/photo-policy.ts';

test('own photos stay visible while friend photos require current friendship and both sharing choices',()=>{
 const privateAuthor={id:'author',share_tasks:false,share_proof:false};
 assert.equal(canSeePhoto('author',privateAuthor,[]),true);
 for(const tasks of [false,true])for(const proof of [false,true])for(const friends of [[],['author']]){
  assert.equal(canSeePhoto('viewer',{...privateAuthor,share_tasks:tasks,share_proof:proof},friends),tasks&&proof&&friends.length>0);
 }
 assert.equal(canSeePhoto('stranger',{id:'author',share_tasks:true,share_proof:true},['someone-else']),false);
});
test('construction preserves existing rewards and advances through the real knowledge milestones',()=>{
 assert.equal(constructionProgress({stats:{knowledge:4}}).ratio,.4);
 assert.equal(constructionProgress({stats:{knowledge:10}}).key,'knowledge_stand');
 assert.equal(constructionProgress({stats:{knowledge:25}}).key,'knowledge_library');
 assert.equal(constructionProgress({stats:{knowledge:100}}),null);
 assert.equal(constructionProgress({stats:{knowledge:2},unlocks:[{item_key:'knowledge_house'}]}).key,'knowledge_stand');
});
test('3D avatars preserve saved hair colours and fit their walking body',()=>{
 for(const [hairColor,color] of Object.entries({black:'#231f20',darkbrown:'#3a2923',darkblonde:'#a88752',grey:'#87898e',white:'#e8e7e2',green:'#477d60'})){
  const {root,arms,legs}=avatarModel({avatarConfig:{hairColor,hair:'curl',tone:'deep',outfit:'hoodie',head:'none'}}),wanted=new Color(color);
  let found=false;root.traverse(o=>{const colours=o.geometry?.attributes.color?.array;if(colours)for(let i=0;i<colours.length;i+=3)if(Math.abs(colours[i]-wanted.r)<1e-6&&Math.abs(colours[i+1]-wanted.g)<1e-6&&Math.abs(colours[i+2]-wanted.b)<1e-6)found=true});
  assert.equal(found,true,hairColor);assert.equal(arms.length,2);assert.equal(legs.length,2);assert.ok(new Box3().setFromObject(root).max.y<1.7);disposeModel(root);
 }
});
test('living characters stay on free land and stop moving with reduced motion',()=>{
 const scene=new Scene(),life=createLife(scene),items=[{id:'house',item_key:'house_main',pos_x:9.5,pos_y:6.6,rotation:0}];
 life.update({owner:{id:'own',name:'Test',avatarConfig:{}},world:{house:{chimney:'none'}},isOwner:true,items,stats:{knowledge:0},unlocks:[]});
 for(let i=0;i<900;i++){life.tick(i*100,.1,false);const p=life.people()[0];assert.equal(placementResult({key:'lamp_glow',x:p.x,y:p.y},items).valid,true)}
 const before=life.people()[0];life.tick(100000,1,true);assert.deepEqual(life.people()[0],before);life.dispose();assert.equal(scene.children.length,0);
});
