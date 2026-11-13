-- Canonical application states: applied -> under_review -> shortlisted ->
-- assessment -> interview -> offer -> accepted/offer_declined.

alter table public.applications
  drop constraint if exists applications_status_check;

update public.offers
set status = 'expired', updated_at = now()
where status = 'pending' and expiry_date < current_date;

do $$
declare
  conflicting_ids text;
  duplicate_offer_application_ids text;
begin
  select string_agg(a.id::text, ', ' order by a.id)
    into conflicting_ids
  from public.applications a
  where (
    exists (
      select 1 from public.offers o
      where o.application_id = a.id and o.status = 'accepted'
    )
    and a.status in ('rejected', 'withdrawn', 'offer_declined', 'expired', 'position_closed')
  ) or (
    exists (
      select 1 from public.offers o
      where o.application_id = a.id and o.status = 'pending'
    )
    and a.status in ('accepted', 'rejected', 'withdrawn', 'offer_declined', 'expired', 'position_closed')
  );

  if conflicting_ids is not null then
    raise exception 'Conflicting terminal application and offer records need manual review'
      using detail = conflicting_ids,
            hint = 'Resolve the listed application/offer outcomes without deleting history, then rerun the migration.';
  end if;

  select string_agg(application_id::text, ', ' order by application_id)
    into duplicate_offer_application_ids
  from (
    select o.application_id
    from public.offers o
    where o.status = 'pending'
    group by o.application_id
    having count(*) > 1
  ) duplicate_offers;

  if duplicate_offer_application_ids is not null then
    raise exception 'Applications with multiple outstanding offers need manual review'
      using detail = duplicate_offer_application_ids,
            hint = 'Preserve the offer records and resolve which single offer is current before rerunning the migration.';
  end if;
end;
$$;

create unique index if not exists offers_one_pending_per_application
  on public.offers (application_id)
  where status = 'pending';

with normalized as (
  select
    a.id,
    a.status as old_status,
    case regexp_replace(lower(trim(a.status)), '[ -]+', '_', 'g')
      when 'saved' then 'applied'
      when 'interested' then 'applied'
      when 'preparing' then 'applied'
      when 'submitted' then 'applied'
      when 'viewed' then 'under_review'
      when 'second_interview' then 'interview'
      when 'selected' then 'accepted'
      when 'hired' then 'accepted'
      when 'declined' then 'offer_declined'
      else regexp_replace(lower(trim(a.status)), '[ -]+', '_', 'g')
    end as normalized_status
  from public.applications a
),
targets as (
  select
    n.id,
    n.old_status,
    case
      when exists (
        select 1 from public.offers o
        where o.application_id = n.id and o.status = 'accepted'
      ) then 'accepted'
      when exists (
        select 1 from public.offers o
        where o.application_id = n.id and o.status = 'pending'
      ) then 'offer'
      when n.normalized_status = 'offer'
        and exists (
          select 1 from public.offers o
          where o.application_id = n.id and o.status = 'declined'
        ) then 'offer_declined'
      when n.normalized_status = 'offer'
        and exists (
          select 1 from public.offers o
          where o.application_id = n.id and o.status = 'expired'
        ) then 'expired'
      when n.normalized_status in ('applied', 'under_review', 'shortlisted', 'assessment', 'interview')
        and exists (
          select 1 from public.interviews i
          where i.application_id = n.id
            and i.status in ('scheduled', 'rescheduled', 'completed')
        ) then 'interview'
      else n.normalized_status
    end as target_status
  from normalized n
),
updated as (
  update public.applications a
  set status = t.target_status
  from targets t
  where a.id = t.id
    and a.status is distinct from t.target_status
  returning a.id, t.old_status, a.status as new_status
)
insert into public.application_events (
  application_id, event_type, title, description, created_by, event_date
)
select
  id,
  new_status,
  initcap(replace(new_status, '_', ' ')),
  'Status standardized from ' || replace(old_status, '_', ' ') || ' using existing application, offer, and interview records.',
  null,
  now()
from updated;

do $$
declare
  invalid_statuses text;
begin
  select string_agg(distinct coalesce(status, '<null>'), ', ' order by coalesce(status, '<null>'))
    into invalid_statuses
  from public.applications
  where status not in (
    'applied', 'under_review', 'shortlisted', 'assessment', 'interview',
    'offer', 'accepted', 'rejected', 'withdrawn', 'offer_declined',
    'expired', 'position_closed'
  );

  if invalid_statuses is not null then
    raise exception 'Unrecognized application statuses remain after normalization'
      using detail = invalid_statuses;
  end if;
