create table public.me_adventure_teams(
 id uuid primary key default gen_random_uuid(),
 user_a uuid not null references public.me_profiles(id) on delete cascade,
 user_b uuid not null references public.me_profiles(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp(),
 unique(user_a,user_b),check(user_a<user_b)
);
create table public.me_adventures(
 id uuid primary key default gen_random_uuid(),team_id uuid not null references public.me_adventure_teams(id) on delete cascade,
 inviter_id uuid not null references public.me_profiles(id) on delete cascade,
 kind text not null check(kind in ('activity','knowledge','together')),
 target integer not null check(target>0),status text not null default 'pending' check(status in ('pending','active','completed','expired','declined')),
 starts_at timestamptz,ends_at timestamptz,completed_at timestamptz,created_at timestamptz not null default clock_timestamp()
);
create unique index me_adventure_one_current on public.me_adventures(team_id) where status in ('pending','active');
create index me_adventure_team_history on public.me_adventures(team_id,created_at desc);
alter table public.me_adventure_teams enable row level security;
alter table public.me_adventures enable row level security;
revoke all on public.me_adventure_teams,public.me_adventures from public,anon,authenticated;
grant all on public.me_adventure_teams,public.me_adventures to service_role;
insert into public.me_world_catalog(item_key,category,name,price,rarity,max_owned,metadata)
values('expedition_lantern','special','Expeditielantaarn',0,'epic',1,'{"icon":"star","footprint":{"w":0.45,"h":0.45},"description":"Voltooi samen je eerste expeditie"}') on conflict do nothing;

create function public.me_adventure_snapshot(p_team uuid) returns jsonb language plpgsql set search_path='' as $$
declare t public.me_adventure_teams%rowtype;e public.me_adventures%rowtype;ca integer:=0;cb integer:=0;completed integer;member uuid;
begin
 select * into strict t from public.me_adventure_teams where id=p_team for update;
 select * into e from public.me_adventures where team_id=t.id order by created_at desc,id desc limit 1;
 if e.starts_at is not null then
  select count(*) filter(where user_id=t.user_a),count(*) filter(where user_id=t.user_b) into ca,cb
  from public.me_point_events where user_id in(t.user_a,t.user_b) and points>0 and kind in ('activity','knowledge')
  and (e.kind='together' or kind=e.kind) and created_at>=e.starts_at and created_at<=least(coalesce(e.completed_at,e.ends_at),now());
 end if;
 if e.status='active' and ca+cb>=e.target then
  update public.me_adventures set status='completed',completed_at=least(now(),ends_at) where id=e.id returning * into e;
  -- Lock accounts in a stable order. The existing reward ledger makes coin awards idempotent.
  foreach member in array array[t.user_a,t.user_b] loop
   perform public.me_world_grant_reward(member,'expedition:'||e.id,25);
   insert into public.me_world_unlocks(user_id,item_key,source) values(member,'expedition_lantern','expedition') on conflict do nothing;
   insert into public.me_world_inventory(user_id,item_key,quantity)
   select member,'expedition_lantern',greatest(0,1-(select count(*)::int from public.me_world_items where user_id=member and item_key='expedition_lantern'))
   on conflict(user_id,item_key) do update set quantity=excluded.quantity;
  end loop;
 elsif e.status='active' and e.ends_at<=now() then
  update public.me_adventures set status='expired' where id=e.id returning * into e;
 end if;
 select count(*) into completed from public.me_adventures where team_id=t.id and status='completed';
 return jsonb_build_object('id',t.id,'completed',completed,'expedition',case when e.id is null then null else to_jsonb(e) end,'score',ca+cb,
 'members',(select jsonb_agg(jsonb_build_object('id',id,'name',display_name,'avatarConfig',avatar_config,'score',case when id=t.user_a then ca else cb end) order by id) from public.me_profiles where id in(t.user_a,t.user_b)));
end $$;
revoke all on function public.me_adventure_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.me_adventure_snapshot(uuid) to service_role;

create function public.me_adventure_action(p_user uuid,p_op text,p_team uuid default null,p_other uuid default null,p_kind text default 'together')
returns jsonb language plpgsql set search_path='' as $$
declare t public.me_adventure_teams%rowtype;e public.me_adventures%rowtype;result jsonb:='[]'::jsonb;other_id uuid;start_time timestamptz;
begin
 if p_op='hub' then
  for t in select * from public.me_adventure_teams where p_user in(user_a,user_b) order by id loop
   other_id:=case when t.user_a=p_user then t.user_b else t.user_a end;
   if exists(select 1 from public.me_follows where status='accepted' and ((follower_id=p_user and following_id=other_id) or (following_id=p_user and follower_id=other_id))) then
    result:=result||jsonb_build_array(public.me_adventure_snapshot(t.id));
   end if;
  end loop;
  return jsonb_build_object('teams',result);
 end if;
 if p_op='create' then
  if p_other is null or p_other=p_user or p_kind not in ('activity','knowledge','together') then raise exception 'Kies een vriend en een expeditie.';end if;
  other_id:=p_other;
 else
  select * into t from public.me_adventure_teams where id=p_team and p_user in(user_a,user_b);
  if not found then raise exception 'Deze expeditie is niet van jou.';end if;
  other_id:=case when t.user_a=p_user then t.user_b else t.user_a end;
 end if;
 if not exists(select 1 from public.me_follows where status='accepted' and ((follower_id=p_user and following_id=other_id) or (following_id=p_user and follower_id=other_id))) then raise exception 'Je kunt alleen met geaccepteerde vrienden op avontuur.';end if;
 if p_op='create' then
  insert into public.me_adventure_teams(user_a,user_b) values(least(p_user,p_other),greatest(p_user,p_other)) on conflict(user_a,user_b) do nothing;
  select * into strict t from public.me_adventure_teams where user_a=least(p_user,p_other) and user_b=greatest(p_user,p_other) for update;
  perform public.me_adventure_snapshot(t.id);
  if exists(select 1 from public.me_adventures where team_id=t.id and status in ('pending','active')) then raise exception 'Jullie hebben al een openstaande expeditie.';end if;
  insert into public.me_adventures(team_id,inviter_id,kind,target) values(t.id,p_user,p_kind,case when p_kind='together' then 20 else 10 end) returning * into e;
  insert into public.me_notifications(user_id,actor_id,type,body,data) values(p_other,p_user,'adventure','Je bent uitgenodigd voor een gezamenlijke expeditie. Open de boot in Wereld.',jsonb_build_object('teamId',t.id));
 elsif p_op in ('accept','decline') then
  perform 1 from public.me_adventure_teams where id=t.id for update;
  select * into e from public.me_adventures where team_id=t.id and status='pending' for update;
  if not found then raise exception 'Deze uitnodiging is al beantwoord.';end if;
  if e.inviter_id=p_user and p_op='accept' then raise exception 'Je vriend moet de uitnodiging accepteren.';end if;
  if p_op='accept' then update public.me_adventures set status='active',starts_at=now(),ends_at=now()+interval '7 days' where id=e.id;
  else update public.me_adventures set status='declined' where id=e.id;end if;
 elsif p_op<>'detail' then raise exception 'Onbekende actie.';
 end if;
 return public.me_adventure_snapshot(t.id);
end $$;
revoke all on function public.me_adventure_action(uuid,text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.me_adventure_action(uuid,text,uuid,uuid,text) to service_role;

-- The reward is singular even after progress sync or older-client placement.
create unique index me_world_unique_expedition_lantern on public.me_world_items(user_id,item_key) where item_key='expedition_lantern';
-- This existing free-reward sync must count objects already on the island.
do $$declare s text;begin
 select pg_get_functiondef('public.me_world_sync_progress(uuid)'::regprocedure) into s;
 s:=replace(s,'''trophy_champion'',''social_flag'')','''trophy_champion'',''social_flag'',''expedition_lantern'')');execute s;
end $$;
