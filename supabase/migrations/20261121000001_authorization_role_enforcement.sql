drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can delete their own profile" on public.profiles;
revoke insert, delete on public.profiles from public, anon, authenticated;

create or replace function public.prevent_profile_admin_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role = 'admin'
     and not public.is_admin()
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Administrator accounts must be provisioned by an authorized administrator';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_admin_insert on public.profiles;
create trigger profiles_prevent_admin_insert
  before insert on public.profiles
  for each row execute function public.prevent_profile_admin_insert();

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
    full_name = excluded.full_name,
    email = excluded.email,
    company_name = excluded.company_name,
    avatar_url = excluded.avatar_url,
    updated_at = now();

  return new;
end;
$$;

create or replace function public.is_employer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'employer'
  );
$$;

create or replace function public.owns_employer(target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() = target_id and public.is_employer();
$$;

create or replace function public.can_access_application(target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.applications a
    join public.jobs j on j.id = a.job_id
    where a.id = target_id
      and (
        a.student_id = auth.uid()
        or (j.employer_id = auth.uid() and public.is_employer())
        or public.is_admin()
      )
  );
$$;

drop policy if exists employer_candidate_profile_read on public.profiles;
create policy employer_candidate_profile_read on public.profiles for select using (
  exists (
    select 1 from public.applications a
    join public.jobs j on j.id = a.job_id
    where a.student_id = profiles.id and public.owns_employer(j.employer_id)
  )
);

drop policy if exists employer_candidate_student_profile_read on public.student_profiles;
create policy employer_candidate_student_profile_read on public.student_profiles for select using (
  exists (
    select 1 from public.applications a
    join public.jobs j on j.id = a.job_id
    where a.student_id = student_profiles.id and public.owns_employer(j.employer_id)
  )
);

drop policy if exists employer_candidate_education_read on public.education;
create policy employer_candidate_education_read on public.education for select using (
  exists (
    select 1 from public.applications a
    join public.jobs j on j.id = a.job_id
    where a.student_id = education.student_id and public.owns_employer(j.employer_id)
  )
);

drop policy if exists employer_candidate_skills_read on public.user_skills;
create policy employer_candidate_skills_read on public.user_skills for select using (
  exists (
    select 1 from public.applications a
    join public.jobs j on j.id = a.job_id
    where a.student_id = user_skills.user_id and public.owns_employer(j.employer_id)
  )
);

drop policy if exists employer_candidate_evidence_read on public.skill_evidence;
create policy employer_candidate_evidence_read on public.skill_evidence for select using (
  exists (
    select 1 from public.user_skills us
    join public.applications a on a.student_id = us.user_id
    join public.jobs j on j.id = a.job_id
    where us.id = skill_evidence.user_skill_id and public.owns_employer(j.employer_id)
  )
);

drop policy if exists employer_candidate_projects_read on public.projects;
create policy employer_candidate_projects_read on public.projects for select using (
  exists (
    select 1 from public.applications a
    join public.jobs j on j.id = a.job_id
    where a.student_id = projects.student_id and public.owns_employer(j.employer_id)
  )
);

drop policy if exists employer_candidate_certificates_read on public.certificates;
create policy employer_candidate_certificates_read on public.certificates for select using (
  exists (
    select 1 from public.applications a
    join public.jobs j on j.id = a.job_id
    where a.student_id = certificates.student_id and public.owns_employer(j.employer_id)
  )
);

drop policy if exists employer_candidate_portfolio_read on public.portfolios;
create policy employer_candidate_portfolio_read on public.portfolios for select using (
  exists (
    select 1 from public.applications a
    join public.jobs j on j.id = a.job_id
    where a.student_id = portfolios.student_id and public.owns_employer(j.employer_id)
  )
);

drop policy if exists employer_candidate_results_read on public.assessment_results;
create policy employer_candidate_results_read on public.assessment_results for select using (
  exists (
    select 1 from public.applications a
    join public.jobs j on j.id = a.job_id
    join public.job_assessments ja on ja.job_id = a.job_id
    where a.student_id = assessment_results.student_id and public.owns_employer(j.employer_id)
      and ja.assessment_id = assessment_results.assessment_id
  )
);

drop policy if exists employer_candidate_matches_read on public.job_matches;
create policy employer_candidate_matches_read on public.job_matches for select using (
  exists (
    select 1 from public.jobs j
    where j.id = job_matches.job_id and public.owns_employer(j.employer_id)
  )
);

drop policy if exists employer_candidate_project_skills_read on public.project_skills;
create policy employer_candidate_project_skills_read on public.project_skills for select using (
  exists (
    select 1 from public.projects p
    join public.applications a on a.student_id = p.student_id
    join public.jobs j on j.id = a.job_id
    where p.id = project_id and public.owns_employer(j.employer_id)
  )
  or exists (
    select 1 from public.projects p
    join public.employment e on e.student_id = p.student_id
    where p.id = project_id and public.owns_employer(e.employer_id)
  )
);

drop policy if exists employer_candidate_portfolio_skills_read on public.portfolio_skills;
create policy employer_candidate_portfolio_skills_read on public.portfolio_skills for select using (
  exists (
    select 1 from public.portfolios p
    join public.applications a on a.student_id = p.student_id
    join public.jobs j on j.id = a.job_id
    where p.id = portfolio_id and public.owns_employer(j.employer_id)
  )
  or exists (
    select 1 from public.portfolios p
    join public.employment e on e.student_id = p.student_id
    where p.id = portfolio_id and public.owns_employer(e.employer_id)
  )
);

drop policy if exists employer_candidate_certificate_skills_read on public.certificate_skills;
create policy employer_candidate_certificate_skills_read on public.certificate_skills for select using (
  exists (
    select 1 from public.certificates c
    join public.applications a on a.student_id = c.student_id
    join public.jobs j on j.id = a.job_id
    where c.id = certificate_id and public.owns_employer(j.employer_id)
  )
  or exists (
    select 1 from public.certificates c
    join public.employment e on e.student_id = c.student_id
    where c.id = certificate_id and public.owns_employer(e.employer_id)
  )
);

drop policy if exists employer_employee_profile_read on public.profiles;
create policy employer_employee_profile_read on public.profiles for select using (
  exists (
    select 1 from public.employment e
    where e.student_id = profiles.id and public.owns_employer(e.employer_id)
  )
);

drop policy if exists employer_employee_student_profile_read on public.student_profiles;
create policy employer_employee_student_profile_read on public.student_profiles for select using (
  exists (
    select 1 from public.employment e
    where e.student_id = student_profiles.id and public.owns_employer(e.employer_id)
  )
);

create or replace function public.has_employer_candidate_relationship(p_employer_id uuid, p_candidate_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (public.is_admin() or public.owns_employer(p_employer_id))
    and (
      exists (
        select 1 from public.applications a
        join public.jobs j on j.id = a.job_id
        where a.student_id = p_candidate_id and j.employer_id = p_employer_id
      )
      or exists (
        select 1 from public.employment e
        where e.student_id = p_candidate_id and e.employer_id = p_employer_id
      )
    );
$$;

create or replace function public.can_access_employer_feedback(p_feedback_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.employer_feedback ef
    where ef.id = p_feedback_id
      and (
        public.owns_employer(ef.employer_id)
        or ef.candidate_id = auth.uid()
        or public.is_admin()
      )
  );
$$;

drop policy if exists employer_feedback_employer_all on public.employer_feedback;
create policy employer_feedback_employer_all on public.employer_feedback for all
  using (
    public.owns_employer(employer_id)
    and public.has_employer_candidate_relationship(employer_id, candidate_id)
  )
  with check (
    public.owns_employer(employer_id)
    and public.has_employer_candidate_relationship(employer_id, candidate_id)
  );

drop policy if exists employer_feedback_competencies_employer_all on public.employer_feedback_competencies;
create policy employer_feedback_competencies_employer_all on public.employer_feedback_competencies for all using (
  exists (
    select 1 from public.employer_feedback ef
    where ef.id = feedback_id and public.owns_employer(ef.employer_id)
  )
) with check (
  exists (
    select 1 from public.employer_feedback ef
    where ef.id = feedback_id and public.owns_employer(ef.employer_id)
  )
);

drop policy if exists employer_feedback_acknowledgements_cand_all on public.employer_feedback_acknowledgements;
create policy employer_feedback_acknowledgements_cand_all on public.employer_feedback_acknowledgements for all using (
  student_id = auth.uid()
  or exists (
    select 1 from public.employer_feedback ef
    where ef.id = feedback_id and public.owns_employer(ef.employer_id)
  )
) with check (
  student_id = auth.uid()
  or exists (
    select 1 from public.employer_feedback ef
    where ef.id = feedback_id and public.owns_employer(ef.employer_id)
  )
);

drop policy if exists employer_feedback_audit_employer_read on public.employer_feedback_audit;
create policy employer_feedback_audit_employer_read on public.employer_feedback_audit for select using (
  exists (
    select 1 from public.employer_feedback ef
    where ef.id = feedback_id and public.owns_employer(ef.employer_id)
  )
);

drop policy if exists employer_feedback_competency_audit_employer_read on public.employer_feedback_competency_audit;
create policy employer_feedback_competency_audit_employer_read on public.employer_feedback_competency_audit for select using (
  exists (
    select 1 from public.employer_feedback ef
    where ef.id = feedback_id and public.owns_employer(ef.employer_id)
  )
);

drop policy if exists employer_verification_submissions_owner_read on public.employer_verification_submissions;
create policy employer_verification_submissions_owner_read
  on public.employer_verification_submissions for select
  using (public.owns_employer(employer_id) or public.is_admin());
drop policy if exists employer_verification_submissions_owner_insert on public.employer_verification_submissions;
create policy employer_verification_submissions_owner_insert
  on public.employer_verification_submissions for insert
  with check (
    public.owns_employer(employer_id)
    and status = 'pending'
    and reviewer_feedback is null
    and reviewed_at is null
    and reviewed_by is null
  );
drop policy if exists employer_verification_events_owner_read on public.employer_verification_events;
create policy employer_verification_events_owner_read
  on public.employer_verification_events for select
  using (public.owns_employer(employer_id) or public.is_admin());

drop policy if exists employer_verification_documents_owner_read on storage.objects;
create policy employer_verification_documents_owner_read
  on storage.objects for select
  using (
    bucket_id = 'employer-verification-documents'
    and (
      (
        (storage.foldername(name))[1] = auth.uid()::text
        and public.owns_employer(auth.uid())
      )
      or public.is_admin()
    )
  );

drop policy if exists employer_verification_documents_owner_insert on storage.objects;
create policy employer_verification_documents_owner_insert
  on storage.objects for insert
  with check (
    bucket_id = 'employer-verification-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.owns_employer(auth.uid())
  );

drop policy if exists employer_verification_documents_owner_delete_unsubmitted on storage.objects;
create policy employer_verification_documents_owner_delete_unsubmitted
  on storage.objects for delete
  using (
    bucket_id = 'employer-verification-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.owns_employer(auth.uid())
    and not exists (
      select 1 from public.employer_verification_submissions s
      where s.document_path = name
    )
  );

notify pgrst, 'reload schema';
