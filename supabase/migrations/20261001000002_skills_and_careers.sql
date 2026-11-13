-- SkillBridge Malawi Step 3: skills, evidence, careers and roadmaps.

create table if not exists public.skills (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  level text not null check (level in ('beginner', 'intermediate', 'advanced', 'expert')),
  self_rating integer check (self_rating between 0 and 100),
  verified boolean not null default false,
  confidence numeric not null default 0 check (confidence between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, skill_id)
);

create table if not exists public.skill_evidence (
  id uuid primary key default gen_random_uuid(),
  user_skill_id uuid not null references public.user_skills(id) on delete cascade,
  evidence_type text not null check (evidence_type in ('assessment', 'project', 'certificate', 'portfolio', 'employer', 'experience', 'other')),
  title text not null,
  description text,
  evidence_url text,
  verification_status text not null default 'pending' check (verification_status in ('pending', 'verified', 'rejected')),
  evidence_strength integer not null default 0 check (evidence_strength between 0 and 100),
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.careers (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  sector text not null,
  description text not null,
  entry_level text,
  growth_path text,
  salary_range text,
  demand_level text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.career_skills (
  id uuid primary key default gen_random_uuid(),
  career_id uuid not null references public.careers(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  required_level text not null check (required_level in ('beginner', 'intermediate', 'advanced', 'expert')),
  importance integer not null default 1 check (importance between 1 and 100),
  unique (career_id, skill_id)
);

create table if not exists public.career_recommendations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  career_id uuid not null references public.careers(id) on delete cascade,
  match_score numeric not null check (match_score between 0 and 100),
  reason text not null,
  strong_skills jsonb not null default '[]'::jsonb,
  developing_skills jsonb not null default '[]'::jsonb,
  missing_skills jsonb not null default '[]'::jsonb,
  generated_by text not null default 'ai',
  created_at timestamptz not null default now()
);

create table if not exists public.career_feedback (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  career_recommendation_id uuid not null references public.career_recommendations(id) on delete cascade,
  is_useful boolean not null,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.career_roadmaps (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  career_id uuid not null references public.careers(id) on delete cascade,
  title text not null,
  description text not null,
  current_stage text not null,
  target_stage text not null,
  progress integer not null default 0 check (progress between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_skills_name on public.skills(name);
create index if not exists idx_skills_category on public.skills(category);
create index if not exists idx_user_skills_user_id on public.user_skills(user_id);
create index if not exists idx_user_skills_skill_id on public.user_skills(skill_id);
create index if not exists idx_skill_evidence_user_skill_id on public.skill_evidence(user_skill_id);
create index if not exists idx_career_skills_career_id on public.career_skills(career_id);
create index if not exists idx_career_skills_skill_id on public.career_skills(skill_id);
create index if not exists idx_career_recommendations_student_id on public.career_recommendations(student_id);
create index if not exists idx_career_roadmaps_student_id on public.career_roadmaps(student_id);

drop trigger if exists skills_updated_at on public.skills;
create trigger skills_updated_at before update on public.skills for each row execute function public.set_updated_at();
drop trigger if exists user_skills_updated_at on public.user_skills;
create trigger user_skills_updated_at before update on public.user_skills for each row execute function public.set_updated_at();
drop trigger if exists skill_evidence_updated_at on public.skill_evidence;
create trigger skill_evidence_updated_at before update on public.skill_evidence for each row execute function public.set_updated_at();
drop trigger if exists careers_updated_at on public.careers;
create trigger careers_updated_at before update on public.careers for each row execute function public.set_updated_at();
drop trigger if exists career_roadmaps_updated_at on public.career_roadmaps;
create trigger career_roadmaps_updated_at before update on public.career_roadmaps for each row execute function public.set_updated_at();
