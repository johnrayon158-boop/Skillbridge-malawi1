alter table public.certificates
  drop constraint if exists certificates_verification_status_check,
  add constraint certificates_verification_status_check
    check (verification_status in ('pending', 'verified', 'rejected', 'requires_correction'));

create table if not exists public.certificate_review_history (
  id uuid primary key default gen_random_uuid(),
  certificate_id uuid references public.certificates(id) on delete set null,
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  event_type text not null check (event_type in ('decision', 'resubmitted')),
  previous_status text not null check (previous_status in ('pending', 'verified', 'rejected', 'requires_correction')),
  new_status text not null check (new_status in ('pending', 'verified', 'rejected', 'requires_correction')),
  actor_id uuid references public.profiles(id) on delete set null,
  reviewer_id uuid references public.profiles(id) on delete set null,
  verification_method text,
  reason text,
  created_at timestamptz not null default now(),
  check (reason is null or length(reason) <= 2000),
  check (
    (event_type = 'decision' and reviewer_id is not null and reason is not null)
    or (event_type = 'resubmitted' and reviewer_id is null and new_status = 'pending')
  )
);

create index if not exists certificate_review_history_certificate_idx
  on public.certificate_review_history(certificate_id, created_at desc);
create index if not exists certificate_review_history_student_idx
  on public.certificate_review_history(student_id, created_at desc);

alter table public.certificate_review_history enable row level security;
drop policy if exists certificate_review_history_owner_admin_read on public.certificate_review_history;
create policy certificate_review_history_owner_admin_read on public.certificate_review_history
  for select using (public.owns_student(student_id) or public.is_admin());

revoke all on public.certificate_review_history from public, anon, authenticated;
grant select on public.certificate_review_history to authenticated;

drop policy if exists certificates_admin_all on public.certificates;
drop policy if exists certificates_admin_select on public.certificates;
create policy certificates_admin_select on public.certificates
  for select using (public.is_admin());

drop policy if exists certificates_owner_all on public.certificates;
drop policy if exists certificates_owner_select on public.certificates;
create policy certificates_owner_select on public.certificates
  for select using (public.owns_student(student_id));
drop policy if exists certificates_owner_insert on public.certificates;
create policy certificates_owner_insert on public.certificates
  for insert with check (public.owns_student(student_id) and not public.is_admin());
drop policy if exists certificates_owner_update on public.certificates;
create policy certificates_owner_update on public.certificates
  for update using (public.owns_student(student_id) and not public.is_admin())
  with check (public.owns_student(student_id) and not public.is_admin());
drop policy if exists certificates_owner_delete on public.certificates;
create policy certificates_owner_delete on public.certificates
  for delete using (public.owns_student(student_id) and not public.is_admin());

create or replace function public.prevent_unverified_credential_claims()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_is_resubmission boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_is_resubmission := not public.is_admin()
      and old.verification_status = 'requires_correction'
      and new.verification_status = 'pending'
      and old.file_path is distinct from new.file_path;
  end if;

  if not public.is_admin() then
    if tg_op = 'INSERT' then
      if new.verification_method is not null or new.verified_by is not null or new.verified_at is not null
        or new.verification_status <> 'pending' or new.verification_notes is not null
      then
        raise exception 'Only an administrator can record certificate review decisions';
      end if;
    elsif v_is_resubmission then
      if new.verification_method is not null or new.verified_by is not null
        or new.verified_at is not null or new.verification_notes is not null
        or new.file_path is null
        or new.file_path not like (auth.uid()::text || '/certificates/%')
        or not exists (
          select 1 from storage.objects
          where bucket_id = 'student-certificates' and name = new.file_path
        )
      then
        raise exception 'Upload a replacement certificate file before resubmitting';
      end if;
    elsif new.verification_method is distinct from old.verification_method
      or new.verified_by is distinct from old.verified_by
      or new.verified_at is distinct from old.verified_at
      or new.verification_status is distinct from old.verification_status
      or new.verification_notes is distinct from old.verification_notes
    then
      raise exception 'Only an administrator can record certificate review decisions';
    end if;
  end if;

  if new.verification_status = 'verified'
    and (new.verification_method is null or new.verified_by is null or new.verified_at is null)
  then
    if tg_op = 'INSERT' then
      raise exception 'Independent verification requires a supported method, reviewer, and verification time';
    elsif old.verification_status is distinct from 'verified'
      or old.verification_method is distinct from new.verification_method
      or old.verified_by is distinct from new.verified_by
      or old.verified_at is distinct from new.verified_at
    then
      raise exception 'Independent verification requires a supported method, reviewer, and verification time';
    end if;
  end if;

  if new.verification_method is not null
    and new.verification_method not in ('issuer_registry', 'issuer_confirmation', 'credential_provider')
  then
    raise exception 'Choose a supported independent verification method';
  end if;

  if new.verification_method is not null
    and (new.verified_by is null or new.verified_at is null or new.verification_status <> 'verified')
  then
    raise exception 'Independent verification requires an approved status, reviewer, and verification time';
  end if;

  return new;
