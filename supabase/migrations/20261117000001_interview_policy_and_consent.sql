create table if not exists public.interview_policy_reports (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references public.interviews(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in (
    'discriminatory',
    'invasive_or_private',
    'unsafe_or_unprofessional',
    'other'
  )),
  details text check (details is null or char_length(details) <= 2000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 2000),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interview_policy_reports_one_per_reporter unique (interview_id, reporter_id)
);

create index if not exists interview_policy_reports_status_created_idx
  on public.interview_policy_reports(status, created_at desc);

alter table public.interview_policy_reports enable row level security;
revoke all on public.interview_policy_reports from public, anon, authenticated;
grant select on public.interview_policy_reports to authenticated;

create policy interview_policy_reports_reporter_read
  on public.interview_policy_reports for select
  using (reporter_id = auth.uid());
create policy interview_policy_reports_admin_read
  on public.interview_policy_reports for select
  using (public.is_admin());

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
  target_application public.applications;
  target_employer_id uuid;
  created_interview public.interviews;
begin
  select a.*
  into target_application
  from public.applications a
  join public.jobs j on j.id = a.job_id
  where a.id = p_application_id
  for update of a, j;

  if not found then
    raise exception 'Application is not owned by this employer';
  end if;
  select j.employer_id into target_employer_id
  from public.jobs j
  join public.applications a on a.job_id = j.id
  where a.id = p_application_id;

  if not public.owns_employer(target_employer_id) then
    raise exception 'Application is not owned by this employer';
  end if;
  if target_application.status not in ('applied', 'under_review', 'shortlisted', 'assessment', 'interview') then
    raise exception 'An interview cannot be scheduled at this application stage';
  end if;
  if p_scheduled_at is null or p_scheduled_at <= now() then
    raise exception 'Interview time must be in the future';
  end if;
  if p_duration_minutes is null or p_duration_minutes < 5 or p_duration_minutes > 480 then
    raise exception 'Interview duration must be between 5 minutes and 8 hours';
  end if;
  if p_meeting_url is not null and (
    char_length(btrim(p_meeting_url)) > 2048
    or btrim(p_meeting_url) !~* '^https://[^/?#[:space:]]+([/?#][^[:space:]]*)?$'
    or btrim(p_meeting_url) ~* '^https://[^/]*@'
  ) then
    raise exception 'Meeting link must be a valid HTTPS URL without embedded credentials';
  end if;
  if p_notes is not null and char_length(p_notes) > 4000 then
    raise exception 'Interview notes must be 4,000 characters or fewer';
  end if;
  if p_location is not null and char_length(p_location) > 500 then
    raise exception 'Interview location must be 500 characters or fewer';
  end if;

  if target_application.status <> 'interview' then
    perform set_config('app.skip_status_notification', 'on', true);
    update public.applications
    set status = 'interview'
    where id = p_application_id;
  end if;

  insert into public.interviews (
    application_id, scheduled_at, duration_minutes, location, meeting_url,
    interview_type, notes, created_by
  )
  values (
    p_application_id, p_scheduled_at, p_duration_minutes, nullif(btrim(p_location), ''),
    nullif(btrim(p_meeting_url), ''), p_interview_type, nullif(btrim(p_notes), ''), auth.uid()
  )
  returning * into created_interview;

  insert into public.application_events (
    application_id, event_type, title, description, created_by
  )
  values (
    p_application_id,
    'interview_scheduled',
    'Interview scheduled',
    'An interview was scheduled for ' || to_char(p_scheduled_at, 'YYYY-MM-DD HH24:MI TZ'),
    auth.uid()
  );

  insert into public.notifications (
    user_id, title, message, notification_type, related_entity_type, related_entity_id
  )
  values (
    target_application.student_id,
    'Interview scheduled',
    'An employer scheduled an interview for your application. Review the date and time zone in SkillBridge.',
    'interview_reminder',
    'interview',
    created_interview.id
  );

  return created_interview;
end;
$$;

