alter table public.projects
  add column if not exists image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'student-project-images',
  'student-project-images',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif',
    'image/gif',
    'image/heic',
    'image/heif'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists student_project_images_owner_select on storage.objects;
create policy student_project_images_owner_select on storage.objects
  for select using (
    bucket_id = 'student-project-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists student_project_images_owner_insert on storage.objects;
create policy student_project_images_owner_insert on storage.objects
  for insert with check (
    bucket_id = 'student-project-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists student_project_images_owner_delete on storage.objects;
create policy student_project_images_owner_delete on storage.objects
  for delete using (
    bucket_id = 'student-project-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
