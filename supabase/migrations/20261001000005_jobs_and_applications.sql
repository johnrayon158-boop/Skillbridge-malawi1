-- SkillBridge Malawi Step 3: jobs, matching records and applications.

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references public.employer_profiles(id) on delete cascade,
  title text not null,
  department text,
  description text not null,
  location text,
  employment_type text not null check (employment_type in ('full_time', 'part_time', 'contract', 'internship', 'graduate', 'temporary', 'volunteer')),
  work_mode text check (work_mode is null or work_mode in ('onsite', 'remote', 'hybrid')),
  salary_min numeric check (salary_min is null or salary_min >= 0),
  salary_max numeric check (salary_max is null or salary_max >= 0),
  currency text not null default 'MWK',
  experience_required text,
  education_required text,
  application_deadline date,
  status text not null default 'draft' check (status in ('draft', 'published', 'closed', 'archived')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (salary_max is null or salary_min is null or salary_max >= salary_min)
);

create table if not exists public.job_skills (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  required_level text not null check (required_level in ('beginner', 'intermediate', 'advanced', 'expert')),
  importance integer not null default 1 check (importance between 1 and 100),
  created_at timestamptz not null default now(),
  unique (job_id, skill_id)
);

create table if not exists public.job_matches (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  match_score numeric not null check (match_score between 0 and 100),
  skills_score numeric check (skills_score is null or skills_score between 0 and 100),
  education_score numeric check (education_score is null or education_score between 0 and 100),
  assessment_score numeric check (assessment_score is null or assessment_score between 0 and 100),
  project_score numeric check (project_score is null or project_score between 0 and 100),
  portfolio_score numeric check (portfolio_score is null or portfolio_score between 0 and 100),
  certificate_score numeric check (certificate_score is null or certificate_score between 0 and 100),
  experience_score numeric check (experience_score is null or experience_score between 0 and 100),
  strong_skills jsonb not null default '[]'::jsonb,
  developing_skills jsonb not null default '[]'::jsonb,
  missing_skills jsonb not null default '[]'::jsonb,
  explanation text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, student_id)
);

create table if not exists public.saved_jobs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (student_id, job_id)
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  status text not null default 'applied' check (status in ('saved', 'interested', 'preparing', 'applied', 'viewed', 'shortlisted', 'assessment', 'interview', 'second_interview', 'offer', 'accepted', 'rejected', 'withdrawn', 'expired', 'position_closed')),
  cover_letter text,
  cv_url text,
  applied_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, job_id)
);

create table if not exists public.application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  event_type text not null,
  title text not null,
  description text,
  event_date timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'assessments_job_id_fkey'
      and conrelid = 'public.assessments'::regclass
  ) then
    alter table public.assessments
      add constraint assessments_job_id_fkey foreign key (job_id) references public.jobs(id) on delete set null;
  end if;
end $$;

create index if not exists idx_jobs_employer_id on public.jobs(employer_id);
create index if not exists idx_jobs_status on public.jobs(status);
create index if not exists idx_jobs_location on public.jobs(location);
create index if not exists idx_jobs_employment_type on public.jobs(employment_type);
create index if not exists idx_job_skills_job_id on public.job_skills(job_id);
create index if not exists idx_job_skills_skill_id on public.job_skills(skill_id);
create index if not exists idx_job_matches_student_id on public.job_matches(student_id);
create index if not exists idx_job_matches_job_id on public.job_matches(job_id);
create index if not exists idx_applications_student_id on public.applications(student_id);
create index if not exists idx_applications_job_id on public.applications(job_id);
create index if not exists idx_applications_status on public.applications(status);
create index if not exists idx_application_events_application_id on public.application_events(application_id);

drop trigger if exists jobs_updated_at on public.jobs;
create trigger jobs_updated_at before update on public.jobs for each row execute function public.set_updated_at();
drop trigger if exists job_matches_updated_at on public.job_matches;
create trigger job_matches_updated_at before update on public.job_matches for each row execute function public.set_updated_at();
drop trigger if exists applications_updated_at on public.applications;
create trigger applications_updated_at before update on public.applications for each row execute function public.set_updated_at();
