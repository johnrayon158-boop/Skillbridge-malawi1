alter table public.careers
  add column status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  add column academic_programmes text[] not null default '{}',
  add column required_qualifications text[] not null default '{}',
  add column responsibilities text[] not null default '{}',
  add column opportunity_areas text[] not null default '{}',
  add column outlook_summary text,
  add column outlook_source text,
  add column outlook_source_url text,
  add column outlook_verified_at timestamptz,
  add column outlook_verified_by uuid references public.profiles(id) on delete set null,
  add column published_at timestamptz,
  add column archived_at timestamptz;

alter table public.career_skills
  add column is_required boolean not null default true;

create table public.career_learning_resources (
  id uuid primary key default gen_random_uuid(),
  career_id uuid not null references public.careers(id) on delete cascade,
  learning_resource_id uuid not null references public.learning_resources(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (career_id, learning_resource_id)
);

create index careers_status_sector_title_idx
  on public.careers(status, sector, title);
create index career_learning_resources_career_id_idx
  on public.career_learning_resources(career_id);

alter table public.career_learning_resources enable row level security;

drop policy if exists careers_public_read on public.careers;
drop policy if exists careers_published_read on public.careers;
create policy careers_published_read on public.careers
  for select using (status = 'published');
drop policy if exists careers_admin_all on public.careers;
create policy careers_admin_all on public.careers
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists career_skills_public_read on public.career_skills;
drop policy if exists career_skills_published_read on public.career_skills;
create policy career_skills_published_read on public.career_skills
  for select using (exists (
    select 1 from public.careers c
    where c.id = career_id and c.status = 'published'
  ));
drop policy if exists career_skills_admin_all on public.career_skills;
create policy career_skills_admin_all on public.career_skills
  for all using (public.is_admin()) with check (public.is_admin());

create policy career_learning_resources_published_read on public.career_learning_resources
  for select using (exists (
    select 1 from public.careers c
    where c.id = career_id and c.status = 'published'
  ));
create policy career_learning_resources_admin_all on public.career_learning_resources
  for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.save_career_definition(
  p_career jsonb,
  p_skill_requirements jsonb default '[]'::jsonb,
  p_learning_resource_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_title text;
  v_sector text;
  v_description text;
  v_entry_level text;
  v_growth_path text;
  v_status text;
  v_academic_programmes text[];
  v_required_qualifications text[];
  v_responsibilities text[];
  v_opportunity_areas text[];
  v_outlook_summary text;
  v_outlook_source text;
  v_outlook_source_url text;
  v_outlook_reviewed boolean;
  v_career public.careers%rowtype;
  v_required_skill_count integer;
  v_resource_count integer;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only administrators can manage career definitions';
  end if;
  if jsonb_typeof(p_career) is distinct from 'object' then
    raise exception 'Career details must be provided as a JSON object';
  end if;
  if jsonb_typeof(p_skill_requirements) is distinct from 'array' then
    raise exception 'Career skill requirements must be provided as a JSON array';
  end if;
  if jsonb_typeof(p_career->'academic_programmes') not in ('array', 'null')
    or jsonb_typeof(p_career->'required_qualifications') not in ('array', 'null')
    or jsonb_typeof(p_career->'responsibilities') not in ('array', 'null')
    or jsonb_typeof(p_career->'opportunity_areas') not in ('array', 'null') then
    raise exception 'Career programmes, qualifications, responsibilities, and opportunities must be lists';
  end if;

  v_id := coalesce(nullif(p_career->>'id', '')::uuid, gen_random_uuid());
  v_title := btrim(coalesce(p_career->>'title', ''));
  v_sector := btrim(coalesce(p_career->>'sector', ''));
  v_description := btrim(coalesce(p_career->>'description', ''));
  v_entry_level := nullif(btrim(p_career->>'entry_level'), '');
  v_growth_path := nullif(btrim(p_career->>'growth_path'), '');
  v_status := coalesce(nullif(p_career->>'status', ''), 'draft');
  v_academic_programmes := array(
    select distinct btrim(value)
    from jsonb_array_elements_text(coalesce(p_career->'academic_programmes', '[]'::jsonb)) as values_list(value)
    where btrim(value) <> ''
  );
  v_required_qualifications := array(
    select distinct btrim(value)
    from jsonb_array_elements_text(coalesce(p_career->'required_qualifications', '[]'::jsonb)) as values_list(value)
    where btrim(value) <> ''
  );
  v_responsibilities := array(
    select distinct btrim(value)
    from jsonb_array_elements_text(coalesce(p_career->'responsibilities', '[]'::jsonb)) as values_list(value)
    where btrim(value) <> ''
  );
  v_opportunity_areas := array(
    select distinct btrim(value)
    from jsonb_array_elements_text(coalesce(p_career->'opportunity_areas', '[]'::jsonb)) as values_list(value)
    where btrim(value) <> ''
  );
  v_outlook_summary := nullif(btrim(p_career->>'outlook_summary'), '');
  v_outlook_source := nullif(btrim(p_career->>'outlook_source'), '');
  v_outlook_source_url := nullif(btrim(p_career->>'outlook_source_url'), '');
  v_outlook_reviewed := coalesce((p_career->>'outlook_reviewed')::boolean, false);

  if v_title = '' or length(v_title) > 160 then
    raise exception 'Career title is required and must be 160 characters or fewer';
  end if;
  if v_sector = '' or length(v_sector) > 120 then
    raise exception 'Industry or sector is required and must be 120 characters or fewer';
  end if;
  if v_description = '' or length(v_description) > 4000 then
    raise exception 'Career description is required and must be 4,000 characters or fewer';
  end if;
  if v_status not in ('draft', 'published', 'archived') then
    raise exception 'Choose a valid career status';
  end if;
  if v_outlook_source_url is not null and v_outlook_source_url !~* '^https://[^[:space:]]+$' then
    raise exception 'Employment outlook source links must use HTTPS';
  end if;
  if v_outlook_reviewed and (v_outlook_summary is null or v_outlook_source is null) then
    raise exception 'A reviewed employment outlook requires a summary and source';
  end if;

  select count(*) filter (where coalesce(requirement.is_required, true))
  into v_required_skill_count
  from jsonb_to_recordset(p_skill_requirements) as requirement(
    skill_id uuid, is_required boolean, required_level text, importance integer
  );
  if v_status = 'published' and v_required_skill_count = 0 then
    raise exception 'Add at least one required catalog skill before publishing this career';
  end if;
  if exists (
    select requirement.skill_id
    from jsonb_to_recordset(p_skill_requirements) as requirement(
      skill_id uuid, is_required boolean, required_level text, importance integer
    )
    group by requirement.skill_id
    having count(*) > 1
  ) then
    raise exception 'A career cannot contain the same skill more than once';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_skill_requirements) as requirement(
      skill_id uuid, is_required boolean, required_level text, importance integer
    )
    left join public.skills s on s.id = requirement.skill_id
    where requirement.skill_id is null
      or s.id is null
      or coalesce(requirement.required_level, 'beginner') not in ('beginner', 'intermediate', 'advanced', 'expert')
      or coalesce(requirement.importance, 50) not between 1 and 100
      or (
        (s.status is distinct from 'active' or s.approval_status is distinct from 'approved' or coalesce(s.is_internal, true))
        and not exists (
          select 1 from public.career_skills existing
          where existing.career_id = v_id and existing.skill_id = requirement.skill_id
        )
      )
  ) then
    raise exception 'Career skills must be valid catalog skills with valid proficiency and importance values';
  end if;
  if v_status = 'published' and exists (
    select 1
    from jsonb_to_recordset(p_skill_requirements) as requirement(
      skill_id uuid, is_required boolean, required_level text, importance integer
    )
    left join public.skills s on s.id = requirement.skill_id
    where coalesce(requirement.is_required, true)
      and (
        s.id is null
        or s.status is distinct from 'active'
        or s.approval_status is distinct from 'approved'
        or coalesce(s.is_internal, true)
      )
  ) then
    raise exception 'Replace inactive or unapproved required skills before publishing this career';
  end if;

  select count(*) into v_resource_count
  from unnest(coalesce(p_learning_resource_ids, '{}'::uuid[])) as selected(resource_id);
  if v_resource_count <> (select count(distinct resource_id) from unnest(coalesce(p_learning_resource_ids, '{}'::uuid[])) as selected(resource_id)) then
    raise exception 'A learning resource cannot be linked more than once';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_learning_resource_ids, '{}'::uuid[])) as selected(resource_id)
    left join public.learning_resources resource on resource.id = selected.resource_id
    where resource.id is null
  ) then
    raise exception 'One or more selected learning resources are unavailable';
  end if;

  insert into public.careers as existing_career (
    id, title, sector, description, entry_level, growth_path,
    status, academic_programmes, required_qualifications, responsibilities, opportunity_areas,
    outlook_summary, outlook_source, outlook_source_url, outlook_verified_at, outlook_verified_by,
    published_at, archived_at
  )
  values (
    v_id, v_title, v_sector, v_description, v_entry_level, v_growth_path,
    v_status, v_academic_programmes, v_required_qualifications, v_responsibilities, v_opportunity_areas,
    v_outlook_summary, v_outlook_source, v_outlook_source_url,
    case when v_outlook_reviewed then now() else null end,
    case when v_outlook_reviewed then auth.uid() else null end,
    case when v_status = 'published' then now() else null end,
    case when v_status = 'archived' then now() else null end
  )
  on conflict (id) do update set
    title = excluded.title,
    sector = excluded.sector,
    description = excluded.description,
    entry_level = excluded.entry_level,
    growth_path = excluded.growth_path,
    status = excluded.status,
    academic_programmes = excluded.academic_programmes,
    required_qualifications = excluded.required_qualifications,
    responsibilities = excluded.responsibilities,
    opportunity_areas = excluded.opportunity_areas,
    outlook_summary = excluded.outlook_summary,
    outlook_source = excluded.outlook_source,
    outlook_source_url = excluded.outlook_source_url,
    outlook_verified_at = excluded.outlook_verified_at,
    outlook_verified_by = excluded.outlook_verified_by,
    published_at = case when excluded.status = 'published' then now() else existing_career.published_at end,
    archived_at = case when excluded.status = 'archived' then now() else null end
  returning * into v_career;

  delete from public.career_skills where career_id = v_career.id;
  insert into public.career_skills (career_id, skill_id, required_level, importance, is_required)
  select v_career.id, requirement.skill_id,
         coalesce(requirement.required_level, 'beginner'),
         coalesce(requirement.importance, 50),
         coalesce(requirement.is_required, true)
  from jsonb_to_recordset(p_skill_requirements) as requirement(
    skill_id uuid, is_required boolean, required_level text, importance integer
  );

  delete from public.career_learning_resources where career_id = v_career.id;
  insert into public.career_learning_resources (career_id, learning_resource_id)
  select v_career.id, selected.resource_id
  from unnest(coalesce(p_learning_resource_ids, '{}'::uuid[])) as selected(resource_id);

  return to_jsonb(v_career);
