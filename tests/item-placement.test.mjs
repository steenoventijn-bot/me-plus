import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

test('item preview requires confirmation, rejects water, cancels safely and sends only one save',async()=>{
 const events=new Map();let frame;
 const canvas={className:'',classList:{add(){},remove(){}},dataset:{},isConnected:true,clientWidth:600,clientHeight:800,setAttribute(){},setPointerCapture(){},remove(){},addEventListener(name,fn){events.set(name,fn)},getBoundingClientRect(){return {left:0,top:0,width:600,height:800}}};
 globalThis.__itemTestRenderer=class{constructor(){this.domElement=canvas;this.shadowMap={};this.info={render:{}}}setPixelRatio(){}getPixelRatio(){return 1}setSize(){}render(scene,camera){scene.updateMatrixWorld();camera.updateMatrixWorld()}dispose(){}};
 globalThis.devicePixelRatio=1;globalThis.requestAnimationFrame=fn=>{frame=fn;return 1};globalThis.cancelAnimationFrame=()=>{};
 globalThis.document={hidden:false,addEventListener(){},createElement(){return {getContext(){return {createLinearGradient(){return {addColorStop(){}}},fillRect(){}}}}}};
 globalThis.ResizeObserver=class{observe(){}disconnect(){}};globalThis.matchMedia=()=>({matches:false});
 let source=fs.readFileSync('world/renderer.js','utf8');
 source=source.replace("import * as T from 'three';",`import * as RealThree from '${import.meta.resolve('three')}';const T={...RealThree,WebGLRenderer:globalThis.__itemTestRenderer};`);
 for(const name of ['models','placement','life','adventure'])source=source.replace(`'./${name}.js'`,`'${pathToFileURL(process.cwd()+'/world/'+name+'.js')}'`);
 const {createWorld}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 let saves=0,release;
 const host={appendChild(){},getBoundingClientRect:canvas.getBoundingClientRect};
 const world=createWorld(host,{onDrop:()=>{saves++;return new Promise(resolve=>release=resolve)}});
 for(const event of ['contextmenu','selectstart','dragstart']){let prevented=false;events.get(event)({preventDefault(){prevented=true}});assert.equal(prevented,true,event)}
 world.update({owner:{id:'own'},isOwner:true,world:{house:{}},items:[]});world.setEdit(true);frame(100);
 const tap=(x,y)=>{const p=world.project(x,y,.32),e={button:0,pointerId:1,clientX:p.x,clientY:p.y,preventDefault(){}};events.get('pointerdown')(e);events.get('pointerup')(e)};
 assert.equal(world.beginPlacement('bench_wood'),true);assert.equal(saves,0);
 tap(0,0);assert.equal(await world.commitPlacement(),false);assert.equal(saves,0);
 tap(9.5,10);assert.equal(saves,0);
 const pending=world.commitPlacement();assert.equal(saves,1);assert.equal(await world.commitPlacement(),false);
 release(true);assert.equal(await pending,true);assert.equal(await world.commitPlacement(),false);
 world.beginPlacement('tree_oak');world.cancelPlacement();assert.equal(await world.commitPlacement(),false);assert.equal(saves,1);
 world.dispose();
});
