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
  created_offer public.offers;
  candidate_id uuid;
begin
  if not exists (
    select 1
    from public.applications a
    join public.jobs j on j.id = a.job_id
    where a.id = p_application_id
      and j.employer_id = auth.uid()
  ) then
    raise exception 'Application is not owned by this employer';
  end if;

  insert into public.offers (application_id, salary, currency, start_date, expiry_date, notes)
  values (p_application_id, p_salary, coalesce(nullif(trim(p_currency), ''), 'MWK'), p_start_date, p_expiry_date, p_notes)
  returning * into created_offer;

  update public.applications
  set status = 'offer', updated_at = now()
  where id = p_application_id;

  insert into public.application_events (application_id, event_type, title, description, created_by)
  values (p_application_id, 'offer', 'Offer made', p_notes, auth.uid());

  select student_id
  into candidate_id
  from public.applications
  where id = p_application_id;

  insert into public.notifications (user_id, title, message, notification_type, related_entity_type, related_entity_id)
  values (candidate_id, 'New offer', 'You have received an employment offer.', 'application_update', 'offer', created_offer.id);

  return created_offer;
end;
$$;

revoke all on function public.employer_create_offer(uuid, numeric, text, date, date, text) from public;
grant execute on function public.employer_create_offer(uuid, numeric, text, date, date, text) to authenticated;

notify pgrst, 'reload schema';
