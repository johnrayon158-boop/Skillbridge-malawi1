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
      or not (
        question_items.question_data->'options'
        @> jsonb_build_array(question_items.question_data->'correct_answer')
      )
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

  insert into public.assessments (
    title, description, assessment_type, job_id, duration_minutes,
    difficulty, passing_score, created_by, status
  )
  values (
    selected_job.title || ' Skills Assessment',
    'A job-specific assessment covering required skills for ' || selected_job.title || '.',
    'job',
    selected_job.id,
    greatest(1, least(coalesce(p_duration_minutes, 15), 120)),
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

  insert into public.job_assessments (job_id, assessment_id, required)
  values (selected_job.id, created_assessment.id, true);

  return created_assessment.id;
end;
$$;

revoke all on function public.employer_generate_job_assessment(uuid, integer, jsonb) from public;
grant execute on function public.employer_generate_job_assessment(uuid, integer, jsonb) to authenticated;

notify pgrst, 'reload schema';
