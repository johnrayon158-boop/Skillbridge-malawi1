-- SkillBridge Malawi Step 11: skill taxonomy and standardization.

alter table public.skills
  add column if not exists normalized_name text,
  add column if not exists subcategory text,
  add column if not exists parent_skill_id uuid references public.skills(id) on delete set null,
  add column if not exists skill_type text not null default 'technical' check (skill_type in ('technical','digital','business','communication','leadership','management','analytical','creative','professional','industry_specific','administrative','customer_service','entrepreneurship','research','financial','healthcare','education','engineering','agriculture','hospitality','legal','media','construction','transport','other')),
  add column if not exists status text not null default 'active' check (status in ('active','inactive','archived')),
  add column if not exists aliases jsonb not null default '[]'::jsonb;

update public.skills
set normalized_name = lower(regexp_replace(trim(name), '[^a-z0-9]+', ' ', 'g'))
where normalized_name is null or normalized_name = '';

create index if not exists idx_skills_normalized_name on public.skills(normalized_name);
create index if not exists idx_skills_parent_skill_id on public.skills(parent_skill_id);
create index if not exists idx_skills_skill_type on public.skills(skill_type);
create index if not exists idx_skills_status on public.skills(status);

create table if not exists public.skill_aliases (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references public.skills(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  alias_type text not null default 'common_name' check (alias_type in ('abbreviation','spelling_variant','common_name','industry_term','synonym','legacy_term','employer_term','user_term')),
  confidence numeric not null default 0.8 check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (skill_id, normalized_alias)
);

create table if not exists public.skill_relationships (
  id uuid primary key default gen_random_uuid(),
  source_skill_id uuid not null references public.skills(id) on delete cascade,
  target_skill_id uuid not null references public.skills(id) on delete cascade,
  relationship_type text not null check (relationship_type in ('related','prerequisite','complementary','specialization','alternative')),
  strength numeric not null default 0.5 check (strength between 0 and 1),
  explanation text,
  created_at timestamptz not null default now(),
  unique (source_skill_id, target_skill_id, relationship_type)
);

alter table public.user_skills
  add column if not exists proficiency_level integer check (proficiency_level between 1 and 5),
  add column if not exists evidence_strength integer check (evidence_strength between 0 and 100),
  add column if not exists source_of_proficiency text,
  add column if not exists last_assessed_at timestamptz;

update public.user_skills
set proficiency_level = case
  when lower(level) = 'beginner' then 1
  when lower(level) = 'intermediate' then 3
  when lower(level) = 'advanced' then 4
  when lower(level) = 'expert' then 5
  else 2
end
where proficiency_level is null;

create index if not exists idx_user_skills_proficiency_level on public.user_skills(proficiency_level);

alter table public.job_skills
  add column if not exists canonical_skill_id uuid references public.skills(id) on delete set null,
  add column if not exists original_skill_text text,
  add column if not exists mandatory boolean not null default true,
  add column if not exists required_proficiency integer check (required_proficiency between 1 and 5),
  add column if not exists skill_alias text;

create index if not exists idx_skill_aliases_skill_id on public.skill_aliases(skill_id);
create index if not exists idx_skill_aliases_normalized_alias on public.skill_aliases(normalized_alias);
create index if not exists idx_skill_relationships_source_skill_id on public.skill_relationships(source_skill_id);
create index if not exists idx_skill_relationships_target_skill_id on public.skill_relationships(target_skill_id);
create index if not exists idx_job_skills_canonical_skill_id on public.job_skills(canonical_skill_id);

create trigger skill_aliases_updated_at before update on public.skill_aliases for each row execute function public.set_updated_at();
create trigger skill_relationships_updated_at before update on public.skill_relationships for each row execute function public.set_updated_at();
