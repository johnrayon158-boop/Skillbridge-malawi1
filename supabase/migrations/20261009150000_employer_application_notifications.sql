create or replace function public.notify_employer_of_new_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_job public.jobs;
begin
  select * into target_job
  from public.jobs
  where id = new.job_id;

  if target_job.employment_type in ('full_time', 'contract') then
    insert into public.notifications (
      user_id,
      title,
      message,
      notification_type,
      related_entity_type,
      related_entity_id
    )
    values (
      target_job.employer_id,
      'New application received',
      'A candidate applied for ' || target_job.title || '. Review the application to continue your hiring process.',
      'application_update',
      'application',
      new.id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists applications_notify_employer on public.applications;
create trigger applications_notify_employer
after insert on public.applications
for each row execute function public.notify_employer_of_new_application();

notify pgrst, 'reload schema';
