create or replace function public.employer_update_application(
  p_application_id uuid,
  p_status text,
  p_note text default null
)
returns public.applications
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_application public.applications;
  candidate_id uuid;
  job_title text;
begin
  if not exists (
    select 1
    from public.applications a
    join public.jobs j on j.id = a.job_id
    where a.id = p_application_id
      and j.employer_id = auth.uid()
  ) then
    raise exception 'Application is not owned by this employer';
  end if;

  update public.applications
  set status = p_status, updated_at = now()
  where id = p_application_id
  returning * into updated_application;

  select a.student_id, j.title
  into candidate_id, job_title
  from public.applications a
  join public.jobs j on j.id = a.job_id
  where a.id = p_application_id;

  insert into public.application_events (
    application_id, event_type, title, description, created_by
  )
  values (
    p_application_id,
    p_status,
    initcap(replace(p_status, '_', ' ')),
    p_note,
    auth.uid()
  );

  insert into public.notifications (
    user_id, title, message, notification_type, related_entity_type, related_entity_id
  )
  values (
    candidate_id,
    'Application update',
    'Your application for ' || job_title || ' moved to ' || replace(p_status, '_', ' ') || '.',
    'application_update',
    'application',
    p_application_id
  );

  return updated_application;
end;
$$;

revoke all on function public.employer_update_application(uuid, text, text) from public;
grant execute on function public.employer_update_application(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
