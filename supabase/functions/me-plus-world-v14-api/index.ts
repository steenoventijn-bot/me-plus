import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.57.4'
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}})
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json; charset=utf-8'}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers})
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers})
 if(req.method!=='POST')return json({error:'Method not allowed'},405)
 let b:any;try{b=await req.json()}catch{return json({error:'Ongeldige aanvraag'},400)}
 if(typeof b.token!=='string'||b.token.length<24||b.token.length>512)return json({error:'Log opnieuw in.'},401)
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(b.token)))).map(x=>x.toString(16).padStart(2,'0')).join('')
 const {data:me,error:authError}=await db.from('me_profiles').select('id').eq('device_token_hash',hash).maybeSingle()
 if(authError||!me)return json({error:'Log opnieuw in.'},401)
 if(!['move','place'].includes(b.op)||typeof b.x!=='number'||typeof b.y!=='number'||!Number.isFinite(b.x)||!Number.isFinite(b.y)||![0,90,180,270].includes(b.rotation)||b.x<0||b.x>19||b.y<0||b.y>19)return json({error:'Ongeldige positie'},400)
 if(b.op==='move'&&(typeof b.itemId!=='string'||!/^[0-9a-f-]{36}$/i.test(b.itemId)))return json({error:'Ongeldig object'},400)
 if(b.op==='place'&&(typeof b.itemKey!=='string'||b.itemKey.length>80))return json({error:'Ongeldig item'},400)
 const {data:item,error}=await db.rpc('me_world_save_position',{p_user_id:me.id,p_item_id:b.op==='move'?b.itemId:null,p_item_key:b.op==='place'?b.itemKey:null,p_x:b.x,p_y:b.y,p_rotation:b.rotation})
 if(error){const safe=['Ongeldige positie','Wereld niet gevonden','Object niet gevonden','Onbekend object','Dit item zit niet in je voorraad.','Plaats het hele object op het gras.','Er staat al een object op deze plek.'];return json({error:safe.find(s=>error.message.includes(s))||'Opslaan mislukt. Probeer opnieuw.'},400)}
 const {data:inventory}=await db.from('me_world_inventory').select('item_key,quantity').eq('user_id',me.id)
 return json({item,inventory})
})
