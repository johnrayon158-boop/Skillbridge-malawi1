create table if not exists public.system_health_incidents (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in (
    'service_check', 'api_error', 'rate_limit', 'authentication', 'client_auth_failure'
  )),
  service text not null check (service in (
    'api', 'database', 'authentication', 'storage', 'email', 'gemini', 'rate_limit'
  )),
  severity text not null check (severity in ('warning', 'error')),
  message text not null check (char_length(message) between 1 and 300),
  route_category text check (route_category is null or route_category in ('api', 'ai', 'admin', 'search', 'health')),
  http_status smallint check (http_status is null or http_status between 100 and 599),
  occurred_at timestamptz not null default now()
);

create index if not exists system_health_incidents_recent_idx
  on public.system_health_incidents(occurred_at desc);
create index if not exists system_health_incidents_source_recent_idx
  on public.system_health_incidents(source, occurred_at desc);

alter table public.system_health_incidents enable row level security;

drop policy if exists system_health_incidents_admin_read on public.system_health_incidents;
create policy system_health_incidents_admin_read
  on public.system_health_incidents for select
  using (public.is_admin());

revoke all on public.system_health_incidents from public, anon, authenticated;
grant select on public.system_health_incidents to authenticated;
grant select, insert on public.system_health_incidents to service_role;

notify pgrst, 'reload schema';
