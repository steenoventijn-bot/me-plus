import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import { sendPushNotification } from 'npm:@mmmike/web-push@0.1.0/send'

const url=Deno.env.get('SUPABASE_URL')!
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const db=createClient(url,serviceKey,{auth:{persistSession:false}})
const headers={'Content-Type':'application/json; charset=utf-8'}
const enc=new TextEncoder()
async function hashText(v:string){const d=await crypto.subtle.digest('SHA-256',enc.encode(v));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function configValue(key:string){const {data,error}=await db.from('me_server_config').select('value').eq('key',key).maybeSingle();if(error)throw error;return data?.value||''}
async function attentionCount(userId:string){const {count:requests}=await db.from('me_follows').select('*',{count:'exact',head:true}).eq('following_id',userId).eq('status','pending');const {count:messages}=await db.from('me_messages').select('*',{count:'exact',head:true}).eq('recipient_id',userId).is('read_at',null);const {count:reminders}=await db.from('me_notifications').select('*',{count:'exact',head:true}).eq('user_id',userId).eq('type','reminder').is('read_at',null);return (requests||0)+(messages||0)+(reminders||0)}
async function finish(id:string,sent:boolean){const {error}=await db.rpc('me_finish_reminder',{p_id:id,p_sent:sent});if(error)console.error('finish reminder',id,error);const {error:scheduleError}=await db.rpc('me_schedule_reminder_job',{p_id:id});if(scheduleError)console.error('schedule next reminder',id,scheduleError)}
function copyFor(r:any){const lead=Number(r.lead_minutes||0);if(lead>=60&&lead%60===0)return `${r.title} begint over ${lead/60} uur.`;if(lead>0)return `${r.title} begint over ${lead} minuten.`;return r.kind==='growth'?`Tijd voor ${r.title}.`:`${r.title} begint nu.`}
async function sendBroadcast(body:any){
 const broadcastKey=String(body.broadcastKey||'').trim().slice(0,100),title=String(body.title||'me+').trim().slice(0,80),message=String(body.message||'').trim().slice(0,240),targetUrl=String(body.url||'./').trim().slice(0,300)
 if(!broadcastKey||!message)return {ok:false,error:'broadcastKey en message zijn verplicht'}
 const publicKey=await configValue('vapid_public'),privateKey=await configValue('vapid_private');if(!publicKey||!privateKey)return {ok:false,error:'VAPID ontbreekt'}
 const {data:profiles,error:pErr}=await db.from('me_profiles').select('id,notifications_enabled').eq('notifications_enabled',true);if(pErr)throw pErr
 let sent=0,skipped=0,failed=0
 for(const p of profiles||[]){
  const {data:existing}=await db.from('me_notifications').select('id').eq('user_id',p.id).eq('type','update').contains('data',{broadcastKey}).limit(1).maybeSingle()
  if(existing){skipped++;continue}
  const {data:subs}=await db.from('me_push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id',p.id).eq('active',true).order('updated_at',{ascending:false}).limit(1)
  if(!subs?.length){skipped++;continue}
  let any=false
  for(const sub of subs){try{const ok=await sendPushNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},{title,body:message,tag:`me-update-${broadcastKey}`,renotify:false,data:{url:targetUrl,broadcastKey}},{publicKey,privateKey,subject:'https://steenoventijn-bot.github.io/me-plus/'});if(ok)any=true}catch(e:any){console.error('broadcast push failed',sub.id,e);const code=Number(e?.statusCode||e?.status||0);if(code===404||code===410)await db.from('me_push_subscriptions').update({active:false,updated_at:new Date().toISOString()}).eq('id',sub.id)}}
  if(any){await db.from('me_notifications').insert({user_id:p.id,actor_id:null,type:'update',body:message,data:{broadcastKey,url:targetUrl,title}});sent++}else failed++
 }
 return {ok:true,broadcast:true,broadcastKey,sent,skipped,failed}
}


