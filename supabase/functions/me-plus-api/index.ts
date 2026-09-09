import {canSeePhoto} from './photo-policy.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

const url = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const db = createClient(url, serviceKey, { auth: { persistSession: false } })
const enc = new TextEncoder()
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8'
}

function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: cors }) }
async function sha256Text(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(value))
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2,'0')).join('')
}
async function sha256Bytes(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2,'0')).join('')
}
function safeText(v: unknown, max = 120) { return typeof v === 'string' ? v.trim().slice(0,max) : '' }
function safeDate(v: unknown) { const s=safeText(v,10); return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:null }
function rank(points: number) {
  const names = ['Starter','Beginner','Groeier','Professional','Baas','Elite','Expert','Meester','Legende','Topper','Me+ Legende']
  const level = Math.min(11, Math.floor(Math.max(0, points) / 10) + 1)
  const next = level >= 11 ? null : level * 10
  return { level, rank: names[level - 1], next, remaining: next === null ? 0 : Math.max(0, next - points) }
}
function profileOut(p: any) {
  return {
    id:p.id, name:p.display_name, handle:p.handle, avatarSeed:p.avatar_seed,
    points:p.points || 0, shareTasks:!!p.share_tasks, shareProof:!!p.share_proof,
    shareProgress:!!p.share_progress, profileVisibility:p.profile_visibility || 'everyone',
    friendRequestPolicy:p.friend_request_policy || 'everyone', interests:p.knowledge_interests || [],
    ...rank(p.points || 0)
  }
}
function slugify(s: string) { return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,28) || 'gebruiker' }
async function uniqueHandle(name: string) {
  const base = slugify(name)
  for (let i=0;i<20;i++) {
    const h = i===0 ? base : `${base}-${Math.floor(1000+Math.random()*9000)}`
    const { data } = await db.from('me_profiles').select('id').eq('handle',h).maybeSingle()
    if (!data) return h
  }
  return `${base}-${crypto.randomUUID().slice(0,6)}`
}
async function current(token: string) {
  if (!token || token.length < 24) return null
  const h = await sha256Text(token)
  const { data } = await db.from('me_profiles').select('*').eq('device_token_hash',h).maybeSingle()
  return data || null
}
async function addNotification(userId:string, actorId:string|null, type:string, body:string, data:any={}) {
  const {error}=await db.from('me_notifications').insert({user_id:userId,actor_id:actorId,type,body,data});if(error)throw error
}
async function recalcPoints(userId:string) {
  const { data } = await db.from('me_point_events').select('points').eq('user_id',userId)
  const total = (data || []).reduce((a:any,b:any)=>a + Number(b.points||0),0)
  await db.from('me_profiles').update({points:total,last_seen_at:new Date().toISOString()}).eq('id',userId)
  return total
}
async function relationships(userId:string) {
  const { data,error } = await db.from('me_follows').select('follower_id,following_id,status,created_at,responded_at').or(`follower_id.eq.${userId},following_id.eq.${userId}`)
  if(error) throw error
  return data || []
}
async function acceptedFriendIds(userId:string) {
  const rels = await relationships(userId)
  return rels.filter((r:any)=>r.status==='accepted').map((r:any)=>r.follower_id===userId?r.following_id:r.follower_id)
}
async function acceptedBetween(a:string,b:string) {
  const {data}=await db.from('me_follows').select('follower_id').eq('status','accepted').or(`and(follower_id.eq.${a},following_id.eq.${b}),and(follower_id.eq.${b},following_id.eq.${a})`).limit(1)
  return !!data?.length
}
function articleSeconds(a:any) {
  const text=[a.intro,a.body,a.extra_fact,a.why_it_matters].filter(Boolean).join(' ')
  const words=text.trim().split(/\s+/).filter(Boolean).length
  return Math.max(30,Math.min(120,Math.ceil(words/3.5)))
}
function dateSeed(s:string) { let n=17; for(const c of s)n=(n*31+c.charCodeAt(0))>>>0; return n }
function decodeProof(dataUrl:string) {
  const m=dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/)
  if(!m) throw new Error('Gebruik een JPG, PNG of WebP-afbeelding')
  const bytes=Uint8Array.from(atob(m[2]),c=>c.charCodeAt(0))
  if(bytes.length>6*1024*1024) throw new Error('Foto is groter dan 6 MB')
  const ext=m[1]==='image/png'?'png':m[1]==='image/webp'?'webp':'jpg'
  return {bytes,mime:m[1],ext}
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok',{headers:cors})
  if (req.method !== 'POST') return json({error:'Method not allowed'},405)
  let body:any
  try { body = await req.json() } catch { return json({error:'Ongeldige aanvraag'},400) }
  const op = safeText(body.op,40)
  const token = safeText(body.token,200)

  try {
    if (op === 'register') {
      if (token.length < 24) return json({error:'Ongeldig apparaat'},400)
      const existing = await current(token)
      if (existing) return json({profile:profileOut(existing)})
      const name = safeText(body.name,40)
      if (!name) return json({error:'Naam ontbreekt'},400)
      const handle = await uniqueHandle(name)
      const hash = await sha256Text(token)
      const { data, error } = await db.from('me_profiles').insert({device_token_hash:hash,display_name:name,handle,avatar_seed:crypto.randomUUID().slice(0,8)}).select('*').single()
      if (error) throw error
      return json({profile:profileOut(data)})
    }

    const me = await current(token)
    if (!me) return json({error:'Profiel niet gevonden',code:'NO_PROFILE'},401)
    await db.from('me_profiles').update({last_seen_at:new Date().toISOString()}).eq('id',me.id)

    if (op === 'me') return json({profile:profileOut(me)})

    if (op === 'settings') {
      const patch:any = {}
      if (typeof body.shareTasks === 'boolean') patch.share_tasks = body.shareTasks
      if (typeof body.shareProof === 'boolean') patch.share_proof = body.shareProof
      if (typeof body.shareProgress === 'boolean') patch.share_progress = body.shareProgress
      if (['everyone','friends'].includes(body.profileVisibility)) patch.profile_visibility = body.profileVisibility
      if (['everyone','nobody'].includes(body.friendRequestPolicy)) patch.friend_request_policy = body.friendRequestPolicy
      if (Array.isArray(body.interests)) patch.knowledge_interests = body.interests.map((x:any)=>safeText(x,40)).filter(Boolean).slice(0,12)
      const { data,error }=await db.from('me_profiles').update(patch).eq('id',me.id).select('*').single(); if(error)throw error
      return json({profile:profileOut(data)})
    }

    if (op === 'search') {
      const q=safeText(body.q,40); if(q.length<2)return json({users:[]})
      const cleaned=q.replace(/[%_,()]/g,'')
      const { data,error }=await db.from('me_profiles').select('*').neq('id',me.id).or(`display_name.ilike.%${cleaned}%,handle.ilike.%${cleaned}%`).limit(20); if(error)throw error
      const rels=await relationships(me.id)
      const users=(data||[]).map((p:any)=>{
        const rel=rels.find((r:any)=>(r.follower_id===me.id&&r.following_id===p.id)||(r.follower_id===p.id&&r.following_id===me.id))
        const isFriend=rel?.status==='accepted'
        const outgoing=rel?.status==='pending'&&rel.follower_id===me.id
        const incoming=rel?.status==='pending'&&rel.following_id===me.id
        const visible=p.profile_visibility==='everyone'||isFriend
        const base=profileOut(p)
        return {...base,points:visible?base.points:null,level:visible?base.level:null,rank:visible?base.rank:null,relation:isFriend?'friend':outgoing?'outgoing':incoming?'incoming':'none',canRequest:p.friend_request_policy!=='nobody'}
      })
      return json({users})
    }

    if (op === 'friend_request') {
      const id=safeText(body.userId,60); if(!id||id===me.id)return json({error:'Ongeldige gebruiker'},400)
      const {data:target}=await db.from('me_profiles').select('*').eq('id',id).maybeSingle(); if(!target)return json({error:'Gebruiker niet gevonden'},404)
      if(target.friend_request_policy==='nobody')return json({error:'Deze gebruiker ontvangt geen vriendverzoeken.'},403)
      const {data:existing}=await db.from('me_follows').select('*').or(`and(follower_id.eq.${me.id},following_id.eq.${id}),and(follower_id.eq.${id},following_id.eq.${me.id})`).limit(1)
      const rel=existing?.[0]
      if(rel?.status==='accepted')return json({ok:true,status:'accepted'})
      if(rel?.status==='pending'&&rel.follower_id===id){
        await db.from('me_follows').update({status:'accepted',responded_at:new Date().toISOString()}).eq('follower_id',id).eq('following_id',me.id)
        await addNotification(id,me.id,'friend_accept',`${me.display_name} heeft je vriendverzoek geaccepteerd.`)
        return json({ok:true,status:'accepted'})
      }
      if(rel?.status==='pending')return json({ok:true,status:'pending'})
      await db.from('me_follows').insert({follower_id:me.id,following_id:id,status:'pending'})
      await addNotification(id,me.id,'friend_request',`${me.display_name} wil je toevoegen als vriend.`)
      return json({ok:true,status:'pending'})
    }

    if (op === 'respond_request') {
      const id=safeText(body.userId,60), action=safeText(body.action,12)
      const {data:rel}=await db.from('me_follows').select('*').eq('follower_id',id).eq('following_id',me.id).eq('status','pending').maybeSingle()
      if(!rel)return json({error:'Verzoek niet gevonden'},404)
      if(action==='accept'){
        await db.from('me_follows').update({status:'accepted',responded_at:new Date().toISOString()}).eq('follower_id',id).eq('following_id',me.id)
        await addNotification(id,me.id,'friend_accept',`${me.display_name} heeft je vriendverzoek geaccepteerd.`)
        return json({ok:true,status:'accepted'})
      }
      if(action==='reject'){
        await db.from('me_follows').delete().eq('follower_id',id).eq('following_id',me.id).eq('status','pending')
        return json({ok:true,status:'rejected'})
      }
      return json({error:'Ongeldige keuze'},400)
    }

    if (op === 'cancel_request') {
      await db.from('me_follows').delete().eq('follower_id',me.id).eq('following_id',safeText(body.userId,60)).eq('status','pending')
      return json({ok:true})
    }

    if (op === 'remove_friend') {
      const id=safeText(body.userId,60)
      await db.from('me_follows').delete().eq('status','accepted').or(`and(follower_id.eq.${me.id},following_id.eq.${id}),and(follower_id.eq.${id},following_id.eq.${me.id})`)
      return json({ok:true})
    }

    if (op === 'friends') {
      const rels=await relationships(me.id)
      const accepted=rels.filter((r:any)=>r.status==='accepted')
      const incoming=rels.filter((r:any)=>r.status==='pending'&&r.following_id===me.id)
      const outgoing=rels.filter((r:any)=>r.status==='pending'&&r.follower_id===me.id)
      const ids=[...new Set(rels.map((r:any)=>r.follower_id===me.id?r.following_id:r.follower_id))]
      const {data:ps}=ids.length?await db.from('me_profiles').select('*').in('id',ids):{data:[] as any[]}
      const map=new Map((ps||[]).map((p:any)=>[p.id,p]))
      const friends=accepted.map((r:any)=>profileOut(map.get(r.follower_id===me.id?r.following_id:r.follower_id))).filter((x:any)=>x.id)
      const incomingRequests=incoming.map((r:any)=>profileOut(map.get(r.follower_id))).filter((x:any)=>x.id)
      const outgoingRequests=outgoing.map((r:any)=>profileOut(map.get(r.following_id))).filter((x:any)=>x.id)
      return json({friends,incomingRequests,outgoingRequests})
    }

    if (op === 'complete_activity') {
      const eventKey=safeText(body.eventKey,140), title=safeText(body.title,160), localDate=safeDate(body.localDate)
      if(!eventKey||!title||!localDate)return json({error:'Activiteit ontbreekt'},400)
      const {data:existing}=await db.from('me_point_events').select('id,points').eq('user_id',me.id).eq('event_key',eventKey).maybeSingle()
      if(existing){const points=await recalcPoints(me.id);return json({ok:true,duplicate:true,points,...rank(points)})}
      const dataUrl=safeText(body.dataUrl,9_000_000)
      if(!dataUrl)return json({error:'Bewijs toevoegen om je punt te verdienen.'},400)
      let proof; try{proof=decodeProof(dataUrl)}catch(e:any){return json({error:e.message},400)}
      const proofHash=await sha256Bytes(proof.bytes)
      const {data:used}=await db.from('me_point_events').select('id').eq('user_id',me.id).eq('proof_hash',proofHash).maybeSingle()
      if(used)return json({error:'Deze foto is al als bewijs gebruikt.'},409)
      const path=`${me.id}/${crypto.randomUUID()}.${proof.ext}`
      const {error:up}=await db.storage.from('me-proof').upload(path,proof.bytes,{contentType:proof.mime,upsert:false}); if(up)throw up
      const metadata=body.metadata&&typeof body.metadata==='object'?body.metadata:{}
      const {data:createdEvent,error:insertError}=await db.from('me_point_events').insert({user_id:me.id,event_key:eventKey,kind:'activity',title,points:1,metadata,proof_path:path,proof_mime:proof.mime,proof_hash:proofHash,local_date:localDate}).select('id').single()
      if(insertError){await db.storage.from('me-proof').remove([path]); if(insertError.code==='23505')return json({error:'Deze activiteit of foto is al gebruikt.'},409); throw insertError}
      const points=await recalcPoints(me.id)
      const friendIds=await acceptedFriendIds(me.id)
      if(me.share_tasks){for(const id of friendIds)await addNotification(id,me.id,'activity',`${me.display_name} rondde “${title}” af.${me.share_proof?' Bekijk de foto.':''}`,{title,points:1,eventId:createdEvent.id,pushStatus:me.share_proof?'pending':'private'})}
      if(me.share_tasks&&me.share_proof&&friendIds.length){
        const work=(async()=>{const {data:secret}=await db.from('me_server_config').select('value').eq('key','push_worker_secret').single();if(secret?.value){const response=await fetch(url+'/functions/v1/me-plus-push-worker',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:secret.value,activity:true,eventId:createdEvent.id})});if(!response.ok)console.error('Activity push worker failed',response.status)}})().catch(e=>console.error('Activity push failed',e));
        if(typeof EdgeRuntime!=='undefined')EdgeRuntime.waitUntil(work);else await work;
      }
      return json({ok:true,duplicate:false,points,...rank(points)})
    }

    if (op === 'award' || op === 'upload_proof') return json({error:'Werk de app bij om punten veilig te verdienen.'},409)

    if (op === 'leaderboard') {
      const period=['week','month','all'].includes(body.period)?body.period:'week'; let since:string|null=null; const n=new Date()
      if(period==='week'){ const d=new Date(n); d.setDate(n.getDate()-6); d.setHours(0,0,0,0); since=d.toISOString() }
      if(period==='month'){ const d=new Date(n.getFullYear(),n.getMonth(),1); since=d.toISOString() }
      const ids=[me.id,...await acceptedFriendIds(me.id)]
      const {data:ps}=await db.from('me_profiles').select('*').in('id',ids)
      const scores=new Map<string,number>()
      if(period==='all'){for(const p of ps||[])scores.set(p.id,p.points||0)} else {let q=db.from('me_point_events').select('user_id,points').in('user_id',ids); if(since)q=q.gte('created_at',since); const {data:ev}=await q; for(const e of ev||[])scores.set(e.user_id,(scores.get(e.user_id)||0)+Number(e.points||0))}
      const rows=(ps||[]).map((p:any)=>({...profileOut(p),score:scores.get(p.id)||0,isMe:p.id===me.id})).sort((a:any,b:any)=>b.score-a.score)
      return json({rows,period})
    }

    if(op==='photo_gallery'){
      const scope=body.scope==='friends'?'friends':'own',offset=Math.max(0,Math.min(100000,Math.floor(Number(body.offset)||0))),limit=24;
      const friends=scope==='friends'?await acceptedFriendIds(me.id):[];
      const authorId=safeText(body.userId,60),photoId=safeText(body.photoId,60);
      if(authorId&&scope==='friends'&&!friends.includes(authorId))return json({error:'Dit album is alleen beschikbaar voor huidige vrienden.'},403);
      const {data:authors,error:authorError}=scope==='own'?{data:[me],error:null}:friends.length?await db.from('me_profiles').select('id,display_name,share_tasks,share_proof').in('id',friends):{data:[],error:null};
      if(authorError)throw authorError;
      const allowed=(authors||[]).filter((p:any)=>canSeePhoto(me.id,p,friends)&&(!authorId||p.id===authorId));if(!allowed.length)return json({items:[],hasMore:false});
      let photoQuery=db.from('me_point_events').select('id,user_id,title,proof_path,created_at,local_date').eq('kind','activity').in('user_id',allowed.map((p:any)=>p.id)).not('proof_path','is',null).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+limit);
      if(photoId)photoQuery=photoQuery.eq('id',photoId);
      const {data:events,error}=await photoQuery;
      if(error)throw error;const rows=(events||[]).slice(0,limit);
      const {data:urls,error:signError}=rows.length?await db.storage.from('me-proof').createSignedUrls(rows.map((e:any)=>e.proof_path),600):{data:[],error:null};if(signError)throw signError;
      const signed=new Map((urls||[]).map((u:any)=>[u.path,u.signedUrl]));
      return json({items:rows.map((e:any)=>({id:e.id,userId:e.user_id,title:e.title,name:allowed.find((p:any)=>p.id===e.user_id)?.display_name||'Vriend',createdAt:e.created_at,date:e.local_date,url:signed.get(e.proof_path)||null,isOwn:e.user_id===me.id})),hasMore:(events||[]).length>limit});
    }

    if (op === 'feed') {
      const ids=await acceptedFriendIds(me.id); if(!ids.length)return json({items:[]})
      const {data:ps}=await db.from('me_profiles').select('*').in('id',ids)
      const allowed=(ps||[]).filter((p:any)=>p.share_tasks); const map=new Map(allowed.map((p:any)=>[p.id,p])); const allowedIds=allowed.map((p:any)=>p.id); if(!allowedIds.length)return json({items:[]})
      const {data:ev}=await db.from('me_point_events').select('id,user_id,title,kind,points,proof_path,created_at').in('user_id',allowedIds).order('created_at',{ascending:false}).limit(30)
      const items=[] as any[]
      for(const e of ev||[]){const p:any=map.get(e.user_id);let proofUrl=null;if(e.proof_path&&p?.share_proof){const {data:s}=await db.storage.from('me-proof').createSignedUrl(e.proof_path,600);proofUrl=s?.signedUrl||null}items.push({...e,name:p?.display_name,avatarSeed:p?.avatar_seed,proofUrl})}
      return json({items})
    }

    if (op === 'conversations') {
      const ids=await acceptedFriendIds(me.id); if(!ids.length)return json({conversations:[]})
      const {data:msgs}=await db.from('me_messages').select('sender_id,recipient_id,created_at,body,read_at').or(`sender_id.eq.${me.id},recipient_id.eq.${me.id}`).order('created_at',{ascending:false}).limit(200)
      const last=new Map<string,any>(); for(const m of msgs||[]){const other=m.sender_id===me.id?m.recipient_id:m.sender_id;if(ids.includes(other)&&!last.has(other))last.set(other,m)}
      const {data:ps}=await db.from('me_profiles').select('*').in('id',ids)
      return json({conversations:(ps||[]).map((p:any)=>({...profileOut(p),last:last.get(p.id)||null}))})
    }

    if (op === 'messages') {
      const other=safeText(body.userId,60); if(!await acceptedBetween(me.id,other))return json({error:'Jullie moeten eerst vrienden zijn.'},403)
      const {data:msgs,error}=await db.from('me_messages').select('id,sender_id,recipient_id,body,created_at,read_at').or(`and(sender_id.eq.${me.id},recipient_id.eq.${other}),and(sender_id.eq.${other},recipient_id.eq.${me.id})`).order('created_at',{ascending:true}).limit(200); if(error)throw error
      await db.from('me_messages').update({read_at:new Date().toISOString()}).eq('recipient_id',me.id).eq('sender_id',other).is('read_at',null)
      return json({messages:msgs||[]})
    }

    if (op === 'send_message') {
      const other=safeText(body.userId,60), text=safeText(body.text,1200); if(!text)return json({error:'Bericht is leeg'},400)
      if(!await acceptedBetween(me.id,other))return json({error:'Jullie moeten eerst vrienden zijn.'},403)
      const {data,error}=await db.from('me_messages').insert({sender_id:me.id,recipient_id:other,body:text}).select('id,sender_id,recipient_id,body,created_at').single(); if(error)throw error
      await addNotification(other,me.id,'message',`${me.display_name} stuurde je een bericht.`)
      return json({message:data})
    }

    if (op === 'notifications') {
      const {data}=await db.from('me_notifications').select('id,type,body,data,created_at,read_at,actor_id').eq('user_id',me.id).order('created_at',{ascending:false}).limit(50)
      return json({notifications:data||[]})
    }

    if (op === 'knowledge') {
      let q=db.from('me_knowledge_articles').select('*'); const category=safeText(body.category,40); if(category&&category!=='Alles')q=q.eq('category',category); const {data,error}=await q.order('created_at',{ascending:false}); if(error)throw error
      const interests=me.knowledge_interests||[]; let articles=data||[]; if(!category&&interests.length)articles=[...articles.filter((a:any)=>interests.includes(a.category)),...articles.filter((a:any)=>!interests.includes(a.category))]
      const day=safeDate(body.date)||new Date().toISOString().slice(0,10); if(articles.length){const idx=dateSeed(day)%articles.length;articles=[articles[idx],...articles.filter((_:any,i:number)=>i!==idx)]}
      return json({articles,interests,date:day})
    }

    if (op === 'start_read') {
      const id=safeText(body.articleId,60); const {data:a}=await db.from('me_knowledge_articles').select('*').eq('id',id).maybeSingle(); if(!a)return json({error:'Artikel niet gevonden'},404)
      const {data:read}=await db.from('me_knowledge_reads').select('article_id').eq('user_id',me.id).eq('article_id',id).maybeSingle()
      if(read)return json({alreadyRead:true,minSeconds:0,sessionId:null})
      const minSeconds=articleSeconds(a)
      const {data:s,error}=await db.from('me_read_sessions').insert({user_id:me.id,article_id:id,min_seconds:minSeconds}).select('id,min_seconds,active_seconds').single(); if(error)throw error
      return json({alreadyRead:false,sessionId:s.id,minSeconds:s.min_seconds,activeSeconds:s.active_seconds})
    }

    if (op === 'read_tick') {
      const id=safeText(body.sessionId,60); const {data:s}=await db.from('me_read_sessions').select('*').eq('id',id).eq('user_id',me.id).maybeSingle(); if(!s)return json({error:'Leessessie niet gevonden'},404)
      if(s.completed_at)return json({activeSeconds:s.active_seconds,minSeconds:s.min_seconds,done:true})
      const now=new Date(), last=new Date(s.last_tick_at); const elapsed=Math.max(0,Math.floor((now.getTime()-last.getTime())/1000)); const add=Math.min(5,elapsed); const active=Math.min(s.min_seconds,s.active_seconds+add)
      await db.from('me_read_sessions').update({active_seconds:active,last_tick_at:now.toISOString()}).eq('id',s.id)
      return json({activeSeconds:active,minSeconds:s.min_seconds,done:active>=s.min_seconds})
    }

    if (op === 'complete_read') {return json({error:'Werk de app bij en beantwoord de quizvraag om een kennispunt te verdienen.',quizRequired:true},409)}

    if (op === 'read_article') return json({error:'Lees eerst de minimale leestijd om een punt te verdienen.'},409)

    if (op === 'stats') {
      const localDate=safeDate(body.localDate)||new Date().toISOString().slice(0,10)
      const {count:activities}=await db.from('me_point_events').select('*',{count:'exact',head:true}).eq('user_id',me.id).eq('kind','activity')
      const {count:reads}=await db.from('me_knowledge_reads').select('*',{count:'exact',head:true}).eq('user_id',me.id)
      const {data:todayEvents}=await db.from('me_point_events').select('kind,points,title').eq('user_id',me.id).eq('local_date',localDate)
      const activityPoints=(todayEvents||[]).filter((x:any)=>x.kind==='activity').reduce((a:any,b:any)=>a+Number(b.points||0),0)
      const knowledgePoints=(todayEvents||[]).filter((x:any)=>x.kind==='knowledge').reduce((a:any,b:any)=>a+Number(b.points||0),0)
      const friendIds=await acceptedFriendIds(me.id)
      const rels=await relationships(me.id); const requestCount=rels.filter((r:any)=>r.status==='pending'&&r.following_id===me.id).length
      const {count:unreadMessages}=await db.from('me_messages').select('*',{count:'exact',head:true}).eq('recipient_id',me.id).is('read_at',null)
      return json({stats:{activities:activities||0,reads:reads||0,points:me.points,...rank(me.points),friendCount:friendIds.length,requestCount,unreadMessages:unreadMessages||0,today:{total:activityPoints+knowledgePoints,activity:activityPoints,knowledge:knowledgePoints}}})
    }

    return json({error:'Onbekende actie'},400)
  } catch (e:any) {
    console.error(e)
    return json({error:'Er ging iets mis. Probeer het opnieuw.',detail:e?.message||String(e)},500)
  }
})

