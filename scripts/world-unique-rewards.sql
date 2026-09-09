-- One copy per earned trophy tier / friendship flag. Keep a service-only restore copy.
lock table public.me_worlds,public.me_world_items,public.me_world_inventory in share row exclusive mode;
create table if not exists public.me_world_reward_repair_backup (
 item_id uuid primary key, original_row jsonb not null, reason text not null,
 saved_at timestamptz not null default now()
);
alter table public.me_world_reward_repair_backup enable row level security;
revoke all on public.me_world_reward_repair_backup from public,anon,authenticated;
grant all on public.me_world_reward_repair_backup to service_role;

update public.me_world_catalog set max_owned=1 where item_key in ('trophy_battle','trophy_bronze','trophy_silver','trophy_gold','trophy_champion','social_flag');
update public.me_world_catalog set metadata=metadata||'{"retired":true}'::jsonb where item_key='trophy_battle';
update public.me_world_catalog set name=case item_key when 'trophy_bronze' then 'Bronzen Battle Trophy' when 'trophy_silver' then 'Zilveren Battle Trophy' when 'trophy_gold' then 'Gouden Battle Trophy' else name end where item_key in ('trophy_bronze','trophy_silver','trophy_gold');

insert into public.me_world_reward_repair_backup(item_id,original_row,reason)
select id,to_jsonb(i),'legacy_trophy_to_bronze' from public.me_world_items i where item_key='trophy_battle' on conflict do nothing;
update public.me_world_items set item_key='trophy_bronze' where item_key='trophy_battle';
insert into public.me_world_unlocks(user_id,item_key,source)
select user_id,'trophy_bronze','battle_win' from public.me_world_unlocks where item_key='trophy_battle' on conflict do nothing;
insert into public.me_world_inventory(user_id,item_key,quantity)
select user_id,'trophy_bronze',least(1,quantity) from public.me_world_inventory where item_key='trophy_battle'
on conflict(user_id,item_key) do update set quantity=greatest(public.me_world_inventory.quantity,excluded.quantity);
update public.me_world_inventory set quantity=0 where item_key='trophy_battle';

with ranked as (
 select i.*,row_number() over(partition by user_id,item_key order by created_at,id) rn
 from public.me_world_items i where item_key in ('trophy_bronze','trophy_silver','trophy_gold','trophy_champion','social_flag')
)
insert into public.me_world_reward_repair_backup(item_id,original_row,reason)
select id,to_jsonb(r)-'rn','duplicate_reward' from ranked r where rn>1 on conflict do nothing;
with ranked as (
 select id,row_number() over(partition by user_id,item_key order by created_at,id) rn
 from public.me_world_items where item_key in ('trophy_bronze','trophy_silver','trophy_gold','trophy_champion','social_flag')
) delete from public.me_world_items where id in(select id from ranked where rn>1);

create unique index if not exists me_world_unique_reward on public.me_world_items
 (user_id,(case when item_key='trophy_battle' then 'trophy_bronze' else item_key end))
 where item_key in ('trophy_battle','trophy_bronze','trophy_silver','trophy_gold','trophy_champion','social_flag');

-- Patch the live progress function without changing coin awards or unrelated milestones.
do $patch$
declare s text; original text;
begin
 select pg_get_functiondef('public.me_world_sync_progress(uuid)'::regprocedure) into s;original:=s;
 s:=replace(s,'perform public.me_world_ensure(p_user_id);','perform public.me_world_ensure(p_user_id); perform 1 from public.me_worlds where user_id=p_user_id for update;');
 s:=replace(s,$old$if battle_wins>=1 then insert into public.me_world_unlocks values(p_user_id,'trophy_battle','battle_win',now()) on conflict do nothing; end if;$old$,'');
 s:=replace(s,$old$select p_user_id,u.item_key,1 from public.me_world_unlocks u join public.me_world_catalog c on c.item_key=u.item_key$old$,
 $new$select p_user_id,u.item_key,case when u.item_key in ('trophy_bronze','trophy_silver','trophy_gold','trophy_champion','social_flag') then greatest(0,1-(select count(*)::int from public.me_world_items i where i.user_id=p_user_id and i.item_key=u.item_key)) else 1 end from public.me_world_unlocks u join public.me_world_catalog c on c.item_key=u.item_key$new$);
 s:=replace(s,'where u.user_id=p_user_id and c.price=0','where u.user_id=p_user_id and c.price=0 and c.item_key<>''trophy_battle''');
 s:=replace(s,'quantity=greatest(public.me_world_inventory.quantity,1),updated_at=now()',
 'quantity=case when excluded.item_key in (''trophy_bronze'',''trophy_silver'',''trophy_gold'',''trophy_champion'',''social_flag'') then excluded.quantity else greatest(public.me_world_inventory.quantity,1) end,updated_at=now()');
 s:=replace(s,$old$if battle_wins>=1 then
    insert into public.me_world_inventory(user_id,item_key,quantity) values(p_user_id,'trophy_battle',battle_wins)
    on conflict(user_id,item_key) do update set quantity=greatest(public.me_world_inventory.quantity,excluded.quantity),updated_at=now();
  end if;$old$,'');
 if s=original or s like '%values(p_user_id,''trophy_battle'',battle_wins)%' or s like '%select p_user_id,u.item_key,1 from%' then raise exception 'Unexpected progress function; repair aborted';end if;
 execute s;
 select pg_get_functiondef('public.me_world_save_position(uuid,uuid,text,double precision,double precision,integer)'::regprocedure) into s;
 s:=replace(s,'else key:=p_item_key;end if;',
 $new$else key:=p_item_key;end if;
 if p_item_id is null and key in ('trophy_battle','trophy_bronze','trophy_silver','trophy_gold','trophy_champion','social_flag') and exists(select 1 from public.me_world_items where user_id=p_user_id and item_key=case when key='trophy_battle' then 'trophy_bronze' else key end) then raise exception 'Dit item staat al op je eiland. Verplaats het via Bewerken.';end if;$new$);
 execute s;
end $patch$;

-- Recalculate only affected free-item stock; refresh must never create another copy.
update public.me_world_inventory inv set quantity=greatest(0,1-(select count(*)::int from public.me_world_items i where i.user_id=inv.user_id and i.item_key=inv.item_key)),updated_at=now()
where item_key in ('trophy_bronze','trophy_silver','trophy_gold','trophy_champion','social_flag');
