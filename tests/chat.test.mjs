import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function chat(){
 const source=fs.readFileSync('parts/v10-social-2.txt','utf8');
 let page,poll,handler=async()=>({friend:{name:'Friend'},messages:[]}),viewportListeners=new Set();
 const doc={activeElement:null,hidden:false,body:{appendChild(p){page=p;p.isConnected=true},classList:{add(){},remove(){}}},getElementById:()=>page?.isConnected?page:null,createElement(){
  const elements=new Map();
  return {isConnected:false,style:{},set innerHTML(value){elements.clear();doc.activeElement=null},querySelector(key){if(!elements.has(key))elements.set(key,{value:'',style:{},scrollHeight:500,scrollTop:0,clientHeight:200,selectionStart:0,selectionEnd:0,addEventListener(event,fn){this['on'+event]=fn},focus(){doc.activeElement=this}});return elements.get(key)},querySelectorAll:()=>[],remove(){this.isConnected=false}};
 }};
 const context={document:doc,window:{visualViewport:{height:600,offsetTop:0,scale:1,addEventListener(e,f){viewportListeners.add(f)},removeEventListener(e,f){viewportListeners.delete(f)}}},server:{v10:{},profile:{id:'me'}},api10:(...args)=>handler(...args),v10ChatTimer:null,v10ReplyTo:null,v10HoldTimer:null,clearInterval(){},setInterval(fn){poll=fn;return 1},clearTimeout(){},setTimeout(){},v10Avatar:()=>'',esc:x=>x,v10MessageHtml:m=>m.id+':'+m.body,toast(){},v10MessageActions(){},v10OpenFriendProfile(){},v10OpenBattleSetup(){},v10OpenBattle(){}};
 vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('let v142ChatOpen='),source.indexOf('function v10MessageActions'))+'\n'+source.slice(source.indexOf('function v10CloseChat'),source.indexOf('\n\nfunction profileView')),context);
 return {context,doc,open:()=>context.v10OpenChat('friend','Friend'),close:()=>context.v10CloseChat(),api:fn=>handler=fn,poll:()=>poll(),input:()=>page.querySelector('#v10-chat-text'),send:()=>page.querySelector('#v10-chat-send'),page:()=>page,listeners:()=>viewportListeners.size};
}
test('incoming messages preserve the same focused composer, draft, cursor and reading position',async()=>{
 const c=chat();await c.open();const input=c.input(),stream=c.page().querySelector('#v10-chat-stream');input.value='Nog aan het typen';input.selectionStart=4;input.focus();stream.scrollTop=20;
 c.api(async()=>({friend:{name:'Friend'},messages:[{id:'new',body:'Hallo'}]}));await c.poll();
 assert.equal(c.input(),input);assert.equal(c.doc.activeElement,input);assert.equal(input.value,'Nog aan het typen');assert.equal(input.selectionStart,4);assert.equal(stream.scrollTop,20);
 c.close();assert.equal(c.listeners(),0);
});
test('send is single-flight and preserves text typed while waiting; stale polls cannot erase the sent message',async()=>{
 const c=chat();await c.open();let finishPoll,finishSend,sends=0;
 c.api((op)=>op==='messages_v10'?new Promise(r=>finishPoll=r):(sends++,new Promise(r=>finishSend=r)));
 const polling=c.poll();c.input().value='Eerste bericht';const send=c.send().onclick();await c.send().onclick();assert.equal(sends,1);
 c.input().value='Volgende bericht';finishSend({message:{id:'sent',body:'Eerste bericht'}});await send;
 finishPoll({friend:{},messages:[]});await polling;
 assert.equal(c.input().value,'Volgende bericht');assert.equal(c.context.server.v10.chatMessages[0].id,'sent');assert.equal(c.send().disabled,false);
});
test('failed sends retain the draft and late responses do not alter a closed conversation',async()=>{
 const c=chat();await c.open();c.input().value='Bewaar mij';c.api(async()=>{throw Error('offline')});await c.send().onclick();assert.equal(c.input().value,'Bewaar mij');assert.equal(c.send().disabled,false);
 let finish;c.api(()=>new Promise(r=>finish=r));const poll=c.poll();c.close();finish({friend:{},messages:[{id:'late'}]});await poll;assert.equal(c.context.server.v10.chatMessages.length,0);
});
