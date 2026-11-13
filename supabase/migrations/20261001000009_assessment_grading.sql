-- SkillBridge Malawi Step 4: server-side assessment submission.
-- Correct answers never leave PostgreSQL for student clients.

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
begin
  if auth.uid() is null or auth.uid() <> p_student_id then
    raise exception 'You can only submit your own assessment';
  end if;

  select coalesce(a.passing_score, 60) into pass_mark
  from public.assessments a
  where a.id = p_assessment_id and a.status = 'published';

  if pass_mark is null then
    raise exception 'Assessment is unavailable';
  end if;

  select coalesce(sum(q.points) filter (where q.correct_answer is not null), 0),
         coalesce(sum(q.points) filter (where q.correct_answer is not null and (p_answers -> q.id::text) = q.correct_answer), 0)
  into total_points, earned_points
  from public.assessment_questions q
  where q.assessment_id = p_assessment_id;

  if total_points > 0 then
    final_percentage := round((earned_points / total_points) * 100, 2);
  end if;
  final_passed := final_percentage >= pass_mark;

  insert into public.assessment_results (
    assessment_id, student_id, score, percentage, level, passed,
    strengths, weaknesses, recommendations, started_at, completed_at
  ) values (
    p_assessment_id, p_student_id, earned_points, final_percentage,
    case when final_percentage >= 80 then 'expert' when final_percentage >= 60 then 'advanced' when final_percentage >= 40 then 'intermediate' else 'beginner' end,
    final_passed,
    case when final_passed then '["Assessment evidence recorded"]'::jsonb else '[]'::jsonb end,
    case when final_passed then '[]'::jsonb else '["Review the related skill gaps"]'::jsonb end,
    '["Review recommended learning resources"]'::jsonb,
    p_started_at, now()
  ) returning id into inserted_id;

  return query select inserted_id, final_percentage, final_passed;
end;
$$;

revoke all on function public.submit_assessment_result(uuid, uuid, jsonb, timestamptz) from public;
grant execute on function public.submit_assessment_result(uuid, uuid, jsonb, timestamptz) to authenticated;
