alter table public.certificates
  add column if not exists verification_notes text;

drop policy if exists certificates_admin_all on public.certificates;
create policy certificates_admin_all on public.certificates
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists student_certificates_admin_select on storage.objects;
create policy student_certificates_admin_select on storage.objects
  for select using (
    bucket_id = 'student-certificates'
    and public.is_admin()
  );

create or replace function public.prevent_unverified_credential_claims()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_admin() then
    if tg_op = 'INSERT' then
      if new.verification_method is not null or new.verified_by is not null or new.verified_at is not null
        or new.verification_status <> 'pending' or new.verification_notes is not null
      then
        raise exception 'Only an administrator can record credential verification';
      end if;
    elsif new.verification_method is distinct from old.verification_method
      or new.verified_by is distinct from old.verified_by
      or new.verified_at is distinct from old.verified_at
      or new.verification_status is distinct from old.verification_status
      or new.verification_notes is distinct from old.verification_notes
    then
      raise exception 'Only an administrator can record credential verification';
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
    raise exception 'Independent verification requires a verified status, reviewer, and verification time';
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
