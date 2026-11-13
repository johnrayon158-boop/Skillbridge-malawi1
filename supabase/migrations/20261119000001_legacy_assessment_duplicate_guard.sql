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
  v_existing_assessment_status text;
  v_legacy_match_count integer;
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

  select ja.assessment_id, a.status
  into v_existing_assessment_id, v_existing_assessment_status
  from public.job_assessments ja
  join public.assessments a on a.id = ja.assessment_id
  where ja.job_id = p_job_id
    and ja.request_fingerprint = v_request_fingerprint;

  if found then
    if v_existing_assessment_status = 'published' then
      return v_existing_assessment_id;
    elsif v_existing_assessment_status = 'archived' then
      update public.job_assessments
      set request_fingerprint = null
      where job_id = p_job_id
        and assessment_id = v_existing_assessment_id
        and request_fingerprint = v_request_fingerprint;
    else
      raise exception 'An identical assessment exists but is not published; administrator review is required';
    end if;
  end if;

  select count(*)
  into v_legacy_match_count
  from public.assessments a
  join public.job_assessments ja on ja.assessment_id = a.id
  where ja.job_id = selected_job.id
    and a.job_id = selected_job.id
    and a.assessment_type = 'job'
    and a.status is distinct from 'archived'
    and lower(btrim(a.title)) = lower(btrim(selected_job.title || ' Skills Assessment'))
    and (
      select count(*)
      from public.assessment_questions stored_question
      where stored_question.assessment_id = a.id
    ) = jsonb_array_length(p_questions)
    and not exists (
      select 1
      from jsonb_array_elements(p_questions) as input_items(question_data)
      where not exists (
        select 1
        from public.assessment_questions stored_question
        where stored_question.assessment_id = a.id
          and stored_question.question = btrim(input_items.question_data->>'question')
          and stored_question.question_type = coalesce(input_items.question_data->>'question_type', 'multiple_choice')
          and stored_question.options = input_items.question_data->'options'
          and stored_question.correct_answer = input_items.question_data->'correct_answer'
          and stored_question.points = coalesce((input_items.question_data->>'points')::integer, 1)
          and stored_question.difficulty is not distinct from coalesce(nullif(btrim(input_items.question_data->>'difficulty'), ''), 'intermediate')
          and stored_question.explanation is not distinct from nullif(btrim(input_items.question_data->>'explanation'), '')
      )
    );

  if v_legacy_match_count > 1 then
    raise exception 'Multiple identical assessments already exist for this job; administrator review is required';
  elsif v_legacy_match_count = 1 then
    select a.id, a.status
    into v_existing_assessment_id, v_existing_assessment_status
    from public.assessments a
    join public.job_assessments ja on ja.assessment_id = a.id
    where ja.job_id = selected_job.id
      and a.job_id = selected_job.id
      and a.assessment_type = 'job'
      and a.status is distinct from 'archived'
      and lower(btrim(a.title)) = lower(btrim(selected_job.title || ' Skills Assessment'))
      and (
        select count(*)
        from public.assessment_questions stored_question
        where stored_question.assessment_id = a.id
      ) = jsonb_array_length(p_questions)
      and not exists (
        select 1
        from jsonb_array_elements(p_questions) as input_items(question_data)
        where not exists (
          select 1
          from public.assessment_questions stored_question
          where stored_question.assessment_id = a.id
            and stored_question.question = btrim(input_items.question_data->>'question')
            and stored_question.question_type = coalesce(input_items.question_data->>'question_type', 'multiple_choice')
            and stored_question.options = input_items.question_data->'options'
            and stored_question.correct_answer = input_items.question_data->'correct_answer'
            and stored_question.points = coalesce((input_items.question_data->>'points')::integer, 1)
            and stored_question.difficulty is not distinct from coalesce(nullif(btrim(input_items.question_data->>'difficulty'), ''), 'intermediate')
            and stored_question.explanation is not distinct from nullif(btrim(input_items.question_data->>'explanation'), '')
        )
      )
    limit 1;

    if v_existing_assessment_status is distinct from 'published' then
      raise exception 'An identical non-published assessment already exists; administrator review is required';
    end if;

    update public.job_assessments
    set request_fingerprint = v_request_fingerprint
    where job_id = selected_job.id
      and assessment_id = v_existing_assessment_id
      and request_fingerprint is null;

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
      btrim(v_question_data->>'question'),
      'multiple_choice',
      v_question_data->'options',
      v_question_data->'correct_answer',
      1,
      'intermediate',
      nullif(btrim(v_question_data->>'explanation'), '')
    );
  end loop;

  insert into public.job_assessments (job_id, assessment_id, required, request_fingerprint)
  values (selected_job.id, created_assessment.id, true, v_request_fingerprint);

  return created_assessment.id;
end;
$$;

revoke all on function public.employer_generate_job_assessment(uuid, integer, jsonb) from public;
grant execute on function public.employer_generate_job_assessment(uuid, integer, jsonb) to authenticated;
