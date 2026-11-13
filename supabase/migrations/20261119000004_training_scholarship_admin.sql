alter table public.career_opportunities
  add column if not exists academic_qualifications text[] not null default '{}',
  add column if not exists eligibility_requirements text[] not null default '{}',
  add column if not exists delivery_mode text
    check (delivery_mode is null or delivery_mode in ('in_person', 'online', 'hybrid'));

create table if not exists public.career_opportunity_careers (
  opportunity_id uuid not null references public.career_opportunities(id) on delete cascade,
  career_id uuid not null references public.careers(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (opportunity_id, career_id)
);

alter table public.career_opportunity_careers enable row level security;

drop policy if exists career_opportunity_careers_published_read on public.career_opportunity_careers;
create policy career_opportunity_careers_published_read on public.career_opportunity_careers
  for select using (
    exists (
      select 1 from public.career_opportunities o
      join public.careers c on c.id = career_id
      where o.id = opportunity_id and o.status = 'published' and c.status = 'published'
    ) or public.is_admin()
  );
drop policy if exists career_opportunity_careers_admin_write on public.career_opportunity_careers;
create policy career_opportunity_careers_admin_write on public.career_opportunity_careers
  for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.career_opportunity_careers to authenticated;

create index if not exists career_opportunity_careers_career_idx
  on public.career_opportunity_careers(career_id);

create or replace function public.save_career_opportunity(
  p_opportunity jsonb,
  p_skill_ids uuid[] default '{}',
  p_career_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_input record;
  v_opportunity public.career_opportunities%rowtype;
  v_input_skill_count integer;
  v_input_career_count integer;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only administrators can manage training and scholarship opportunities';
  end if;

  select * into v_input from jsonb_to_record(p_opportunity) as input(
    id uuid, title text, description text, opportunity_type text, provider text,
    application_url text, location text, is_remote boolean, industries text[],
    eligible_programmes text[], eligible_candidate_types text[], min_study_year integer,
    max_study_year integer, application_deadline date, status text,
    academic_qualifications text[], eligibility_requirements text[], delivery_mode text
  );
  if nullif(trim(v_input.title), '') is null or nullif(trim(v_input.description), '') is null then
    raise exception 'Opportunity title and description are required';
  end if;
  if v_input.opportunity_type is null or v_input.opportunity_type not in ('training', 'scholarship') then
    raise exception 'Choose either a training programme or scholarship';
  end if;
  if v_input.status is null or v_input.status not in ('draft', 'published', 'closed', 'archived') then
    raise exception 'Choose a valid publication status';
  end if;
  if v_input.delivery_mode is not null and v_input.delivery_mode not in ('in_person', 'online', 'hybrid') then
    raise exception 'Choose a valid delivery mode';
  end if;
  if v_input.application_url is not null
    and v_input.application_url !~* '^https://[^/@[:space:]?#]+([/?#][^[:space:]]*)?$'
  then
    raise exception 'Application links must use HTTPS and cannot contain embedded credentials';
  end if;
  if v_input.status = 'published' then
    if nullif(trim(v_input.provider), '') is null then
      raise exception 'A provider is required before publishing an opportunity';
    end if;
    if nullif(trim(v_input.application_url), '') is null then
      raise exception 'A valid HTTPS application URL is required before publishing';
    end if;
    if v_input.application_deadline is not null and v_input.application_deadline < current_date then
      raise exception 'Expired opportunities cannot be published';
    end if;
  end if;
  if v_input.min_study_year is not null and v_input.min_study_year < 1
    or v_input.max_study_year is not null and v_input.max_study_year < 1
    or v_input.min_study_year is not null and v_input.max_study_year is not null
      and v_input.min_study_year > v_input.max_study_year
  then
    raise exception 'Study year bounds are invalid';
  end if;
  if exists (
    select 1 from unnest(coalesce(v_input.eligible_candidate_types, '{}'::text[])) candidate(value)
    where candidate.value not in ('student', 'graduate')
  ) then
    raise exception 'Eligible candidate types must be student or graduate';
  end if;

  select count(distinct skill_id)
  into v_input_skill_count
  from unnest(coalesce(p_skill_ids, '{}'::uuid[])) chosen(skill_id);
  if v_input_skill_count <> cardinality(coalesce(p_skill_ids, '{}'::uuid[])) then
    raise exception 'Remove duplicate required skills before saving';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_skill_ids, '{}'::uuid[])) chosen(skill_id)
    left join public.skills s on s.id = chosen.skill_id
    where s.id is null
  ) then
    raise exception 'One or more selected skills are unavailable';
  end if;
  if v_input.status = 'published' and exists (
    select 1
    from unnest(coalesce(p_skill_ids, '{}'::uuid[])) chosen(skill_id)
    join public.skills s on s.id = chosen.skill_id
    where s.status <> 'active' or s.approval_status <> 'approved' or s.is_internal
  ) then
    raise exception 'Replace inactive or unapproved required skills before publishing';
  end if;

  select count(distinct career_id)
  into v_input_career_count
  from unnest(coalesce(p_career_ids, '{}'::uuid[])) chosen(career_id);
  if v_input_career_count <> cardinality(coalesce(p_career_ids, '{}'::uuid[])) then
    raise exception 'Remove duplicate related careers before saving';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_career_ids, '{}'::uuid[])) chosen(career_id)
    left join public.careers c on c.id = chosen.career_id
    where c.id is null or (v_input.status = 'published' and c.status <> 'published')
  ) then
    raise exception 'Only existing, published careers can be linked to a published opportunity';
  end if;

  insert into public.career_opportunities (
    id, title, description, opportunity_type, provider, application_url, location, is_remote,
    industries, eligible_programmes, eligible_candidate_types, min_study_year, max_study_year,
    application_deadline, status, academic_qualifications, eligibility_requirements,
    delivery_mode, created_by
  ) values (
    coalesce(v_input.id, gen_random_uuid()), trim(v_input.title), trim(v_input.description),
    v_input.opportunity_type, nullif(trim(v_input.provider), ''), nullif(trim(v_input.application_url), ''),
    nullif(trim(v_input.location), ''), coalesce(v_input.is_remote, false),
    coalesce(v_input.industries, '{}'::text[]), coalesce(v_input.eligible_programmes, '{}'::text[]),
    coalesce(v_input.eligible_candidate_types, '{}'::text[]), v_input.min_study_year,
    v_input.max_study_year, v_input.application_deadline, v_input.status,
    coalesce(v_input.academic_qualifications, '{}'::text[]),
    coalesce(v_input.eligibility_requirements, '{}'::text[]), v_input.delivery_mode, auth.uid()
  )
  on conflict (id) do update set
    title = excluded.title,
    description = excluded.description,
    opportunity_type = excluded.opportunity_type,
    provider = excluded.provider,
    application_url = excluded.application_url,
    location = excluded.location,
    is_remote = excluded.is_remote,
    industries = excluded.industries,
    eligible_programmes = excluded.eligible_programmes,
    eligible_candidate_types = excluded.eligible_candidate_types,
    min_study_year = excluded.min_study_year,
    max_study_year = excluded.max_study_year,
    application_deadline = excluded.application_deadline,
    status = excluded.status,
    academic_qualifications = excluded.academic_qualifications,
    eligibility_requirements = excluded.eligibility_requirements,
    delivery_mode = excluded.delivery_mode
  returning * into v_opportunity;

  delete from public.career_opportunity_skills where opportunity_id = v_opportunity.id;
  insert into public.career_opportunity_skills(opportunity_id, skill_id)
  select v_opportunity.id, chosen.skill_id
  from unnest(coalesce(p_skill_ids, '{}'::uuid[])) as chosen(skill_id);

  delete from public.career_opportunity_careers where opportunity_id = v_opportunity.id;
  insert into public.career_opportunity_careers(opportunity_id, career_id)
  select v_opportunity.id, chosen.career_id
  from unnest(coalesce(p_career_ids, '{}'::uuid[])) as chosen(career_id);

  update public.career_opportunities set updated_at = now() where id = v_opportunity.id;
  select * into v_opportunity from public.career_opportunities where id = v_opportunity.id;
  return to_jsonb(v_opportunity);
