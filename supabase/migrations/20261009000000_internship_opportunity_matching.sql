-- Extend the existing jobs model for internships and practical placements.
alter table public.jobs
  add column if not exists opportunity_type text,
  add column if not exists eligible_programmes text[] not null default '{}',
  add column if not exists min_study_year integer,
  add column if not exists max_study_year integer,
  add column if not exists placement_start_date date,
  add column if not exists placement_end_date date,
  add column if not exists duration_weeks integer,
  add column if not exists positions_available integer,
  add column if not exists responsibilities text,
  add column if not exists learning_objectives text,
  add column if not exists required_documents text[] not null default '{}',
  add column if not exists application_instructions text;

alter table public.jobs
  drop constraint if exists jobs_opportunity_type_check,
  add constraint jobs_opportunity_type_check check (
    opportunity_type is null or opportunity_type in (
      'industrial_attachment',
      'internship',
      'graduate_internship',
      'work_experience',
      'apprenticeship',
      'traineeship',
      'other'
    )
  ),
  drop constraint if exists jobs_study_year_range_check,
  add constraint jobs_study_year_range_check check (
    (min_study_year is null or min_study_year > 0)
    and (max_study_year is null or max_study_year > 0)
    and (min_study_year is null or max_study_year is null or min_study_year <= max_study_year)
  ),
  drop constraint if exists jobs_placement_date_range_check,
  add constraint jobs_placement_date_range_check check (
    placement_start_date is null or placement_end_date is null or placement_start_date <= placement_end_date
  ),
  drop constraint if exists jobs_duration_weeks_check,
  add constraint jobs_duration_weeks_check check (duration_weeks is null or duration_weeks > 0),
  drop constraint if exists jobs_positions_available_check,
  add constraint jobs_positions_available_check check (positions_available is null or positions_available > 0);

alter table public.job_skills
  add column if not exists is_required boolean not null default true;

alter table public.applications
  add column if not exists submitted_documents jsonb not null default '[]'::jsonb;

alter table public.student_profiles
  add column if not exists current_year_of_study integer,
  add column if not exists preferred_location text,
  add column if not exists available_from date,
  add column if not exists available_to date;

alter table public.student_profiles
  drop constraint if exists student_profiles_current_year_check,
  add constraint student_profiles_current_year_check check (current_year_of_study is null or current_year_of_study between 1 and 20),
  drop constraint if exists student_profiles_availability_range_check,
  add constraint student_profiles_availability_range_check check (
    available_from is null or available_to is null or available_from <= available_to
  );

create index if not exists idx_jobs_opportunity_type on public.jobs(opportunity_type);
create index if not exists idx_jobs_eligible_programmes on public.jobs using gin(eligible_programmes);
create index if not exists idx_jobs_placement_dates on public.jobs(placement_start_date, placement_end_date);

create or replace function public.internship_documents_complete(p_job_id uuid, p_documents jsonb)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.jobs j
    cross join lateral unnest(coalesce(j.required_documents, '{}'::text[])) required_document(name)
    where j.id = p_job_id
      and not exists (
        select 1
        from jsonb_array_elements(
          case when jsonb_typeof(p_documents) = 'array' then p_documents else '[]'::jsonb end
        ) as submitted_document(value)
        where lower(trim(submitted_document.value->>'name')) = lower(trim(required_document.name))
          and coalesce(submitted_document.value->>'url', '') ~ '^https://[^/[:space:]]+'
      )
  );
$$;

create or replace function public.submit_internship_application(
  p_job_id uuid,
  p_cover_letter text default null,
  p_documents jsonb default '[]'::jsonb
)
returns public.applications
language plpgsql
security definer
set search_path = public
as $$
declare
  current_job public.jobs;
  created_application public.applications;
  applicant_id uuid := auth.uid();
  required_document text;
  applicant_profile public.student_profiles;
