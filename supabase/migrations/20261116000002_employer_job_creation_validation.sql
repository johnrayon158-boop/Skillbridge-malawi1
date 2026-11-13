do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'jobs_title_nonempty'
      and conrelid = 'public.jobs'::regclass
  ) then
    alter table public.jobs
      add constraint jobs_title_nonempty
      check (title ~ '[^[:space:]]') not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'jobs_description_nonempty'
      and conrelid = 'public.jobs'::regclass
  ) then
    alter table public.jobs
      add constraint jobs_description_nonempty
      check (description ~ '[^[:space:]]') not valid;
  end if;
end
$$;

create or replace function public.validate_published_job_requirements()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.status = 'published' then
    if tg_op = 'INSERT' or old.status is distinct from 'published' then
      if not exists (
        select 1
        from public.job_skills js
        join public.skills s on s.id = js.skill_id
        where js.job_id = new.id
          and js.is_required
          and s.status = 'active'
          and s.approval_status = 'approved'
          and not s.is_internal
      ) then
        raise exception 'Add at least one approved required skill before publishing this job.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.preserve_published_job_required_skill()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  affected_job_id uuid;
  affected_job_status text;
  removes_last_required boolean := false;
begin
  affected_job_id := old.job_id;
  if tg_op = 'DELETE' then
    removes_last_required := old.is_required;
  elsif tg_op = 'UPDATE' then
    removes_last_required := old.is_required
      and (new.job_id is distinct from old.job_id or not new.is_required);
  end if;

  select j.status into affected_job_status
  from public.jobs j
  where j.id = affected_job_id
  for update;

  if removes_last_required
    and affected_job_status = 'published'
    and not exists (
      select 1
      from public.job_skills js
      join public.skills s on s.id = js.skill_id
      where js.job_id = affected_job_id
        and js.id <> old.id
        and js.is_required
        and s.status = 'active'
        and s.approval_status = 'approved'
        and not s.is_internal
    )
  then
    raise exception 'A published job must retain at least one approved required skill.';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists jobs_validate_published_requirements on public.jobs;
create trigger jobs_validate_published_requirements
before insert or update on public.jobs
for each row execute function public.validate_published_job_requirements();

drop trigger if exists job_skills_preserve_published_requirement on public.job_skills;
create trigger job_skills_preserve_published_requirement
before delete or update of job_id, skill_id, is_required on public.job_skills
for each row execute function public.preserve_published_job_required_skill();

revoke all on function public.validate_published_job_requirements() from public, anon, authenticated;
revoke all on function public.preserve_published_job_required_skill() from public, anon, authenticated;
