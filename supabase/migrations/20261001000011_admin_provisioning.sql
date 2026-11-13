-- SkillBridge Malawi: controlled admin provisioning.
-- Admins are created through Supabase Auth/Dashboard, never public signup.

create or replace function public.prevent_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and not public.is_admin()
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Users cannot change their role';
  end if;
  return new;
end;
$$;

-- Recreate the trigger in case a database was provisioned manually.
drop trigger if exists profiles_prevent_role_change on public.profiles;
create trigger profiles_prevent_role_change
before update on public.profiles
for each row execute function public.prevent_profile_role_change();
