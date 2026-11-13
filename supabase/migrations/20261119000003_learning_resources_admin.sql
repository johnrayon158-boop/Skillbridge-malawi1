alter table public.learning_resources
  add column category text,
  add column status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  add column published_at timestamptz,
  add column archived_at timestamptz;

alter table public.learning_resources
  drop constraint if exists learning_resources_resource_type_check,
  add constraint learning_resources_resource_type_check
    check (resource_type in (
      'course', 'tutorial', 'article', 'video', 'documentation',
      'book', 'project', 'practice', 'certificate'
    )) not valid;

create table public.learning_resource_skills (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.learning_resources(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (resource_id, skill_id)
);

create table public.learning_resource_careers (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.learning_resources(id) on delete cascade,
  career_id uuid not null references public.careers(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (resource_id, career_id)
);

insert into public.learning_resource_skills (resource_id, skill_id)
select id, skill_id
from public.learning_resources
where skill_id is not null
on conflict (resource_id, skill_id) do nothing;

create index learning_resources_status_category_difficulty_idx
  on public.learning_resources(status, category, difficulty);
create index learning_resource_skills_skill_id_idx
  on public.learning_resource_skills(skill_id);
create index learning_resource_careers_career_id_idx
  on public.learning_resource_careers(career_id);

alter table public.learning_resource_skills enable row level security;
alter table public.learning_resource_careers enable row level security;

drop policy if exists learning_resources_public_read on public.learning_resources;
drop policy if exists learning_resources_published_read on public.learning_resources;
create policy learning_resources_published_read on public.learning_resources
  for select using (status = 'published');
drop policy if exists learning_resources_admin_all on public.learning_resources;
create policy learning_resources_admin_all on public.learning_resources
  for all using (public.is_admin()) with check (public.is_admin());

create policy learning_resource_skills_published_read on public.learning_resource_skills
  for select using (exists (
    select 1 from public.learning_resources resource
    where resource.id = resource_id and resource.status = 'published'
  ));
create policy learning_resource_skills_admin_all on public.learning_resource_skills
  for all using (public.is_admin()) with check (public.is_admin());

create policy learning_resource_careers_published_read on public.learning_resource_careers
  for select using (exists (
    select 1 from public.learning_resources resource
    where resource.id = resource_id and resource.status = 'published'
  ));
create policy learning_resource_careers_admin_all on public.learning_resource_careers
  for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.save_learning_resource(
  p_resource jsonb,
  p_skill_ids uuid[] default '{}'::uuid[],
  p_career_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_title text;
  v_description text;
  v_resource_type text;
  v_url text;
  v_provider text;
  v_category text;
  v_difficulty text;
  v_duration_minutes integer;
  v_free boolean;
  v_status text;
  v_skill_ids uuid[];
  v_career_ids uuid[];
  v_primary_skill_id uuid;
  v_resource public.learning_resources%rowtype;
  v_id_count integer;
  v_distinct_id_count integer;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only administrators can manage learning resources';
  end if;
  if jsonb_typeof(p_resource) is distinct from 'object' then
    raise exception 'Resource details must be provided as a JSON object';
  end if;

  v_id := coalesce(nullif(p_resource->>'id', '')::uuid, gen_random_uuid());
  v_title := btrim(coalesce(p_resource->>'title', ''));
  v_description := btrim(coalesce(p_resource->>'description', ''));
  v_resource_type := nullif(btrim(p_resource->>'resource_type'), '');
  v_url := nullif(btrim(p_resource->>'url'), '');
  v_provider := nullif(btrim(p_resource->>'provider'), '');
  v_category := nullif(btrim(p_resource->>'category'), '');
  v_difficulty := nullif(btrim(p_resource->>'difficulty'), '');
  v_duration_minutes := nullif(btrim(p_resource->>'duration_minutes'), '')::integer;
  v_free := coalesce((p_resource->>'free')::boolean, true);
  v_status := coalesce(nullif(p_resource->>'status', ''), 'draft');
  v_skill_ids := coalesce(p_skill_ids, '{}'::uuid[]);
  v_career_ids := coalesce(p_career_ids, '{}'::uuid[]);
  if cardinality(v_skill_ids) = 0 and nullif(p_resource->>'skill_id', '') is not null then
    v_skill_ids := array[(p_resource->>'skill_id')::uuid];
  end if;
  v_primary_skill_id := v_skill_ids[1];

  if v_title = '' or length(v_title) > 200 then
    raise exception 'Resource title is required and must be 200 characters or fewer';
  end if;
  if v_description = '' or length(v_description) > 4000 then
    raise exception 'Resource description is required and must be 4,000 characters or fewer';
  end if;
  if v_resource_type is null or v_resource_type not in (
    'course', 'tutorial', 'article', 'video', 'documentation',
    'book', 'project', 'practice', 'certificate'
  ) then
    raise exception 'Choose a valid learning resource type';
  end if;
  if v_status not in ('draft', 'published', 'archived') then
    raise exception 'Choose a valid publication status';
  end if;
  if v_category is not null and length(v_category) > 120 then
    raise exception 'Resource category must be 120 characters or fewer';
  end if;
  if v_difficulty is not null and v_difficulty not in ('beginner', 'intermediate', 'advanced') then
    raise exception 'Choose a valid difficulty level';
  end if;
  if v_duration_minutes is not null and v_duration_minutes <= 0 then
    raise exception 'Duration must be a positive number of minutes';
  end if;
  if v_url is not null and v_url !~* '^https?://[^/[:space:]?#]+([/?#][^[:space:]]*)?$' then
    raise exception 'Resource URLs must be valid HTTP or HTTPS links';
  end if;
  if v_status = 'published' then
    if v_category is null then
      raise exception 'Choose an academic or professional category before publishing';
    end if;
    if v_url is null or v_url !~* '^https://[^/[:space:]?#]+([/?#][^[:space:]]*)?$' then
      raise exception 'Add a valid HTTPS resource URL before publishing';
    end if;
  end if;

  select count(*), count(distinct selected.skill_id)
  into v_id_count, v_distinct_id_count
  from unnest(v_skill_ids) as selected(skill_id);
  if v_id_count <> v_distinct_id_count then
    raise exception 'A skill cannot be linked more than once';
  end if;
  select count(*), count(distinct selected.career_id)
  into v_id_count, v_distinct_id_count
  from unnest(v_career_ids) as selected(career_id);
  if v_id_count <> v_distinct_id_count then
    raise exception 'A career cannot be linked more than once';
  end if;
  if exists (
    select 1
    from unnest(v_skill_ids) as selected(skill_id)
    left join public.skills skill on skill.id = selected.skill_id
    where selected.skill_id is null or skill.id is null
      or (
        (skill.status is distinct from 'active'
          or skill.approval_status is distinct from 'approved'
          or coalesce(skill.is_internal, true))
        and not exists (
          select 1 from public.learning_resource_skills existing
          where existing.resource_id = v_id and existing.skill_id = selected.skill_id
        )
      )
  ) then
    raise exception 'Related skills must be available approved catalog skills';
  end if;
  if exists (
    select 1
    from unnest(v_career_ids) as selected(career_id)
    left join public.careers career on career.id = selected.career_id
    where selected.career_id is null or career.id is null
      or (
        career.status <> 'published'
        and not exists (
          select 1 from public.learning_resource_careers existing
          where existing.resource_id = v_id and existing.career_id = selected.career_id
        )
      )
  ) then
    raise exception 'Related careers must be available published definitions';
  end if;
  if v_status = 'published' and exists (
    select 1
    from unnest(v_skill_ids) as selected(skill_id)
    join public.skills skill on skill.id = selected.skill_id
    where skill.status is distinct from 'active'
      or skill.approval_status is distinct from 'approved'
      or coalesce(skill.is_internal, true)
  ) then
    raise exception 'Replace inactive or unapproved skills before publishing this resource';
  end if;
  if v_status = 'published' and exists (
    select 1
    from unnest(v_career_ids) as selected(career_id)
    join public.careers career on career.id = selected.career_id
    where career.status is distinct from 'published'
  ) then
    raise exception 'Related careers must be published before this resource';
  end if;

  if v_url is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_url, 0));
    if exists (
      select 1 from public.learning_resources existing
      where existing.id <> v_id and btrim(existing.url) = v_url
    ) then
      raise exception 'A learning resource with this URL already exists';
    end if;
  end if;

  insert into public.learning_resources as existing_resource (
    id, title, description, resource_type, url, provider, skill_id, category,
    difficulty, duration_minutes, free, status, published_at, archived_at
  )
  values (
    v_id, v_title, v_description, v_resource_type, v_url, v_provider, v_primary_skill_id, v_category,
    v_difficulty, v_duration_minutes, v_free, v_status,
    case when v_status = 'published' then now() else null end,
    case when v_status = 'archived' then now() else null end
  )
  on conflict (id) do update set
    title = excluded.title,
    description = excluded.description,
    resource_type = excluded.resource_type,
    url = excluded.url,
    provider = excluded.provider,
    skill_id = excluded.skill_id,
    category = excluded.category,
    difficulty = excluded.difficulty,
    duration_minutes = excluded.duration_minutes,
    free = excluded.free,
    status = excluded.status,
    published_at = case
      when excluded.status = 'published' then coalesce(existing_resource.published_at, now())
      else existing_resource.published_at
    end,
    archived_at = case when excluded.status = 'archived' then now() else null end
  returning * into v_resource;

  delete from public.learning_resource_skills where resource_id = v_resource.id;
  insert into public.learning_resource_skills (resource_id, skill_id)
  select v_resource.id, selected.skill_id
  from unnest(v_skill_ids) as selected(skill_id);

  delete from public.learning_resource_careers where resource_id = v_resource.id;
  insert into public.learning_resource_careers (resource_id, career_id)
  select v_resource.id, selected.career_id
  from unnest(v_career_ids) as selected(career_id);

  return to_jsonb(v_resource);
end;
$$;

create or replace function public.update_learning_resource_status(
  p_resource_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_resource public.learning_resources%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only administrators can manage learning resources';
  end if;
  if p_status is null or p_status not in ('draft', 'published', 'archived') then
    raise exception 'Choose a valid publication status';
  end if;

  select * into v_resource
  from public.learning_resources
  where id = p_resource_id
  for update;
  if not found then
    raise exception 'Learning resource not found';
  end if;

  if p_status = 'published' then
    if btrim(v_resource.title) = '' or btrim(v_resource.description) = ''
      or nullif(btrim(v_resource.category), '') is null then
      raise exception 'Resource title, description, and category are required before publishing';
    end if;
    if v_resource.url is null or v_resource.url !~* '^https://[^/[:space:]?#]+([/?#][^[:space:]]*)?$' then
      raise exception 'Add a valid HTTPS resource URL before publishing';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(btrim(v_resource.url), 0));
    if exists (
      select 1 from public.learning_resources existing
      where existing.id <> v_resource.id and btrim(existing.url) = btrim(v_resource.url)
    ) then
      raise exception 'A learning resource with this URL already exists';
    end if;
    if exists (
      select 1
      from public.learning_resource_skills relation
      join public.skills skill on skill.id = relation.skill_id
      where relation.resource_id = p_resource_id
        and (
          skill.status is distinct from 'active'
          or skill.approval_status is distinct from 'approved'
          or coalesce(skill.is_internal, true)
        )
    ) then
      raise exception 'Replace inactive or unapproved skills before publishing this resource';
    end if;
    if exists (
      select 1
      from public.learning_resource_careers relation
      join public.careers career on career.id = relation.career_id
      where relation.resource_id = p_resource_id
        and career.status is distinct from 'published'
    ) then
      raise exception 'Related careers must be published before this resource';
    end if;
  end if;

  update public.learning_resources
  set status = p_status,
      published_at = case when p_status = 'published' then coalesce(published_at, now()) else published_at end,
      archived_at = case when p_status = 'archived' then now() else null end
  where id = p_resource_id
  returning * into v_resource;

  return to_jsonb(v_resource);
end;
$$;

create or replace function public.notify_for_learning_resource()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user record;
  v_notification_type text;
  v_skill_ids uuid[];
begin
  if new.status is distinct from 'published' then
    return new;
  end if;
  if new.resource_type not in ('course', 'certificate') then
    delete from public.notifications
    where related_entity_type = 'learning_resource' and related_entity_id = new.id
      and dedupe_key = 'learning_resource:' || new.id::text;
    return new;
  end if;

  v_notification_type := case when new.resource_type = 'certificate'
    then 'training_recommendation' else 'learning_recommendation' end;
  v_skill_ids := case when new.skill_id is null then '{}'::uuid[] else array[new.skill_id] end;
  for v_user in
    select sp.id
    from public.student_profiles sp
    join public.profiles profile on profile.id = sp.id
    where profile.role = 'student'
  loop
    perform public.create_opportunity_notification(
      v_user.id, 'learning_resource', new.id, new.title, new.description,
      v_notification_type, new.url, '{}'::text[], array[new.resource_type, 'training'], null, false,
      '{}'::text[], '{}'::text[], null, null, v_skill_ids, coalesce(new.difficulty, 'beginner')
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists learning_resource_opportunity_notification on public.learning_resources;
create trigger learning_resource_opportunity_notification
after insert or update of title, description, resource_type, url, skill_id, difficulty, status
on public.learning_resources for each row execute function public.notify_for_learning_resource();

revoke all on function public.save_learning_resource(jsonb, uuid[], uuid[]) from public;
revoke all on function public.update_learning_resource_status(uuid, text) from public;
grant execute on function public.save_learning_resource(jsonb, uuid[], uuid[]) to authenticated;
grant execute on function public.update_learning_resource_status(uuid, text) to authenticated;
