-- SkillBridge Malawi Step 3: employer feedback and competency profile improvement

create table if not exists public.employer_feedback (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references public.employer_profiles(id) on delete cascade,
  candidate_id uuid not null references public.student_profiles(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  application_id uuid references public.applications(id) on delete set null,
  employment_id uuid references public.employment(id) on delete set null,
  feedback_type text not null default 'employment' check (feedback_type in ('employment', 'internship', 'placement', 'apprenticeship', 'graduate_programme', 'interview', 'assessment', 'project')),
  review_date date not null default current_date,
  reviewer_role text not null default 'Supervisor',
  project_name text,
  organization text,
  strengths text,
  improvement_areas text,
  evidence text,
  development_plan text,
  next_review_goals text,
  overall_summary text,
  status text not null default 'submitted' check (status in ('draft', 'submitted', 'validated', 'disputed', 'excluded')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employer_feedback_competencies (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.employer_feedback(id) on delete cascade,
  name text not null,
  rating numeric check (rating is null or rating between 0 and 5),
  rating_label text,
  evidence text,
  comment text,
  not_observed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.employer_feedback_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.employer_feedback(id) on delete cascade,
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'acknowledged', 'disputed')),
  notes text,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (feedback_id, student_id)
);

create table if not exists public.employer_feedback_audit (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.employer_feedback(id) on delete cascade,
  action text not null,
  previous_values jsonb,
  new_values jsonb,
  changed_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists idx_employer_feedback_employer_id on public.employer_feedback(employer_id);
create index if not exists idx_employer_feedback_candidate_id on public.employer_feedback(candidate_id);
create index if not exists idx_employer_feedback_job_id on public.employer_feedback(job_id);
create index if not exists idx_employer_feedback_application_id on public.employer_feedback(application_id);
create index if not exists idx_employer_feedback_status on public.employer_feedback(status);
create index if not exists idx_employer_feedback_competencies_feedback_id on public.employer_feedback_competencies(feedback_id);
create index if not exists idx_employer_feedback_acknowledgements_feedback_id on public.employer_feedback_acknowledgements(feedback_id);

create trigger employer_feedback_updated_at before update on public.employer_feedback for each row execute function public.set_updated_at();
create trigger employer_feedback_acknowledgements_updated_at before update on public.employer_feedback_acknowledgements for each row execute function public.set_updated_at();

create or replace function public.has_employer_candidate_relationship(p_employer_id uuid, p_candidate_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.applications a
    join public.jobs j on j.id = a.job_id
    where a.student_id = p_candidate_id and j.employer_id = p_employer_id
  )
  or exists (
    select 1 from public.employment e
    where e.student_id = p_candidate_id and e.employer_id = p_employer_id
  );
$$;

create or replace function public.can_access_employer_feedback(p_feedback_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.employer_feedback ef
    where ef.id = p_feedback_id and (
      ef.employer_id = auth.uid()
      or ef.candidate_id = auth.uid()
      or public.is_admin()
    )
  );
$$;

alter table public.employer_feedback enable row level security;
alter table public.employer_feedback_competencies enable row level security;
alter table public.employer_feedback_acknowledgements enable row level security;
alter table public.employer_feedback_audit enable row level security;

create policy employer_feedback_admin_all on public.employer_feedback for all using (public.is_admin()) with check (public.is_admin());
create policy employer_feedback_employer_all on public.employer_feedback for all using (employer_id = auth.uid()) with check (employer_id = auth.uid());
create policy employer_feedback_candidate_read on public.employer_feedback for select using (candidate_id = auth.uid());
create policy employer_feedback_candidate_update on public.employer_feedback for update using (candidate_id = auth.uid()) with check (candidate_id = auth.uid());

create policy employer_feedback_competencies_admin_all on public.employer_feedback_competencies for all using (public.is_admin()) with check (public.is_admin());
create policy employer_feedback_competencies_employer_all on public.employer_feedback_competencies for all using (
  exists (select 1 from public.employer_feedback ef where ef.id = feedback_id and ef.employer_id = auth.uid())
) with check (
  exists (select 1 from public.employer_feedback ef where ef.id = feedback_id and ef.employer_id = auth.uid())
);
create policy employer_feedback_competencies_candidate_read on public.employer_feedback_competencies for select using (
  exists (select 1 from public.employer_feedback ef where ef.id = feedback_id and ef.candidate_id = auth.uid())
);

create policy employer_feedback_acknowledgements_admin_all on public.employer_feedback_acknowledgements for all using (public.is_admin()) with check (public.is_admin());
create policy employer_feedback_acknowledgements_cand_all on public.employer_feedback_acknowledgements for all using (
  student_id = auth.uid() or exists (select 1 from public.employer_feedback ef where ef.id = feedback_id and ef.employer_id = auth.uid())
) with check (
  student_id = auth.uid() or exists (select 1 from public.employer_feedback ef where ef.id = feedback_id and ef.employer_id = auth.uid())
);

create policy employer_feedback_audit_admin_read on public.employer_feedback_audit for select using (public.is_admin());
create policy employer_feedback_audit_employer_read on public.employer_feedback_audit for select using (
  exists (select 1 from public.employer_feedback ef where ef.id = feedback_id and ef.employer_id = auth.uid())
);
