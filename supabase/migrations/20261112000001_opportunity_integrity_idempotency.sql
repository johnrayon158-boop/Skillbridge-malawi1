alter table public.job_assessments
  add column if not exists request_fingerprint text;

create unique index if not exists job_assessments_job_request_fingerprint
  on public.job_assessments(job_id, request_fingerprint)
  where request_fingerprint is not null;

alter table public.assessment_results
  add column if not exists submission_key text;

create unique index if not exists assessment_results_submission_key
  on public.assessment_results(submission_key)
  where submission_key is not null;

alter table public.education
  add constraint education_required_text_nonempty
  check (
    length(btrim(institution)) > 0
    and length(btrim(programme)) > 0
    and length(btrim(qualification)) > 0
    and length(btrim(education_level)) > 0
  ) not valid;

create or replace function public.employer_generate_job_assessment(
  p_job_id uuid,
  p_duration_minutes integer,
  p_questions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_job public.jobs;
  created_assessment public.assessments;
  v_question_data jsonb;
  v_duration_minutes integer;
  v_request_fingerprint text;
  v_existing_assessment_id uuid;
begin
  select *
  into selected_job
  from public.jobs
  where id = p_job_id
    and public.owns_employer(employer_id)
  for update;

  if not found then
    raise exception 'Job not found or not owned by this employer';
  end if;

  if jsonb_typeof(p_questions) is distinct from 'array' then
    raise exception 'Assessment questions must be provided as a JSON array';
  end if;

  if jsonb_array_length(p_questions) < 1 or jsonb_array_length(p_questions) > 10 then
    raise exception 'An assessment must contain between 1 and 10 questions';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_questions) as question_items(question_data)
    where jsonb_typeof(question_items.question_data->'question') <> 'string'
      or length(trim(question_items.question_data->>'question')) = 0
      or jsonb_typeof(question_items.question_data->'options') <> 'array'
      or jsonb_array_length(question_items.question_data->'options') <> 4
      or jsonb_typeof(question_items.question_data->'correct_answer') <> 'string'
      or not (question_items.question_data->'options' @> jsonb_build_array(question_items.question_data->'correct_answer'))
  ) then
    raise exception 'Assessment questions must have four answer options and one matching correct answer';
  end if;

  if not exists (
    select 1
    from public.job_skills
    where job_id = p_job_id
      and is_required = true
  ) then
    raise exception 'Add required skills to this job before generating an assessment';
  end if;

  v_duration_minutes := greatest(1, least(coalesce(p_duration_minutes, 15), 120));
  v_request_fingerprint := md5(jsonb_build_object(
    'duration_minutes', v_duration_minutes,
    'questions', p_questions
  )::text);

  select assessment_id
  into v_existing_assessment_id
  from public.job_assessments
  where job_id = p_job_id
    and request_fingerprint = v_request_fingerprint;

  if found then
    return v_existing_assessment_id;
  end if;

  insert into public.assessments (
    title, description, assessment_type, job_id, duration_minutes,
    difficulty, passing_score, created_by, status
  )
  values (
    selected_job.title || ' Skills Assessment',
    'A job-specific assessment covering required skills for ' || selected_job.title || '.',
    'job',
    selected_job.id,
    v_duration_minutes,
    'intermediate',
    60,
    auth.uid(),
    'published'
  )
  returning * into created_assessment;

  for v_question_data in select value from jsonb_array_elements(p_questions)
  loop
    insert into public.assessment_questions (
      assessment_id, question, question_type, options, correct_answer,
      points, difficulty, explanation
    )
    values (
      created_assessment.id,
      trim(v_question_data->>'question'),
      'multiple_choice',
      v_question_data->'options',
      v_question_data->'correct_answer',
      1,
      'intermediate',
      nullif(trim(v_question_data->>'explanation'), '')
    );
  end loop;

  insert into public.job_assessments (job_id, assessment_id, required, request_fingerprint)
  values (selected_job.id, created_assessment.id, true, v_request_fingerprint);

  return created_assessment.id;