end;
$$;

create or replace function public.record_certificate_resubmission()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.verification_status = 'requires_correction'
    and new.verification_status = 'pending'
  then
    insert into public.certificate_review_history (
      certificate_id, student_id, event_type, previous_status, new_status, actor_id
    )
    values (
      new.id, new.student_id, 'resubmitted', old.verification_status, new.verification_status, auth.uid()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists certificates_record_resubmission on public.certificates;
create trigger certificates_record_resubmission
after update of verification_status on public.certificates
for each row when (old.verification_status is distinct from new.verification_status)
execute function public.record_certificate_resubmission();

revoke all on function public.record_certificate_resubmission() from public, anon, authenticated;

create or replace function public.review_student_certificate(
  p_certificate_id uuid,
  p_decision text,
  p_method text,
  p_reason text
)
returns public.certificates
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_certificate public.certificates;
  v_reason text := nullif(btrim(p_reason), '');
  v_notification_action text;
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required to review certificates'
      using errcode = '42501';
  end if;

  if p_decision is null or p_decision not in ('verified', 'rejected', 'requires_correction') then
    raise exception 'Choose a valid certificate review decision';
  end if;
  if v_reason is null or length(v_reason) > 2000 then
    raise exception 'A review reason of 1 to 2,000 characters is required';
  end if;
  if p_decision = 'verified'
    and (p_method is null or p_method not in ('issuer_registry', 'issuer_confirmation', 'credential_provider'))
  then
    raise exception 'Choose a supported independent verification method';
  end if;
  if p_decision <> 'verified' and p_method is not null then
    raise exception 'Verification method is only valid for an approved certificate';
  end if;

  select * into v_certificate
  from public.certificates
  where id = p_certificate_id
  for update;

  if not found then
    raise exception 'Certificate not found';
  end if;
  if v_certificate.student_id = auth.uid() then
    raise exception 'Administrators cannot review their own certificate';
  end if;
  if v_certificate.verification_status <> 'pending' then
    raise exception 'Only pending certificates can be reviewed';
  end if;

  insert into public.certificate_review_history (
    certificate_id, student_id, event_type, previous_status, new_status,
    actor_id, reviewer_id, verification_method, reason
  )
  values (
    v_certificate.id, v_certificate.student_id, 'decision',
    v_certificate.verification_status, p_decision, auth.uid(), auth.uid(),
    p_method, v_reason
  );

  update public.certificates
  set verification_status = p_decision,
      verification_method = case when p_decision = 'verified' then p_method else null end,
      verified_by = case when p_decision = 'verified' then auth.uid() else null end,
      verified_at = case when p_decision = 'verified' then now() else null end,
      verification_notes = v_reason
  where id = p_certificate_id
  returning * into v_certificate;

  v_notification_action := case p_decision
    when 'verified' then 'approved'
    when 'requires_correction' then 'requires corrections'
    else 'rejected'
  end;
  insert into public.notifications (
    user_id, title, message, notification_type, related_entity_type, related_entity_id
  )
  values (
    v_certificate.student_id,
    'Certificate review update',
    format('Your certificate "%s" was %s. Reviewer note: %s', v_certificate.title, v_notification_action, v_reason),
    'certificate_review',
    'certificate',
    v_certificate.id
  );

  return v_certificate;
end;
$$;

revoke all on function public.review_student_certificate(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.review_student_certificate(uuid, text, text, text) to authenticated;

notify pgrst, 'reload schema';
