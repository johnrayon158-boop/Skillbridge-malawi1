create or replace function public.current_user_is_student()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'student'
  );
$$;

revoke all on function public.current_user_is_student() from public, anon, authenticated;
grant execute on function public.current_user_is_student() to authenticated;

drop policy if exists applications_student_all on public.applications;
drop policy if exists applications_student_select on public.applications;
drop policy if exists applications_student_insert on public.applications;
drop policy if exists applications_student_withdraw on public.applications;
drop policy if exists applications_employer_read on public.applications;
drop policy if exists applications_employer_update on public.applications;

create policy applications_student_select on public.applications
  for select using (
    public.owns_student(student_id)
    and public.current_user_is_student()
  );

create policy applications_student_insert on public.applications
  for insert with check (
    public.owns_student(student_id)
    and public.current_user_is_student()
    and status = 'applied'
    and not exists (
      select 1
      from public.jobs j
      where j.id = applications.job_id
        and (
          j.opportunity_type is not null
          or j.employment_type in ('internship', 'graduate', 'temporary', 'part_time', 'volunteer')
        )
    )
  );

create policy applications_employer_read on public.applications
  for select using (
    exists (
      select 1
      from public.jobs j
      where j.id = applications.job_id
        and public.owns_employer(j.employer_id)
        and applications.student_id <> j.employer_id
    )
  );

create or replace function public.validate_application_candidate_eligibility()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = new.student_id
      and p.role = 'student'
  ) then
    raise exception 'Only student accounts can apply to jobs.';
  end if;

  if exists (
    select 1
    from public.jobs j
    where j.id = new.job_id
      and j.employer_id = new.student_id
  ) then
    raise exception 'You cannot apply to your own opportunity.';
  end if;

  return new;
end;
$$;

drop trigger if exists applications_validate_candidate_eligibility on public.applications;
create trigger applications_validate_candidate_eligibility
  before insert on public.applications
  for each row execute function public.validate_application_candidate_eligibility();

revoke all on function public.validate_application_candidate_eligibility() from public, anon, authenticated;

create or replace function public.can_access_application(target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1
    from public.applications a
    join public.jobs j on j.id = a.job_id
    where a.id = target_id
      and (
        (a.student_id = (select auth.uid()) and public.current_user_is_student())
        or (j.employer_id = (select auth.uid()) and public.owns_employer(j.employer_id))
        or public.is_admin()
      )
  );
$$;

revoke all on function public.can_access_application(uuid) from public, anon;
grant execute on function public.can_access_application(uuid) to authenticated;

create or replace function public.student_withdraw_application(p_application_id uuid)
returns public.applications
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  target_application public.applications;
begin
  select *
  into target_application
  from public.applications
  where id = p_application_id
  for update;

  if not found
    or not public.current_user_is_student()
    or not public.owns_student(target_application.student_id) then
    raise exception 'Application is not owned by this student';
  end if;

  if not public.application_status_transition_allowed(target_application.status, 'withdrawn') then
    raise exception 'This application can no longer be withdrawn';
  end if;

  update public.offers
  set status = 'withdrawn', updated_at = now()
  where application_id = p_application_id
    and status = 'pending';

  update public.applications
  set status = 'withdrawn'
  where id = p_application_id
  returning * into target_application;

  return target_application;
end;
$$;

create or replace function public.student_respond_to_offer(
  p_application_id uuid,
  p_response text
)
returns public.applications
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  target_application public.applications;
  target_offer public.offers;
  next_status text;
begin
  if p_response is null or p_response not in ('accepted', 'declined') then
    raise exception 'Offer response must be accepted or declined';
  end if;

  next_status := case p_response
    when 'accepted' then 'accepted'
    else 'offer_declined'
  end;

  select *
  into target_application
  from public.applications
  where id = p_application_id
  for update;

  if not found
    or not public.current_user_is_student()
    or not public.owns_student(target_application.student_id) then
    raise exception 'Application is not owned by this student';
  end if;

  if target_application.status <> 'offer' then
    raise exception 'This application has no outstanding offer';
  end if;

  if not public.application_status_transition_allowed(target_application.status, next_status) then
    raise exception 'Invalid offer response for the current application status';
  end if;

  select *
  into target_offer
  from public.offers
  where application_id = p_application_id
    and status = 'pending'
  order by created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'No pending offer was found for this application';
  end if;

  if target_offer.expiry_date is not null
    and target_offer.expiry_date < current_date then
    update public.offers
    set status = 'expired', updated_at = now()
    where id = target_offer.id;

    update public.applications
    set status = 'expired'
    where id = p_application_id
    returning * into target_application;

    return target_application;
  end if;

  update public.offers
  set status = p_response, updated_at = now()
  where id = target_offer.id;

  update public.applications
  set status = next_status
  where id = p_application_id
  returning * into target_application;

  return target_application;
end;
$$;

revoke all on function public.student_withdraw_application(uuid) from public;
revoke all on function public.student_respond_to_offer(uuid, text) from public;
grant execute on function public.student_withdraw_application(uuid) to authenticated;
grant execute on function public.student_respond_to_offer(uuid, text) to authenticated;

notify pgrst, 'reload schema';
