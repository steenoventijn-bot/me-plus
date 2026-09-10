import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {sharedIslandData} from '../world/adventure.js';import {placementResult} from '../world/placement.js';import {adventureBoat,disposeModel,itemModel} from '../world/models.js';import {Box3} from 'three';
test('shared island grows only at earned milestones and all buildings fit on free land',()=>{
 for(const completed of [0,1,2,3,4,5]){const d=sharedIslandData({completed,members:[{id:'one'},{id:'two'}]});assert.equal(d.isOwner,false);assert.equal(d.owner.id,'one');assert.equal(d.visitors[0].id,'two');assert.equal(d.items.some(i=>i.item_key==='house_main'),completed>=3);assert.equal(d.items.some(i=>i.item_key==='flowers_pink'),completed>=1);assert.equal(d.items.some(i=>i.item_key==='beach_chair'),completed>=5);for(const it of d.items){const result=placementResult({id:it.id,key:it.item_key,x:it.pos_x,y:it.pos_y,rotation:0},d.items);assert.equal(result.valid,true,it.item_key+': '+result.reason)}}
});
test('boat and expedition lantern have finite geometry and a small draw-call budget',()=>{for(const m of [adventureBoat(),itemModel('expedition_lantern')]){const b=new Box3().setFromObject(m);assert.ok(Number.isFinite(b.min.x)&&Number.isFinite(b.max.y));assert.ok(m.children.length<15);disposeModel(m)}});
test('activity shortcuts open a growth activity and prefill the chosen suggestion',()=>{
 const source=fs.readFileSync('parts/v18-adventures.txt','utf8'),chunk=source.slice(source.indexOf('function w18Add'),source.indexOf('function w18BoatArt'));const input={value:'',focus(){},closest:()=>null},save={};let preset;
 const context={openEvent:(e,type)=>{preset=type},el:id=>id==='ev-title'?input:id==='save-event'?save:null};vm.createContext(context);vm.runInContext(chunk,context);context.w18Add('10 minuten wandelen');assert.equal(preset,'growth');assert.equal(input.value,'10 minuten wandelen');assert.equal(save.textContent,'Activiteit toevoegen');
});