create or replace function public.employer_update_interview(
  p_interview_id uuid,
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
  target_interview public.interviews;
  target_application public.applications;
  updated_interview public.interviews;
  changed_time boolean;
begin
  select i.*
  into target_interview
  from public.interviews i
  join public.applications a on a.id = i.application_id
  join public.jobs j on j.id = a.job_id
  where i.id = p_interview_id
    and public.owns_employer(j.employer_id)
  for update of i, a, j;

  if not found then
    raise exception 'Interview is not owned by this employer';
  end if;
  select a.*
  into target_application
  from public.applications a
  where a.id = target_interview.application_id;

  if target_interview.status not in ('scheduled', 'rescheduled') then
    raise exception 'Only scheduled interviews can be updated';
  end if;
  if target_application.status <> 'interview' then
    raise exception 'The application is no longer at the interview stage';
  end if;
  if p_scheduled_at is null or p_scheduled_at <= now() then
    raise exception 'Interview time must be in the future';
  end if;
  if p_duration_minutes is null or p_duration_minutes < 5 or p_duration_minutes > 480 then
    raise exception 'Interview duration must be between 5 minutes and 8 hours';
  end if;
  if p_meeting_url is not null and (
    char_length(btrim(p_meeting_url)) > 2048
    or btrim(p_meeting_url) !~* '^https://[^/?#[:space:]]+([/?#][^[:space:]]*)?$'
    or btrim(p_meeting_url) ~* '^https://[^/]*@'
  ) then
    raise exception 'Meeting link must be a valid HTTPS URL without embedded credentials';
  end if;
  if p_notes is not null and char_length(p_notes) > 4000 then
    raise exception 'Interview notes must be 4,000 characters or fewer';
  end if;
  if p_location is not null and char_length(p_location) > 500 then
    raise exception 'Interview location must be 500 characters or fewer';
  end if;

  changed_time := target_interview.scheduled_at is distinct from p_scheduled_at;
  update public.interviews
  set scheduled_at = p_scheduled_at,
      duration_minutes = p_duration_minutes,
      location = nullif(btrim(p_location), ''),
      meeting_url = nullif(btrim(p_meeting_url), ''),
      interview_type = p_interview_type,
      notes = nullif(btrim(p_notes), ''),
      status = case when changed_time then 'rescheduled' else status end,
      updated_at = now()
  where id = p_interview_id
  returning * into updated_interview;

  insert into public.application_events (
    application_id, event_type, title, description, created_by
  )
  values (
    target_interview.application_id,
    case when changed_time then 'interview_rescheduled' else 'interview_updated' end,
    case when changed_time then 'Interview rescheduled' else 'Interview details updated' end,
    'Interview details were updated for ' || to_char(p_scheduled_at, 'YYYY-MM-DD HH24:MI TZ'),
    auth.uid()
  );

  insert into public.notifications (
    user_id, title, message, notification_type, related_entity_type, related_entity_id
  )
  values (
    target_application.student_id,
    case when changed_time then 'Interview rescheduled' else 'Interview details updated' end,
    'An employer updated your interview details. Review the current date, time zone, meeting link, and notes in SkillBridge.',
    'interview_reminder',
    'interview',
    updated_interview.id
  );

  return updated_interview;
end;
$$;

create or replace function public.submit_interview_policy_report(
  p_interview_id uuid,
  p_category text,
  p_details text default null
)
returns public.interview_policy_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_report public.interview_policy_reports;
begin
  if auth.uid() is null then
    raise exception 'Sign in before reporting interview instructions';
  end if;
  if p_category is null or p_category not in ('discriminatory', 'invasive_or_private', 'unsafe_or_unprofessional', 'other') then
    raise exception 'Choose a valid interview report category';
  end if;
  if p_details is not null and char_length(btrim(p_details)) > 2000 then
    raise exception 'Report details must be 2,000 characters or fewer';
  end if;
  if not exists (
    select 1
    from public.interviews i
    join public.applications a on a.id = i.application_id
    where i.id = p_interview_id and a.student_id = auth.uid()
  ) then
    raise exception 'You can only report an interview connected to your application';
  end if;

  insert into public.interview_policy_reports (
    interview_id, reporter_id, category, details, status, resolution_note, reviewed_by, reviewed_at, updated_at
  )
  values (
    p_interview_id, auth.uid(), p_category, nullif(btrim(p_details), ''),
    'open', null, null, null, now()
  )
  on conflict (interview_id, reporter_id) do update
  set category = excluded.category,
      details = excluded.details,
      status = 'open',
      resolution_note = null,
      reviewed_by = null,
      reviewed_at = null,
      updated_at = now()
  returning * into saved_report;

  return saved_report;
end;
$$;

create or replace function public.admin_review_interview_policy_report(
  p_report_id uuid,
  p_status text,
  p_resolution_note text default null
)
returns public.interview_policy_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_report public.interview_policy_reports;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only an administrator can review interview reports';
  end if;
  if p_status is null or p_status not in ('reviewing', 'resolved', 'dismissed') then
    raise exception 'Choose a valid interview report status';
  end if;
  if p_resolution_note is not null and char_length(btrim(p_resolution_note)) > 2000 then
    raise exception 'Review notes must be 2,000 characters or fewer';
  end if;

  update public.interview_policy_reports
  set status = p_status,
      resolution_note = nullif(btrim(p_resolution_note), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = p_report_id and status in ('open', 'reviewing')
  returning * into updated_report;

  if not found then
    raise exception 'Interview report was not found or is already closed';
  end if;
  return updated_report;
end;
$$;

revoke all on function public.employer_schedule_interview(uuid, timestamptz, integer, text, text, text, text) from public, anon, authenticated;
grant execute on function public.employer_schedule_interview(uuid, timestamptz, integer, text, text, text, text) to authenticated;
revoke all on function public.employer_update_interview(uuid, timestamptz, integer, text, text, text, text) from public, anon, authenticated;
grant execute on function public.employer_update_interview(uuid, timestamptz, integer, text, text, text, text) to authenticated;
revoke all on function public.submit_interview_policy_report(uuid, text, text) from public, anon, authenticated;
grant execute on function public.submit_interview_policy_report(uuid, text, text) to authenticated;
revoke all on function public.admin_review_interview_policy_report(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_review_interview_policy_report(uuid, text, text) to authenticated;
