-- Restore recruitment-scoped visibility for candidate records in employer review.
drop policy if exists employer_candidate_profile_read on public.profiles;
create policy employer_candidate_profile_read on public.profiles
for select using (
  exists (
    select 1
    from public.applications a
    join public.jobs j on j.id = a.job_id
    where a.student_id = profiles.id
      and j.employer_id = auth.uid()
  )
);

drop policy if exists employer_candidate_student_profile_read on public.student_profiles;
create policy employer_candidate_student_profile_read on public.student_profiles
for select using (
  exists (
    select 1
    from public.applications a
    join public.jobs j on j.id = a.job_id
    where a.student_id = student_profiles.id
      and j.employer_id = auth.uid()
  )
);

drop policy if exists employer_candidate_education_read on public.education;
create policy employer_candidate_education_read on public.education
for select using (
  exists (
    select 1
    from public.applications a
    join public.jobs j on j.id = a.job_id
    where a.student_id = education.student_id
      and j.employer_id = auth.uid()
  )
);

drop policy if exists employer_candidate_skills_read on public.user_skills;
create policy employer_candidate_skills_read on public.user_skills
for select using (
  exists (
    select 1
    from public.applications a
    join public.jobs j on j.id = a.job_id
    where a.student_id = user_skills.user_id
      and j.employer_id = auth.uid()
  )
);

drop policy if exists employer_candidate_projects_read on public.projects;
create policy employer_candidate_projects_read on public.projects
for select using (
  exists (
    select 1
    from public.applications a
    join public.jobs j on j.id = a.job_id
    where a.student_id = projects.student_id
      and j.employer_id = auth.uid()
  )
);

drop policy if exists employer_candidate_certificates_read on public.certificates;
create policy employer_candidate_certificates_read on public.certificates
for select using (
  exists (
    select 1
    from public.applications a
    join public.jobs j on j.id = a.job_id
    where a.student_id = certificates.student_id
      and j.employer_id = auth.uid()
  )
);

drop policy if exists employer_candidate_results_read on public.assessment_results;
create policy employer_candidate_results_read on public.assessment_results
for select using (
  exists (
    select 1
    from public.applications a
    join public.jobs j on j.id = a.job_id
    join public.job_assessments ja on ja.job_id = a.job_id
    where a.student_id = assessment_results.student_id
      and j.employer_id = auth.uid()
      and ja.assessment_id = assessment_results.assessment_id
  )
);
