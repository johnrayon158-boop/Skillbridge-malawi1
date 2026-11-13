alter table public.student_profiles
  add column if not exists interests text[] not null default '{}';

alter table public.certificates
  add column if not exists verification_method text,
  add column if not exists verified_by uuid references public.profiles(id) on delete set null,
  add column if not exists verified_at timestamptz;

create table if not exists public.certificate_skills (
  id uuid primary key default gen_random_uuid(),
  certificate_id uuid not null references public.certificates(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (certificate_id, skill_id)
);

create table if not exists public.portfolio_skills (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (portfolio_id, skill_id)
);

create index if not exists idx_certificate_skills_certificate_id on public.certificate_skills(certificate_id);
create index if not exists idx_portfolio_skills_portfolio_id on public.portfolio_skills(portfolio_id);

alter table public.certificate_skills enable row level security;
alter table public.portfolio_skills enable row level security;

drop policy if exists certificate_skills_owner_all on public.certificate_skills;
create policy certificate_skills_owner_all on public.certificate_skills for all
using (exists (
  select 1 from public.certificates c
  where c.id = certificate_id and public.owns_student(c.student_id)
))
with check (exists (
  select 1 from public.certificates c
  where c.id = certificate_id and public.owns_student(c.student_id)
));

drop policy if exists portfolio_skills_owner_all on public.portfolio_skills;
create policy portfolio_skills_owner_all on public.portfolio_skills for all
using (exists (
  select 1 from public.portfolios p
  where p.id = portfolio_id and public.owns_student(p.student_id)
))
with check (exists (
  select 1 from public.portfolios p
  where p.id = portfolio_id and public.owns_student(p.student_id)
));

drop policy if exists employer_candidate_project_skills_read on public.project_skills;
create policy employer_candidate_project_skills_read on public.project_skills for select using (
  exists (
    select 1 from public.projects p
    join public.applications a on a.student_id = p.student_id
    join public.jobs j on j.id = a.job_id
    where p.id = project_id and j.employer_id = auth.uid()
  )
  or exists (
    select 1 from public.projects p
    join public.employment e on e.student_id = p.student_id
    where p.id = project_id and e.employer_id = auth.uid()
  )
);

drop policy if exists employer_candidate_portfolio_skills_read on public.portfolio_skills;
create policy employer_candidate_portfolio_skills_read on public.portfolio_skills for select using (
  exists (
    select 1 from public.portfolios p
    join public.applications a on a.student_id = p.student_id
    join public.jobs j on j.id = a.job_id
    where p.id = portfolio_id and j.employer_id = auth.uid()
  )
  or exists (
    select 1 from public.portfolios p
    join public.employment e on e.student_id = p.student_id
    where p.id = portfolio_id and e.employer_id = auth.uid()
  )
);

drop policy if exists employer_candidate_certificate_skills_read on public.certificate_skills;
create policy employer_candidate_certificate_skills_read on public.certificate_skills for select using (
  exists (
    select 1 from public.certificates c
    join public.applications a on a.student_id = c.student_id
    join public.jobs j on j.id = a.job_id
    where c.id = certificate_id and j.employer_id = auth.uid()
  )
  or exists (
    select 1 from public.certificates c
    join public.employment e on e.student_id = c.student_id
    where c.id = certificate_id and e.employer_id = auth.uid()
  )
);

create or replace function public.prevent_unverified_credential_claims()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_admin() then
    if tg_op = 'INSERT' then
      if new.verification_method is not null or new.verified_by is not null or new.verified_at is not null
        or new.verification_status <> 'pending'
      then
        raise exception 'Only an administrator can record credential verification';
      end if;
    elsif new.verification_method is distinct from old.verification_method
      or new.verified_by is distinct from old.verified_by
      or new.verified_at is distinct from old.verified_at
      or new.verification_status is distinct from old.verification_status
    then
      raise exception 'Only an administrator can record credential verification';
    end if;
  end if;

  if new.verification_status = 'verified'
    and (new.verification_method is null or new.verified_by is null or new.verified_at is null)
  then
    if tg_op = 'INSERT' then
      raise exception 'Independent verification requires a supported method, reviewer, and verification time';
    elsif old.verification_status is distinct from 'verified'
      or old.verification_method is distinct from new.verification_method
      or old.verified_by is distinct from new.verified_by
      or old.verified_at is distinct from new.verified_at
    then
      raise exception 'Independent verification requires a supported method, reviewer, and verification time';
    end if;
  end if;

  if new.verification_method is not null
    and new.verification_method not in ('issuer_registry', 'issuer_confirmation', 'credential_provider')
  then
    raise exception 'Choose a supported independent verification method';
  end if;

  if new.verification_method is not null
    and (new.verified_by is null or new.verified_at is null or new.verification_status <> 'verified')
  then
    raise exception 'Independent verification requires a verified status, reviewer, and verification time';
  end if;

  return new;
end;
$$;

drop trigger if exists certificates_prevent_unverified_claims on public.certificates;
create trigger certificates_prevent_unverified_claims
before insert or update on public.certificates
for each row execute function public.prevent_unverified_credential_claims();

create or replace function public.prevent_self_verified_skill_evidence()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_admin() then
    if tg_op = 'INSERT' then
      if new.verified_by is not null or new.verified_at is not null or new.verification_status <> 'pending' then
        raise exception 'Only an administrator can independently verify skill evidence';
      end if;
    elsif new.verified_by is distinct from old.verified_by
      or new.verified_at is distinct from old.verified_at
      or new.verification_status is distinct from old.verification_status
    then
      raise exception 'Only an administrator can independently verify skill evidence';
    end if;
  end if;

  if new.verification_status = 'verified' and (new.verified_by is null or new.verified_at is null) then
    if tg_op = 'INSERT' then
      raise exception 'Independent skill evidence verification requires a reviewer and verification time';
    elsif old.verification_status is distinct from 'verified'
      or old.verified_by is distinct from new.verified_by
      or old.verified_at is distinct from new.verified_at
    then
      raise exception 'Independent skill evidence verification requires a reviewer and verification time';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists skill_evidence_prevent_self_verification on public.skill_evidence;
create trigger skill_evidence_prevent_self_verification
before insert or update on public.skill_evidence
for each row execute function public.prevent_self_verified_skill_evidence();

create or replace function public.validate_employer_feedback_submission()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status = 'validated' and not public.is_admin() then
    raise exception 'Only an administrator can validate employer feedback';
  end if;

  if not public.is_admin() then
    if tg_op = 'INSERT' then
      if new.status not in ('draft', 'submitted') then
        raise exception 'Employer feedback must be submitted for review';
      end if;
    elsif old.status not in ('draft', 'submitted')
      or new.status not in ('draft', 'submitted')
    then
      raise exception 'Only an administrator can change reviewed feedback status';
    elsif new.employer_id is distinct from old.employer_id
      or new.candidate_id is distinct from old.candidate_id
      or new.application_id is distinct from old.application_id
      or new.employment_id is distinct from old.employment_id
      or new.job_id is distinct from old.job_id
    then
      raise exception 'Employer, candidate, and relationship references cannot be changed after submission';
    end if;
  end if;

  if not public.is_admin() then
    if not public.has_employer_candidate_relationship(new.employer_id, new.candidate_id) then
      raise exception 'Feedback can only be submitted for a candidate connected to your applications or employment';
    end if;
    if new.application_id is not null and not exists (
      select 1 from public.applications a
      join public.jobs j on j.id = a.job_id
      where a.id = new.application_id
        and a.student_id = new.candidate_id
        and j.employer_id = new.employer_id
        and (new.job_id is null or new.job_id = a.job_id)
    ) then
      raise exception 'The application does not belong to this employer and candidate';
    end if;
    if new.employment_id is not null and not exists (
      select 1 from public.employment e
      where e.id = new.employment_id
        and e.student_id = new.candidate_id
        and e.employer_id = new.employer_id
        and (new.job_id is null or new.job_id = e.job_id)
    ) then
      raise exception 'The employment record does not belong to this employer and candidate';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists employer_feedback_validate_submission on public.employer_feedback;
create trigger employer_feedback_validate_submission
before insert or update on public.employer_feedback
for each row execute function public.validate_employer_feedback_submission();

alter table public.employer_feedback_audit
  alter column feedback_id drop not null;

alter table public.employer_feedback_audit
  drop constraint if exists employer_feedback_audit_feedback_id_fkey;
alter table public.employer_feedback_audit
  add constraint employer_feedback_audit_feedback_id_fkey
  foreign key (feedback_id) references public.employer_feedback(id) on delete set null;

create or replace function public.audit_employer_feedback_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  feedback_key uuid;
begin
  feedback_key := case when tg_op = 'DELETE' then old.id else new.id end;
  insert into public.employer_feedback_audit (
    feedback_id, action, previous_values, new_values, changed_by
  ) values (
    case when tg_op = 'DELETE' then null else feedback_key end,
    lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    coalesce(auth.uid(), case when tg_op = 'DELETE' then old.created_by else new.created_by end)
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists employer_feedback_audit_changes on public.employer_feedback;
create trigger employer_feedback_audit_changes
after insert or update or delete on public.employer_feedback
for each row execute function public.audit_employer_feedback_change();

create or replace function public.validate_employer_feedback_acknowledgement()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  feedback_candidate uuid;
begin
  if not public.is_admin() then
    if new.student_id is distinct from auth.uid() then
      raise exception 'Only the candidate can acknowledge or dispute their feedback';
    end if;
    if tg_op = 'UPDATE' then
      if new.student_id is distinct from old.student_id
        or new.feedback_id is distinct from old.feedback_id
      then
        raise exception 'The candidate and feedback references cannot be changed';
      end if;
    end if;
  end if;

  select candidate_id into feedback_candidate
  from public.employer_feedback
  where id = new.feedback_id;
  if feedback_candidate is distinct from new.student_id then
    raise exception 'Feedback can only be acknowledged by its candidate';
  end if;

  if new.status = 'disputed' and length(trim(coalesce(new.notes, ''))) < 5 then
    raise exception 'A dispute explanation must contain at least 5 characters';
  end if;
  if tg_op = 'INSERT' then
    new.acknowledged_at := now();
  elsif new.status is distinct from old.status then
    new.acknowledged_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists employer_feedback_acknowledgements_validate
  on public.employer_feedback_acknowledgements;
create trigger employer_feedback_acknowledgements_validate
before insert or update on public.employer_feedback_acknowledgements
for each row execute function public.validate_employer_feedback_acknowledgement();

create or replace function public.audit_employer_feedback_acknowledgement_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  feedback_key uuid;
  actor_id uuid;
begin
  feedback_key := case when tg_op = 'DELETE' then old.feedback_id else new.feedback_id end;
  actor_id := coalesce(auth.uid(), case when tg_op = 'DELETE' then old.student_id else new.student_id end);
  insert into public.employer_feedback_audit (
    feedback_id, action, previous_values, new_values, changed_by
  ) values (
    feedback_key,
    lower(tg_op) || '_acknowledgement',
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    actor_id
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists employer_feedback_acknowledgements_audit_changes
  on public.employer_feedback_acknowledgements;
create trigger employer_feedback_acknowledgements_audit_changes
after insert or update or delete on public.employer_feedback_acknowledgements
for each row execute function public.audit_employer_feedback_acknowledgement_change();

create table if not exists public.employer_feedback_competency_audit (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid references public.employer_feedback(id) on delete set null,
  competency_id uuid references public.employer_feedback_competencies(id) on delete set null,
  action text not null,
  previous_values jsonb,
  new_values jsonb,
  changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_employer_feedback_competency_audit_feedback
  on public.employer_feedback_competency_audit(feedback_id);
alter table public.employer_feedback_competency_audit enable row level security;

drop policy if exists employer_feedback_competency_audit_admin_read on public.employer_feedback_competency_audit;
create policy employer_feedback_competency_audit_admin_read on public.employer_feedback_competency_audit
for select using (public.is_admin());

drop policy if exists employer_feedback_competency_audit_employer_read on public.employer_feedback_competency_audit;
create policy employer_feedback_competency_audit_employer_read on public.employer_feedback_competency_audit
for select using (
  exists (
    select 1 from public.employer_feedback ef
    where ef.id = feedback_id and ef.employer_id = auth.uid()
  )
);

create or replace function public.audit_employer_feedback_competency_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  feedback_key uuid;
  competency_key uuid;
begin
  feedback_key := case when tg_op = 'DELETE' then old.feedback_id else new.feedback_id end;
  competency_key := case when tg_op = 'DELETE' then old.id else new.id end;
  insert into public.employer_feedback_competency_audit (
    feedback_id, competency_id, action, previous_values, new_values, changed_by
  ) values (
    feedback_key,
    competency_key,
    lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    auth.uid()
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.prevent_changes_to_validated_feedback_competencies()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  feedback_key uuid;
  feedback_status text;
begin
  feedback_key := case when tg_op = 'DELETE' then old.feedback_id else new.feedback_id end;
  if not public.is_admin() then
    select status into feedback_status from public.employer_feedback where id = feedback_key;
    if feedback_status = 'validated' then
      raise exception 'Competencies on validated feedback can only be changed by an administrator';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists employer_feedback_competencies_prevent_post_validation_edits
  on public.employer_feedback_competencies;
create trigger employer_feedback_competencies_prevent_post_validation_edits
before insert or update or delete on public.employer_feedback_competencies
for each row execute function public.prevent_changes_to_validated_feedback_competencies();

drop trigger if exists employer_feedback_competencies_audit_changes
  on public.employer_feedback_competencies;
create trigger employer_feedback_competencies_audit_changes
after insert or update or delete on public.employer_feedback_competencies
for each row execute function public.audit_employer_feedback_competency_change();
