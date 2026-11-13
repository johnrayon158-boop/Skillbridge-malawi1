alter table public.skills
  add column if not exists source_type text not null default 'legacy'
    check (source_type in ('legacy', 'pdf_import', 'manual', 'seed'));

create table if not exists public.skill_catalog_review_events (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null,
  skill_name text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  source_type text not null,
  action text not null check (action in (
    'submitted',
    'created',
    'approved',
    'rejected',
    'archived',
    'restored',
    'edited'
  )),
  old_approval_status text,
  new_approval_status text,
  old_status text,
  new_status text,
  created_at timestamptz not null default now()
);

create index if not exists skill_catalog_review_events_skill_created_idx
  on public.skill_catalog_review_events (skill_id, created_at desc);

alter table public.skill_catalog_review_events enable row level security;
revoke all on public.skill_catalog_review_events from public, anon, authenticated;
grant select on public.skill_catalog_review_events to authenticated;

drop policy if exists skill_catalog_review_events_admin_read on public.skill_catalog_review_events;
create policy skill_catalog_review_events_admin_read
  on public.skill_catalog_review_events for select
  using (public.is_admin());

create or replace function public.record_skill_catalog_review_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  event_action text;
begin
  if tg_op = 'INSERT' then
    event_action := case
      when new.approval_status = 'pending' then 'submitted'
      else 'created'
    end;
    insert into public.skill_catalog_review_events (
      skill_id, skill_name, actor_id, source_type, action,
      new_approval_status, new_status
    )
    values (
      new.id, new.name, auth.uid(), new.source_type, event_action,
      new.approval_status, new.status
    );
    return new;
  end if;

  if new.name is not distinct from old.name
    and new.category is not distinct from old.category
    and new.description is not distinct from old.description
    and new.source_type is not distinct from old.source_type
    and new.approval_status is not distinct from old.approval_status
    and new.status is not distinct from old.status
    and new.is_internal is not distinct from old.is_internal then
    return new;
  end if;

  event_action := case
    when new.status = 'archived' and old.status is distinct from 'archived' then 'archived'
    when old.status = 'archived' and new.status is distinct from 'archived' then 'restored'
    when new.approval_status is distinct from old.approval_status then new.approval_status
    else 'edited'
  end;
  insert into public.skill_catalog_review_events (
    skill_id, skill_name, actor_id, source_type, action,
    old_approval_status, new_approval_status, old_status, new_status
  )
  values (
    new.id, new.name, auth.uid(), new.source_type, event_action,
    old.approval_status, new.approval_status, old.status, new.status
  );
  return new;
end;
$$;

drop trigger if exists skills_catalog_review_audit on public.skills;
create trigger skills_catalog_review_audit
after insert or update on public.skills
for each row execute function public.record_skill_catalog_review_event();

revoke all on function public.record_skill_catalog_review_event() from public, anon, authenticated;
grant execute on function public.record_skill_catalog_review_event() to service_role;

create or replace function public.validate_skill_catalog_record()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  allowed_categories constant text[] := array[
    'Information Technology and Software Development',
    'Graphic Design and Creative Arts',
    'Business and Management',
    'Accounting and Finance',
    'Health and Medical Sciences',
    'Agriculture and Environmental Sciences',
    'Education and Teaching',
    'Engineering and Technical Trades',
    'Communication and Media',
    'Hospitality and Tourism',
    'General and Transferable Skills'
  ];
begin
  new.name := regexp_replace(trim(new.name), '\s+', ' ', 'g');
  if char_length(new.name) < 3 or char_length(new.name) > 80 then
    raise exception 'Skill names must contain between 3 and 80 characters.';
  end if;
  if cardinality(regexp_split_to_array(new.name, '\s+')) > 8 then
    raise exception 'Skill names must contain no more than 8 words.';
  end if;
  if new.name ~* '^(and|or|but)([[:space:]]|$)'
    or new.name ~* '^(skills?|competencies|learning outcomes|contents|table of contents|appendix|references|introduction)$'
    or new.name ~* '^(page|examples?)([[:space:]]+[0-9]+|\.\.\.)?$'
    or new.name ~* '^examples?'
    or new.name ~* '(claude[[:space:]]+skills?[[:space:]]+catalog|benepass|built[- ]?in[- ]?browser|mcp[- ]?builder|skill[- ]?testing|public[_ -]?read|installed[[:space:]]*editable|shared documents|fill[[:space:]]+pdf[[:space:]]+forms|https?://|@)' then
    raise exception 'Enter a professional skill name, not a document heading, fragment, or system term.';
  end if;
  if new.category is null or not (new.category = any (allowed_categories)) then
    raise exception 'Choose a category from the curated skills taxonomy.';
  end if;
  if new.source_type = 'pdf_import' and (
    char_length(trim(coalesce(new.description, ''))) < 25
    or char_length(trim(coalesce(new.description, ''))) > 500
    or cardinality(regexp_split_to_array(trim(coalesce(new.description, '')), '\s+')) < 4
    or new.description ~* '^the knowledge and practical ability to apply .+ effectively in .+ tasks and situations\.?$'
  ) then
    raise exception 'PDF-imported skills need a meaningful 25-500 character description.';
  end if;
  return new;
end;
$$;

drop trigger if exists skills_catalog_validate on public.skills;
create trigger skills_catalog_validate
before insert or update of name, category, description, source_type on public.skills
for each row execute function public.validate_skill_catalog_record();

revoke all on function public.validate_skill_catalog_record() from public, anon, authenticated;
grant execute on function public.validate_skill_catalog_record() to service_role;
