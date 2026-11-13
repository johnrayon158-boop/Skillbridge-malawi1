do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'education_required_text_nonempty'
      and conrelid = 'public.education'::regclass
  ) then
    alter table public.education
      add constraint education_required_text_nonempty
      check (
        length(btrim(institution)) > 0
        and length(btrim(programme)) > 0
        and length(btrim(qualification)) > 0
        and length(btrim(education_level)) > 0
      ) not valid;
  end if;
end
$$;

create or replace function public.refresh_student_profile_completion(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  completion_percentage integer;
begin
  select round(100.0 * (
    (case when length(btrim(coalesce(p.full_name, ''))) > 0 then 1 else 0 end)
    + (case when length(btrim(coalesce(sp.phone, ''))) > 0 then 1 else 0 end)
    + (case when length(btrim(coalesce(sp.bio, ''))) > 0 then 1 else 0 end)
    + (case when length(btrim(coalesce(sp.target_role, ''))) > 0 then 1 else 0 end)
    + (case when exists (
      select 1
      from unnest(coalesce(sp.interests, array[]::text[])) as interest(value)
      where length(btrim(interest.value)) > 0
    ) then 1 else 0 end)
    + (case when (
      (
        length(btrim(coalesce(sp.institution, ''))) > 0
        and length(btrim(coalesce(sp.programme, ''))) > 0
        and length(btrim(coalesce(sp.education_level, ''))) > 0
      )
      or exists (
        select 1
        from public.education e
        where e.student_id = sp.id
          and length(btrim(e.institution)) > 0
          and length(btrim(e.programme)) > 0
          and length(btrim(e.qualification)) > 0
          and length(btrim(e.education_level)) > 0
          and (e.start_year is null or e.start_year between 1900 and 2200)
          and (e.end_year is null or e.end_year between 1900 and 2200)
          and (e.start_year is null or e.end_year is null or e.end_year >= e.start_year)
      )
    ) then 1 else 0 end)
  ) / 6)::integer
  into completion_percentage
  from public.profiles p
  join public.student_profiles sp on sp.id = p.id
  where p.id = p_student_id;

  if completion_percentage is null then return; end if;

  update public.student_profiles
  set profile_completion = completion_percentage
  where id = p_student_id
    and profile_completion is distinct from completion_percentage;
end;
$$;

create or replace function public.refresh_student_profile_completion_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.refresh_student_profile_completion(new.id);
  return new;
end;
$$;

create or replace function public.refresh_student_profile_completion_from_education()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_student_profile_completion(old.student_id);
    return old;
  end if;

  perform public.refresh_student_profile_completion(new.student_id);
  if tg_op = 'UPDATE' and old.student_id is distinct from new.student_id then
    perform public.refresh_student_profile_completion(old.student_id);
  end if;
  return new;
end;
$$;

drop trigger if exists student_profiles_profile_completion_insert on public.student_profiles;
create trigger student_profiles_profile_completion_insert
after insert on public.student_profiles
for each row execute function public.refresh_student_profile_completion_trigger();

drop trigger if exists student_profiles_profile_completion_update on public.student_profiles;
create trigger student_profiles_profile_completion_update
after update of phone, bio, target_role, interests, institution, programme, education_level
on public.student_profiles
for each row execute function public.refresh_student_profile_completion_trigger();

drop trigger if exists profiles_profile_completion_update on public.profiles;
create trigger profiles_profile_completion_update
after update of full_name on public.profiles
for each row execute function public.refresh_student_profile_completion_trigger();

drop trigger if exists education_profile_completion_change on public.education;
create trigger education_profile_completion_change
after insert or update or delete on public.education
for each row execute function public.refresh_student_profile_completion_from_education();

do $$
declare
  student_record record;
begin
  for student_record in select id from public.student_profiles
  loop
    perform public.refresh_student_profile_completion(student_record.id);
  end loop;
end
$$;

revoke all on function public.refresh_student_profile_completion(uuid) from public, anon, authenticated;
revoke all on function public.refresh_student_profile_completion_trigger() from public, anon, authenticated;
revoke all on function public.refresh_student_profile_completion_from_education() from public, anon, authenticated;