begin
  if applicant_id is null or not exists (
    select 1 from public.profiles where id = applicant_id and role = 'student'
  ) then
    raise exception 'Only signed-in students can apply to placements.';
  end if;

  if jsonb_typeof(p_documents) is distinct from 'array' then
    raise exception 'Application documents must be a list of secure HTTPS links.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_documents) as document(value)
    where coalesce(document.value->>'name', '') = ''
      or coalesce(document.value->>'url', '') !~ '^https://[^/[:space:]]+'
  ) then
    raise exception 'Each submitted document must have a name and a secure HTTPS link.';
  end if;

  select * into current_job
  from public.jobs
  where id = p_job_id
    and status = 'published'
    and employment_type in ('internship', 'graduate', 'temporary', 'part_time', 'volunteer')
    and (application_deadline is null or application_deadline >= current_date);

  if current_job.id is null then
    raise exception 'This placement is closed, expired, or unavailable.';
  end if;

  select * into applicant_profile from public.student_profiles where id = applicant_id;
  if cardinality(current_job.eligible_programmes) > 0 then
    if coalesce(trim(applicant_profile.programme), '') = '' then
      raise exception 'Add your academic programme to your profile before applying.';
    end if;
    if not exists (
      select 1 from unnest(current_job.eligible_programmes) programme
      where lower(trim(programme)) = lower(trim(applicant_profile.programme))
    ) then
      raise exception 'Your recorded academic programme does not meet this placement requirement.';
    end if;
  end if;

  if current_job.min_study_year is not null or current_job.max_study_year is not null then
    if applicant_profile.current_year_of_study is null then
      raise exception 'Add your current year of study to your profile before applying.';
    end if;
    if (current_job.min_study_year is not null and applicant_profile.current_year_of_study < current_job.min_study_year)
      or (current_job.max_study_year is not null and applicant_profile.current_year_of_study > current_job.max_study_year) then
      raise exception 'Your current year of study does not meet this placement requirement.';
    end if;
  end if;

  if current_job.education_required is not null and applicant_profile.education_level is null then
    raise exception 'Add your education level to your profile before applying.';
  end if;

  if current_job.education_required is not null then
    if lower(trim(applicant_profile.education_level)) not like '%' || lower(trim(current_job.education_required)) || '%'
      and lower(trim(current_job.education_required)) not like '%' || lower(trim(applicant_profile.education_level)) || '%' then
      raise exception 'Your recorded education level does not meet this placement requirement.';
    end if;
  end if;

  if exists (
    select 1
    from public.job_skills required_skill
    where required_skill.job_id = p_job_id
      and required_skill.is_required
      and not exists (
        select 1 from public.user_skills candidate_skill
        where candidate_skill.user_id = applicant_id
          and candidate_skill.skill_id = required_skill.skill_id
      )
  ) then
    raise exception 'Your profile does not include all the skills required for this placement.';
  end if;

  foreach required_document in array coalesce(current_job.required_documents, '{}'::text[]) loop
    if not exists (
      select 1 from jsonb_array_elements(p_documents) as document(value)
      where lower(trim(document.value->>'name')) = lower(trim(required_document))
    ) then
      raise exception 'Please provide the required document: %.', required_document;
    end if;
  end loop;

  if exists (
    select 1 from public.applications
    where student_id = applicant_id and job_id = p_job_id
  ) then
    raise exception 'You already have an application for this placement.';
  end if;

  insert into public.applications (student_id, job_id, status, cover_letter, submitted_documents, applied_at, updated_at)
  values (
    applicant_id,
    p_job_id,
    'applied',
    nullif(trim(p_cover_letter), ''),
    p_documents,
    now(),
    now()
  )
  returning * into created_application;

  insert into public.application_events (application_id, event_type, title, description, created_by)
  values (created_application.id, 'applied', 'Application submitted', 'Your placement application was submitted successfully.', applicant_id);

  insert into public.notifications (user_id, title, message, notification_type, related_entity_type, related_entity_id)
  values (
    applicant_id,
    'Application submitted',
    'Your application for ' || current_job.title || ' was submitted successfully.',
    'application_update',
    'application',
    created_application.id
  );

  insert into public.notifications (user_id, title, message, notification_type, related_entity_type, related_entity_id)
  values (
    current_job.employer_id,
    'New placement application',
    'A student applied for ' || current_job.title || '.',
    'application_update',
    'application',
    created_application.id
  );

  return created_application;
end;
$$;

drop policy if exists applications_student_all on public.applications;
create policy applications_student_select on public.applications
  for select using (public.owns_student(student_id));
create policy applications_student_insert on public.applications
  for insert with check (
    public.owns_student(student_id)
    and status = 'applied'
    and not exists (
      select 1 from public.jobs j
      where j.id = job_id and (
        j.opportunity_type is not null
        or j.employment_type in ('internship', 'graduate', 'temporary', 'part_time', 'volunteer')
      )
    )
  );
create policy applications_student_withdraw on public.applications
  for update
  using (public.owns_student(student_id) and status in ('saved', 'interested', 'preparing', 'applied'))
  with check (public.owns_student(student_id) and status = 'withdrawn');

revoke all on function public.internship_documents_complete(uuid, jsonb) from public;
revoke all on function public.submit_internship_application(uuid, text, jsonb) from public;
grant execute on function public.internship_documents_complete(uuid, jsonb) to authenticated;
grant execute on function public.submit_internship_application(uuid, text, jsonb) to authenticated;