async function sendActivityPhotos(eventId:string|null){
 const stale=new Date(Date.now()-5*60000).toISOString();
 const {data:stuck}=await db.from('me_notifications').select('id,data').eq('type','activity').eq('data->>pushStatus','sending').lt('data->>pushClaimedAt',stale).limit(50);
 for(const note of stuck||[])await db.from('me_notifications').update({data:{...note.data,pushStatus:Number(note.data.pushAttempts||0)<3?'pending':'failed'}}).eq('id',note.id).eq('data->>pushStatus','sending').eq('data->>pushClaimedAt',note.data.pushClaimedAt);

 let query=db.from('me_notifications').select('id,user_id,actor_id,data,created_at').eq('type','activity').eq('data->>pushStatus','pending').gte('created_at',new Date(Date.now()-86400000).toISOString()).order('created_at').limit(50);
 if(eventId)query=query.eq('data->>eventId',eventId);
 const {data:notes,error}=await query;if(error)throw error;
 let sent=0,skipped=0,failed=0;
 for(const n of notes||[]){
  const delivery={...n.data,pushAttempts:Number(n.data.pushAttempts||0)+1,pushClaimedAt:new Date().toISOString(),deliveredSubscriptions:n.data.deliveredSubscriptions||[]};
  const {data:claim,error:claimError}=await db.from('me_notifications').update({data:{...delivery,pushStatus:'sending'}}).eq('id',n.id).eq('data->>pushStatus','pending').select('id').maybeSingle();
  if(claimError)throw claimError;if(!claim)continue;
  let status='skipped';
  try{
   const [{data:event},{data:author},{data:recipient},{data:relations}]=await Promise.all([
    db.from('me_point_events').select('id,user_id,proof_path,kind').eq('id',n.data.eventId).maybeSingle(),
    db.from('me_profiles').select('id,display_name,share_tasks,share_proof').eq('id',n.actor_id).maybeSingle(),
    db.from('me_profiles').select('notifications_enabled').eq('id',n.user_id).maybeSingle(),
    db.from('me_follows').select('follower_id').eq('status','accepted').or(`and(follower_id.eq.${n.actor_id},following_id.eq.${n.user_id}),and(follower_id.eq.${n.user_id},following_id.eq.${n.actor_id})`).limit(1)
   ]);
   if(event?.user_id===n.actor_id&&event.kind==='activity'&&event.proof_path&&author?.share_tasks&&author?.share_proof&&recipient?.notifications_enabled&&relations?.length){
    const {data:subs}=await db.from('me_push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id',n.user_id).eq('active',true).order('updated_at',{ascending:false});
    if(subs?.length){
     const publicKey=await configValue('vapid_public'),privateKey=await configValue('vapid_private');
     if(publicKey&&privateKey){
      let retry=false;
      for(const sub of subs){
       if(delivery.deliveredSubscriptions.includes(sub.id))continue;
       try{
        const accepted=await sendPushNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},{title:'Me+ · '+(author.display_name||'Een vriend'),body:'Nieuwe verbeteractiviteit met foto. Tik om de foto te bekijken.',tag:'me-photo-'+n.id,data:{url:'https://steenoventijn-bot.github.io/me-plus/?photos=friends&photo='+encodeURIComponent(n.data.eventId),deliveryKey:'photo:'+n.id}},{publicKey,privateKey,subject:'https://steenoventijn-bot.github.io/me-plus/'});
        if(accepted)delivery.deliveredSubscriptions.push(sub.id);else retry=true;
       }catch(e:any){const code=Number(e?.statusCode||e?.status||0);if(code===404||code===410)await db.from('me_push_subscriptions').update({active:false}).eq('id',sub.id);else retry=true}
      }
      status=retry?'failed':delivery.deliveredSubscriptions.length?'sent':'skipped';
     }else status='failed';
    }
   }
  }catch{status='failed'}
  const {error:saveError}=await db.from('me_notifications').update({data:{...delivery,pushStatus:status==='failed'&&delivery.pushAttempts<3?'pending':status}}).eq('id',n.id);if(saveError)console.error('Activity push status could not be saved');
  if(status==='sent')sent++;else if(status==='failed')failed++;else skipped++;
 }
 return {ok:true,sent,skipped,failed};
}

