create or replace function public.employer_schedule_interview(
  p_application_id uuid,
  p_scheduled_at timestamptz,
  p_duration_minutes integer,
  p_location text,
  p_meeting_url text,
  p_interview_type text,
  p_notes text
)
returns public.interviews
language plpgsql
security definer
set search_path = public
as $$
declare
  created_interview public.interviews;
  candidate_id uuid;
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

  insert into public.interviews (
    application_id,
    scheduled_at,
    duration_minutes,
    location,
    meeting_url,
    interview_type,
    notes,
    created_by
  )
  values (
    p_application_id,
    p_scheduled_at,
    p_duration_minutes,
    p_location,
    p_meeting_url,
    p_interview_type,
    p_notes,
    auth.uid()
  )
  returning * into created_interview;

  select student_id
  into candidate_id
  from public.applications
  where id = p_application_id;

  insert into public.notifications (
    user_id,
    title,
    message,
    notification_type,
    related_entity_type,
    related_entity_id
  )
  values (
    candidate_id,
    'Interview scheduled',
    'An employer scheduled an interview for your application.',
    'interview_reminder',
    'interview',
    created_interview.id
  );

  return created_interview;
end;
$$;

revoke all on function public.employer_schedule_interview(uuid, timestamptz, integer, text, text, text, text) from public;
grant execute on function public.employer_schedule_interview(uuid, timestamptz, integer, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
