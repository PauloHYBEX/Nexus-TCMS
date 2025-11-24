-- Activity Logs retention and cron job (14 days)
-- Enable pg_cron (Supabase uses the extensions schema)
create extension if not exists pg_cron with schema extensions;

-- Function to purge activity_logs older than 14 days
create or replace function public.purge_old_activity_logs()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.activity_logs
  where created_at < (now() - interval '14 days');
end;
$$;

-- Schedule daily purge at 03:00 UTC
-- Note: In Supabase, cron.schedule creates a job owned by postgres (superuser)
-- If the job already exists, this will create another entry; manage via cron.job if needed.
select
  cron.schedule(
    'purge_activity_logs_daily',          -- job name
    '0 3 * * *',                          -- every day at 03:00
    $$select public.purge_old_activity_logs();$$
  );
