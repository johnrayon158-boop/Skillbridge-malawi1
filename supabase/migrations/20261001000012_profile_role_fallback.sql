-- Repair the profile-role fallback for invited users and ensure null roles are corrected.

alter table public.profiles
  alter column role set default 'student';

update public.profiles
set role = 'student'
where role is null or role not in ('student', 'employer', 'admin');

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text := coalesce(new.raw_user_meta_data->>'role', 'student');
begin
  if requested_role not in ('student', 'employer') then
    requested_role := 'student';
  end if;

  insert into public.profiles (id, full_name, email, role, company_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), 'User'),
    new.email,
    requested_role,
    new.raw_user_meta_data->>'company_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set
    role = excluded.role,
    full_name = excluded.full_name,
    email = excluded.email,
    company_name = excluded.company_name,
    avatar_url = excluded.avatar_url,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
