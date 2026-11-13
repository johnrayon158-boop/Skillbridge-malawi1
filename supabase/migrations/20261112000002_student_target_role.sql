alter table public.student_profiles
  add column if not exists target_role text;

update public.student_profiles
set target_role = nullif(btrim(target_role), '')
where target_role is not null
  and target_role is distinct from nullif(btrim(target_role), '');

update public.student_profiles sp
set target_role = careers.title
from (
  select distinct on (lower(btrim(title)))
    title
  from public.careers
  where nullif(btrim(title), '') is not null
    and char_length(btrim(title)) <= 120
  order by lower(btrim(title)), title
) careers
where sp.target_role is null
  and nullif(btrim(sp.career_goal), '') is not null
  and char_length(btrim(sp.career_goal)) <= 120
  and lower(btrim(sp.career_goal)) = lower(btrim(careers.title));

alter table public.student_profiles
  drop constraint if exists student_profiles_target_role_length;
alter table public.student_profiles
  add constraint student_profiles_target_role_length
  check (target_role is null or char_length(btrim(target_role)) between 1 and 120)
  not valid;
alter table public.student_profiles
  validate constraint student_profiles_target_role_length;

do $$
declare
  v_function_definition text;
  v_old_terms text := 'array[v_profile.career_goal, v_profile.programme, v_profile.bio]';
  v_new_terms text := 'array[v_profile.target_role, v_profile.career_goal, v_profile.programme, v_profile.bio]';
begin
  v_function_definition := pg_get_functiondef(
    'public.opportunity_notification_match(uuid,text,text,text[],text[],text,text,boolean,text[],text[],integer,integer,uuid[],text)'::regprocedure
  );

  if position(v_new_terms in v_function_definition) > 0 then
    return;
  end if;
  if position(v_old_terms in v_function_definition) = 0 then
    raise exception 'Could not safely add target_role to opportunity_notification_match.';
  end if;

  execute replace(v_function_definition, v_old_terms, v_new_terms);
end;
$$;
