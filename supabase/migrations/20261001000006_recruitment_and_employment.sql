-- SkillBridge Malawi Step 3: recruitment and employment.

create table if not exists public.recruitment_stages (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references public.employer_profiles(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  name text not null,
  description text,
  sequence_order integer not null check (sequence_order > 0),
  is_terminal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.application_stage_progress (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  stage_id uuid not null references public.recruitment_stages(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'skipped')),
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, stage_id)
);

create table if not exists public.interviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  scheduled_at timestamptz not null,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  location text,
  meeting_url text,
  interview_type text,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled', 'rescheduled')),
  notes text,
  feedback text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  salary numeric check (salary is null or salary >= 0),
  currency text not null default 'MWK',
  start_date date,
  expiry_date date,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired', 'withdrawn')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expiry_date is null or start_date is null or expiry_date >= start_date)
);

create table if not exists public.employment (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  employer_id uuid not null references public.employer_profiles(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  application_id uuid references public.applications(id) on delete set null,
  position text not null,
  start_date date not null,
  end_date date,
  probation_end_date date,
  status text not null default 'active' check (status in ('active', 'completed', 'terminated', 'on_leave')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create table if not exists public.employment_progress (
  id uuid primary key default gen_random_uuid(),
  employment_id uuid not null references public.employment(id) on delete cascade,
  period_label text not null,
  technical_skills integer check (technical_skills is null or technical_skills between 0 and 100),
  communication integer check (communication is null or communication between 0 and 100),
  collaboration integer check (collaboration is null or collaboration between 0 and 100),
  problem_solving integer check (problem_solving is null or problem_solving between 0 and 100),
  project_contribution integer check (project_contribution is null or project_contribution between 0 and 100),
  overall_score integer check (overall_score is null or overall_score between 0 and 100),
  achievements jsonb not null default '[]'::jsonb,
  training jsonb not null default '[]'::jsonb,
  certifications jsonb not null default '[]'::jsonb,
  supervisor_feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.career_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  career_id uuid not null references public.careers(id) on delete cascade,
  readiness_score numeric not null default 0 check (readiness_score between 0 and 100),
  skills_score numeric not null default 0 check (skills_score between 0 and 100),
  assessment_score numeric not null default 0 check (assessment_score between 0 and 100),
  portfolio_score numeric not null default 0 check (portfolio_score between 0 and 100),
  certificate_score numeric not null default 0 check (certificate_score between 0 and 100),
  experience_score numeric not null default 0 check (experience_score between 0 and 100),
  projects_score numeric not null default 0 check (projects_score between 0 and 100),
  last_calculated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, career_id)
);

create table if not exists public.job_assessments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  required boolean not null default true,
  created_at timestamptz not null default now(),
  unique (job_id, assessment_id)
);

create index if not exists idx_recruitment_stages_job_id on public.recruitment_stages(job_id);
create index if not exists idx_application_stage_progress_application_id on public.application_stage_progress(application_id);
create index if not exists idx_interviews_application_id on public.interviews(application_id);
create index if not exists idx_employment_student_id on public.employment(student_id);
create index if not exists idx_employment_employer_id on public.employment(employer_id);
create index if not exists idx_career_progress_student_id on public.career_progress(student_id);

create trigger recruitment_stages_updated_at before update on public.recruitment_stages for each row execute function public.set_updated_at();
create trigger application_stage_progress_updated_at before update on public.application_stage_progress for each row execute function public.set_updated_at();
create trigger interviews_updated_at before update on public.interviews for each row execute function public.set_updated_at();
create trigger offers_updated_at before update on public.offers for each row execute function public.set_updated_at();
create trigger employment_updated_at before update on public.employment for each row execute function public.set_updated_at();
create trigger employment_progress_updated_at before update on public.employment_progress for each row execute function public.set_updated_at();
create trigger career_progress_updated_at before update on public.career_progress for each row execute function public.set_updated_at();
