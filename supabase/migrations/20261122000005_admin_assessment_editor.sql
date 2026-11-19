create or replace function public.admin_save_assessment(
  p_assessment_id uuid,
  p_assessment jsonb,
  p_questions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  saved_assessment_id uuid;
  current_status text;
  question_item jsonb;
  question_text text;
  option_count integer;
  unique_option_count integer;
  points_value integer;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only administrators can save assessments.';
  end if;
  if jsonb_typeof(p_assessment) is distinct from 'object' then
    raise exception 'Assessment details are required.';
  end if;
  if nullif(trim(p_assessment->>'title'), '') is null then
    raise exception 'Enter an assessment title.';
  end if;
  if length(trim(p_assessment->>'title')) > 200 then
    raise exception 'Assessment titles must be 200 characters or fewer.';
  end if;
  if nullif(trim(p_assessment->>'description'), '') is null then
    raise exception 'Enter an assessment description.';
  end if;
  if coalesce(p_assessment->>'assessment_type', '') not in ('skill', 'career', 'job', 'practice') then
    raise exception 'Choose a valid assessment type.';
  end if;
  if coalesce(p_assessment->>'duration_minutes', '') <> ''
    and (p_assessment->>'duration_minutes' !~ '^[1-9][0-9]*$') then
    raise exception 'Duration must be a positive whole number of minutes.';
  end if;
  if coalesce(p_assessment->>'passing_score', '') <> ''
    and (p_assessment->>'passing_score' !~ '^(100|[0-9]{1,2})$') then
    raise exception 'Passing score must be a whole number from 0 to 100.';
  end if;
  if p_questions is not null
    and jsonb_typeof(p_questions) <> 'null'
    and jsonb_typeof(p_questions) is distinct from 'array' then
    raise exception 'Assessment questions must be provided as a list.';
  end if;

  if p_questions is not null and jsonb_typeof(p_questions) <> 'null' then
    for question_item in select value from jsonb_array_elements(p_questions)
    loop
      question_text := nullif(trim(question_item->>'question'), '');
      if jsonb_typeof(question_item) is distinct from 'object' or question_text is null then
        raise exception 'Every question must include question text.';
      end if;
      if coalesce(question_item->>'question_type', 'multiple_choice') <> 'multiple_choice' then
        raise exception 'Only multiple-choice questions can be edited in this form.';
      end if;
      if jsonb_typeof(question_item->'options') is distinct from 'array' then
        raise exception 'Question answer options are required.';
      end if;
      select count(*), count(distinct options.value)
      into option_count, unique_option_count
      from jsonb_array_elements(question_item->'options') as options(value)
      where jsonb_typeof(options.value) = 'string' and length(trim(options.value #>> '{}')) > 0;
      if option_count < 2 then
        raise exception 'Each question needs at least two answer options.';
      end if;
      if option_count <> unique_option_count then
        raise exception 'Question answer options must be unique.';
      end if;
      if jsonb_typeof(question_item->'correct_answer') is distinct from 'string'
        or nullif(trim(question_item->>'correct_answer'), '') is null
        or not (question_item->'options' @> jsonb_build_array(question_item->'correct_answer')) then
        raise exception 'Choose a correct answer from the question options.';
      end if;
      if coalesce(question_item->>'points', '') !~ '^[1-9][0-9]*$' then
        raise exception 'Each question must be worth at least one point.';
      end if;
      points_value := (question_item->>'points')::integer;
      if points_value > 1000 then
        raise exception 'Question points must not exceed 1000.';
      end if;
    end loop;
  end if;

  if p_assessment_id is null then
    insert into public.assessments (
      title, description, assessment_type, skill_id, career_id,
      duration_minutes, difficulty, passing_score, created_by, status
    ) values (
      trim(p_assessment->>'title'),
      trim(p_assessment->>'description'),
      p_assessment->>'assessment_type',
      nullif(p_assessment->>'skill_id', '')::uuid,
      nullif(p_assessment->>'career_id', '')::uuid,
      nullif(p_assessment->>'duration_minutes', '')::integer,
      nullif(trim(p_assessment->>'difficulty'), ''),
      nullif(p_assessment->>'passing_score', '')::integer,
      auth.uid(),
      'draft'
    )
    returning id into saved_assessment_id;
  else
    select status into current_status
    from public.assessments
    where id = p_assessment_id
    for update;
    if not found then
      raise exception 'Assessment not found.';
    end if;
    if current_status = 'published' then
      raise exception 'Move the assessment to draft before editing it.';
    end if;
    if p_questions is not null
      and jsonb_typeof(p_questions) <> 'null'
      and exists (
      select 1 from public.assessment_results where assessment_id = p_assessment_id
    ) then
      raise exception 'Questions cannot be changed after students have attempted this assessment.';
    end if;

    update public.assessments
    set title = trim(p_assessment->>'title'),
        description = trim(p_assessment->>'description'),
        assessment_type = p_assessment->>'assessment_type',
        skill_id = case when p_assessment ? 'skill_id' then nullif(p_assessment->>'skill_id', '')::uuid else skill_id end,
        career_id = case when p_assessment ? 'career_id' then nullif(p_assessment->>'career_id', '')::uuid else career_id end,
        duration_minutes = nullif(p_assessment->>'duration_minutes', '')::integer,
        difficulty = nullif(trim(p_assessment->>'difficulty'), ''),
        passing_score = nullif(p_assessment->>'passing_score', '')::integer
    where id = p_assessment_id;
    saved_assessment_id := p_assessment_id;
  end if;

  if p_questions is not null and jsonb_typeof(p_questions) <> 'null' then
    delete from public.assessment_questions where assessment_id = saved_assessment_id;
    insert into public.assessment_questions (
      assessment_id, question, question_type, options, correct_answer,
      points, difficulty, explanation
    )
    select
      saved_assessment_id,
      trim(question_item->>'question'),
      'multiple_choice',
      question_item->'options',
      question_item->'correct_answer',
      (question_item->>'points')::integer,
      nullif(trim(question_item->>'difficulty'), ''),
      nullif(trim(question_item->>'explanation'), '')
    from jsonb_array_elements(p_questions) as questions(question_item);
  end if;

  return saved_assessment_id;
end;
$$;

revoke all on function public.admin_save_assessment(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.admin_save_assessment(uuid, jsonb, jsonb) to authenticated;
