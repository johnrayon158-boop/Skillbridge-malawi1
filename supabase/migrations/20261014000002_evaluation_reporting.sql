alter table public.career_feedback
  add column if not exists relevance_rating integer check (relevance_rating between 1 and 5),
  add column if not exists suitability_rating integer check (suitability_rating between 1 and 5);

create table if not exists public.platform_evaluations (
  user_id uuid not null references public.profiles(id) on delete cascade,
  survey_version text not null default 'v1',
  respondent_role text not null check (respondent_role in ('student', 'graduate', 'employer')),
  ease_of_use integer not null check (ease_of_use between 1 and 5),
  navigation_clarity integer not null check (navigation_clarity between 1 and 5),
  task_completion integer not null check (task_completion between 1 and 5),
  trust_in_recommendations integer not null check (trust_in_recommendations between 1 and 5),
  overall_satisfaction integer not null check (overall_satisfaction between 1 and 5),
  feedback text not null default '' check (length(feedback) <= 1000),
  submitted_at timestamptz not null default now(),
  primary key (user_id, survey_version)
);

create table if not exists public.job_match_evaluation_examples (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.student_profiles(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  expected_match boolean not null,
  reviewer_id uuid not null references public.profiles(id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  unique (candidate_id, job_id)
);

alter table public.platform_evaluations enable row level security;
alter table public.job_match_evaluation_examples enable row level security;

drop policy if exists platform_evaluations_owner_read on public.platform_evaluations;
create policy platform_evaluations_owner_read on public.platform_evaluations
  for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists platform_evaluations_admin_read on public.platform_evaluations;
create policy platform_evaluations_admin_read on public.platform_evaluations
  for select using (public.is_admin());
drop policy if exists job_match_evaluation_examples_admin_all on public.job_match_evaluation_examples;
create policy job_match_evaluation_examples_admin_all on public.job_match_evaluation_examples
  for all using (public.is_admin()) with check (public.is_admin());

create index if not exists job_match_evaluation_examples_reviewed_idx
  on public.job_match_evaluation_examples(reviewed_at desc);

create or replace function public.submit_platform_evaluation(p_answers jsonb, p_feedback text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_answers record;
  v_evaluation public.platform_evaluations%rowtype;
begin
  if v_user_id is null then raise exception 'Sign in to submit evaluation feedback'; end if;
  select p.role into v_role from public.profiles p where p.id = v_user_id;
  if v_role is null or v_role not in ('student', 'graduate', 'employer') then
    raise exception 'Only students, graduates and employers can submit this evaluation';
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
    user_id, survey_version, respondent_role, ease_of_use, navigation_clarity,
    task_completion, trust_in_recommendations, overall_satisfaction, feedback, submitted_at
  ) values (
    v_user_id, 'v1', v_role, v_answers.ease_of_use, v_answers.navigation_clarity,
    v_answers.task_completion, v_answers.trust_in_recommendations,
    v_answers.overall_satisfaction, coalesce(p_feedback, ''), now()
  )
  on conflict (user_id, survey_version) do update set
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

create or replace function public.save_job_match_evaluation_example(
  p_candidate_id uuid,
  p_job_id uuid,
  p_expected_match boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record public.job_match_evaluation_examples%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only administrators can review matching examples';
  end if;
  if p_expected_match is null then
    raise exception 'Choose whether the candidate is a suitable match for this job';
  end if;
  if not exists (
    select 1 from public.profiles p join public.student_profiles sp on sp.id = p.id
    where p.id = p_candidate_id and p.role = 'student'
  ) then raise exception 'Choose a valid student candidate'; end if;
  if not exists (
    select 1 from public.jobs j
    where j.id = p_job_id and j.status = 'published'
      and (j.application_deadline is null or j.application_deadline >= current_date)
  ) then raise exception 'Choose a published job that is still accepting applications'; end if;
  if not exists (
    select 1 from public.job_matches m
    where m.student_id = p_candidate_id and m.job_id = p_job_id and m.match_score is not null
  ) then raise exception 'Generate a stored candidate-job match before reviewing it'; end if;

  insert into public.job_match_evaluation_examples (
    candidate_id, job_id, expected_match, reviewer_id, reviewed_at
  ) values (p_candidate_id, p_job_id, p_expected_match, auth.uid(), now())
  on conflict (candidate_id, job_id) do update set
    expected_match = excluded.expected_match,
    reviewer_id = excluded.reviewer_id,
    reviewed_at = now()
  returning * into v_record;
  return to_jsonb(v_record);
end;
$$;

revoke all on function public.submit_platform_evaluation(jsonb, text) from public;
revoke all on function public.save_job_match_evaluation_example(uuid, uuid, boolean) from public;
grant execute on function public.submit_platform_evaluation(jsonb, text) to authenticated;
grant execute on function public.save_job_match_evaluation_example(uuid, uuid, boolean) to authenticated;
