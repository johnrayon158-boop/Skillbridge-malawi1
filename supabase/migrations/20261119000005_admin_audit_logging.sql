alter table public.admin_logs
  add column if not exists actor_role text,
  add column if not exists action_result text not null default 'success',
  add column if not exists before_summary jsonb,
  add column if not exists after_summary jsonb;

alter table public.admin_logs
  drop constraint if exists admin_logs_action_result_check,
  add constraint admin_logs_action_result_check
    check (action_result in ('success', 'failure'));

create index if not exists admin_logs_created_at_idx
  on public.admin_logs(created_at desc);
create index if not exists admin_logs_entity_created_idx
  on public.admin_logs(entity_type, created_at desc);
create index if not exists admin_logs_actor_created_idx
  on public.admin_logs(admin_id, created_at desc);

alter table public.admin_logs enable row level security;
drop policy if exists admin_logs_admin_all on public.admin_logs;
drop policy if exists admin_logs_admin_read on public.admin_logs;
create policy admin_logs_admin_read on public.admin_logs
  for select using (public.is_admin());

revoke all on public.admin_logs from public, anon, authenticated;
grant select on public.admin_logs to authenticated;

create or replace function public.capture_admin_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_before_summary jsonb;
  v_after_summary jsonb;
  v_action text;
  v_entity_type text;
  v_entity_id uuid;
