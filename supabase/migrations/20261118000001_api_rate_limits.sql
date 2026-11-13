create table if not exists public.api_rate_limit_buckets (
  key_hash text primary key check (key_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  reset_at timestamptz not null
);

create index if not exists api_rate_limit_buckets_reset_at_idx
  on public.api_rate_limit_buckets (reset_at);

alter table public.api_rate_limit_buckets enable row level security;
revoke all on public.api_rate_limit_buckets from public, anon, authenticated;
grant all on public.api_rate_limit_buckets to service_role;

create or replace function public.consume_api_rate_limit(
  p_key_hash text,
  p_max_requests integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  current_count integer;
  current_reset_at timestamptz;
begin
  if p_key_hash !~ '^[a-f0-9]{64}$'
    or p_max_requests < 1
    or p_max_requests > 1000000
    or p_window_seconds < 1
    or p_window_seconds > 86400 then
    raise exception 'Invalid API rate-limit parameters.';
  end if;

  if get_byte(decode(substr(p_key_hash, 1, 2), 'hex'), 0) = 0 then
    with expired_buckets as (
      select key_hash
      from public.api_rate_limit_buckets
      where reset_at < now() - interval '1 day'
      order by reset_at
      limit 100
    )
    delete from public.api_rate_limit_buckets as buckets
    using expired_buckets
    where buckets.key_hash = expired_buckets.key_hash;
  end if;

  insert into public.api_rate_limit_buckets as buckets (
    key_hash,
    window_started_at,
    request_count,
    reset_at
  )
  values (
    p_key_hash,
    now(),
    1,
    now() + make_interval(secs => p_window_seconds)
  )
  on conflict (key_hash) do update
  set
    window_started_at = case
      when buckets.reset_at <= now() then now()
      else buckets.window_started_at
    end,
    request_count = case
      when buckets.reset_at <= now() then 1
      else least(buckets.request_count + 1, p_max_requests + 1)
    end,
    reset_at = case
      when buckets.reset_at <= now() then now() + make_interval(secs => p_window_seconds)
      else buckets.reset_at
    end
  returning buckets.request_count, buckets.reset_at
  into current_count, current_reset_at;

  return query select
    current_count <= p_max_requests,
    greatest(0, p_max_requests - current_count),
    greatest(1, ceil(extract(epoch from current_reset_at - now()))::integer),
    current_reset_at;
end;
$$;

create or replace function public.check_api_rate_limit_storage()
returns boolean
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select not exists (
    select 1
    from public.api_rate_limit_buckets
    where false
  );
$$;

revoke all on function public.consume_api_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.check_api_rate_limit_storage() from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, integer, integer) to service_role;
grant execute on function public.check_api_rate_limit_storage() to service_role;