end;
$$;

alter table public.applications
  add constraint applications_status_check
  check (status in (
    'applied', 'under_review', 'shortlisted', 'assessment', 'interview',
    'offer', 'accepted', 'rejected', 'withdrawn', 'offer_declined',
    'expired', 'position_closed'
  ));

create or replace function public.application_status_transition_allowed(
  p_current text,
  p_next text
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_current = p_next or case p_current
    when 'applied' then p_next in ('under_review', 'shortlisted', 'interview', 'rejected', 'withdrawn', 'expired', 'position_closed')
    when 'under_review' then p_next in ('shortlisted', 'assessment', 'interview', 'rejected', 'withdrawn', 'expired', 'position_closed')
    when 'shortlisted' then p_next in ('assessment', 'interview', 'offer', 'rejected', 'withdrawn', 'expired', 'position_closed')
    when 'assessment' then p_next in ('interview', 'offer', 'rejected', 'withdrawn', 'expired', 'position_closed')
    when 'interview' then p_next in ('offer', 'rejected', 'withdrawn', 'expired', 'position_closed')
    when 'offer' then p_next in ('accepted', 'offer_declined', 'rejected', 'withdrawn', 'expired', 'position_closed')
    else false
  end;
$$;

create or replace function public.enforce_application_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_employer_id uuid;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  if not public.application_status_transition_allowed(old.status, new.status) then
    raise exception 'Invalid application status transition: % -> %', old.status, new.status;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  if public.owns_student(old.student_id) then
    if new.status = 'withdrawn' then
      return new;
    end if;
    if new.status = 'accepted' and old.status = 'offer' and exists (
      select 1 from public.offers o
      where o.application_id = old.id and o.status = 'accepted'
    ) then
      return new;
    end if;
    if new.status = 'offer_declined' and old.status = 'offer' and exists (
      select 1 from public.offers o
      where o.application_id = old.id and o.status = 'declined'
    ) then
      return new;
    end if;
    if new.status = 'expired' and old.status = 'offer' and exists (
      select 1 from public.offers o
      where o.application_id = old.id and o.status = 'expired'
    ) then
      return new;
    end if;
    raise exception 'Students may only withdraw an application or respond to an offer';
  end if;

  select j.employer_id into target_employer_id
  from public.jobs j
  where j.id = old.job_id;

  if public.owns_employer(target_employer_id) then
    if new.status in ('accepted', 'offer_declined', 'withdrawn') then
      raise exception 'Employers cannot record a candidate offer response or withdrawal';
    end if;
    if new.status = 'offer' and not exists (
      select 1 from public.offers o
      where o.application_id = old.id and o.status = 'pending'
    ) then
      raise exception 'An offer record is required before changing the application to Offer';
    end if;
    return new;
  end if;

  raise exception 'Application status may only be changed by a participant';
end;
$$;

create or replace function public.record_application_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_employer_id uuid;
  target_user_id uuid;
  status_note text;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  status_note := nullif(current_setting('app.application_status_note', true), '');

  insert into public.application_events (
    application_id, event_type, title, description, created_by
  )
  values (
    new.id,
    new.status,
    initcap(replace(new.status, '_', ' ')),
    coalesce(status_note, 'Application status changed to ' || replace(new.status, '_', ' ') || '.'),
    auth.uid()
  );

  select j.employer_id into target_employer_id
  from public.jobs j
  where j.id = new.job_id;

  if auth.uid() = new.student_id then
    target_user_id := target_employer_id;
    insert into public.notifications (
      user_id, title, message, notification_type, related_entity_type, related_entity_id
    )
    values (
      target_user_id,
      'Application response recorded',
      'The candidate responded to the offer or changed their application status.',
      'application_update',
      'application',
      new.id
    );
  elsif not (
    new.status = 'interview'
    and current_setting('app.skip_status_notification', true) = 'on'
  ) then
    target_user_id := new.student_id;
    insert into public.notifications (
      user_id, title, message, notification_type, related_entity_type, related_entity_id
    )
    values (
      target_user_id,
      'Application update',
      'Your application status changed to ' || replace(new.status, '_', ' ') || '.',
      'application_update',
      'application',
      new.id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists applications_status_transition_guard on public.applications;
create trigger applications_status_transition_guard
before update of status on public.applications
for each row execute function public.enforce_application_status_transition();

drop trigger if exists applications_status_change_event on public.applications;
create trigger applications_status_change_event
after update of status on public.applications
for each row execute function public.record_application_status_change();

drop policy if exists applications_employer_update on public.applications;
drop policy if exists applications_student_withdraw on public.applications;
drop policy if exists interviews_participant_all on public.interviews;
drop policy if exists interviews_participant_select on public.interviews;
drop policy if exists offers_participant_all on public.offers;
drop policy if exists offers_participant_select on public.offers;
create policy interviews_participant_select on public.interviews
  for select using (
    exists (
      select 1 from public.applications a
      where a.id = application_id and public.can_access_application(a.id)
    )
  );
create policy offers_participant_select on public.offers
  for select using (
    exists (
      select 1 from public.applications a
      where a.id = application_id and public.can_access_application(a.id)
    )
  );

create or replace function public.employer_update_application(
  p_application_id uuid,
  p_status text,
  p_note text default null
)
returns public.applications
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_application public.applications;
  target_employer_id uuid;
begin
  select a.*
  into updated_application
  from public.applications a
  join public.jobs j on j.id = a.job_id
  where a.id = p_application_id
  for update of a, j;

  if not found then
    raise exception 'Application is not owned by this employer';
  end if;
  select j.employer_id into target_employer_id
  from public.jobs j
  join public.applications a on a.job_id = j.id
  where a.id = p_application_id;

  if not public.owns_employer(target_employer_id) then
    raise exception 'Application is not owned by this employer';
  end if;
  if p_status not in (
    'under_review', 'shortlisted', 'assessment', 'interview',
    'offer', 'rejected', 'expired', 'position_closed'
  ) then
    raise exception 'Employer-selected application status is not allowed';
  end if;
  if not public.application_status_transition_allowed(updated_application.status, p_status) then
    raise exception 'Invalid application status transition: % -> %', updated_application.status, p_status;
  end if;

  perform set_config('app.application_status_note', coalesce(trim(p_note), ''), true);
  update public.applications
  set status = p_status
  where id = p_application_id
  returning * into updated_application;
  return updated_application;
end;
$$;

create or replace function public.employer_schedule_interview(
  p_application_id uuid,
  p_scheduled_at timestamptz,
  p_duration_minutes integer,
  p_location text,
  p_meeting_url text,
  p_interview_type text,
  p_notes text
)
returns public.interviews
language plpgsql
security definer
set search_path = public
as $$
declare
  target_application public.applications;
  target_employer_id uuid;
  created_interview public.interviews;
begin
  select a.*
  into target_application
  from public.applications a
  join public.jobs j on j.id = a.job_id
  where a.id = p_application_id
  for update of a, j;

  if not found then
    raise exception 'Application is not owned by this employer';
  end if;
  select j.employer_id into target_employer_id
  from public.jobs j
  join public.applications a on a.job_id = j.id
  where a.id = p_application_id;

  if not public.owns_employer(target_employer_id) then
    raise exception 'Application is not owned by this employer';
  end if;
  if target_application.status not in ('applied', 'under_review', 'shortlisted', 'assessment', 'interview') then
    raise exception 'An interview cannot be scheduled at this application stage';
  end if;
  if p_scheduled_at is null or p_scheduled_at <= now() then
    raise exception 'Interview time must be in the future';
  end if;
  if p_duration_minutes is null or p_duration_minutes <= 0 then
    raise exception 'Interview duration must be greater than zero';
  end if;

  if target_application.status <> 'interview' then
    perform set_config('app.skip_status_notification', 'on', true);
    update public.applications
    set status = 'interview'
    where id = p_application_id;
  end if;

  insert into public.interviews (
    application_id, scheduled_at, duration_minutes, location, meeting_url,
    interview_type, notes, created_by
  )
  values (
    p_application_id, p_scheduled_at, p_duration_minutes, p_location, p_meeting_url,
    p_interview_type, p_notes, auth.uid()
  )
  returning * into created_interview;

  insert into public.application_events (
    application_id, event_type, title, description, created_by
  )
  values (
    p_application_id,
    'interview_scheduled',
    'Interview scheduled',
    'An interview was scheduled for ' || to_char(p_scheduled_at, 'YYYY-MM-DD HH24:MI TZ'),
    auth.uid()
  );

  insert into public.notifications (
    user_id, title, message, notification_type, related_entity_type, related_entity_id
  )
  values (
    target_application.student_id,
    'Interview scheduled',
    'An employer scheduled an interview for your application.',
    'interview_reminder',
    'interview',
    created_interview.id
  );

  return created_interview;
end;
$$;

create or replace function public.employer_create_offer(
  p_application_id uuid,
  p_salary numeric,
  p_currency text,
  p_start_date date,
  p_expiry_date date,
  p_notes text
)
returns public.offers
language plpgsql
security definer
set search_path = public
as $$
declare
  target_application public.applications;
  target_employer_id uuid;
  created_offer public.offers;
begin
  select a.*
  into target_application
  from public.applications a
  join public.jobs j on j.id = a.job_id
  where a.id = p_application_id
  for update of a, j;

  if not found then
    raise exception 'Application is not owned by this employer';
  end if;
  select j.employer_id into target_employer_id
  from public.jobs j
  join public.applications a on a.job_id = j.id
  where a.id = p_application_id;

  if not public.owns_employer(target_employer_id) then
    raise exception 'Application is not owned by this employer';
  end if;
  if target_application.status not in ('shortlisted', 'assessment', 'interview', 'offer') then
    raise exception 'An offer cannot be created at this application stage';
  end if;
  if exists (
    select 1 from public.offers o
    where o.application_id = p_application_id and o.status = 'pending'
  ) then
    raise exception 'An outstanding offer already exists for this application';
  end if;
  if p_expiry_date is not null and p_expiry_date < current_date then
    raise exception 'Offer expiry date must be today or later';
  end if;

  insert into public.offers (application_id, salary, currency, start_date, expiry_date, notes)
  values (p_application_id, p_salary, coalesce(nullif(trim(p_currency), ''), 'MWK'), p_start_date, p_expiry_date, p_notes)
  returning * into created_offer;

  if target_application.status <> 'offer' then
    update public.applications set status = 'offer' where id = p_application_id;
  end if;

  if target_application.status = 'offer' then
    insert into public.application_events (
      application_id, event_type, title, description, created_by
    )
    values (p_application_id, 'offer_created', 'Offer created', p_notes, auth.uid());
    insert into public.notifications (
      user_id, title, message, notification_type, related_entity_type, related_entity_id
    )
    values (
      target_application.student_id,
      'New offer',
      'You have received an employment offer.',
      'application_update',
      'offer',
      created_offer.id
    );
  end if;

  return created_offer;
end;
$$;

create or replace function public.student_withdraw_application(p_application_id uuid)
returns public.applications
language plpgsql
security definer
set search_path = public
as $$
declare
  target_application public.applications;
begin
  select * into target_application
  from public.applications
  where id = p_application_id
  for update;

  if not found or not public.owns_student(target_application.student_id) then
    raise exception 'Application is not owned by this student';
  end if;
  if not public.application_status_transition_allowed(target_application.status, 'withdrawn') then
    raise exception 'This application can no longer be withdrawn';
  end if;

  update public.offers
  set status = 'withdrawn', updated_at = now()
  where application_id = p_application_id and status = 'pending';

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
set search_path = public
as $$
declare
  target_application public.applications;
  target_offer public.offers;
  next_status text;
begin
  if p_response is null or p_response not in ('accepted', 'declined') then
    raise exception 'Offer response must be accepted or declined';
  end if;
  next_status := case p_response when 'accepted' then 'accepted' else 'offer_declined' end;

  select * into target_application
  from public.applications
  where id = p_application_id
  for update;

  if not found or not public.owns_student(target_application.student_id) then
    raise exception 'Application is not owned by this student';
  end if;
  if target_application.status <> 'offer' then
    raise exception 'This application has no outstanding offer';
  end if;
  if not public.application_status_transition_allowed(target_application.status, next_status) then
    raise exception 'Invalid offer response for the current application status';
  end if;

  select * into target_offer
  from public.offers
  where application_id = p_application_id and status = 'pending'
  order by created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'No pending offer was found for this application';
  end if;
  if target_offer.expiry_date is not null and target_offer.expiry_date < current_date then
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

revoke all on function public.employer_update_application(uuid, text, text) from public;
revoke all on function public.employer_schedule_interview(uuid, timestamptz, integer, text, text, text, text) from public;
revoke all on function public.employer_create_offer(uuid, numeric, text, date, date, text) from public;
revoke all on function public.student_withdraw_application(uuid) from public;
revoke all on function public.student_respond_to_offer(uuid, text) from public;
grant execute on function public.employer_update_application(uuid, text, text) to authenticated;
grant execute on function public.employer_schedule_interview(uuid, timestamptz, integer, text, text, text, text) to authenticated;
grant execute on function public.employer_create_offer(uuid, numeric, text, date, date, text) to authenticated;
grant execute on function public.student_withdraw_application(uuid) to authenticated;
grant execute on function public.student_respond_to_offer(uuid, text) to authenticated;

notify pgrst, 'reload schema';