end;
$$;

create or replace function public.notify_for_career_opportunity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user record;
  v_notification_type text;
  v_skills uuid[];
  v_match_terms text[];
begin
  if new.status <> 'published' or (new.application_deadline is not null and new.application_deadline < current_date) then
    delete from public.notifications
    where related_entity_type = 'opportunity' and related_entity_id = new.id
      and dedupe_key = 'opportunity:' || new.id::text;
    return new;
  end if;
  v_notification_type := case when new.opportunity_type = 'scholarship'
    then 'scholarship_opportunity' else 'training_recommendation' end;
  select coalesce(array_agg(os.skill_id), '{}'::uuid[]) into v_skills
    from public.career_opportunity_skills os where os.opportunity_id = new.id;
  select coalesce(array_agg(c.title), '{}'::text[]) into v_match_terms
    from public.career_opportunity_careers oc
    join public.careers c on c.id = oc.career_id and c.status = 'published'
    where oc.opportunity_id = new.id;
  for v_user in
    select sp.id from public.student_profiles sp join public.profiles p on p.id = sp.id where p.role = 'student'
  loop
    perform public.create_opportunity_notification(
      v_user.id, 'opportunity', new.id, new.title, new.description,
      v_notification_type, new.application_url,
      coalesce(new.industries, '{}'::text[]) || coalesce(v_match_terms, '{}'::text[]),
      array[new.opportunity_type], new.location, new.is_remote,
      coalesce(new.eligible_programmes, '{}'::text[]),
      coalesce(new.eligible_candidate_types, '{}'::text[]), new.min_study_year,
      new.max_study_year, v_skills
    );
  end loop;
  return new;
