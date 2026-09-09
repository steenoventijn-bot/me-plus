import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import { generateVapidKeys } from 'npm:@mmmike/web-push@0.1.0/vapid'

const url=Deno.env.get('SUPABASE_URL')!
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const db=createClient(url,serviceKey,{auth:{persistSession:false}})
const enc=new TextEncoder()
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json; charset=utf-8'}
function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:cors})}
function safeText(v:unknown,max=160){return typeof v==='string'?v.trim().slice(0,max):''}
function safeDate(v:unknown){const s=safeText(v,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:null}
async function hashText(value:string){const d=await crypto.subtle.digest('SHA-256',enc.encode(value));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function current(token:string){if(token.length<24)return null;const h=await hashText(token);const {data}=await db.from('me_profiles').select('*').eq('device_token_hash',h).maybeSingle();return data||null}
async function configValue(key:string){const {data,error}=await db.from('me_server_config').select('value').eq('key',key).maybeSingle();if(error)throw error;return data?.value||''}
async function ensurePushConfig(){let publicKey=await configValue('vapid_public'),privateKey=await configValue('vapid_private');if(!publicKey||!privateKey){const keys=await generateVapidKeys();await db.from('me_server_config').upsert([{key:'vapid_public',value:keys.publicKey,updated_at:new Date().toISOString()},{key:'vapid_private',value:keys.privateKey,updated_at:new Date().toISOString()}],{onConflict:'key',ignoreDuplicates:true});publicKey=await configValue('vapid_public')||keys.publicKey;privateKey=await configValue('vapid_private')||keys.privateKey}return {publicKey,privateKey}}
async function attentionCount(userId:string){const {count:requests}=await db.from('me_follows').select('*',{count:'exact',head:true}).eq('following_id',userId).eq('status','pending');const {count:messages}=await db.from('me_messages').select('*',{count:'exact',head:true}).eq('recipient_id',userId).is('read_at',null);const {count:reminders}=await db.from('me_notifications').select('*',{count:'exact',head:true}).eq('user_id',userId).eq('type','reminder').is('read_at',null);return (requests||0)+(messages||0)+(reminders||0)}
function rank(points:number){const names=['Starter','Beginner','Groeier','Professional','Baas','Elite','Expert','Meester','Legende','Topper','Me+ Legende'];const level=Math.min(11,Math.floor(Math.max(0,points)/10)+1);const next=level>=11?null:level*10;return {level,rank:names[level-1],next,remaining:next===null?0:Math.max(0,next-points)}}
async function recalcPoints(userId:string){const {data}=await db.from('me_point_events').select('points').eq('user_id',userId);const total=(data||[]).reduce((a:any,b:any)=>a+Number(b.points||0),0);await db.from('me_profiles').update({points:total,last_seen_at:new Date().toISOString()}).eq('id',userId);return total}
function articleSeconds(a:any){const text=[a.intro,a.body,a.extra_fact,a.why_it_matters].filter(Boolean).join(' ');const words=text.trim().split(/\s+/).filter(Boolean).length;return Math.max(30,Math.min(180,Math.ceil(words/3.35)))}
function streakFromDates(values:string[],today:string){const set=new Set(values.filter(Boolean));let d=new Date(today+'T12:00:00Z');let first=d.toISOString().slice(0,10);if(!set.has(first))d.setUTCDate(d.getUTCDate()-1);let count=0;for(let i=0;i<500;i++){const key=d.toISOString().slice(0,10);if(!set.has(key))break;count++;d.setUTCDate(d.getUTCDate()-1)}return count}

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
 if(req.method!=='POST')return json({error:'Method not allowed'},405)
 let body:any={};try{body=await req.json()}catch{return json({error:'Ongeldige aanvraag'},400)}
 const token=safeText(body.token,220),op=safeText(body.op,40)
 const me=await current(token);if(!me)return json({error:'Profiel niet gevonden'},401)
 try{
  if(op==='push_config'){const c=await ensurePushConfig();return json({publicKey:c.publicKey})}
  if(op==='push_status'){const {count}=await db.from('me_push_subscriptions').select('*',{count:'exact',head:true}).eq('user_id',me.id).eq('active',true);return json({enabled:!!me.notifications_enabled&&(count||0)>0,preference:!!me.notifications_enabled,attention:await attentionCount(me.id)})}
  if(op==='register_push'){const sub=body.subscription,endpoint=safeText(sub?.endpoint,4000),p256dh=safeText(sub?.keys?.p256dh,1000),auth=safeText(sub?.keys?.auth,1000);if(!endpoint||!p256dh||!auth)return json({error:'Push-abonnement is ongeldig.'},400);await ensurePushConfig();await db.from('me_push_subscriptions').update({active:false,updated_at:new Date().toISOString()}).eq('user_id',me.id);const {error}=await db.from('me_push_subscriptions').upsert({user_id:me.id,endpoint,p256dh,auth,active:true,updated_at:new Date().toISOString()},{onConflict:'endpoint'});if(error)throw error;await db.from('me_profiles').update({notifications_enabled:true}).eq('id',me.id);return json({ok:true,enabled:true,attention:await attentionCount(me.id)})}
  if(op==='disable_push'){await db.from('me_profiles').update({notifications_enabled:false}).eq('id',me.id);await db.from('me_push_subscriptions').update({active:false,updated_at:new Date().toISOString()}).eq('user_id',me.id);await db.from('me_reminders').update({enabled:false,processing_at:null,updated_at:new Date().toISOString()}).eq('user_id',me.id);await db.rpc('me_unschedule_user_reminders',{p_user:me.id});return json({ok:true,enabled:false})}
  if(op==='schedule_reminder'){
    if(!me.notifications_enabled)return json({ok:true,disabled:true})
    const eventKey=safeText(body.eventKey,160),title=safeText(body.title,160),kind=['appointment','growth'].includes(body.kind)?body.kind:'appointment',repeat=['none','daily','weekly','monthly'].includes(body.repeat)?body.repeat:'none',timezone=safeText(body.timezone,80)||'Europe/Amsterdam',scheduledAt=safeText(body.scheduledAt,80),leadMinutes=Math.max(0,Math.min(1440,Number(body.leadMinutes)||0)),when=new Date(scheduledAt)
    if(!eventKey||!title||!scheduledAt||Number.isNaN(when.getTime()))return json({error:'Melding kon niet worden gepland.'},400)
    if(when.getTime()<Date.now()-30000)return json({ok:true,skippedPast:true})
    const deliveryKey=await hashText(`${me.id}|${eventKey}|${when.toISOString()}`)
    const {data:delivered}=await db.from('me_reminder_deliveries').select('id,status').eq('delivery_key',deliveryKey).maybeSingle()
    if(delivered)return json({ok:true,alreadyDelivered:true,nextAt:when.toISOString()})
    const {data:rem,error}=await db.from('me_reminders').upsert({user_id:me.id,event_key:eventKey,title,kind,next_at:when.toISOString(),repeat,timezone,lead_minutes:leadMinutes,enabled:true,processing_at:null,updated_at:new Date().toISOString()},{onConflict:'user_id,event_key'}).select('id').single();if(error)throw error
    const {error:scheduleError}=await db.rpc('me_schedule_reminder_job',{p_id:rem.id});if(scheduleError)throw scheduleError
    return json({ok:true,nextAt:when.toISOString(),deliveryKey,reminderId:rem.id})
  }
  if(op==='cancel_reminder'){const eventKey=safeText(body.eventKey,160);if(eventKey){const {data:rows}=await db.from('me_reminders').update({enabled:false,processing_at:null,updated_at:new Date().toISOString()}).eq('user_id',me.id).eq('event_key',eventKey).select('id');for(const r of rows||[])await db.rpc('me_unschedule_reminder_job',{p_id:r.id})}return json({ok:true})}
  if(op==='app_open'){await db.from('me_notifications').update({read_at:new Date().toISOString()}).eq('user_id',me.id).eq('type','reminder').is('read_at',null);return json({ok:true,attention:await attentionCount(me.id)})}
  if(op==='saved_list'){const {data}=await db.from('me_saved_articles').select('article_id').eq('user_id',me.id);return json({savedIds:(data||[]).map((x:any)=>x.article_id)})}
  if(op==='toggle_save'){const articleId=safeText(body.articleId,60);const {data:existing}=await db.from('me_saved_articles').select('article_id').eq('user_id',me.id).eq('article_id',articleId).maybeSingle();if(existing){await db.from('me_saved_articles').delete().eq('user_id',me.id).eq('article_id',articleId);return json({saved:false})}const {error}=await db.from('me_saved_articles').insert({user_id:me.id,article_id:articleId});if(error)throw error;return json({saved:true})}
  if(op==='extras'){const localDate=safeDate(body.localDate)||new Date().toISOString().slice(0,10);const {data:days}=await db.from('me_point_events').select('local_date').eq('user_id',me.id).not('local_date','is',null).order('local_date',{ascending:false}).limit(500);const unique=[...(new Set((days||[]).map((x:any)=>x.local_date)))];const {count:saved}=await db.from('me_saved_articles').select('*',{count:'exact',head:true}).eq('user_id',me.id);return json({streak:streakFromDates(unique,localDate),saved:saved||0,attention:await attentionCount(me.id)})}
  if(op==='start_read_v7'){const id=safeText(body.articleId,60);const {data:a}=await db.from('me_knowledge_articles').select('*').eq('id',id).maybeSingle();if(!a)return json({error:'Artikel niet gevonden'},404);const {data:read}=await db.from('me_knowledge_reads').select('article_id').eq('user_id',me.id).eq('article_id',id).maybeSingle();if(read)return json({alreadyRead:true,minSeconds:0,sessionId:null});const minSeconds=articleSeconds(a);const {data:s,error}=await db.from('me_read_sessions').insert({user_id:me.id,article_id:id,min_seconds:minSeconds}).select('id,min_seconds,active_seconds').single();if(error)throw error;return json({alreadyRead:false,sessionId:s.id,minSeconds:s.min_seconds,activeSeconds:s.active_seconds})}
  if(op==='read_tick_v7'){const id=safeText(body.sessionId,60);const {data:s}=await db.from('me_read_sessions').select('*').eq('id',id).eq('user_id',me.id).maybeSingle();if(!s)return json({error:'Leessessie niet gevonden'},404);if(s.completed_at)return json({activeSeconds:s.active_seconds,minSeconds:s.min_seconds,done:true});const now=new Date(),last=new Date(s.last_tick_at),elapsed=Math.max(0,Math.floor((now.getTime()-last.getTime())/1000)),add=Math.min(4,elapsed),active=Math.min(s.min_seconds,s.active_seconds+add);await db.from('me_read_sessions').update({active_seconds:active,last_tick_at:now.toISOString()}).eq('id',s.id);return json({activeSeconds:active,minSeconds:s.min_seconds,done:active>=s.min_seconds})}
  if(op==='complete_read_v7'){return json({error:'Werk de app bij en beantwoord de quizvraag om een kennispunt te verdienen.',quizRequired:true},409)}

  return json({error:'Onbekende actie'},400)
 }catch(e:any){console.error(e);return json({error:'Er ging iets mis. Probeer het opnieuw.',detail:e?.message||String(e)},500)}
})

