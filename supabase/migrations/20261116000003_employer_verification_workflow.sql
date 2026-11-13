alter table public.employer_profiles
  add column if not exists verification_status text not null default 'unverified';

-- Only an approved submission may preserve an existing verified claim.
alter table public.employer_profiles
  drop constraint if exists employer_profiles_verification_status_check,
  drop constraint if exists employer_profiles_verification_consistency_check;

create table if not exists public.employer_verification_submissions (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references public.employer_profiles(id) on delete cascade,
  legal_business_name text not null check (length(btrim(legal_business_name)) between 2 and 160),
  registration_number text not null check (length(btrim(registration_number)) between 1 and 100),
  registration_authority text not null check (length(btrim(registration_authority)) between 2 and 160),
  registration_country text not null default 'Malawi' check (length(btrim(registration_country)) between 2 and 100),
  representative_name text not null check (length(btrim(representative_name)) between 2 and 120),
  representative_role text not null check (length(btrim(representative_role)) between 2 and 100),
  document_path text not null,
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  reviewer_feedback text check (reviewer_feedback is null or length(reviewer_feedback) <= 2000),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint employer_verification_review_fields_check check (
    (status = 'pending' and reviewed_at is null and reviewed_by is null and reviewer_feedback is null)
    or (status in ('verified', 'rejected') and reviewed_at is not null and reviewed_by is not null)
  )
);

update public.employer_profiles ep
set verification_status = case when exists (
      select 1
      from public.employer_verification_submissions s
      where s.employer_id = ep.id
        and s.status = 'verified'
        and s.reviewed_by is not null
        and s.reviewed_at is not null
    ) then 'verified' else 'unverified' end,
    verified = exists (
      select 1
      from public.employer_verification_submissions s
      where s.employer_id = ep.id
        and s.status = 'verified'
        and s.reviewed_by is not null
        and s.reviewed_at is not null
    )
where ep.verification_status = 'verified'
   or ep.verified;

alter table public.employer_profiles
  add constraint employer_profiles_verification_status_check
    check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  add constraint employer_profiles_verification_consistency_check
    check (verified = (verification_status = 'verified'));

create unique index if not exists employer_verification_one_pending_per_employer
  on public.employer_verification_submissions(employer_id)
  where status = 'pending';
create index if not exists employer_verification_submissions_status_idx
  on public.employer_verification_submissions(status, submitted_at desc);
create index if not exists employer_verification_submissions_employer_idx
  on public.employer_verification_submissions(employer_id, submitted_at desc);

create table if not exists public.employer_verification_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.employer_verification_submissions(id) on delete cascade,
  employer_id uuid not null references public.employer_profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('submitted', 'approved', 'rejected')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists employer_verification_events_employer_idx
  on public.employer_verification_events(employer_id, created_at desc);

alter table public.employer_verification_submissions enable row level security;
alter table public.employer_verification_events enable row level security;

drop policy if exists employer_verification_submissions_owner_read on public.employer_verification_submissions;
create policy employer_verification_submissions_owner_read
  on public.employer_verification_submissions for select
  using (employer_id = auth.uid() or public.is_admin());

drop policy if exists employer_verification_submissions_owner_insert on public.employer_verification_submissions;
create policy employer_verification_submissions_owner_insert
  on public.employer_verification_submissions for insert
  with check (
    employer_id = auth.uid()
    and status = 'pending'
    and reviewer_feedback is null
    and reviewed_at is null
    and reviewed_by is null
  );

drop policy if exists employer_verification_events_owner_read on public.employer_verification_events;
create policy employer_verification_events_owner_read
  on public.employer_verification_events for select
  using (employer_id = auth.uid() or public.is_admin());

revoke all on public.employer_verification_submissions from public, anon, authenticated;
grant select, insert on public.employer_verification_submissions to authenticated;
revoke all on public.employer_verification_events from public, anon, authenticated;
grant select on public.employer_verification_events to authenticated;

-- Verification attributes must not be writable through the ordinary profile editor.
revoke update on public.employer_profiles from public, anon, authenticated;
grant update (
  company_name, industry, description, website, email, phone,
  country, district, city, logo_url, company_size
) on public.employer_profiles to authenticated;

drop policy if exists employer_profiles_admin_select on public.employer_profiles;
create policy employer_profiles_admin_select
  on public.employer_profiles for select using (public.is_admin());

