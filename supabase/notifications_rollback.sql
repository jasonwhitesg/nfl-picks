-- Undo supabase/notifications.sql (removes phone notifications completely).
begin;
select cron.unschedule('send-notifications') where exists (select 1 from cron.job where jobname = 'send-notifications');
delete from vault.secrets where name = 'notify_secret';
drop function if exists public.pending_notifications();
drop function if exists public.check_notify_secret(text);
drop table if exists public.notification_log;
drop table if exists public.push_subscriptions;
commit;
