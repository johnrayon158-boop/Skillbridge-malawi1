-- SkillBridge Malawi Step 5: employer candidate visibility and audited workflows.

-- Employers may view only recruitment-relevant records for candidates who applied to their jobs.
create policy employer_candidate_profile_read on public.profiles for select using (
  exists (select 1 from public.applications a join public.jobs j on j.id = a.job_id where a.student_id = profiles.id and j.employer_id = auth.uid())
);

create policy employer_candidate_student_profile_read on public.student_profiles for select using (
  exists (select 1 from public.applications a join public.jobs j on j.id = a.job_id where a.student_id = student_profiles.id and j.employer_id = auth.uid())
);

create policy employer_candidate_education_read on public.education for select using (
  exists (select 1 from public.applications a join public.jobs j on j.id = a.job_id where a.student_id = education.student_id and j.employer_id = auth.uid())
);

create policy employer_candidate_skills_read on public.user_skills for select using (
  exists (select 1 from public.applications a join public.jobs j on j.id = a.job_id where a.student_id = user_skills.user_id and j.employer_id = auth.uid())
);

create policy employer_candidate_evidence_read on public.skill_evidence for select using (
  exists (select 1 from public.user_skills us join public.applications a on a.student_id = us.user_id join public.jobs j on j.id = a.job_id where us.id = skill_evidence.user_skill_id and j.employer_id = auth.uid())
);

create policy employer_candidate_projects_read on public.projects for select using (
  exists (select 1 from public.applications a join public.jobs j on j.id = a.job_id where a.student_id = projects.student_id and j.employer_id = auth.uid())
);

create policy employer_candidate_certificates_read on public.certificates for select using (
  exists (select 1 from public.applications a join public.jobs j on j.id = a.job_id where a.student_id = certificates.student_id and j.employer_id = auth.uid())
);

create policy employer_candidate_portfolio_read on public.portfolios for select using (
  exists (select 1 from public.applications a join public.jobs j on j.id = a.job_id where a.student_id = portfolios.student_id and j.employer_id = auth.uid())
);

create policy employer_candidate_results_read on public.assessment_results for select using (
  exists (select 1 from public.applications a join public.jobs j on j.id = a.job_id where a.student_id = assessment_results.student_id and j.employer_id = auth.uid())
);

create policy employer_candidate_matches_read on public.job_matches for select using (
  exists (select 1 from public.jobs j where j.id = job_matches.job_id and j.employer_id = auth.uid())
);

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
  if not exists (select 1 from public.applications a join public.jobs j on j.id = a.job_id where a.id = p_application_id and j.employer_id = auth.uid()) then
    raise exception 'Application is not owned by this employer';
  end if;

  update public.applications set status = p_status, updated_at = now() where id = p_application_id returning * into updated_application;
  select a.student_id, j.title into candidate_id, job_title from public.applications a join public.jobs j on j.id = a.job_id where a.id = p_application_id;

  insert into public.application_events (application_id, event_type, title, description, created_by)
  values (p_application_id, p_status, initcap(replace(p_status, '_', ' ')), p_note, auth.uid());

  insert into public.notifications (user_id, title, message, notification_type, related_entity_type, related_entity_id)
  values (candidate_id, 'Application update', 'Your application for ' || job_title || ' moved to ' || replace(p_status, '_', ' ') || '.', 'application_update', 'application', p_application_id);

  return updated_application;
end;
$$;

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
  if not exists (select 1 from public.applications a join public.jobs j on j.id = a.job_id where a.id = p_application_id and j.employer_id = auth.uid()) then
    raise exception 'Application is not owned by this employer';
  end if;

  insert into public.interviews (application_id, scheduled_at, duration_minutes, location, meeting_url, interview_type, notes, created_by)
  values (p_application_id, p_scheduled_at, p_duration_minutes, p_location, p_meeting_url, p_interview_type, p_notes, auth.uid())
  returning * into created_interview;

  select student_id into candidate_id from public.applications where id = p_application_id;
  insert into public.notifications (user_id, title, message, notification_type, related_entity_type, related_entity_id)
  values (candidate_id, 'Interview scheduled', 'An employer scheduled an interview for your application.', 'interview_reminder', 'interview', created_interview.id);
  return created_interview;
end;
$$;

create or replace function public.employer_create_offer(
  p_application_id uuid,
  p_salary numeric,
  p_currency text,
  p_start_date date,
  p_expiry_date date,
  p_notes text
)
returns public.offers
language plpgsql
security definer
set search_path = public
as $$
declare
  created_offer public.offers;
  candidate_id uuid;
begin
  if not exists (select 1 from public.applications a join public.jobs j on j.id = a.job_id where a.id = p_application_id and j.employer_id = auth.uid()) then
    raise exception 'Application is not owned by this employer';
  end if;

  insert into public.offers (application_id, salary, currency, start_date, expiry_date, notes)
  values (p_application_id, p_salary, p_currency, p_start_date, p_expiry_date, p_notes)
  returning * into created_offer;

  update public.applications set status = 'offer', updated_at = now() where id = p_application_id;
  insert into public.application_events (application_id, event_type, title, description, created_by)
  values (p_application_id, 'offer', 'Offer made', p_notes, auth.uid());
  select student_id into candidate_id from public.applications where id = p_application_id;
  insert into public.notifications (user_id, title, message, notification_type, related_entity_type, related_entity_id)
  values (candidate_id, 'New offer', 'You have received an employment offer.', 'application_update', 'offer', created_offer.id);
  return created_offer;
end;
$$;

revoke all on function public.employer_update_application(uuid, text, text) from public;
revoke all on function public.employer_schedule_interview(uuid, timestamptz, integer, text, text, text, text) from public;
revoke all on function public.employer_create_offer(uuid, numeric, text, date, date, text) from public;
grant execute on function public.employer_update_application(uuid, text, text) to authenticated;
grant execute on function public.employer_schedule_interview(uuid, timestamptz, integer, text, text, text, text) to authenticated;
grant execute on function public.employer_create_offer(uuid, numeric, text, date, date, text) to authenticated;