begin
  if v_actor_id is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select p.role into v_actor_role
  from public.profiles p
  where p.id = v_actor_id;
  if tg_table_name = 'profiles' and tg_op = 'UPDATE' then
    if old.id = v_actor_id then
      v_actor_role := old.role;
    end if;
  end if;
  if v_actor_role is distinct from 'admin' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op <> 'INSERT' then v_before := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_after := to_jsonb(new); end if;

  case tg_table_name
    when 'profiles' then
      v_entity_type := 'user';
      v_entity_id := coalesce((v_after->>'id')::uuid, (v_before->>'id')::uuid);
      if tg_op = 'UPDATE' and v_before->>'role' is distinct from v_after->>'role' then
        v_action := 'user.role_changed';
        v_before_summary := jsonb_build_object('role', v_before->'role');
        v_after_summary := jsonb_build_object('role', v_after->'role');
      elsif tg_op = 'UPDATE' and v_before->>'avatar_url' is distinct from v_after->>'avatar_url' then
        v_action := 'admin.profile_picture_changed';
        v_before_summary := jsonb_build_object('profile_picture_set', nullif(v_before->>'avatar_url', '') is not null);
        v_after_summary := jsonb_build_object('profile_picture_set', nullif(v_after->>'avatar_url', '') is not null);
      end if;
    when 'employer_verification_submissions' then
      v_entity_type := 'employer_verification_submission';
      v_entity_id := coalesce((v_after->>'id')::uuid, (v_before->>'id')::uuid);
      if tg_op = 'UPDATE' and v_before->>'status' is distinct from v_after->>'status' then
        v_action := case v_after->>'status'
          when 'verified' then 'employer_verification.approved'
          when 'rejected' then 'employer_verification.rejected'
          else 'employer_verification.status_changed'
        end;
        v_before_summary := jsonb_build_object('status', v_before->'status');
        v_after_summary := jsonb_build_object('status', v_after->'status');
      end if;
    when 'careers' then
      v_entity_type := 'career';
      v_entity_id := coalesce((v_after->>'id')::uuid, (v_before->>'id')::uuid);
      v_before_summary := jsonb_build_object(
        'title', v_before->'title', 'sector', v_before->'sector', 'status', v_before->'status'
      );
      v_after_summary := jsonb_build_object(
        'title', v_after->'title', 'sector', v_after->'sector', 'status', v_after->'status'
      );
      if tg_op = 'INSERT' then
        v_action := 'career.created';
        v_before_summary := null;
      elsif tg_op = 'DELETE' then
        v_action := 'career.deleted';
        v_after_summary := null;
      elsif v_before - 'updated_at' - 'created_at' is distinct from v_after - 'updated_at' - 'created_at' then
        v_action := case when v_before->>'status' is distinct from v_after->>'status'
          then 'career.status_changed' else 'career.updated' end;
      end if;
    when 'skills' then
      v_entity_type := 'skill';
      v_entity_id := coalesce((v_after->>'id')::uuid, (v_before->>'id')::uuid);
      v_before_summary := jsonb_build_object(
        'name', v_before->'name', 'category', v_before->'category',
        'status', v_before->'status', 'approval_status', v_before->'approval_status',
        'source_type', v_before->'source_type'
      );
      v_after_summary := jsonb_build_object(
        'name', v_after->'name', 'category', v_after->'category',
        'status', v_after->'status', 'approval_status', v_after->'approval_status',
        'source_type', v_after->'source_type'
      );
      if tg_op = 'INSERT' then
        v_action := 'skill.imported';
        v_before_summary := null;
      elsif tg_op = 'DELETE' then
        v_action := 'skill.deleted';
        v_after_summary := null;
      elsif v_before - 'updated_at' - 'created_at' is distinct from v_after - 'updated_at' - 'created_at' then
        v_action := case
          when v_before->>'approval_status' is distinct from v_after->>'approval_status'
            then 'skill.review_status_changed'
          else 'skill.updated'
        end;
      end if;
    when 'jobs' then
      v_entity_type := 'job';
      v_entity_id := coalesce((v_after->>'id')::uuid, (v_before->>'id')::uuid);
      v_before_summary := jsonb_build_object(
        'title', v_before->'title', 'status', v_before->'status',
        'employment_type', v_before->'employment_type', 'work_mode', v_before->'work_mode'
      );
      v_after_summary := jsonb_build_object(
        'title', v_after->'title', 'status', v_after->'status',
        'employment_type', v_after->'employment_type', 'work_mode', v_after->'work_mode'
      );
      if tg_op = 'INSERT' then
        v_action := 'job.created';
        v_before_summary := null;
      elsif tg_op = 'DELETE' then
        v_action := 'job.deleted';
        v_after_summary := null;
      elsif v_before - 'updated_at' - 'created_at' is distinct from v_after - 'updated_at' - 'created_at' then
        v_action := case when v_before->>'status' is distinct from v_after->>'status'
          then 'job.moderated' else 'job.updated' end;
      end if;
    when 'assessments' then
      v_entity_type := 'assessment';
      v_entity_id := coalesce((v_after->>'id')::uuid, (v_before->>'id')::uuid);
      v_before_summary := jsonb_build_object(
        'title', v_before->'title', 'status', v_before->'status',
        'assessment_type', v_before->'assessment_type'
      );
      v_after_summary := jsonb_build_object(
        'title', v_after->'title', 'status', v_after->'status',
        'assessment_type', v_after->'assessment_type'
      );
      if tg_op = 'INSERT' then
        v_action := 'assessment.created';
        v_before_summary := null;
      elsif tg_op = 'DELETE' then
        v_action := 'assessment.deleted';
        v_after_summary := null;
      elsif v_before - 'updated_at' - 'created_at' is distinct from v_after - 'updated_at' - 'created_at' then
        v_action := case when v_before->>'status' is distinct from v_after->>'status'
          then 'assessment.status_changed' else 'assessment.updated' end;
      end if;
    when 'assessment_questions' then
      v_entity_type := 'assessment_question';
      v_entity_id := coalesce((v_after->>'id')::uuid, (v_before->>'id')::uuid);
      v_before_summary := jsonb_build_object(
        'assessment_id', v_before->'assessment_id', 'question_type', v_before->'question_type',
        'points', v_before->'points', 'difficulty', v_before->'difficulty'
      );
      v_after_summary := jsonb_build_object(
        'assessment_id', v_after->'assessment_id', 'question_type', v_after->'question_type',
        'points', v_after->'points', 'difficulty', v_after->'difficulty'
      );
      if tg_op = 'INSERT' then
        v_action := 'assessment.question_created';
        v_before_summary := null;
      elsif tg_op = 'DELETE' then
        v_action := 'assessment.question_deleted';
        v_after_summary := null;
      elsif v_before - 'created_at' is distinct from v_after - 'created_at' then
        v_action := 'assessment.question_updated';
      end if;
    when 'learning_resources' then
      v_entity_type := 'learning_resource';
      v_entity_id := coalesce((v_after->>'id')::uuid, (v_before->>'id')::uuid);
      v_before_summary := jsonb_build_object(
        'title', v_before->'title', 'status', v_before->'status',
        'resource_type', v_before->'resource_type', 'category', v_before->'category'
      );
      v_after_summary := jsonb_build_object(
        'title', v_after->'title', 'status', v_after->'status',
        'resource_type', v_after->'resource_type', 'category', v_after->'category'
      );
      if tg_op = 'INSERT' then
        v_action := 'learning_resource.created';
        v_before_summary := null;
      elsif tg_op = 'DELETE' then
        v_action := 'learning_resource.deleted';
        v_after_summary := null;
      elsif v_before - 'updated_at' - 'created_at' is distinct from v_after - 'updated_at' - 'created_at' then
        v_action := case when v_before->>'status' is distinct from v_after->>'status'
          then 'learning_resource.status_changed' else 'learning_resource.updated' end;
      end if;
    when 'certificates' then
      v_entity_type := 'certificate_review';
      v_entity_id := coalesce((v_after->>'id')::uuid, (v_before->>'id')::uuid);
      v_before_summary := jsonb_build_object('verification_status', v_before->'verification_status');
      v_after_summary := jsonb_build_object('verification_status', v_after->'verification_status');
      if tg_op = 'UPDATE'
        and v_before->>'verification_status' is distinct from v_after->>'verification_status' then
        v_action := 'certificate.reviewed';
      end if;
    when 'interview_policy_reports' then
      v_entity_type := 'interview_policy_report';
      v_entity_id := coalesce((v_after->>'id')::uuid, (v_before->>'id')::uuid);
      v_before_summary := jsonb_build_object('status', v_before->'status', 'category', v_before->'category');
      v_after_summary := jsonb_build_object('status', v_after->'status', 'category', v_after->'category');
      if tg_op = 'UPDATE' and v_before->>'status' is distinct from v_after->>'status' then
        v_action := 'interview_policy_report.reviewed';
      end if;
    else
      if tg_op = 'DELETE' then return old; end if;
      return new;
  end case;

  if v_action is null or v_entity_id is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  insert into public.admin_logs (
    admin_id, actor_role, action, entity_type, entity_id,
    description, action_result, before_summary, after_summary
  ) values (
    v_actor_id, v_actor_role, v_action, v_entity_type, v_entity_id,
    v_action, 'success', v_before_summary, v_after_summary
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.capture_admin_audit_event() from public, anon, authenticated;

drop trigger if exists admin_audit_profiles on public.profiles;
create trigger admin_audit_profiles
  after update of role, avatar_url on public.profiles
  for each row execute function public.capture_admin_audit_event();

drop trigger if exists admin_audit_employer_verification on public.employer_verification_submissions;
create trigger admin_audit_employer_verification
  after update of status on public.employer_verification_submissions
  for each row when (old.status is distinct from new.status)
  execute function public.capture_admin_audit_event();

drop trigger if exists admin_audit_careers on public.careers;
create trigger admin_audit_careers
  after insert or update or delete on public.careers
  for each row execute function public.capture_admin_audit_event();

drop trigger if exists admin_audit_skills on public.skills;
create trigger admin_audit_skills
  after insert or update or delete on public.skills
  for each row execute function public.capture_admin_audit_event();

drop trigger if exists admin_audit_jobs on public.jobs;
create trigger admin_audit_jobs
  after insert or update or delete on public.jobs
  for each row execute function public.capture_admin_audit_event();

drop trigger if exists admin_audit_assessments on public.assessments;
create trigger admin_audit_assessments
  after insert or update or delete on public.assessments
  for each row execute function public.capture_admin_audit_event();

drop trigger if exists admin_audit_assessment_questions on public.assessment_questions;
create trigger admin_audit_assessment_questions
  after insert or update or delete on public.assessment_questions
  for each row execute function public.capture_admin_audit_event();

drop trigger if exists admin_audit_learning_resources on public.learning_resources;
create trigger admin_audit_learning_resources
  after insert or update or delete on public.learning_resources
  for each row execute function public.capture_admin_audit_event();

drop trigger if exists admin_audit_certificates on public.certificates;
create trigger admin_audit_certificates
  after update of verification_status on public.certificates
  for each row when (old.verification_status is distinct from new.verification_status)
  execute function public.capture_admin_audit_event();

drop trigger if exists admin_audit_interview_policy_reports on public.interview_policy_reports;
create trigger admin_audit_interview_policy_reports
  after update of status on public.interview_policy_reports
  for each row when (old.status is distinct from new.status)
  execute function public.capture_admin_audit_event();