end;
$$;

create or replace function public.generate_opportunity_notifications()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer := 0;
  v_row record;
  v_added boolean;
begin
  if v_user_id is null or not exists (
    select 1 from public.profiles p where p.id = v_user_id and p.role = 'student'
  ) then
    raise exception 'Only signed-in students can refresh opportunity notifications';
  end if;

  delete from public.notifications n
  where n.user_id = v_user_id
    and n.related_entity_type = 'job'
    and n.dedupe_key like 'job:%'
    and not exists (
      select 1 from public.jobs j
      where j.id = n.related_entity_id and j.status = 'published'
        and (j.application_deadline is null or j.application_deadline >= current_date)
    );
  delete from public.notifications n
  where n.user_id = v_user_id
    and n.related_entity_type = 'opportunity'
    and n.dedupe_key like 'opportunity:%'
    and not exists (
      select 1 from public.career_opportunities o
      where o.id = n.related_entity_id and o.status = 'published'
        and (o.application_deadline is null or o.application_deadline >= current_date)
    );
  delete from public.notifications n
  where n.user_id = v_user_id
    and n.related_entity_type = 'learning_resource'
    and n.dedupe_key like 'learning_resource:%'
    and not exists (
      select 1 from public.learning_resources lr
      where lr.id = n.related_entity_id and lr.resource_type in ('course', 'certificate')
    );

  for v_row in
    select j.*, ep.industry
    from public.jobs j left join public.employer_profiles ep on ep.id = j.employer_id
    where j.status = 'published'
      and (j.application_deadline is null or j.application_deadline >= current_date)
  loop
    v_added := public.create_opportunity_notification(
      v_user_id, 'job', v_row.id, v_row.title, v_row.description,
      case when v_row.employment_type = 'internship' or v_row.opportunity_type in ('industrial_attachment', 'internship', 'graduate_internship', 'work_experience')
        then 'internship_match'
        when v_row.opportunity_type = 'apprenticeship' then 'apprenticeship_programme'
        else 'new_job_match' end,
      case when v_row.employment_type = 'internship' or v_row.opportunity_type in ('industrial_attachment', 'internship', 'graduate_internship', 'work_experience')
        then '/student/internships/' || v_row.id::text else '/student/jobs/' || v_row.id::text end,
      case when v_row.industry is null then '{}'::text[] else array[v_row.industry] end,
      array_remove(array[v_row.employment_type, v_row.opportunity_type, 'job'], null),
      v_row.location, v_row.work_mode in ('remote', 'hybrid'), coalesce(v_row.eligible_programmes, '{}'::text[]),
      '{}'::text[], v_row.min_study_year, v_row.max_study_year,
      coalesce((select array_agg(js.skill_id) from public.job_skills js where js.job_id = v_row.id and js.is_required), '{}'::uuid[])
    );
    if v_added then v_count := v_count + 1; end if;
  end loop;

  for v_row in
    select lr.* from public.learning_resources lr where lr.resource_type in ('course', 'certificate')
  loop
    v_added := public.create_opportunity_notification(
      v_user_id, 'learning_resource', v_row.id, v_row.title, v_row.description,
      case when v_row.resource_type = 'certificate' then 'training_recommendation' else 'learning_recommendation' end,
      v_row.url, '{}'::text[], array[v_row.resource_type, 'training'], null, false, '{}'::text[], '{}'::text[],
      null, null, case when v_row.skill_id is null then '{}'::uuid[] else array[v_row.skill_id] end,
      coalesce(v_row.difficulty, 'beginner')
    );
    if v_added then v_count := v_count + 1; end if;
  end loop;

  for v_row in
    select o.* from public.career_opportunities o
    where o.status = 'published'
      and (o.application_deadline is null or o.application_deadline >= current_date)
  loop
    v_added := public.create_opportunity_notification(
      v_user_id, 'opportunity', v_row.id, v_row.title, v_row.description,
      case when v_row.opportunity_type = 'scholarship' then 'scholarship_opportunity' else 'training_recommendation' end,
      v_row.application_url,
      coalesce(v_row.industries, '{}'::text[]) || coalesce((
        select array_agg(c.title)
        from public.career_opportunity_careers oc
        join public.careers c on c.id = oc.career_id and c.status = 'published'
        where oc.opportunity_id = v_row.id
      ), '{}'::text[]),
      array[v_row.opportunity_type], v_row.location, v_row.is_remote,
      coalesce(v_row.eligible_programmes, '{}'::text[]),
      coalesce(v_row.eligible_candidate_types, '{}'::text[]), v_row.min_study_year, v_row.max_study_year,
      coalesce((select array_agg(os.skill_id) from public.career_opportunity_skills os where os.opportunity_id = v_row.id), '{}'::uuid[])
    );
    if v_added then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end;
