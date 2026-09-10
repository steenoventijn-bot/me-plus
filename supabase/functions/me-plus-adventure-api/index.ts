import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.57.4'
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}})
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json; charset=utf-8'}
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers})
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});if(req.method!=='POST')return json({error:'Method not allowed'},405);
 try{
  const b=await req.json();if(typeof b.token!=='string'||b.token.length<24||b.token.length>512)return json({error:'Log opnieuw in.'},401);
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(b.token)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const {data:me}=await db.from('me_profiles').select('id').eq('device_token_hash',hash).maybeSingle();if(!me)return json({error:'Log opnieuw in.'},401);
  if(!['hub','create','accept','decline','detail'].includes(b.op))return json({error:'Onbekende actie.'},400);
  for(const k of ['teamId','userId'])if(b[k]!=null&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b[k]))return json({error:'Ongeldige uitnodiging.'},400);
  const {data,error}=await db.rpc('me_adventure_action',{p_user:me.id,p_op:b.op,p_team:b.teamId||null,p_other:b.userId||null,p_kind:b.kind||'together'});
  if(error)return json({error:error.code==='P0001'?error.message:'De expeditie kon niet worden bijgewerkt.'},400);
  return json(data);
 }catch{return json({error:'De expeditie kon niet worden geladen. Probeer opnieuw.'},500)}
})
