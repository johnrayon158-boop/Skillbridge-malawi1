with published_job_details as (
  select
    j.id,
    j.employer_id,
    j.title,
    j.location,
    j.employment_type,
    j.opportunity_type,
    j.application_deadline,
    j.created_at,
    lower(regexp_replace(btrim(j.title), '[[:space:]]+', ' ', 'g')) as normalized_title,
    lower(regexp_replace(btrim(coalesce(j.location, '')), '[[:space:]]+', ' ', 'g')) as normalized_location,
    (select count(*) from public.job_skills js where js.job_id = j.id and js.is_required) as required_skill_count,
    (select count(*) from public.applications a where a.job_id = j.id) as application_count,
    (select count(*) from public.job_assessments ja where ja.job_id = j.id) as assessment_count,
    (
      select count(*)
      from public.assessment_results ar
      join public.job_assessments ja on ja.assessment_id = ar.assessment_id
      where ja.job_id = j.id
    ) as assessment_result_count,
    (
      select count(*)
      from public.notifications n
      where n.related_entity_type = 'job' and n.related_entity_id = j.id
    ) as notification_count
  from public.jobs j
  where j.status = 'published'
),
duplicate_signatures as (
  select
    employer_id,
    normalized_title,
    normalized_location,
    employment_type,
    opportunity_type,
    count(*) as job_count
  from published_job_details
  group by employer_id, normalized_title, normalized_location, employment_type, opportunity_type
  having count(*) > 1
)
select
  signatures.employer_id,
  signatures.normalized_title,
  signatures.normalized_location,
  signatures.employment_type,
  signatures.opportunity_type,
  signatures.job_count,
  jsonb_agg(
    jsonb_build_object(
      'job_id', jobs.id,
      'title', jobs.title,
      'location', jobs.location,
      'application_deadline', jobs.application_deadline,
      'created_at', jobs.created_at,
      'required_skill_count', jobs.required_skill_count,
      'application_count', jobs.application_count,
      'assessment_count', jobs.assessment_count,
      'assessment_result_count', jobs.assessment_result_count,
      'notification_count', jobs.notification_count
    )
    order by jobs.created_at, jobs.id
  ) as candidate_jobs
from duplicate_signatures signatures
join published_job_details jobs
  on jobs.employer_id = signatures.employer_id
  and jobs.normalized_title = signatures.normalized_title
  and jobs.normalized_location = signatures.normalized_location
  and jobs.employment_type = signatures.employment_type
  and jobs.opportunity_type is not distinct from signatures.opportunity_type
group by
  signatures.employer_id,
  signatures.normalized_title,
  signatures.normalized_location,
  signatures.employment_type,
  signatures.opportunity_type,
  signatures.job_count
order by signatures.normalized_title, signatures.employer_id;
