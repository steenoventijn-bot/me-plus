-- Atomic precise placement. Existing profile IDs, item IDs and positions are preserved.
alter table public.me_worlds add column if not exists layout_initialized boolean not null default false;
update public.me_worlds set layout_initialized=true;
insert into public.me_world_catalog(item_key,category,name,price,rarity,max_owned,metadata) values
 ('house_main','building','Je huis',0,'common',1,'{"permanent":true}'),
 ('pond_garden','water','Tuinvijver',0,'common',1,'{}'),
 ('dock_wood','decor','Houten steiger',0,'common',1,'{}') on conflict(item_key) do nothing;
with shapes(item_key,w,h,ox,oy) as (values
('house_main',3.45,3.5,0,0.35),
('pond_garden',3.5,2.8,0,0),
('dock_wood',1.5,2.6,0,0),
('activity_garden',0.32,0.32,0,0),
('beach_chair',0.76,0.98,0,0),
('bench_wood',1.35,0.55,0,0),
('bookshelf_small',0.65,0.5,0,0),
('bridge_wood',1.8,0.9,0,0),
('bush_round',0.85,0.78,0,0),
('campfire',0.95,0.95,0,0),
('fence_white',1.3,0.23,0,0),
('flowers_pink',0.85,0.62,0,0),
('flowers_white',0.85,0.62,0,0),
('fountain',1.4,1.4,0,0),
('fountain_gold',1.4,1.4,0,0),
('golden_duck',0.65,0.48,0,0),
('growth_zone',1.8,1.6,0,0),
('knowledge_house',2,1.7,0,0),
('knowledge_library',2,1.7,0,0),
('knowledge_stack',0.65,0.5,0,0),
('knowledge_stand',1.8,1.6,0,0),
('lamp_glow',0.32,0.32,0,0),
('palm_tree',0.58,0.58,0,0),
('parasols',0.44,0.44,0,0),
('pond_lily',1.9,1.45,0,0),
('pond_small',1.9,1.45,0,0),
('pool_small',2.7,2.1,0,0),
('rock_coast',0.7,0.7,0,0),
('sign_meplus',0.32,0.32,0,0),
('social_flag',0.32,0.32,0,0),
('social_house',2,1.7,0,0),
('streak_beach14',1.35,0.55,0,0),
('streak_house60',2,1.7,0,0),
('streak_legend100',0.65,0.65,0,0),
('streak_lights30',0.32,0.32,0,0),
('streak_palm7',0.58,0.58,0,0),
('stream_stones',2.8,0.95,0,0),
('training_house',1.8,1.6,0,0),
('tree_level5',0.62,0.62,0,0),
('tree_oak',0.62,0.62,0,0),
('tree_streak7',0.7,0.7,0,0),
('trophy_battle',0.65,0.65,0,0),
('trophy_bronze',0.65,0.65,0,0),
('trophy_champion',0.65,0.65,0,0),
('trophy_gold',0.65,0.65,0,0),
('trophy_silver',0.65,0.65,0,0),
('tropical_bush',0.85,0.78,0,0),
('waterfall_garden',3.5,2.8,0,0)
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

-- Existing worlds receive only the three formerly baked-in features, once.
-- Deliberately empty inventories/layouts are never refilled by opening a world.
insert into public.me_world_items(user_id,item_key,grid_x,grid_y,pos_x,pos_y)
select w.user_id,f.key,round(f.x),round(f.y),f.x,f.y from public.me_worlds w cross join(values('house_main',9.5,6.6),('pond_garden',15.2,10.7),('dock_wood',14.3,15.9)) f(key,x,y)
where not exists(select 1 from public.me_world_items i where i.user_id=w.user_id and i.item_key=f.key);

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
 insert into public.me_world_items(user_id,item_key,grid_x,grid_y,pos_x,pos_y)
 select p_user_id,f.key,round(f.x),round(f.y),f.x,f.y from(values('house_main',9.5,6.6),('pond_garden',15.2,10.7),('dock_wood',14.3,15.9))f(key,x,y)
 where not exists(select 1 from public.me_world_items i where i.user_id=p_user_id and i.item_key=f.key);
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

insert into public.me_knowledge_questions(article_id,question,options,correct_index,explanation) select id,'Wat krijgen mycorrhizaschimmels van planten in ruil voor hun hulp bij water en mineralen?','["Zuurstofrijke bloedcellen","Koolstofrijke suikers uit fotosynthese","Kleine stukjes boomschors","Warmte uit de boomstam"]'::jsonb,1,'Planten leveren suikers uit fotosynthese. De schimmeldraden helpen water en mineralen te bereiken.' from public.me_knowledge_articles where slug='bomen-netwerk' on conflict(article_id) do update set question=excluded.question,options=excluded.options,correct_index=excluded.correct_index,explanation=excluded.explanation;
insert into public.me_knowledge_questions(article_id,question,options,correct_index,explanation) select id,'Waarom groeiden veel oude steden bij rivieren en kruispunten van handelsroutes?','["Omdat daar nooit overstromingen voorkwamen","Omdat landbouw daar overbodig was","Omdat alle handelaren er dezelfde taal spraken","Omdat goederen en mensen er efficiënt konden samenkomen"]'::jsonb,3,'Goede verbindingen maakten transport, handel, opslag en ambachten aantrekkelijk.' from public.me_knowledge_articles where slug='cities-and-trade' on conflict(article_id) do update set question=excluded.question,options=excluded.options,correct_index=excluded.correct_index,explanation=excluded.explanation;
insert into public.me_knowledge_questions(article_id,question,options,correct_index,explanation) select id,'Waarom gingen plaatsen over van lokale zonnetijd naar standaardtijd?','["Om spoorwegen en communicatie over grotere gebieden te synchroniseren","Omdat de zon overal tegelijk opkwam","Omdat alle landen één regering kregen","Om de lengte van een dag te veranderen"]'::jsonb,0,'Dienstregelingen en snelle communicatie maakten veel verschillende lokale tijden onpraktisch.' from public.me_knowledge_articles where slug='culturele-tijdzones' on conflict(article_id) do update set question=excluded.question,options=excluded.options,correct_index=excluded.correct_index,explanation=excluded.explanation;
insert into public.me_knowledge_questions(article_id,question,options,correct_index,explanation) select id,'Wat bedoelt de tekst met het reconstructieve karakter van geheugen?','["Elke herinnering blijft een exacte video","Alleen emoties worden opgeslagen","Herinneringen worden opnieuw samengesteld en kunnen veranderen","Zelfvertrouwen bewijst dat een herinnering klopt"]'::jsonb,2,'Je brein combineert beelden, emoties, kennis en verwachtingen opnieuw. Nieuwe informatie kan herinneringen beïnvloeden.' from public.me_knowledge_articles where slug='geheugen-reconstructie' on conflict(article_id) do update set question=excluded.question,options=excluded.options,correct_index=excluded.correct_index,explanation=excluded.explanation;
insert into public.me_knowledge_questions(article_id,question,options,correct_index,explanation) select id,'Wat is een bruikbaar anker voor een nieuwe gewoonte?','["Wachten op veel motivatie","Nieuw gedrag koppelen aan iets dat al vanzelf gebeurt","Meteen de zwaarste versie van het gedrag kiezen","Iedere dag een ander startmoment zoeken"]'::jsonb,1,'Een bestaand moment, zoals na de lunch, vermindert de dagelijkse beslissing over wanneer je begint.' from public.me_knowledge_articles where slug='gewoonte-anker' on conflict(article_id) do update set question=excluded.question,options=excluded.options,correct_index=excluded.correct_index,explanation=excluded.explanation;
insert into public.me_knowledge_questions(article_id,question,options,correct_index,explanation) select id,'Waarom zijn in de praktijk minstens vier GPS-satellieten nuttig?','["Elke satelliet bestuurt één app","De vierde satelliet maakt de kaartfoto","Vier signalen zijn nodig om wifi aan te zetten","Je telefoon moet drie coördinaten én een klokfout bepalen"]'::jsonb,3,'Naast drie ruimtelijke coördinaten moet het toestel de kleine afwijking van zijn eigen klok oplossen.' from public.me_knowledge_articles where slug='gps-positioning' on conflict(article_id) do update set question=excluded.question,options=excluded.options,correct_index=excluded.correct_index,explanation=excluded.explanation;
insert into public.me_knowledge_questions(article_id,question,options,correct_index,explanation) select id,'Wat betekent het meestal als inflatie van acht naar drie procent daalt?','["Het gemiddelde prijsniveau stijgt nog, maar langzamer","Alle prijzen gaan terug naar hun oude niveau","Elk product wordt vijf procent goedkoper","Huishoudens ervaren voortaan dezelfde prijzen"]'::jsonb,0,'Lagere positieve inflatie betekent een tragere prijsstijging. Het is niet hetzelfde als een dalend prijsniveau.' from public.me_knowledge_articles where slug='inflatie-kern' on conflict(article_id) do update set question=excluded.question,options=excluded.options,correct_index=excluded.correct_index,explanation=excluded.explanation;
insert into public.me_knowledge_questions(article_id,question,options,correct_index,explanation) select id,'Welke taak hebben de twee kieuw-harten van een octopus?','["Ze maken het bloed rood","Ze sturen bloed rechtstreeks naar alle armen","Ze pompen bloed door de kieuwen voor zuurstofopname","Ze vervangen de kieuwen tijdens zwemmen"]'::jsonb,2,'De branchiale harten sturen bloed door de kieuwen. Het centrale hart pompt het zuurstofrijke bloed door het lichaam.' from public.me_knowledge_articles where slug='octopus-harten' on conflict(article_id) do update set question=excluded.question,options=excluded.options,correct_index=excluded.correct_index,explanation=excluded.explanation;
insert into public.me_knowledge_questions(article_id,question,options,correct_index,explanation) select id,'Welke combinatie helpt verklaren waarom de nachtelijke hemel donker is?','["Alle sterren doven tegelijk en de aarde staat stil","Het heelal heeft een eindige leeftijd en dijt uit","Het heelal is oneindig oud en krimpt","Sterren geven uitsluitend onzichtbaar licht"]'::jsonb,1,'Niet al het verre licht heeft ons bereikt. Door uitdijing wordt licht ook naar langere golflengten uitgerekt.' from public.me_knowledge_articles where slug='olbers-paradox-dark-night' on conflict(article_id) do update set question=excluded.question,options=excluded.options,correct_index=excluded.correct_index,explanation=excluded.explanation;
insert into public.me_knowledge_questions(article_id,question,options,correct_index,explanation) select id,'Waarom kan een heel kleine eerste stap helpen tegen uitstellen?','["Omdat plannen dan overbodig is","Omdat de hele taak vanzelf verdwijnt","Omdat je eerst maximale motivatie nodig hebt","Omdat de emotionele drempel om te beginnen lager wordt"]'::jsonb,3,'Een kleine, concrete start maakt een onzekere of onaangename taak minder overweldigend.' from public.me_knowledge_articles where slug='procrastination-emotion' on conflict(article_id) do update set question=excluded.question,options=excluded.options,correct_index=excluded.correct_index,explanation=excluded.explanation;
insert into public.me_knowledge_questions(article_id,question,options,correct_index,explanation) select id,'Hoe kan een scanner beschadigde informatie in een QR-code herstellen?','["Met extra, redundante informatie in de code","Door altijd het origineel van internet te downloaden","Door de drie grote vierkanten als tekst te lezen","Door ontbrekende vakjes willekeurig in te vullen"]'::jsonb,0,'Foutcorrectie gebruikt extra informatie om ontbrekende gegevens terug te rekenen. Niet iedere soort schade is herstelbaar.' from public.me_knowledge_articles where slug='qr-foutcorrectie' on conflict(article_id) do update set question=excluded.question,options=excluded.options,correct_index=excluded.correct_index,explanation=excluded.explanation;
insert into public.me_knowledge_questions(article_id,question,options,correct_index,explanation) select id,'Waardoor kunnen sommige kleine scheuren in Romeins beton gedeeltelijk worden gevuld?','["Stalen wapening groeit voortdurend aan","Elke scheur verdwijnt door zonlicht","Water reageert met kalkrijke delen en vormt nieuw materiaal","Romeins beton heeft nooit poriën"]'::jsonb,2,'Water kan reacties met kalkrijke deeltjes op gang brengen. Nieuw materiaal kan een kleine opening gedeeltelijk vullen.' from public.me_knowledge_articles where slug='rome-beton' on conflict(article_id) do update set question=excluded.question,options=excluded.options,correct_index=excluded.correct_index,explanation=excluded.explanation;
insert into public.me_knowledge_questions(article_id,question,options,correct_index,explanation) select id,'Hoe heet het proces waarbij nieuwe herinneringen tijdens slaap stabieler worden?','["Foutcorrectie","Consolidatie","Fotosynthese","Inflatie"]'::jsonb,1,'Consolidatie helpt nieuwe herinneringen te stabiliseren en aan bestaande kennis te koppelen.' from public.me_knowledge_articles where slug='slaap-geheugen' on conflict(article_id) do update set question=excluded.question,options=excluded.options,correct_index=excluded.correct_index,explanation=excluded.explanation;
insert into public.me_knowledge_questions(article_id,question,options,correct_index,explanation) select id,'Hoe kunnen walvissen indirect de groei van plankton ondersteunen?','["Door het zonlicht tegen te houden","Door alle koolstof uit zeewater te verwijderen","Door voedingsstoffen op één diepte vast te houden","Door voedingsstoffen tussen waterlagen te verplaatsen"]'::jsonb,3,'Walvissen eten en scheiden afvalstoffen vaak op verschillende diepten uit. Daardoor komen voedingsstoffen beschikbaar voor plankton.' from public.me_knowledge_articles where slug='whales-carbon-cycle' on conflict(article_id) do update set question=excluded.question,options=excluded.options,correct_index=excluded.correct_index,explanation=excluded.explanation;
insert into public.me_knowledge_questions(article_id,question,options,correct_index,explanation) select id,'Waarom kan een bedrijf een investering uitstellen wanneer rente stijgt?','["Duurdere financiering kan het project minder aantrekkelijk maken","Bestaande leningen verdwijnen dan","Hogere rente maakt investeringen altijd winstgevender","Rente beïnvloedt alleen spaargeld"]'::jsonb,0,'Bij duurder krediet kan een project te weinig opleveren ten opzichte van de financieringskosten.' from public.me_knowledge_articles where slug='why-interest-rates-matter' on conflict(article_id) do update set question=excluded.question,options=excluded.options,correct_index=excluded.correct_index,explanation=excluded.explanation;
insert into public.me_knowledge_questions(article_id,question,options,correct_index,explanation) select id,'Wat is een lichtjaar?','["De omlooptijd van de aarde rond de zon","De helderheid van een ster gedurende een jaar","De afstand die licht in één jaar aflegt","De leeftijd van het zonlicht dat vandaag aankomt"]'::jsonb,2,'Een lichtjaar is een afstandseenheid. Hoe verder een object wegstaat, hoe langer zijn licht onderweg is.' from public.me_knowledge_articles where slug='zonlicht-acht-minuten' on conflict(article_id) do update set question=excluded.question,options=excluded.options,correct_index=excluded.correct_index,explanation=excluded.explanation;

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
