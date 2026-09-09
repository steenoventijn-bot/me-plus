-- Atomic precise placement. Existing profile IDs, item IDs and positions are preserved.
alter table public.me_worlds add column if not exists layout_initialized boolean not null default false;
update public.me_worlds set layout_initialized=true;
insert into public.me_world_catalog(item_key,category,name,price,rarity,max_owned,metadata) values
 ('house_main','building','Je huis',0,'common',1,'{"permanent":true}'),
 ('pond_garden','water','Tuinvijver',0,'common',1,'{}'),
 ('dock_wood','decor','Houten steiger',0,'common',1,'{}') on conflict(item_key) do nothing;
with shapes(item_key,w,h,ox,oy) as (values
-- FOOTPRINT_VALUES
) update public.me_world_catalog c set metadata=c.metadata||jsonb_build_object('footprint',jsonb_build_object('w',s.w,'h',s.h,'ox',s.ox,'oy',s.oy)) from shapes s where c.item_key=s.item_key;

create or replace function public.me_world_shape(p_key text,p_rotation integer default 0)
returns double precision[] language sql stable set search_path='' as $$
 select case p_rotation when 90 then array[h,w,-oy,ox] when 180 then array[w,h,-ox,-oy] when 270 then array[h,w,oy,-ox] else array[w,h,ox,oy] end
 from(select coalesce((metadata->'footprint'->>'w')::float8,.7)w,coalesce((metadata->'footprint'->>'h')::float8,.7)h,coalesce((metadata->'footprint'->>'ox')::float8,0)ox,coalesce((metadata->'footprint'->>'oy')::float8,0)oy from public.me_world_catalog where item_key=p_key)s
$$;
create or replace function public.me_world_land_distance(p_x double precision,p_y double precision)
returns double precision language sql immutable set search_path='' as $$
 select sqrt(dx*dx+dy*dy)/(1+.045*sin(3*a+.7)+.028*cos(5*a-1.2)+.018*sin(9*a))
 from (select dx,dy,atan2(dy,dx) a from (select (p_x-9.5)/8.7 dx,(p_y-9.5)/8.15 dy) q) r
$$;
create or replace function public.me_world_validate_position(p_user_id uuid,p_key text,p_x double precision,p_y double precision,p_rotation integer,p_exclude uuid default null)
returns void language plpgsql set search_path='' as $$
declare shape double precision[]; other double precision[]; row record; i int; point double precision[]; max_land float8;
begin
 if p_x is null or p_y is null or not(p_x between 0 and 19 and p_y between 0 and 19) or p_rotation is null or p_rotation not in(0,90,180,270) then raise exception 'Ongeldige positie'; end if;
 shape:=public.me_world_shape(p_key,p_rotation);if shape is null then raise exception 'Onbekend object';end if;
 max_land:=case when p_key='dock_wood' then 1.19 else .94 end;
 for i in 0..4 loop
   foreach point slice 1 in array array[array[(i/4.0-.5)*shape[1],-shape[2]/2],array[(i/4.0-.5)*shape[1],shape[2]/2],array[-shape[1]/2,(i/4.0-.5)*shape[2]],array[shape[1]/2,(i/4.0-.5)*shape[2]]] loop
     if public.me_world_land_distance(p_x+shape[3]+point[1],p_y+shape[4]+point[2])>max_land then raise exception 'Plaats het hele object op het gras.';end if;
   end loop;
 end loop;
 for row in select * from public.me_world_items where user_id=p_user_id and (p_exclude is null or id<>p_exclude) loop
  other:=public.me_world_shape(row.item_key,row.rotation);
  if abs(coalesce(row.pos_x,row.grid_x)+other[3]-p_x-shape[3])<(shape[1]+other[1])/2-.005 and abs(coalesce(row.pos_y,row.grid_y)+other[4]-p_y-shape[4])<(shape[2]+other[2])/2-.005 then raise exception 'Er staat al een object op deze plek.';end if;
 end loop;
end $$;

create or replace function public.me_world_save_position(p_user_id uuid,p_item_id uuid,p_item_key text,p_x double precision,p_y double precision,p_rotation integer default 0)
returns jsonb language plpgsql set search_path='' as $$
declare result public.me_world_items; qty int; key text; px numeric; py numeric;
begin
 -- One world lock serializes overlapping placements and stock consumption.
 perform 1 from public.me_worlds where user_id=p_user_id for update;
 if not found then raise exception 'Wereld niet gevonden';end if;
 if p_item_id is not null then
  select item_key into key from public.me_world_items where id=p_item_id and user_id=p_user_id;
  if not found then raise exception 'Object niet gevonden';end if;
 else key:=p_item_key;end if;
 px:=round(p_x::numeric,2);py:=round(p_y::numeric,2);
 perform public.me_world_validate_position(p_user_id,key,px::float8,py::float8,p_rotation,p_item_id);
 if p_item_id is null then
  select quantity into qty from public.me_world_inventory where user_id=p_user_id and item_key=key for update;
  if coalesce(qty,0)<1 then raise exception 'Dit item zit niet in je voorraad.';end if;
  update public.me_world_inventory set quantity=quantity-1,updated_at=now() where user_id=p_user_id and item_key=key;
  insert into public.me_world_items(user_id,item_key,grid_x,grid_y,pos_x,pos_y,rotation) values(p_user_id,key,round(px),round(py),px,py,p_rotation) returning * into result;
 else
  update public.me_world_items set grid_x=round(px),grid_y=round(py),pos_x=px,pos_y=py,rotation=p_rotation,updated_at=now() where id=p_item_id and user_id=p_user_id returning * into result;
 end if;
 update public.me_worlds set updated_at=now() where user_id=p_user_id;
 return to_jsonb(result);
