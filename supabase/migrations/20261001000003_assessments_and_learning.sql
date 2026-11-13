-- SkillBridge Malawi Step 3: assessments and learning foundations.

create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  assessment_type text not null check (assessment_type in ('skill', 'career', 'job', 'practice')),
  skill_id uuid references public.skills(id) on delete set null,
  career_id uuid references public.careers(id) on delete set null,
  job_id uuid,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  difficulty text,
  passing_score integer check (passing_score is null or passing_score between 0 and 100),
  created_by uuid references public.profiles(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assessment_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  question text not null,
  question_type text not null,
  options jsonb,
  correct_answer jsonb,
  points integer not null default 1 check (points > 0),
  difficulty text,
  explanation text,
  created_at timestamptz not null default now()
);

create table if not exists public.assessment_results (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  score numeric not null check (score between 0 and 100),
  percentage numeric not null check (percentage between 0 and 100),
  level text,
  passed boolean not null,
  strengths jsonb not null default '[]'::jsonb,
  weaknesses jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  started_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  check (completed_at is null or completed_at >= started_at)
);

create table if not exists public.learning_resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  resource_type text not null check (resource_type in ('course', 'video', 'article', 'book', 'tutorial', 'project', 'practice', 'certificate')),
  url text,
  provider text,
  skill_id uuid references public.skills(id) on delete set null,
  difficulty text,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  free boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.learning_paths (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  career_id uuid references public.careers(id) on delete set null,
  title text not null,
  description text not null,
  progress integer not null default 0 check (progress between 0 and 100),
  status text not null default 'active' check (status in ('active', 'completed', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.learning_path_resources (
  id uuid primary key default gen_random_uuid(),
  learning_path_id uuid not null references public.learning_paths(id) on delete cascade,
  resource_id uuid not null references public.learning_resources(id) on delete cascade,
  sequence_order integer not null check (sequence_order > 0),
  required boolean not null default true,
  created_at timestamptz not null default now(),
  unique (learning_path_id, resource_id),
  unique (learning_path_id, sequence_order)
);

create table if not exists public.learning_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  resource_id uuid not null references public.learning_resources(id) on delete cascade,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed')),
  progress integer not null default 0 check (progress between 0 and 100),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, resource_id)
);

create index if not exists idx_assessment_results_student_id on public.assessment_results(student_id);
create index if not exists idx_assessment_questions_assessment_id on public.assessment_questions(assessment_id);
create index if not exists idx_learning_paths_student_id on public.learning_paths(student_id);
create index if not exists idx_learning_progress_student_id on public.learning_progress(student_id);
create index if not exists idx_learning_resources_skill_id on public.learning_resources(skill_id);

drop trigger if exists assessments_updated_at on public.assessments;
create trigger assessments_updated_at before update on public.assessments for each row execute function public.set_updated_at();
drop trigger if exists learning_resources_updated_at on public.learning_resources;
create trigger learning_resources_updated_at before update on public.learning_resources for each row execute function public.set_updated_at();
drop trigger if exists learning_paths_updated_at on public.learning_paths;
create trigger learning_paths_updated_at before update on public.learning_paths for each row execute function public.set_updated_at();
drop trigger if exists learning_progress_updated_at on public.learning_progress;
create trigger learning_progress_updated_at before update on public.learning_progress for each row execute function public.set_updated_at();
