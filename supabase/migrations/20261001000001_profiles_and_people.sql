-- SkillBridge Malawi Step 3: profile extensions and shared helpers.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.prevent_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Users cannot change their role';
  end if;
  return new;
end;
$$;

-- Public signup metadata must never be able to create an administrator.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text := new.raw_user_meta_data->>'role';
begin
  if requested_role not in ('student', 'employer') then
    requested_role := 'student';
  end if;

  insert into public.profiles (id, full_name, email, role, company_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'User'),
    new.email,
    requested_role,
    new.raw_user_meta_data->>'company_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    email = excluded.email,
    company_name = excluded.company_name,
    avatar_url = excluded.avatar_url,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists profiles_prevent_role_change on public.profiles;
create trigger profiles_prevent_role_change
before update on public.profiles
for each row execute function public.prevent_profile_role_change();

create table if not exists public.student_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,
  phone text,
  date_of_birth date,
  gender text,
  country text not null default 'Malawi',
  district text,
  city text,
  institution text,
  programme text,
  education_level text,
  graduation_year integer check (graduation_year between 1900 and 2200),
  bio text,
  career_goal text,
  years_experience numeric not null default 0 check (years_experience >= 0),
  profile_completion integer not null default 0 check (profile_completion between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employer_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,
  company_name text not null,
  industry text not null,
  description text not null,
  website text,
  email text not null,
  phone text,
  country text not null default 'Malawi',
  district text,
  city text,
  logo_url text,
  company_size text,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.education (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  institution text not null,
  programme text not null,
  qualification text not null,
  education_level text not null,
  field_of_study text,
  start_year integer check (start_year between 1900 and 2200),
  end_year integer check (end_year between 1900 and 2200),
  grade text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_year is null or start_year is null or end_year >= start_year)
);

create index if not exists idx_student_profiles_institution on public.student_profiles(institution);
create index if not exists idx_student_profiles_programme on public.student_profiles(programme);
create index if not exists idx_education_student_id on public.education(student_id);
create index if not exists idx_employer_profiles_company_name on public.employer_profiles(company_name);

drop trigger if exists student_profiles_updated_at on public.student_profiles;
create trigger student_profiles_updated_at before update on public.student_profiles for each row execute function public.set_updated_at();
drop trigger if exists employer_profiles_updated_at on public.employer_profiles;
create trigger employer_profiles_updated_at before update on public.employer_profiles for each row execute function public.set_updated_at();
drop trigger if exists education_updated_at on public.education;
create trigger education_updated_at before update on public.education for each row execute function public.set_updated_at();

-- Create the appropriate extension row after the auth profile is created.
create or replace function public.handle_profile_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'student' then
    insert into public.student_profiles (id) values (new.id) on conflict do nothing;
  elsif new.role = 'employer' then
    insert into public.employer_profiles (id, company_name, industry, description, email)
    values (new.id, coalesce(new.company_name, 'Company'), 'Other', 'Employer profile', new.email)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists profile_created_extensions on public.profiles;
create trigger profile_created_extensions
after insert on public.profiles
for each row execute function public.handle_profile_created();

-- Existing accounts created before this migration receive their role-specific row.
insert into public.student_profiles (id)
select id from public.profiles where role = 'student'
on conflict do nothing;

insert into public.employer_profiles (id, company_name, industry, description, email)
select id, coalesce(company_name, 'Company'), 'Other', 'Employer profile', email
from public.profiles where role = 'employer'
on conflict do nothing;
