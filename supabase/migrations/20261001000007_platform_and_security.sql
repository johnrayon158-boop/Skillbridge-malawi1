-- SkillBridge Malawi Step 3: notifications, AI storage, audit logs and RLS helpers.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  notification_type text not null,
  related_entity_type text,
  related_entity_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  reminder_type text not null,
  reminder_date timestamptz not null,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  subject text,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  check (sender_id <> receiver_id)
);

create table if not exists public.ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  recommendation_type text not null,
  input_data jsonb not null,
  output_data jsonb not null,
  explanation text,
  model_name text,
  feedback_status text,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_feedback (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references public.ai_recommendations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_useful boolean not null,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  description text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_id on public.notifications(user_id);
create index if not exists idx_notifications_is_read on public.notifications(is_read);
create index if not exists idx_reminders_user_id on public.reminders(user_id);
create index if not exists idx_messages_receiver_id on public.messages(receiver_id);
create index if not exists idx_ai_recommendations_user_id on public.ai_recommendations(user_id);

create trigger reminders_updated_at before update on public.reminders for each row execute function public.set_updated_at();

create or replace function public.owns_student(target_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select auth.uid() = target_id; $$;

create or replace function public.owns_employer(target_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select auth.uid() = target_id; $$;

create or replace function public.can_access_application(target_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.applications a
    join public.jobs j on j.id = a.job_id
    where a.id = target_id
      and (a.student_id = auth.uid() or j.employer_id = auth.uid() or public.is_admin())
  );
$$;

-- RLS is enabled on every application table. Public catalog tables receive selective read policies below.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'student_profiles', 'employer_profiles', 'education', 'skills', 'user_skills', 'skill_evidence',
    'careers', 'career_skills', 'career_recommendations', 'career_feedback', 'career_roadmaps',
    'assessments', 'assessment_questions', 'assessment_results', 'learning_resources', 'learning_paths',
    'learning_path_resources', 'learning_progress', 'projects', 'project_skills', 'certificates', 'portfolios',
    'jobs', 'job_skills', 'job_matches', 'saved_jobs', 'applications', 'application_events',
    'recruitment_stages', 'application_stage_progress', 'interviews', 'offers', 'employment',
    'employment_progress', 'career_progress', 'job_assessments', 'notifications', 'reminders', 'messages',
    'ai_recommendations', 'ai_feedback', 'admin_logs'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_admin_all', table_name);
    execute format('create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())', table_name || '_admin_all', table_name);
  end loop;
end $$;

-- Profiles: the existing Step 2 policies remain, with admin visibility added.
drop policy if exists profiles_admin_select on public.profiles;
create policy profiles_admin_select on public.profiles for select using (public.is_admin());
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update using (public.is_admin()) with check (public.is_admin());

create policy student_profiles_owner_all on public.student_profiles for all using (public.owns_student(id)) with check (public.owns_student(id));
create policy employer_profiles_owner_all on public.employer_profiles for all using (public.owns_employer(id)) with check (public.owns_employer(id));
create policy education_owner_all on public.education for all using (public.owns_student(student_id)) with check (public.owns_student(student_id));
create policy user_skills_owner_all on public.user_skills for all using (public.owns_student(user_id)) with check (public.owns_student(user_id));
create policy skill_evidence_owner_all on public.skill_evidence for all using (exists (select 1 from public.user_skills us where us.id = user_skill_id and public.owns_student(us.user_id))) with check (exists (select 1 from public.user_skills us where us.id = user_skill_id and public.owns_student(us.user_id)));

create policy skills_public_read on public.skills for select using (true);
create policy careers_public_read on public.careers for select using (true);
create policy career_skills_public_read on public.career_skills for select using (true);
create policy learning_resources_public_read on public.learning_resources for select using (true);
create policy assessments_published_read on public.assessments for select using (status = 'published' or created_by = auth.uid());
create policy assessment_questions_published_read on public.assessment_questions for select using (exists (select 1 from public.assessments a where a.id = assessment_id and (a.status = 'published' or a.created_by = auth.uid())));

create policy career_recommendations_owner_all on public.career_recommendations for all using (public.owns_student(student_id)) with check (public.owns_student(student_id));
create policy career_feedback_owner_all on public.career_feedback for all using (public.owns_student(student_id)) with check (public.owns_student(student_id));
create policy career_roadmaps_owner_all on public.career_roadmaps for all using (public.owns_student(student_id)) with check (public.owns_student(student_id));
create policy assessment_results_owner_all on public.assessment_results for all using (public.owns_student(student_id)) with check (public.owns_student(student_id));
create policy learning_paths_owner_all on public.learning_paths for all using (public.owns_student(student_id)) with check (public.owns_student(student_id));
create policy learning_path_resources_owner_all on public.learning_path_resources for all using (exists (select 1 from public.learning_paths lp where lp.id = learning_path_id and public.owns_student(lp.student_id))) with check (exists (select 1 from public.learning_paths lp where lp.id = learning_path_id and public.owns_student(lp.student_id)));
create policy learning_progress_owner_all on public.learning_progress for all using (public.owns_student(student_id)) with check (public.owns_student(student_id));

create policy projects_owner_all on public.projects for all using (public.owns_student(student_id)) with check (public.owns_student(student_id));
create policy project_skills_owner_all on public.project_skills for all using (exists (select 1 from public.projects p where p.id = project_id and public.owns_student(p.student_id))) with check (exists (select 1 from public.projects p where p.id = project_id and public.owns_student(p.student_id)));
create policy certificates_owner_all on public.certificates for all using (public.owns_student(student_id)) with check (public.owns_student(student_id));
create policy portfolios_owner_all on public.portfolios for all using (public.owns_student(student_id)) with check (public.owns_student(student_id));
create policy portfolios_public_read on public.portfolios for select using (is_public = true);

create policy jobs_employer_all on public.jobs for all using (public.owns_employer(employer_id)) with check (public.owns_employer(employer_id));
create policy jobs_published_read on public.jobs for select using (status = 'published');
create policy job_skills_employer_all on public.job_skills for all using (exists (select 1 from public.jobs j where j.id = job_id and public.owns_employer(j.employer_id))) with check (exists (select 1 from public.jobs j where j.id = job_id and public.owns_employer(j.employer_id)));
create policy job_skills_published_read on public.job_skills for select using (exists (select 1 from public.jobs j where j.id = job_id and j.status = 'published'));
create policy job_matches_student_read on public.job_matches for select using (public.owns_student(student_id) or exists (select 1 from public.jobs j where j.id = job_id and public.owns_employer(j.employer_id)));
create policy saved_jobs_owner_all on public.saved_jobs for all using (public.owns_student(student_id)) with check (public.owns_student(student_id));
create policy applications_student_all on public.applications for all using (public.owns_student(student_id)) with check (public.owns_student(student_id));
create policy applications_employer_read on public.applications for select using (exists (select 1 from public.jobs j where j.id = job_id and public.owns_employer(j.employer_id)));
create policy applications_employer_update on public.applications for update using (exists (select 1 from public.jobs j where j.id = job_id and public.owns_employer(j.employer_id))) with check (exists (select 1 from public.jobs j where j.id = job_id and public.owns_employer(j.employer_id)));
create policy application_events_participant_all on public.application_events for all using (public.can_access_application(application_id)) with check (public.can_access_application(application_id));

create policy recruitment_stages_employer_all on public.recruitment_stages for all using (public.owns_employer(employer_id)) with check (public.owns_employer(employer_id));
create policy application_stage_progress_participant_all on public.application_stage_progress for all using (public.can_access_application(application_id)) with check (public.can_access_application(application_id));
create policy interviews_participant_all on public.interviews for all using (exists (select 1 from public.applications a where a.id = application_id and public.can_access_application(a.id))) with check (exists (select 1 from public.applications a where a.id = application_id and public.can_access_application(a.id)));
create policy offers_participant_all on public.offers for all using (exists (select 1 from public.applications a where a.id = application_id and public.can_access_application(a.id))) with check (exists (select 1 from public.applications a where a.id = application_id and public.can_access_application(a.id)));
create policy employment_participant_all on public.employment for all using (public.owns_student(student_id) or public.owns_employer(employer_id)) with check (public.owns_student(student_id) or public.owns_employer(employer_id));
create policy employment_progress_participant_all on public.employment_progress for all using (exists (select 1 from public.employment e where e.id = employment_id and (public.owns_student(e.student_id) or public.owns_employer(e.employer_id)))) with check (exists (select 1 from public.employment e where e.id = employment_id and (public.owns_student(e.student_id) or public.owns_employer(e.employer_id))));
create policy career_progress_owner_all on public.career_progress for all using (public.owns_student(student_id)) with check (public.owns_student(student_id));
create policy job_assessments_employer_all on public.job_assessments for all using (exists (select 1 from public.jobs j where j.id = job_id and public.owns_employer(j.employer_id))) with check (exists (select 1 from public.jobs j where j.id = job_id and public.owns_employer(j.employer_id)));

create policy notifications_owner_all on public.notifications for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reminders_owner_all on public.reminders for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy messages_participant_all on public.messages for all using (sender_id = auth.uid() or receiver_id = auth.uid()) with check (sender_id = auth.uid());
create policy ai_recommendations_owner_all on public.ai_recommendations for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ai_feedback_owner_all on public.ai_feedback for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy admin_logs_admin_read on public.admin_logs for select using (public.is_admin());
