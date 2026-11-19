drop trigger if exists jobs_guard_employer_publication on public.jobs;
drop function if exists public.guard_employer_job_publication();
drop function if exists public.employer_publish_job(uuid);

drop trigger if exists applications_validate_candidate_eligibility on public.applications;
drop function if exists public.validate_application_candidate_eligibility();

drop policy if exists applications_student_all on public.applications;
drop policy if exists applications_student_select on public.applications;
create policy applications_student_select on public.applications
  for select using (public.owns_student(student_id));

drop policy if exists applications_student_insert on public.applications;
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

drop policy if exists applications_student_withdraw on public.applications;

drop policy if exists applications_employer_read on public.applications;
create policy applications_employer_read on public.applications
  for select using (
    exists (
      select 1 from public.jobs j
      where j.id = job_id and public.owns_employer(j.employer_id)
    )
  );

drop policy if exists applications_employer_update on public.applications;

create or replace function public.can_access_application(target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.applications a
    join public.jobs j on j.id = a.job_id
    where a.id = target_id
      and (
        a.student_id = auth.uid()
        or (j.employer_id = auth.uid() and public.is_employer())
        or public.is_admin()
      )
  );
$$;

drop function if exists public.is_student();
