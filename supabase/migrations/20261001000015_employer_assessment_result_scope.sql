-- Employers may only see a candidate's result for an assessment assigned to one of
-- their jobs, and only when that candidate has applied to that job.
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
