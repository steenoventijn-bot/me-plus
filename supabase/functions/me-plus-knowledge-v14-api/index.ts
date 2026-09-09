import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.57.4'
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}})
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json; charset=utf-8'}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers})
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers})
 if(req.method!=='POST')return json({error:'Method not allowed'},405)
 let b:any;try{b=await req.json()}catch{return json({error:'Ongeldige aanvraag'},400)}
 if(typeof b.token!=='string'||b.token.length<24||b.token.length>512)return json({error:'Log opnieuw in.'},401)
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(b.token)))).map(x=>x.toString(16).padStart(2,'0')).join('')
 const {data:me,error:authError}=await db.from('me_profiles').select('id').eq('device_token_hash',hash).maybeSingle()
 if(authError||!me)return json({error:'Log opnieuw in.'},401)
 try{
  if(b.op==='start'){
   if(!uuid(b.articleId))return json({error:'Artikel niet gevonden'},404)
   const {data:seconds,error}=await db.rpc('me_article_seconds',{p_article:b.articleId});if(error)throw error;if(!seconds)return json({error:'Artikel niet gevonden'},404)
   const {data:existing}=await db.from('me_read_sessions').select('id,min_seconds,active_seconds').eq('user_id',me.id).eq('article_id',b.articleId).is('completed_at',null).gte('created_at',new Date(Date.now()-86400000).toISOString()).order('created_at',{ascending:false}).limit(1).maybeSingle()
   let session=existing
   if(!session){const {data,error}=await db.from('me_read_sessions').insert({user_id:me.id,article_id:b.articleId,min_seconds:seconds}).select('id,min_seconds,active_seconds').single();if(error)throw error;session=data}
   const {data:attempt}=await db.from('me_knowledge_quiz_attempts').select('correct,awarded').eq('user_id',me.id).eq('article_id',b.articleId).maybeSingle()
   return json({sessionId:session!.id,minSeconds:session!.min_seconds,activeSeconds:session!.active_seconds,attempt})
  }
  if(!uuid(b.sessionId))return json({error:'Leessessie niet gevonden'},404)
  if(b.op==='tick'){const {data,error}=await db.rpc('me_read_tick_atomic',{p_user_id:me.id,p_session_id:b.sessionId});if(error)throw error;return json(data)}
  if(b.op==='question'){
   const {data:s}=await db.from('me_read_sessions').select('article_id,min_seconds,active_seconds').eq('id',b.sessionId).eq('user_id',me.id).maybeSingle()
   if(!s)return json({error:'Leessessie niet gevonden'},404)
   if(s.active_seconds<s.min_seconds)return json({error:'Lees de tekst eerst uit.'},409)
   const {data:q,error}=await db.from('me_knowledge_questions').select('question,options').eq('article_id',s.article_id).maybeSingle();if(error)throw error
   if(!q)return json({error:'Deze tekst heeft nog geen quizvraag.'},404)
   return json(q)
  }
  if(b.op==='answer'){
   if(!Number.isInteger(b.choice)||b.choice<0||b.choice>3)return json({error:'Kies één antwoord.'},400)
   const date=typeof b.localDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(b.localDate)?b.localDate:null
   const {data,error}=await db.rpc('me_answer_knowledge',{p_user_id:me.id,p_session_id:b.sessionId,p_choice:b.choice,p_local_date:date});if(error)throw error
   return json(data)
  }
  return json({error:'Onbekende actie'},400)
 }catch(e:any){console.error('knowledge',e.code||'');const safe=['Leessessie niet gevonden','Lees de tekst eerst uit.','Kies één antwoord.','Deze tekst heeft nog geen quizvraag.'];return json({error:safe.find(s=>String(e.message).includes(s))||'Opslaan mislukt. Probeer opnieuw.'},400)}
})
