-- SkillBridge Malawi Step 12: AI governance, audit logging and review controls.

create table if not exists public.ai_decision_logs (
  id uuid primary key default gen_random_uuid(),
  feature_type text not null,
  user_id uuid references public.profiles(id) on delete set null,
  related_entity_type text,
  related_entity_id uuid,
  recommendation_id uuid,
  model_provider text not null default 'deterministic-scoring',
  model_version text not null default 'N/A',
  deterministic_score numeric,
  ai_score numeric,
  confidence_score text not null default 'Insufficient Data',
  explanation text,
  validation_status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.ai_review_queue (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid,
  feature_type text not null,
  reason text not null,
  severity text not null default 'medium',
  review_status text not null default 'open',
  reviewer_id uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_recommendation_versions (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid,
  feature_type text not null,
  version_number integer not null default 1,
  payload jsonb not null,
  explanation text,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_governance_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  summary text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_decision_logs_user_id on public.ai_decision_logs(user_id);
create index if not exists idx_ai_decision_logs_feature_type on public.ai_decision_logs(feature_type);
create index if not exists idx_ai_decision_logs_created_at on public.ai_decision_logs(created_at);
create index if not exists idx_ai_review_queue_status on public.ai_review_queue(review_status);
create index if not exists idx_ai_recommendation_versions_recommendation_id on public.ai_recommendation_versions(recommendation_id);
create index if not exists idx_ai_governance_events_created_at on public.ai_governance_events(created_at);

alter table public.ai_decision_logs enable row level security;
alter table public.ai_review_queue enable row level security;
alter table public.ai_recommendation_versions enable row level security;
alter table public.ai_governance_events enable row level security;

create policy ai_decision_logs_owner_read on public.ai_decision_logs
for select using (user_id = auth.uid() or public.is_admin());

create policy ai_decision_logs_admin_all on public.ai_decision_logs
for all using (public.is_admin()) with check (public.is_admin());

create policy ai_review_queue_admin_all on public.ai_review_queue
for all using (public.is_admin()) with check (public.is_admin());

create policy ai_recommendation_versions_owner_read on public.ai_recommendation_versions
for select using (
  recommendation_id is null or exists (
    select 1 from public.ai_recommendations ar
    where ar.id = recommendation_id and ar.user_id = auth.uid()
  ) or public.is_admin()
);

create policy ai_recommendation_versions_admin_all on public.ai_recommendation_versions
for all using (public.is_admin()) with check (public.is_admin());

create policy ai_governance_events_admin_all on public.ai_governance_events
for all using (public.is_admin()) with check (public.is_admin());