end $$;

-- Add formerly baked-in features without moving or overlapping a user's objects.
create or replace function public.me_world_add_features(p_user_id uuid)
returns void language plpgsql set search_path='' as $$
declare f record; candidate record; placed boolean;
begin
 perform 1 from public.me_worlds where user_id=p_user_id for update;
 for f in select * from(values('house_main',9.5,6.6),('pond_garden',15.2,10.7),('dock_wood',14.3,15.9))v(key,x,y) loop
  if exists(select 1 from public.me_world_items where user_id=p_user_id and item_key=f.key) then continue;end if;
  placed:=false;
  for candidate in
   select x,y from (
    select f.x::float8 x,f.y::float8 y,-1::float8 distance
    union all
    select gx/2.0,gy/2.0,power(gx/2.0-f.x,2)+power(gy/2.0-f.y,2)
    from generate_series(1,37)gx cross join generate_series(1,37)gy
   )positions order by distance,x,y
  loop
   begin
    perform public.me_world_validate_position(p_user_id,f.key,candidate.x,candidate.y,0);
   exception when sqlstate 'P0001' then continue;
   end;
   insert into public.me_world_items(user_id,item_key,grid_x,grid_y,pos_x,pos_y)
   values(p_user_id,f.key,round(candidate.x),round(candidate.y),candidate.x,candidate.y);
   placed:=true;exit;
  end loop;
  if not placed then raise exception 'Geen vrije plek voor % in wereld %. Bestaande objecten zijn behouden.',f.key,p_user_id;end if;
 end loop;
end $$;
revoke all on function public.me_world_add_features(uuid) from public,anon,authenticated;
grant execute on function public.me_world_add_features(uuid) to service_role;
do $$ declare w record;begin
 for w in select user_id from public.me_worlds loop perform public.me_world_add_features(w.user_id);end loop;
end $$;

create or replace function public.me_world_seed_layout(p_user_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.me_world_ensure(p_user_id);
 perform 1 from public.me_worlds where user_id=p_user_id and not layout_initialized for update;
 if not found then return;end if;
 if not exists(select 1 from public.me_world_items where user_id=p_user_id) then
  insert into public.me_world_items(user_id,item_key,grid_x,grid_y,rotation) values
   (p_user_id,'tree_oak',4,5,0),(p_user_id,'tree_oak',15,4,0),(p_user_id,'tree_oak',16,13,0),
   (p_user_id,'flowers_pink',7,11,0),(p_user_id,'flowers_pink',12,8,0),
   (p_user_id,'bush_round',6,6,0),(p_user_id,'bush_round',13,12,0),
   (p_user_id,'bench_wood',9,13,0),(p_user_id,'lamp_glow',8,9,0),(p_user_id,'lamp_glow',11,9,0);
  update public.me_world_inventory i set quantity=greatest(0,i.quantity-s.used),updated_at=now()
   from(select item_key,count(*)::int used from public.me_world_items where user_id=p_user_id group by item_key)s where i.user_id=p_user_id and i.item_key=s.item_key;
 end if;
 perform public.me_world_add_features(p_user_id);
 update public.me_worlds set layout_initialized=true where user_id=p_user_id;
end $$;
revoke all on function public.me_world_shape(text,integer),public.me_world_land_distance(double precision,double precision),public.me_world_validate_position(uuid,text,double precision,double precision,integer,uuid),public.me_world_save_position(uuid,uuid,text,double precision,double precision,integer),public.me_world_seed_layout(uuid) from public,anon,authenticated;
grant execute on function public.me_world_shape(text,integer),public.me_world_land_distance(double precision,double precision),public.me_world_validate_position(uuid,text,double precision,double precision,integer,uuid),public.me_world_save_position(uuid,uuid,text,double precision,double precision,integer),public.me_world_seed_layout(uuid) to service_role;

-- Keep a house present while allowing its position and every appearance option to change.
create or replace function public.me_world_remove(p_user_id uuid,p_item_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare k text;
begin
 perform 1 from public.me_worlds where user_id=p_user_id for update;
 select item_key into k from public.me_world_items where id=p_item_id and user_id=p_user_id;
 if k='house_main' then raise exception 'Je huis kun je verplaatsen of aanpassen.';end if;
 delete from public.me_world_items where id=p_item_id and user_id=p_user_id returning item_key into k;
 if k is null then return false;end if;
 insert into public.me_world_inventory(user_id,item_key,quantity) values(p_user_id,k,1) on conflict(user_id,item_key) do update set quantity=public.me_world_inventory.quantity+1,updated_at=now();
 return true;
end $$;
revoke all on function public.me_world_remove(uuid,uuid) from public,anon,authenticated;
grant execute on function public.me_world_remove(uuid,uuid) to service_role;
alter table public.me_worlds alter column house set default '{"style":"cottage","roofShape":"gable","roof":"blue","walls":"wood","door":"oak","windows":"classic","frames":"white","chimney":"brick","fence":"wood","decor":"flowers","level":1}'::jsonb;