end;
$$;

create or replace function public.update_career_definition_status(
  p_career_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_career public.careers%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only administrators can manage career definitions';
  end if;
  if p_status is null or p_status not in ('draft', 'published', 'archived') then
    raise exception 'Choose a valid career status';
  end if;

  select * into v_career
  from public.careers
  where id = p_career_id
  for update;
  if not found then
    raise exception 'Career definition not found';
  end if;

  if p_status = 'published' then
    if btrim(v_career.title) = '' or btrim(v_career.sector) = '' or btrim(v_career.description) = '' then
      raise exception 'Career title, sector, and description are required before publishing';
    end if;
    if not exists (
      select 1 from public.career_skills
      where career_id = p_career_id and is_required = true
    ) then
      raise exception 'Add at least one required catalog skill before publishing this career';
    end if;
    if exists (
      select 1
      from public.career_skills cs
      join public.skills s on s.id = cs.skill_id
      where cs.career_id = p_career_id
        and cs.is_required = true
        and (
          s.status is distinct from 'active'
          or s.approval_status is distinct from 'approved'
          or coalesce(s.is_internal, true)
        )
    ) then
      raise exception 'Replace inactive or unapproved required skills before publishing this career';
    end if;
  end if;

  update public.careers
  set status = p_status,
      published_at = case when p_status = 'published' then now() else published_at end,
      archived_at = case when p_status = 'archived' then now() else null end
  where id = p_career_id
  returning * into v_career;

  return to_jsonb(v_career);
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
    or exists (select 1 from public.assessments where career_id = p_career_id) then
    raise exception 'This career has student or assessment history; archive it instead of deleting it';
  end if;

  delete from public.careers where id = p_career_id;
  return true;
end;
$$;

revoke all on function public.save_career_definition(jsonb, jsonb, uuid[]) from public;
revoke all on function public.update_career_definition_status(uuid, text) from public;
revoke all on function public.delete_career_definition(uuid) from public;
grant execute on function public.save_career_definition(jsonb, jsonb, uuid[]) to authenticated;
grant execute on function public.update_career_definition_status(uuid, text) to authenticated;
grant execute on function public.delete_career_definition(uuid) to authenticated;
