alter table public.career_recommendations
  add column if not exists factor_scores jsonb not null default '{}'::jsonb,
  add column if not exists factor_weights jsonb not null default '{}'::jsonb,
  add column if not exists interaction_status text,
  add column if not exists interaction_updated_at timestamptz,
  drop constraint if exists career_recommendations_interaction_status_check,
  add constraint career_recommendations_interaction_status_check
    check (interaction_status is null or interaction_status in ('accepted', 'dismissed', 'explored')),
  drop constraint if exists career_recommendations_factor_scores_object_check,
  add constraint career_recommendations_factor_scores_object_check
    check (jsonb_typeof(factor_scores) = 'object'),
  drop constraint if exists career_recommendations_factor_weights_object_check,
  add constraint career_recommendations_factor_weights_object_check
    check (jsonb_typeof(factor_weights) = 'object');

create or replace function public.record_career_recommendation_interaction(
  p_recommendation_id uuid,
  p_interaction_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('student', 'graduate')
  ) then
    raise exception 'Sign in with a student account to update a career recommendation'
      using errcode = '42501';
  end if;
  if p_interaction_status is null or p_interaction_status not in ('accepted', 'dismissed', 'explored') then
    raise exception 'Choose accepted, dismissed, or explored';
  end if;

  update public.career_recommendations
  set interaction_status = p_interaction_status,
      interaction_updated_at = now()
  where id = p_recommendation_id
    and student_id = auth.uid()
  returning jsonb_build_object(
    'recommendation_id', id,
    'interaction_status', interaction_status,
    'interaction_updated_at', interaction_updated_at
  ) into v_result;

  if v_result is null then
    raise exception 'Career recommendation not found';
  end if;
  return v_result;
end;
$$;

create or replace function public.get_career_recommendation_action_counts()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access is required'
      using errcode = '42501';
  end if;

  with latest_recommendations as (
    select distinct on (student_id, career_id)
      student_id, career_id, interaction_status
    from public.career_recommendations
    order by student_id, career_id, created_at desc, id desc
  )
  select jsonb_build_object(
    'sample_size', count(*) filter (where interaction_status is not null),
    'accepted', count(*) filter (where interaction_status = 'accepted'),
    'dismissed', count(*) filter (where interaction_status = 'dismissed'),
    'explored', count(*) filter (where interaction_status = 'explored')
  )
  into v_result
  from latest_recommendations;

  return v_result;
end;
$$;

revoke all on function public.record_career_recommendation_interaction(uuid, text) from public, anon;
grant execute on function public.record_career_recommendation_interaction(uuid, text) to authenticated;
revoke all on function public.get_career_recommendation_action_counts() from public, anon;
grant execute on function public.get_career_recommendation_action_counts() to authenticated;

drop policy if exists career_recommendations_owner_all on public.career_recommendations;
drop policy if exists career_recommendations_owner_select on public.career_recommendations;
create policy career_recommendations_owner_select on public.career_recommendations
  for select using (public.owns_student(student_id));

drop policy if exists career_feedback_admin_read on public.career_feedback;
create policy career_feedback_admin_read on public.career_feedback
  for select using (public.is_admin());
drop policy if exists assessment_results_admin_read on public.assessment_results;
create policy assessment_results_admin_read on public.assessment_results
  for select using (public.is_admin());
drop policy if exists job_matches_admin_read on public.job_matches;
create policy job_matches_admin_read on public.job_matches
  for select using (public.is_admin());

alter table public.platform_evaluations
  add column if not exists workflow text not null default 'general';
alter table public.platform_evaluations
  drop constraint if exists platform_evaluations_workflow_check,
  add constraint platform_evaluations_workflow_check
    check (workflow in ('general', 'career_recommendations', 'job_matching', 'assessments', 'learning'));
alter table public.platform_evaluations
  drop constraint if exists platform_evaluations_pkey,
  add constraint platform_evaluations_pkey primary key (user_id, survey_version, workflow);

