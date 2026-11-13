-- Ensure the app's profile avatar bucket exists for the `profile-pictures` storage path.

-- Storage policies cannot use IF NOT EXISTS. Drop and recreate them in an idempotent way.
drop policy if exists "profile_pictures_public_read" on storage.objects;
create policy "profile_pictures_public_read"
  on storage.objects for select
  using (bucket_id = 'profile-pictures');

drop policy if exists "profile_pictures_authenticated_upload" on storage.objects;
create policy "profile_pictures_authenticated_upload"
  on storage.objects for insert
  with check (
    bucket_id = 'profile-pictures'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "profile_pictures_authenticated_update" on storage.objects;
create policy "profile_pictures_authenticated_update"
  on storage.objects for update
  using (
    bucket_id = 'profile-pictures'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'profile-pictures'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "profile_pictures_authenticated_delete" on storage.objects;
create policy "profile_pictures_authenticated_delete"
  on storage.objects for delete
  using (
    bucket_id = 'profile-pictures'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

insert into storage.buckets (id, name, public)
values ('profile-pictures', 'profile-pictures', true)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public;
