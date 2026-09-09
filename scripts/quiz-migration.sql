
-- One validated question per article, with the answer retained on the server.
create table if not exists public.me_knowledge_questions(
 article_id uuid primary key references public.me_knowledge_articles(id) on delete cascade,
 question text not null,
 options jsonb not null check(jsonb_typeof(options)='array' and jsonb_array_length(options)=4),
 correct_index smallint not null check(correct_index between 0 and 3),
 explanation text not null
);
create table if not exists public.me_knowledge_quiz_attempts(
 user_id uuid not null references public.me_profiles(id) on delete cascade,
 article_id uuid not null references public.me_knowledge_articles(id) on delete cascade,
 selected_index smallint not null check(selected_index between 0 and 3),
 correct boolean not null,
 awarded boolean not null default false,
 answered_at timestamptz not null default now(),
 primary key(user_id,article_id)
);
alter table public.me_knowledge_questions enable row level security;
alter table public.me_knowledge_quiz_attempts enable row level security;
revoke all on public.me_knowledge_questions,public.me_knowledge_quiz_attempts from public,anon,authenticated;
grant all on public.me_knowledge_questions,public.me_knowledge_quiz_attempts to service_role;

-- QUESTION_VALUES

create or replace function public.me_article_seconds(p_article uuid)
returns integer language sql stable set search_path='' as $$
 select greatest(1,ceil(cardinality(regexp_split_to_array(trim(concat_ws(' ',nullif(trim(intro),''),nullif(trim(body),''),nullif(trim(extra_fact),''),nullif(trim(why_it_matters),''))),'\s+'))*.3)::integer) from public.me_knowledge_articles where id=p_article
$$;
create or replace function public.me_read_tick_atomic(p_user_id uuid,p_session_id uuid)
returns jsonb language plpgsql set search_path='' as $$
declare s public.me_read_sessions; elapsed integer;
begin
 select * into s from public.me_read_sessions where id=p_session_id and user_id=p_user_id for update;
 if not found then raise exception 'Leessessie niet gevonden';end if;
 elapsed:=greatest(0,floor(extract(epoch from(now()-s.last_tick_at)))::integer);
 if s.completed_at is null then
  update public.me_read_sessions set active_seconds=least(min_seconds,active_seconds+case when elapsed<=8 then least(5,elapsed) else 0 end),last_tick_at=now() where id=s.id returning * into s;
 end if;
 return jsonb_build_object('activeSeconds',s.active_seconds,'minSeconds',s.min_seconds,'done',s.active_seconds>=s.min_seconds);
end $$;
create or replace function public.me_answer_knowledge(p_user_id uuid,p_session_id uuid,p_choice integer,p_local_date date)
returns jsonb language plpgsql set search_path='' as $$
declare s public.me_read_sessions; q public.me_knowledge_questions; a public.me_knowledge_quiz_attempts; total integer; earned boolean:=false; inserted integer; title text;
begin
 if p_choice is null or p_choice not between 0 and 3 then raise exception 'Kies één antwoord.';end if;
 -- Serialize across multiple tabs, sessions and devices for the same account.
 perform 1 from public.me_profiles where id=p_user_id for update;
 select * into s from public.me_read_sessions where id=p_session_id and user_id=p_user_id for update;
 if not found then raise exception 'Leessessie niet gevonden';end if;
 if s.active_seconds<s.min_seconds then raise exception 'Lees de tekst eerst uit.';end if;
 select * into q from public.me_knowledge_questions where article_id=s.article_id;
 if not found then raise exception 'Deze tekst heeft nog geen quizvraag.';end if;
 select * into a from public.me_knowledge_quiz_attempts where user_id=p_user_id and article_id=s.article_id;
 if not found then
  if p_choice=q.correct_index then
   select ar.title into title from public.me_knowledge_articles ar where ar.id=s.article_id;
   insert into public.me_point_events(user_id,event_key,kind,title,points,local_date,metadata)
    values(p_user_id,'knowledge:'||s.article_id::text,'knowledge',title,1,coalesce(p_local_date,current_date),jsonb_build_object('quiz',true)) on conflict do nothing;
   get diagnostics inserted=row_count;earned:=inserted=1;
  end if;
  insert into public.me_knowledge_quiz_attempts(user_id,article_id,selected_index,correct,awarded)
   values(p_user_id,s.article_id,p_choice,p_choice=q.correct_index,earned) returning * into a;
 end if;
 insert into public.me_knowledge_reads(user_id,article_id) values(p_user_id,s.article_id) on conflict do nothing;
 update public.me_read_sessions set completed_at=coalesce(completed_at,now()) where id=s.id;
 select coalesce(sum(points),0)::integer into total from public.me_point_events where user_id=p_user_id;
 update public.me_profiles set points=total,last_seen_at=now() where id=p_user_id;
 return jsonb_build_object('correct',a.correct,'correctIndex',q.correct_index,'selectedIndex',a.selected_index,'explanation',q.explanation,'awarded',a.awarded,'newPoint',earned,'points',total);
end $$;
revoke all on function public.me_article_seconds(uuid),public.me_read_tick_atomic(uuid,uuid),public.me_answer_knowledge(uuid,uuid,integer,date) from public,anon,authenticated;
grant execute on function public.me_article_seconds(uuid),public.me_read_tick_atomic(uuid,uuid),public.me_answer_knowledge(uuid,uuid,integer,date) to service_role;
