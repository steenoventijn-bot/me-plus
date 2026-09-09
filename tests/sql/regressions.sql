\set ON_ERROR_STOP on
begin;
set local role service_role;
do $$
declare own uuid:=gen_random_uuid();other uuid:=gen_random_uuid();id uuid;result jsonb;stock integer;article uuid;session uuid;session2 uuid;question smallint;first_points integer;
begin
 insert into public.me_profiles(id,display_name) values(own,'Test account'),(other,'Other test account');
 perform public.me_world_seed_layout(own);perform public.me_world_seed_layout(other);
 if (select count(*) from public.me_world_items where user_id=own and item_key in('house_main','pond_garden','dock_wood'))<>3 then raise exception 'Feature seed failed';end if;
 delete from public.me_world_items where user_id=own;
 perform public.me_world_seed_layout(own);
 if exists(select 1 from public.me_world_items where user_id=own) then raise exception 'Empty layout was reseeded';end if;
 insert into public.me_world_inventory(user_id,item_key,quantity) values(own,'bench_wood',2) on conflict(user_id,item_key)do update set quantity=2;
 result:=public.me_world_save_position(own,null,'bench_wood',9.23,13.47,90);id:=(result->>'id')::uuid;
 if (result->>'pos_x')::numeric<>9.23 or (result->>'pos_y')::numeric<>13.47 then raise exception 'Precision lost';end if;
 select quantity into stock from public.me_world_inventory where user_id=own and item_key='bench_wood';
 if stock<>1 then raise exception 'Inventory not consumed once';end if;
 begin
  perform public.me_world_save_position(own,null,'bench_wood',9.23,13.47,0);
  raise exception 'Collision unexpectedly accepted' using errcode='ZX001';
 exception when sqlstate 'P0001' then null;end;
 if (select quantity from public.me_world_inventory where user_id=own and item_key='bench_wood')<>stock then raise exception 'Invalid placement consumed inventory';end if;
 begin
  perform public.me_world_save_position(other,id,null,8,13,0);
  raise exception 'Cross-account move accepted' using errcode='ZX001';
 exception when sqlstate 'P0001' then null;end;
 result:=public.me_world_save_position(own,id,null,8.12,13.81,270);
 if (result->>'rotation')::int<>270 then raise exception 'Move not persisted';end if;

 select id into article from public.me_knowledge_articles where slug='slaap-geheugen';
 select correct_index into question from public.me_knowledge_questions where article_id=article;
 insert into public.me_read_sessions(user_id,article_id,min_seconds,active_seconds) values(own,article,60,60) returning id into session;
 result:=public.me_answer_knowledge(own,session,question,current_date);
 if not (result->>'correct')::boolean or not (result->>'newPoint')::boolean or (result->>'points')::int<>1 then raise exception 'Correct answer was not rewarded once';end if;
 result:=public.me_answer_knowledge(own,session,(question+1)%4,current_date);
 if (result->>'newPoint')::boolean or (result->>'points')::int<>1 or not (result->>'correct')::boolean then raise exception 'Retry changed original answer or points';end if;
 insert into public.me_read_sessions(user_id,article_id,min_seconds,active_seconds) values(own,article,60,60) returning id into session2;
 result:=public.me_answer_knowledge(own,session2,question,current_date);
 if (result->>'newPoint')::boolean or (result->>'points')::int<>1 then raise exception 'Another session earned twice';end if;

 select id into article from public.me_knowledge_articles where slug='gewoonte-anker';
 select correct_index into question from public.me_knowledge_questions where article_id=article;
 insert into public.me_read_sessions(user_id,article_id,min_seconds,active_seconds) values(own,article,60,59) returning id into session;
 begin
  perform public.me_answer_knowledge(own,session,question,current_date);
  raise exception 'Incomplete reading accepted' using errcode='ZX001';
 exception when sqlstate 'P0001' then null;end;
 update public.me_read_sessions set active_seconds=60 where id=session;
 result:=public.me_answer_knowledge(own,session,(question+1)%4,current_date);
 if (result->>'correct')::boolean or (result->>'newPoint')::boolean or (result->>'points')::int<>1 then raise exception 'Wrong answer changed points';end if;
 result:=public.me_answer_knowledge(own,session,question,current_date);
 if (result->>'correct')::boolean or (result->>'points')::int<>1 then raise exception 'Wrong answer could be farmed';end if;
 if public.me_article_seconds(article)<>63 then raise exception 'Reading word count mismatch';end if;
 if has_function_privilege('anon','public.me_answer_knowledge(uuid,uuid,integer,date)','execute') or has_function_privilege('authenticated','public.me_world_save_position(uuid,uuid,text,double precision,double precision,integer)','execute') then raise exception 'RPC permissions exposed';end if;
 raise notice 'Atomic placement, ownership, empty world, reading and quiz regressions passed';
end $$;
rollback;