$$;

create or replace function public.delete_career_definition(p_career_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only administrators can manage career definitions';
  end if;

  select status into v_status
  from public.careers
  where id = p_career_id
  for update;
  if not found then
    raise exception 'Career definition not found';
  end if;
  if v_status = 'published' then
    raise exception 'Archive a published career before deleting it';
  end if;
  if exists (select 1 from public.career_recommendations where career_id = p_career_id)
    or exists (select 1 from public.career_roadmaps where career_id = p_career_id)
    or exists (select 1 from public.career_progress where career_id = p_career_id)
    or exists (select 1 from public.learning_paths where career_id = p_career_id)
    or exists (select 1 from public.assessments where career_id = p_career_id)
    or exists (select 1 from public.career_opportunity_careers where career_id = p_career_id) then
    raise exception 'This career has student, assessment, or opportunity history; archive it instead of deleting it';
  end if;

  delete from public.careers where id = p_career_id;
  return true;
end;
$$;

revoke all on function public.save_career_opportunity(jsonb, uuid[]) from public, anon, authenticated;
revoke all on function public.save_career_opportunity(jsonb, uuid[], uuid[]) from public, anon;
grant execute on function public.save_career_opportunity(jsonb, uuid[], uuid[]) to authenticated;
revoke all on function public.generate_opportunity_notifications() from public;
grant execute on function public.generate_opportunity_notifications() to authenticated;
revoke all on function public.delete_career_definition(uuid) from public;
grant execute on function public.delete_career_definition(uuid) to authenticated;
