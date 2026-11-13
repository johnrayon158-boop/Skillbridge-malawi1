alter table public.cv_analyses
  add column if not exists document_id uuid references public.cv_documents(id) on delete cascade;

create index if not exists idx_cv_analyses_document_id
  on public.cv_analyses(document_id);
