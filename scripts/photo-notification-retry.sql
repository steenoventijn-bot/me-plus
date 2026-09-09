-- Drain only the photo outbox; the worker claims each notification and retries at most 3 times.
-- The secret is read on the server at execution time, never included in the schedule text.
select cron.schedule('me-photo-notifications','* * * * *',$job$
 select net.http_post(
  url:='https://npolnflektojripucyvq.supabase.co/functions/v1/me-plus-push-worker',
  headers:='{"Content-Type":"application/json"}'::jsonb,
  body:=jsonb_build_object('secret',(select value from public.me_server_config where key='push_worker_secret'),'activity',true),
  timeout_milliseconds:=10000
 );
$job$);
