create role anon;create role authenticated;create role service_role;
create table public.me_profiles(id uuid primary key default gen_random_uuid(),display_name text,points integer not null default 0,last_seen_at timestamptz);
create table public.me_worlds(user_id uuid primary key references me_profiles(id),world_name text,coins integer default 0,house jsonb default '{}',updated_at timestamptz default now());
create table public.me_world_catalog(item_key text primary key,category text,name text,price integer default 0,rarity text default 'common',max_owned integer,metadata jsonb default '{}',default_unlocked boolean default false);
create table public.me_world_items(id uuid primary key default gen_random_uuid(),user_id uuid references me_profiles(id),item_key text references me_world_catalog(item_key),grid_x integer check(grid_x between 0 and 19),grid_y integer check(grid_y between 0 and 19),pos_x numeric check(pos_x between 0 and 19),pos_y numeric check(pos_y between 0 and 19),rotation smallint default 0 check(rotation in(0,90,180,270)),updated_at timestamptz default now());
create table public.me_world_inventory(user_id uuid references me_profiles(id),item_key text references me_world_catalog(item_key),quantity integer check(quantity>=0),updated_at timestamptz default now(),primary key(user_id,item_key));
create table public.me_knowledge_articles(id uuid primary key default gen_random_uuid(),slug text unique,title text,intro text,body text,extra_fact text,why_it_matters text);
create table public.me_knowledge_reads(user_id uuid references me_profiles(id),article_id uuid references me_knowledge_articles(id),read_at timestamptz default now(),primary key(user_id,article_id));
create table public.me_read_sessions(id uuid primary key default gen_random_uuid(),user_id uuid references me_profiles(id),article_id uuid references me_knowledge_articles(id),min_seconds integer,active_seconds integer default 0,last_tick_at timestamptz default now(),completed_at timestamptz,created_at timestamptz default now());
create table public.me_point_events(id uuid primary key default gen_random_uuid(),user_id uuid references me_profiles(id),event_key text,kind text,title text,points smallint default 1,metadata jsonb default '{}',local_date date,unique(user_id,event_key));
create function public.me_world_ensure(p_user_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.me_worlds(user_id) values(p_user_id) on conflict do nothing;
 insert into public.me_world_inventory(user_id,item_key,quantity) select p_user_id,item_key,4 from public.me_world_catalog where default_unlocked on conflict do nothing;
end $$;
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant execute on function public.me_world_ensure(uuid) to service_role;
