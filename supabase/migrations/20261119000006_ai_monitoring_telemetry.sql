create table if not exists public.ai_request_events (
  id uuid primary key default gen_random_uuid(),
  feature_type text not null,
  request_outcome text not null check (
    request_outcome in ('success', 'fallback', 'validation_error', 'unavailable', 'unauthorized', 'failure')
  ),
  model_provider text not null check (
    model_provider in ('google-gemini', 'deterministic-scoring', 'deterministic-fallback', 'not_attempted')
  ),
  model_identifier text,
  provider_status text not null check (
    provider_status in ('ok', 'invalid', 'unavailable', 'not_attempted', 'not_applicable')
  ),
  validation_status text not null check (
    validation_status in ('passed', 'failed', 'not_attempted', 'not_applicable')
  ),
  error_category text,
  provider_response_id text,
  duration_ms integer not null check (duration_ms >= 0),
  http_status smallint not null check (http_status between 100 and 599),
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_request_events_created_at
  on public.ai_request_events(created_at desc);
create index if not exists idx_ai_request_events_outcome_created_at
  on public.ai_request_events(request_outcome, created_at desc);
create index if not exists idx_ai_request_events_provider_created_at
  on public.ai_request_events(model_provider, created_at desc);

alter table public.ai_request_events enable row level security;

drop policy if exists ai_request_events_admin_read on public.ai_request_events;
create policy ai_request_events_admin_read on public.ai_request_events
for select using (public.is_admin());

revoke insert, update, delete, truncate on public.ai_request_events from anon, authenticated;
grant select on public.ai_request_events to authenticated;
grant insert on public.ai_request_events to service_role;

drop policy if exists ai_decision_logs_admin_all on public.ai_decision_logs;
drop policy if exists ai_decision_logs_admin_read on public.ai_decision_logs;
create policy ai_decision_logs_admin_read on public.ai_decision_logs
for select using (public.is_admin());

drop policy if exists ai_governance_events_admin_all on public.ai_governance_events;
drop policy if exists ai_governance_events_admin_read on public.ai_governance_events;
create policy ai_governance_events_admin_read on public.ai_governance_events
for select using (public.is_admin());