end;
$$;

revoke all on function public.employer_generate_job_assessment(uuid, integer, jsonb) from public;
grant execute on function public.employer_generate_job_assessment(uuid, integer, jsonb) to authenticated;

create or replace function public.submit_assessment_result(
  p_assessment_id uuid,
  p_student_id uuid,
  p_answers jsonb,
  p_started_at timestamptz
)
returns table (result_id uuid, percentage numeric, passed boolean)
language plpgsql
security invoker
set search_path = public
as $$
declare
  total_points numeric := 0;
  earned_points numeric := 0;
  pass_mark numeric;
  final_percentage numeric := 0;
  final_passed boolean := false;
  inserted_id uuid;
  existing_percentage numeric;
  existing_passed boolean;
  v_submission_key text;
begin
  if auth.uid() is null or auth.uid() <> p_student_id then
    raise exception 'You can only submit your own assessment';
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Assessment answers must be an object keyed by question ID';
  end if;

  if p_started_at is null or p_started_at > now() then
    raise exception 'Assessment start time is invalid';
  end if;

  v_submission_key := md5(
    p_assessment_id::text || ':' || p_student_id::text || ':' || extract(epoch from p_started_at)::text
  );

  select ar.id, ar.percentage, ar.passed
  into inserted_id, existing_percentage, existing_passed
  from public.assessment_results ar
  where ar.submission_key = v_submission_key;

  if found then
    return query select inserted_id, existing_percentage, existing_passed;
    return;
  end if;

  select coalesce(a.passing_score, 60) into pass_mark
  from public.assessments a
  where a.id = p_assessment_id and a.status = 'published';

  if pass_mark is null then
    raise exception 'Assessment is unavailable';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_answers) as keys(answer_key)
    where not exists (
      select 1
      from public.assessment_questions q
      where q.assessment_id = p_assessment_id
        and q.id::text = answer_key
    )
  ) then
    raise exception 'Submitted answers include questions outside this assessment';
  end if;

  select coalesce(sum(q.points) filter (where q.correct_answer is not null), 0),
         coalesce(sum(q.points) filter (
           where q.correct_answer is not null
             and (p_answers -> q.id::text) = q.correct_answer
         ), 0)
  into total_points, earned_points
  from public.assessment_questions q
  where q.assessment_id = p_assessment_id;

  if total_points <= 0 then
    raise exception 'Assessment has no gradable questions';
  end if;

  final_percentage := round((earned_points / total_points) * 100, 2);
  final_passed := final_percentage >= pass_mark;

  insert into public.assessment_results (
    assessment_id, student_id, score, percentage, level, passed,
    strengths, weaknesses, recommendations, started_at, completed_at, submission_key
  ) values (
    p_assessment_id, p_student_id, final_percentage, final_percentage,
    case when final_percentage >= 80 then 'expert' when final_percentage >= 60 then 'advanced' when final_percentage >= 40 then 'intermediate' else 'beginner' end,
    final_passed,
    case when final_passed then '["Assessment evidence recorded"]'::jsonb else '[]'::jsonb end,
    case when final_passed then '[]'::jsonb else '["Review the related skill gaps"]'::jsonb end,
    '["Review recommended learning resources"]'::jsonb,
    p_started_at, now(), v_submission_key
  )
  on conflict (submission_key) where submission_key is not null do nothing
  returning id into inserted_id;

  if inserted_id is null then
    select ar.id, ar.percentage, ar.passed
    into inserted_id, existing_percentage, existing_passed
    from public.assessment_results ar
    where ar.submission_key = v_submission_key;

    return query select inserted_id, existing_percentage, existing_passed;
    return;
  end if;

  return query select inserted_id, final_percentage, final_passed;
end;
$$;

revoke all on function public.submit_assessment_result(uuid, uuid, jsonb, timestamptz) from public;
grant execute on function public.submit_assessment_result(uuid, uuid, jsonb, timestamptz) to authenticated;
