alter table public.job_matches
  add column if not exists career_target_score numeric,
  add column if not exists calculation_status text not null default 'pending',
  add column if not exists calculation_reason text,
  add column if not exists calculated_at timestamptz;

alter table public.job_matches
  drop constraint if exists job_matches_calculation_status_check;

alter table public.job_matches
  add constraint job_matches_calculation_status_check
  check (calculation_status in ('pending', 'completed', 'unavailable'));

alter table public.job_matches
  drop constraint if exists job_matches_career_target_score_check;

alter table public.job_matches
  add constraint job_matches_career_target_score_check
  check (career_target_score is null or career_target_score between 0 and 100);

update public.job_matches
set calculation_status = 'pending',
    calculation_reason = 'Match analysis needs to be recalculated from current profile and job data.',
    calculated_at = null
where calculated_at is null
  and calculation_status = 'completed';

create index if not exists idx_job_matches_calculation_status
  on public.job_matches(student_id, calculation_status);

create or replace function public.mark_student_job_matches_pending(target_student_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.job_matches
  set calculation_status = 'pending',
      calculation_reason = 'Candidate evidence changed. Match analysis will refresh when viewed.',
      calculated_at = null
  where student_id = target_student_id
    and (calculation_status <> 'pending' or calculated_at is not null);
$$;

create or replace function public.mark_job_matches_pending(target_job_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.job_matches
  set calculation_status = 'pending',
      calculation_reason = 'Job requirements changed. Match analysis will refresh when viewed.',
      calculated_at = null
  where job_id = target_job_id
    and (calculation_status <> 'pending' or calculated_at is not null);
$$;

create or replace function public.invalidate_employment_matches()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_id uuid;
  new_id uuid;
  old_parent_id uuid;
  new_parent_id uuid;
begin
  if tg_table_name = 'jobs' then
    if tg_op <> 'INSERT' then perform public.mark_job_matches_pending(old.id); end if;
    if tg_op <> 'DELETE' then perform public.mark_job_matches_pending(new.id); end if;
  elsif tg_table_name = 'job_skills' then
    if tg_op <> 'INSERT' then perform public.mark_job_matches_pending(old.job_id); end if;
    if tg_op <> 'DELETE' then perform public.mark_job_matches_pending(new.job_id); end if;
  elsif tg_table_name = 'employer_profiles' then
    if tg_op <> 'INSERT' then
      update public.job_matches matches
      set calculation_status = 'pending',
          calculation_reason = 'Employer or job context changed. Match analysis will refresh when viewed.',
          calculated_at = null
      from public.jobs jobs
      where jobs.employer_id = old.id
        and matches.job_id = jobs.id
        and (matches.calculation_status <> 'pending' or matches.calculated_at is not null);
    end if;
    if tg_op <> 'DELETE' then
      update public.job_matches matches
      set calculation_status = 'pending',
          calculation_reason = 'Employer or job context changed. Match analysis will refresh when viewed.',
          calculated_at = null
      from public.jobs jobs
      where jobs.employer_id = new.id
        and matches.job_id = jobs.id
        and (matches.calculation_status <> 'pending' or matches.calculated_at is not null);
    end if;
  elsif tg_table_name = 'student_profiles' then
    if tg_op <> 'INSERT' then perform public.mark_student_job_matches_pending(old.id); end if;
    if tg_op <> 'DELETE' then perform public.mark_student_job_matches_pending(new.id); end if;
  elsif tg_table_name = 'user_skills' then
    if tg_op <> 'INSERT' then perform public.mark_student_job_matches_pending(old.user_id); end if;
    if tg_op <> 'DELETE' then perform public.mark_student_job_matches_pending(new.user_id); end if;
  elsif tg_table_name in ('education', 'projects', 'certificates', 'portfolios', 'employment', 'assessment_results') then
    if tg_op <> 'INSERT' then perform public.mark_student_job_matches_pending(old.student_id); end if;
    if tg_op <> 'DELETE' then perform public.mark_student_job_matches_pending(new.student_id); end if;
  elsif tg_table_name = 'project_skills' then
    if tg_op <> 'INSERT' then
      select student_id into old_parent_id from public.projects where id = old.project_id;
      if old_parent_id is not null then perform public.mark_student_job_matches_pending(old_parent_id); end if;
    end if;
    if tg_op <> 'DELETE' then
      select student_id into new_parent_id from public.projects where id = new.project_id;
      if new_parent_id is not null then perform public.mark_student_job_matches_pending(new_parent_id); end if;
    end if;
  elsif tg_table_name = 'assessments' then
    if tg_op <> 'INSERT' then old_id := old.id; end if;
    if tg_op <> 'DELETE' then new_id := new.id; end if;
    for old_parent_id in
      select distinct student_id
      from public.assessment_results
      where assessment_id in (old_id, new_id)
    loop
      perform public.mark_student_job_matches_pending(old_parent_id);
    end loop;
  elsif tg_table_name = 'skills' then
    if tg_op <> 'INSERT' then old_id := old.id; end if;
    if tg_op <> 'DELETE' then new_id := new.id; end if;
    for old_parent_id in
      select distinct user_id from public.user_skills where skill_id in (old_id, new_id)
      union
      select distinct projects.student_id
      from public.project_skills
      join public.projects on projects.id = project_skills.project_id
      where project_skills.skill_id in (old_id, new_id)
    loop
      perform public.mark_student_job_matches_pending(old_parent_id);
    end loop;
    for old_parent_id in
      select distinct job_id from public.job_skills where skill_id in (old_id, new_id)
    loop
      perform public.mark_job_matches_pending(old_parent_id);
    end loop;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists jobs_invalidate_employment_matches on public.jobs;
create trigger jobs_invalidate_employment_matches
after update of title, description, status, employment_type, application_deadline,
  education_required, experience_required, employer_id
on public.jobs
for each row execute function public.invalidate_employment_matches();

drop trigger if exists job_skills_invalidate_employment_matches on public.job_skills;
create trigger job_skills_invalidate_employment_matches
after insert or update or delete on public.job_skills
for each row execute function public.invalidate_employment_matches();

drop trigger if exists employer_profiles_invalidate_employment_matches on public.employer_profiles;
create trigger employer_profiles_invalidate_employment_matches
after update of industry on public.employer_profiles
for each row execute function public.invalidate_employment_matches();

drop trigger if exists student_profiles_invalidate_employment_matches on public.student_profiles;
create trigger student_profiles_invalidate_employment_matches
after update of target_role, career_goal, years_experience, education_level
on public.student_profiles
for each row execute function public.invalidate_employment_matches();

drop trigger if exists user_skills_invalidate_employment_matches on public.user_skills;
create trigger user_skills_invalidate_employment_matches
after insert or update or delete on public.user_skills
for each row execute function public.invalidate_employment_matches();

drop trigger if exists education_invalidate_employment_matches on public.education;
create trigger education_invalidate_employment_matches
after insert or update or delete on public.education
for each row execute function public.invalidate_employment_matches();

drop trigger if exists projects_invalidate_employment_matches on public.projects;
create trigger projects_invalidate_employment_matches
after insert or update or delete on public.projects
for each row execute function public.invalidate_employment_matches();

drop trigger if exists project_skills_invalidate_employment_matches on public.project_skills;
create trigger project_skills_invalidate_employment_matches
after insert or update or delete on public.project_skills
for each row execute function public.invalidate_employment_matches();

drop trigger if exists certificates_invalidate_employment_matches on public.certificates;
create trigger certificates_invalidate_employment_matches
after insert or update or delete on public.certificates
for each row execute function public.invalidate_employment_matches();

drop trigger if exists portfolios_invalidate_employment_matches on public.portfolios;
create trigger portfolios_invalidate_employment_matches
after insert or update or delete on public.portfolios
for each row execute function public.invalidate_employment_matches();

drop trigger if exists employment_invalidate_employment_matches on public.employment;
create trigger employment_invalidate_employment_matches
after insert or update or delete on public.employment
for each row execute function public.invalidate_employment_matches();

drop trigger if exists assessment_results_invalidate_employment_matches on public.assessment_results;
create trigger assessment_results_invalidate_employment_matches
after insert or update or delete on public.assessment_results
for each row execute function public.invalidate_employment_matches();

drop trigger if exists assessments_invalidate_employment_matches on public.assessments;
create trigger assessments_invalidate_employment_matches
after update of title, job_id, skill_id on public.assessments
for each row execute function public.invalidate_employment_matches();

drop trigger if exists skills_invalidate_employment_matches on public.skills;
create trigger skills_invalidate_employment_matches
after update of name, category, status, approval_status, is_internal on public.skills
for each row execute function public.invalidate_employment_matches();

revoke all on function public.mark_student_job_matches_pending(uuid) from public, anon, authenticated;
revoke all on function public.mark_job_matches_pending(uuid) from public, anon, authenticated;
revoke all on function public.invalidate_employment_matches() from public, anon, authenticated;
