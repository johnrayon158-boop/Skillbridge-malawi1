create table if not exists public.cv_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null check (mime_type in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  file_size_bytes bigint not null check (file_size_bytes between 1 and 10485760),
  created_at timestamptz not null default now()
);

create table if not exists public.cv_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  document_id uuid not null references public.cv_documents(id) on delete cascade,
  original_filename text not null,
  mime_type text not null check (mime_type in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  target_type text not null check (target_type in ('career', 'job', 'internship', 'career_goal')),
  target_id uuid,
  target_title text not null,
  compatibility_score integer not null check (compatibility_score between 0 and 100),
  score_breakdown jsonb not null default '{}'::jsonb,
  analysis_result jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_cv_analyses_user_created
  on public.cv_analyses(user_id, created_at desc);
create index if not exists idx_cv_documents_user_created
  on public.cv_documents(user_id, created_at desc);

alter table public.cv_documents enable row level security;
alter table public.cv_analyses enable row level security;

drop policy if exists cv_documents_owner_all on public.cv_documents;
create policy cv_documents_owner_all on public.cv_documents
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists cv_analyses_owner_select on public.cv_analyses;
create policy cv_analyses_owner_select on public.cv_analyses
  for select using (user_id = auth.uid());

drop policy if exists cv_analyses_owner_insert on public.cv_analyses;
create policy cv_analyses_owner_insert on public.cv_analyses
  for insert with check (user_id = auth.uid());

drop policy if exists cv_analyses_owner_delete on public.cv_analyses;
create policy cv_analyses_owner_delete on public.cv_analyses
  for delete using (user_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cv-documents',
  'cv-documents',
  false,
  10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists cv_documents_owner_select on storage.objects;
create policy cv_documents_owner_select on storage.objects
  for select using (
    bucket_id = 'cv-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists cv_documents_owner_insert on storage.objects;
create policy cv_documents_owner_insert on storage.objects
  for insert with check (
    bucket_id = 'cv-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists cv_documents_owner_update on storage.objects;
create policy cv_documents_owner_update on storage.objects
  for update using (
    bucket_id = 'cv-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'cv-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists cv_documents_owner_delete on storage.objects;
create policy cv_documents_owner_delete on storage.objects
  for delete using (
    bucket_id = 'cv-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
