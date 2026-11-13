insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-logos',
  'company-logos',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists company_logos_public_read on storage.objects;
create policy company_logos_public_read on storage.objects
  for select using (bucket_id = 'company-logos');

drop policy if exists company_logos_employer_insert on storage.objects;
create policy company_logos_employer_insert on storage.objects
  for insert with check (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'employer'
    )
  );

drop policy if exists company_logos_employer_update on storage.objects;
create policy company_logos_employer_update on storage.objects
  for update using (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'employer'
    )
  ) with check (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'employer'
    )
  );

drop policy if exists company_logos_employer_delete on storage.objects;
create policy company_logos_employer_delete on storage.objects
  for delete using (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'employer'
    )
  );
