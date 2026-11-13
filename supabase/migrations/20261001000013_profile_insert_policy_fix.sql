-- Fix Supabase user creation when the auth trigger inserts the profile row.
-- During auth.users inserts, no session is active, so the profile row must be allowed to be created by the trigger.

create policy "Users can insert their own profile"
on public.profiles for insert
with check (auth.uid() = id or auth.uid() is null);

-- Keep the general user row protections in place while allowing the system trigger to create the profile.
-- Any authenticated user still must only insert rows for their own user id.
