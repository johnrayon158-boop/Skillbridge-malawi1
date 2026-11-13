alter table public.skill_aliases enable row level security;

drop policy if exists skill_aliases_public_read on public.skill_aliases;
create policy skill_aliases_public_read
  on public.skill_aliases
  for select
  using (true);

drop policy if exists skill_aliases_admin_all on public.skill_aliases;
create policy skill_aliases_admin_all
  on public.skill_aliases
  for all
  using (public.is_admin())
  with check (public.is_admin());