Deno.serve(async req=>{
 if(req.method!=='POST')return new Response(JSON.stringify({error:'Method not allowed'}),{status:405,headers})
 let body:any={};try{body=await req.json()}catch{}
 const expected=await configValue('push_worker_secret');if(!expected||body.secret!==expected)return new Response(JSON.stringify({error:'Forbidden'}),{status:403,headers})
 if(body.broadcast===true){try{return new Response(JSON.stringify(await sendBroadcast(body)),{headers})}catch(e:any){console.error(e);return new Response(JSON.stringify({ok:false,error:e?.message||String(e)}),{status:500,headers})}}
 if(body.activity===true){try{return new Response(JSON.stringify(await sendActivityPhotos(typeof body.eventId==='string'?body.eventId:null)),{headers})}catch{return new Response(JSON.stringify({ok:false,error:'Activity notifications failed'}),{status:500,headers})}}
 await sendActivityPhotos(null).catch(()=>console.error('Pending activity notifications failed'));
 const targetId=typeof body.reminderId==='string'&&body.reminderId.length>10?body.reminderId:null
 const now=new Date(),stale=new Date(now.getTime()-5*60_000).toISOString();await db.from('me_reminders').update({processing_at:null}).lt('processing_at',stale)
 let q=db.from('me_reminders').select('*').eq('enabled',true).lte('next_at',new Date(Date.now()+45000).toISOString()).order('next_at',{ascending:true}).limit(targetId?1:100);if(targetId)q=q.eq('id',targetId)
 const {data:due,error}=await q;if(error)return new Response(JSON.stringify({error:error.message}),{status:500,headers})
 let sent=0,skipped=0,failed=0,duplicates=0
 for(const r of due||[]){
  const claimAt=new Date().toISOString();const {data:claim}=await db.from('me_reminders').update({processing_at:claimAt}).eq('id',r.id).eq('enabled',true).is('processing_at',null).select('id').maybeSingle();if(!claim)continue
  try{
   const age=Date.now()-new Date(r.next_at).getTime();if(age>10*60_000){await finish(r.id,false);skipped++;continue}
   const {data:profile}=await db.from('me_profiles').select('notifications_enabled').eq('id',r.user_id).maybeSingle();if(!profile?.notifications_enabled){await db.from('me_reminders').update({enabled:false,processing_at:null}).eq('id',r.id);await db.rpc('me_unschedule_reminder_job',{p_id:r.id});skipped++;continue}
   const deliveryKey=await hashText(`${r.user_id}|${r.event_key}|${new Date(r.next_at).toISOString()}`)
   const {data:delivery,error:deliveryError}=await db.from('me_reminder_deliveries').insert({user_id:r.user_id,reminder_id:r.id,event_key:r.event_key,scheduled_at:r.next_at,delivery_key:deliveryKey,status:'claimed'}).select('id').maybeSingle()
   if(deliveryError){if(deliveryError.code==='23505'){await finish(r.id,false);duplicates++;continue}throw deliveryError}
   const deliveryId=delivery?.id
   const {data:subs}=await db.from('me_push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id',r.user_id).eq('active',true).order('updated_at',{ascending:false}).limit(1)
   if(!subs?.length){if(deliveryId)await db.from('me_reminder_deliveries').update({status:'skipped'}).eq('id',deliveryId);await finish(r.id,false);skipped++;continue}
   const publicKey=await configValue('vapid_public'),privateKey=await configValue('vapid_private');if(!publicKey||!privateKey){if(deliveryId)await db.from('me_reminder_deliveries').update({status:'failed'}).eq('id',deliveryId);await finish(r.id,false);failed++;continue}
   const copy=copyFor(r);await db.from('me_notifications').insert({user_id:r.user_id,actor_id:null,type:'reminder',body:copy,data:{reminderId:r.id,eventKey:r.event_key,occurrence:r.next_at,deliveryKey}})
   const badgeCount=await attentionCount(r.user_id);let any=false
   for(const sub of subs){try{const ok=await sendPushNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},{title:'me+',body:copy,tag:`me-reminder-${deliveryKey.slice(0,24)}`,data:{url:'/',badgeCount,reminderId:r.id,deliveryKey}},{publicKey,privateKey,subject:'https://me-plus-steenoventijn-2330.vercel.app'});if(ok)any=true}catch(e:any){console.error('push failed',sub.id,e);const code=Number(e?.statusCode||e?.status||0);if(code===404||code===410)await db.from('me_push_subscriptions').update({active:false,updated_at:new Date().toISOString()}).eq('id',sub.id)}}
   if(deliveryId)await db.from('me_reminder_deliveries').update({status:any?'sent':'failed',sent_at:any?new Date().toISOString():null}).eq('id',deliveryId)
   await finish(r.id,any);if(any)sent++;else failed++
  }catch(e){console.error('reminder failed',r.id,e);await finish(r.id,false);failed++}
 }
 return new Response(JSON.stringify({ok:true,targeted:!!targetId,checked:(due||[]).length,sent,skipped,failed,duplicates}),{headers})
})