create or replace function public.guard_employer_verification_profile()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.verification_status <> 'unverified' or new.verified then
      raise exception 'Employer verification must begin as unverified';
    end if;
    return new;
  end if;

  if new.verification_status = 'pending'
     and not exists (
       select 1 from public.employer_verification_submissions s
       where s.employer_id = new.id and s.status = 'pending'
     ) then
    raise exception 'Pending employer status requires a pending submission';
  end if;
  if new.verification_status = 'rejected'
     and not exists (
       select 1 from public.employer_verification_submissions s
       where s.employer_id = new.id and s.status = 'rejected' and s.reviewed_by is not null
     ) then
    raise exception 'Rejected employer status requires a reviewed submission';
  end if;
  if new.verification_status = 'verified'
     and not exists (
       select 1 from public.employer_verification_submissions s
       where s.employer_id = new.id and s.status = 'verified'
         and s.reviewed_by is not null and s.reviewed_at is not null
     ) then
    raise exception 'Verified employer status requires an approved submission';
  end if;

  return new;
end;
$$;

drop trigger if exists employer_verification_profile_insert_guard on public.employer_profiles;
create trigger employer_verification_profile_insert_guard
  before insert on public.employer_profiles
  for each row execute function public.guard_employer_verification_profile();

drop trigger if exists employer_verification_profile_update_guard on public.employer_profiles;
create trigger employer_verification_profile_update_guard
  before update of verified, verification_status on public.employer_profiles
  for each row execute function public.guard_employer_verification_profile();

create or replace function public.guard_employer_verification_submission_insert()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  if auth.uid() is null or new.employer_id is distinct from auth.uid()
     or not exists (
       select 1 from public.profiles p where p.id = auth.uid() and p.role = 'employer'
     ) then
    raise exception 'Only the employer account owner can submit verification';
  end if;
  if new.status <> 'pending' or new.reviewed_at is not null
     or new.reviewed_by is not null or new.reviewer_feedback is not null then
    raise exception 'Employer verification submissions must start pending';
  end if;
  if split_part(new.document_path, '/', 1) <> new.employer_id::text
     or not exists (
       select 1 from storage.objects o
       where o.bucket_id = 'employer-verification-documents'
         and o.name = new.document_path
     ) then
    raise exception 'Upload verification evidence to your private employer folder before submitting';
  end if;
  if exists (
    select 1 from public.employer_profiles ep
    where ep.id = new.employer_id and ep.verification_status = 'verified'
  ) then
    raise exception 'This employer already has an approved verification record';
  end if;

  new.legal_business_name := btrim(new.legal_business_name);
  new.registration_number := btrim(new.registration_number);
  new.registration_authority := btrim(new.registration_authority);
  new.registration_country := btrim(new.registration_country);
  new.representative_name := btrim(new.representative_name);
  new.representative_role := btrim(new.representative_role);
  return new;
end;
$$;

drop trigger if exists employer_verification_submission_insert_guard on public.employer_verification_submissions;
create trigger employer_verification_submission_insert_guard
  before insert on public.employer_verification_submissions
  for each row execute function public.guard_employer_verification_submission_insert();

create or replace function public.guard_employer_verification_submission_review()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.is_admin() or auth.uid() is null then
    raise exception 'Only an administrator can review employer verification';
  end if;
  if old.status <> 'pending' or new.status not in ('verified', 'rejected') then
    raise exception 'Only pending employer verification submissions can be reviewed';
  end if;
  if new.employer_id is distinct from old.employer_id
     or new.legal_business_name is distinct from old.legal_business_name
     or new.registration_number is distinct from old.registration_number
     or new.registration_authority is distinct from old.registration_authority
     or new.registration_country is distinct from old.registration_country
     or new.representative_name is distinct from old.representative_name
     or new.representative_role is distinct from old.representative_role
     or new.document_path is distinct from old.document_path
     or new.submitted_at is distinct from old.submitted_at then
    raise exception 'Submitted verification evidence cannot be changed during review';
  end if;
  if new.reviewed_by is distinct from auth.uid() or new.reviewed_at is null then
    raise exception 'A review must record the administrator and review time';
  end if;
  new.reviewer_feedback := nullif(btrim(new.reviewer_feedback), '');
  if new.status = 'rejected' and new.reviewer_feedback is null then
    raise exception 'A rejection requires feedback for the employer';
  end if;
  return new;