drop function if exists public.submit_platform_evaluation(jsonb, text);
create function public.submit_platform_evaluation(
  p_answers jsonb,
  p_feedback text default '',
  p_workflow text default 'general'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_answers record;
  v_evaluation public.platform_evaluations%rowtype;
begin
  if v_user_id is null then
    raise exception 'Sign in to submit evaluation feedback';
  end if;
  select p.role into v_role from public.profiles p where p.id = v_user_id;
  if v_role is null or v_role not in ('student', 'graduate', 'employer') then
    raise exception 'Only students, graduates and employers can submit this evaluation';
  end if;
  if p_workflow is null or p_workflow not in ('general', 'career_recommendations', 'job_matching', 'assessments', 'learning') then
    raise exception 'Choose a valid page or workflow';
  end if;

  select * into v_answers from jsonb_to_record(p_answers) as answers(
    ease_of_use integer,
    navigation_clarity integer,
    task_completion integer,
    trust_in_recommendations integer,
    overall_satisfaction integer
  );
  if v_answers.ease_of_use is null or v_answers.ease_of_use not between 1 and 5
    or v_answers.navigation_clarity is null or v_answers.navigation_clarity not between 1 and 5
    or v_answers.task_completion is null or v_answers.task_completion not between 1 and 5
    or v_answers.trust_in_recommendations is null or v_answers.trust_in_recommendations not between 1 and 5
    or v_answers.overall_satisfaction is null or v_answers.overall_satisfaction not between 1 and 5
  then
    raise exception 'Each questionnaire response must be a whole-number rating from 1 to 5';
  end if;
  if length(coalesce(p_feedback, '')) > 1000 then
    raise exception 'Feedback must be 1000 characters or fewer';
  end if;

  insert into public.platform_evaluations (
    user_id, survey_version, workflow, respondent_role, ease_of_use,
    navigation_clarity, task_completion, trust_in_recommendations,
    overall_satisfaction, feedback, submitted_at
  ) values (
    v_user_id, 'v1', p_workflow, v_role, v_answers.ease_of_use,
    v_answers.navigation_clarity, v_answers.task_completion,
    v_answers.trust_in_recommendations, v_answers.overall_satisfaction,
    coalesce(p_feedback, ''), now()
  )
  on conflict (user_id, survey_version, workflow) do update set
    respondent_role = excluded.respondent_role,
    ease_of_use = excluded.ease_of_use,
    navigation_clarity = excluded.navigation_clarity,
    task_completion = excluded.task_completion,
    trust_in_recommendations = excluded.trust_in_recommendations,
    overall_satisfaction = excluded.overall_satisfaction,
    feedback = excluded.feedback,
    submitted_at = now()
  returning * into v_evaluation;
  return to_jsonb(v_evaluation) - 'feedback';
end;
$$;

revoke all on function public.submit_platform_evaluation(jsonb, text, text) from public, anon;
grant execute on function public.submit_platform_evaluation(jsonb, text, text) to authenticated;

create table if not exists public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  client_request_id uuid not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  result_id uuid references public.assessment_results(id) on delete set null,
  score numeric check (score is null or score between 0 and 100),
  passed boolean,
  unique (student_id, assessment_id, client_request_id),
  unique (result_id),
  check ((completed_at is null and result_id is null and score is null and passed is null)
    or (completed_at is not null and result_id is not null and score is not null and passed is not null)),
  check (completed_at is null or completed_at >= started_at)
);

create index if not exists assessment_attempts_started_idx
  on public.assessment_attempts(started_at desc);
create index if not exists assessment_attempts_student_assessment_idx
  on public.assessment_attempts(student_id, assessment_id, started_at desc);

alter table public.assessment_attempts enable row level security;
drop policy if exists assessment_attempts_owner_read on public.assessment_attempts;
create policy assessment_attempts_owner_read on public.assessment_attempts
  for select using (public.owns_student(student_id));
drop policy if exists assessment_attempts_admin_read on public.assessment_attempts;
create policy assessment_attempts_admin_read on public.assessment_attempts
  for select using (public.is_admin());
revoke all on public.assessment_attempts from public, anon, authenticated;
grant select on public.assessment_attempts to authenticated;

create or replace function public.start_assessment_attempt(
  p_assessment_id uuid,
  p_client_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt public.assessment_attempts%rowtype;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('student', 'graduate')
  ) then
    raise exception 'Sign in with a student account to start an assessment'
      using errcode = '42501';
  end if;
  if p_client_request_id is null then
    raise exception 'Assessment start request is missing its idempotency key';
  end if;
  if not exists (
    select 1 from public.assessments
    where id = p_assessment_id and status = 'published'
  ) then
    raise exception 'Assessment is unavailable';
  end if;

  insert into public.assessment_attempts(student_id, assessment_id, client_request_id)
  values (auth.uid(), p_assessment_id, p_client_request_id)
  on conflict (student_id, assessment_id, client_request_id) do nothing;

  select * into v_attempt
  from public.assessment_attempts
  where student_id = auth.uid()
    and assessment_id = p_assessment_id
    and client_request_id = p_client_request_id;
  return jsonb_build_object('attempt_id', v_attempt.id, 'started_at', v_attempt.started_at);
end;
$$;

create or replace function public.submit_assessment_attempt(
  p_attempt_id uuid,
  p_answers jsonb
)
returns table (result_id uuid, percentage numeric, passed boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt public.assessment_attempts%rowtype;
  v_submission record;
begin
  if auth.uid() is null then
    raise exception 'Sign in to submit this assessment' using errcode = '42501';
  end if;

  select * into v_attempt
  from public.assessment_attempts
  where id = p_attempt_id and student_id = auth.uid()
  for update;
  if not found then
    raise exception 'Assessment attempt not found' using errcode = '42501';
  end if;
  if v_attempt.completed_at is not null then
    return query select v_attempt.result_id, v_attempt.score, v_attempt.passed;
    return;
  end if;

  select submitted.result_id, submitted.percentage, submitted.passed
  into v_submission
  from public.submit_assessment_result(
    v_attempt.assessment_id,
    v_attempt.student_id,
    p_answers,
    v_attempt.started_at
  ) as submitted;

  update public.assessment_attempts
  set completed_at = now(),
      result_id = v_submission.result_id,
      score = v_submission.percentage,
      passed = v_submission.passed
  where id = v_attempt.id;

  return query select v_submission.result_id, v_submission.percentage, v_submission.passed;
end;
$$;

revoke all on function public.submit_assessment_result(uuid, uuid, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.start_assessment_attempt(uuid, uuid) from public, anon;
revoke all on function public.submit_assessment_attempt(uuid, jsonb) from public, anon;
grant execute on function public.start_assessment_attempt(uuid, uuid) to authenticated;
grant execute on function public.submit_assessment_attempt(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
