-- Run in a transaction and roll back: these fixtures never persist or send push notifications.
do $test$
declare a uuid;b uuid; outsider uuid;t uuid;eid uuid;r jsonb;balance_a integer;balance_b integer;n integer;
begin
 select follower_id,following_id into strict a,b from public.me_follows where status='accepted' and follower_id<>following_id limit 1;
 select id into outsider from public.me_profiles where id not in(a,b) limit 1;
 r:=public.me_adventure_action(a,'create',null,b,'knowledge');t:=(r->>'id')::uuid;eid:=(r->'expedition'->>'id')::uuid;
 if r->'expedition'->>'status'<>'pending' then raise exception 'Invitation not pending';end if;
 begin perform public.me_adventure_action(a,'accept',t);raise exception 'Inviter accepted their own invitation';exception when raise_exception then if sqlerrm='Inviter accepted their own invitation' then raise;end if;end;
 if outsider is not null then begin perform public.me_adventure_action(outsider,'detail',t);raise exception 'Outsider saw private team';exception when raise_exception then if sqlerrm='Outsider saw private team' then raise;end if;end;end if;
 r:=public.me_adventure_action(b,'accept',t);
 if r->'expedition'->>'status'<>'active' or (r->>'score')::int<>0 then raise exception 'Must start active at zero';end if;
 insert into public.me_point_events(user_id,event_key,kind,title,points,created_at) values(a,'test-before-'||eid,'knowledge','Rollback fixture',1,now()-interval '1 day');
 r:=public.me_adventure_action(a,'detail',t);if (r->>'score')::int<>0 then raise exception 'Old points counted';end if;
 perform public.me_world_ensure(a);perform public.me_world_ensure(b);
 select coins into balance_a from public.me_worlds where user_id=a;select coins into balance_b from public.me_worlds where user_id=b;
 insert into public.me_point_events(user_id,event_key,kind,title,points,created_at)
 select case when i<=4 then a else b end,'test-expedition-'||eid||'-'||i,'knowledge','Rollback fixture',1,now() from generate_series(1,10)i;
 r:=public.me_adventure_action(a,'detail',t);
 if r->'expedition'->>'status'<>'completed' or (r->>'score')::int<>10 or (r->>'completed')::int<>1 then raise exception 'Team did not finish';end if;
 perform public.me_adventure_action(a,'detail',t);perform public.me_adventure_action(b,'hub');
 if (select coins from public.me_worlds where user_id=a)<>balance_a+25 or (select coins from public.me_worlds where user_id=b)<>balance_b+25 then raise exception 'Reward missing or duplicated';end if;
 if (select count(*) from public.me_world_reward_events where source_key='expedition:'||eid)<>2 then raise exception 'Reward ledger incorrect';end if;
 if (select count(*) from public.me_world_inventory where user_id in(a,b) and item_key='expedition_lantern' and quantity=1)<>2 then raise exception 'Lantern not available';end if;
 r:=public.me_adventure_action(a,'create',null,b,'activity');
 if (r->>'completed')::int<>1 then raise exception 'Shared island progress lost';end if;
 r:=public.me_adventure_action(b,'accept',t);
 update public.me_adventures set starts_at=now()-interval '1 year',ends_at=now()-interval '360 days' where id=(r->'expedition'->>'id')::uuid;
 r:=public.me_adventure_action(a,'detail',t);if r->'expedition'->>'status'<>'expired' then raise exception 'Expired expedition not closed';end if;
 if (r->>'completed')::int<>1 then raise exception 'Missed goal reduced island progress';end if;
end $test$;