end;
$$;

drop trigger if exists employer_verification_submission_review_guard on public.employer_verification_submissions;
create trigger employer_verification_submission_review_guard
  before update on public.employer_verification_submissions
  for each row execute function public.guard_employer_verification_submission_review();

create or replace function public.sync_employer_verification_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_status text;
begin
  next_status := new.status;
  update public.employer_profiles
  set verification_status = next_status,
      verified = (next_status = 'verified')
  where id = new.employer_id;
  return new;
end;
$$;

drop trigger if exists employer_verification_profile_sync_insert on public.employer_verification_submissions;
create trigger employer_verification_profile_sync_insert
  after insert on public.employer_verification_submissions
  for each row
  execute function public.sync_employer_verification_profile();

drop trigger if exists employer_verification_profile_sync_update on public.employer_verification_submissions;
create trigger employer_verification_profile_sync_update
  after update of status on public.employer_verification_submissions
  for each row
  when (old.status is distinct from new.status)
  execute function public.sync_employer_verification_profile();

create or replace function public.audit_employer_verification_action()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.employer_verification_events (
    submission_id, employer_id, actor_id, action, note
  ) values (
    new.id,
    new.employer_id,
    auth.uid(),
    case when tg_op = 'INSERT' then 'submitted'
         when new.status = 'verified' then 'approved'
         else 'rejected' end,
    case when tg_op = 'INSERT' then null else new.reviewer_feedback end
  );
  return new;
end;
$$;

drop trigger if exists employer_verification_submission_audit_insert on public.employer_verification_submissions;
create trigger employer_verification_submission_audit_insert
  after insert on public.employer_verification_submissions
  for each row
  execute function public.audit_employer_verification_action();

drop trigger if exists employer_verification_submission_audit_update on public.employer_verification_submissions;
create trigger employer_verification_submission_audit_update
  after update of status on public.employer_verification_submissions
  for each row
  when (old.status is distinct from new.status)
  execute function public.audit_employer_verification_action();

create or replace function public.review_employer_verification_submission(
  p_submission_id uuid,
  p_decision text,
  p_feedback text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_submission public.employer_verification_submissions%rowtype;
  normalized_feedback text := nullif(btrim(p_feedback), '');
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only administrators can review employer verification';
  end if;
  if p_decision is null or p_decision not in ('verified', 'rejected') then
    raise exception 'Choose approved or rejected for the review decision';
  end if;
  if length(normalized_feedback) > 2000 then
    raise exception 'Review feedback must be 2000 characters or fewer';
  end if;
  if p_decision = 'rejected' and normalized_feedback is null then
    raise exception 'A rejection requires feedback for the employer';
  end if;

  select * into target_submission
  from public.employer_verification_submissions
  where id = p_submission_id
  for update;
  if not found or target_submission.status <> 'pending' then
    raise exception 'This employer verification submission is no longer pending';
  end if;

  update public.employer_verification_submissions
  set status = p_decision,
      reviewer_feedback = normalized_feedback,
      reviewed_at = now(),
      reviewed_by = auth.uid()
  where id = p_submission_id;
  return p_submission_id;
end;
$$;

revoke all on function public.review_employer_verification_submission(uuid, text, text) from public, anon, authenticated;
grant execute on function public.review_employer_verification_submission(uuid, text, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'employer-verification-documents',
  'employer-verification-documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png'];

drop policy if exists employer_verification_documents_owner_read on storage.objects;
create policy employer_verification_documents_owner_read
  on storage.objects for select
  using (
    bucket_id = 'employer-verification-documents'
    and (
      (
        (storage.foldername(name))[1] = auth.uid()::text
        and exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role = 'employer'
        )
      )
      or public.is_admin()
    )
  );

drop policy if exists employer_verification_documents_owner_insert on storage.objects;
create policy employer_verification_documents_owner_insert
  on storage.objects for insert
  with check (
    bucket_id = 'employer-verification-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'employer'
    )
  );

drop policy if exists employer_verification_documents_owner_delete_unsubmitted on storage.objects;
create policy employer_verification_documents_owner_delete_unsubmitted
  on storage.objects for delete
  using (
    bucket_id = 'employer-verification-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not exists (
      select 1 from public.employer_verification_submissions s
      where s.document_path = name
    )
  );

notify pgrst, 'reload schema';
