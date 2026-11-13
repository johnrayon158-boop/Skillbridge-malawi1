alter table public.notifications
  add column if not exists action_url text,
  add column if not exists relevance_score integer check (relevance_score is null or relevance_score between 0 and 100),
  add column if not exists relevance_reasons text[] not null default '{}',
  add column if not exists dismissed_at timestamptz,
  add column if not exists dedupe_key text;

update public.notification_preferences set email_enabled = false where email_enabled;
alter table public.notification_preferences
  drop constraint if exists notification_preferences_email_delivery_disabled;
alter table public.notification_preferences
  add constraint notification_preferences_email_delivery_disabled check (email_enabled = false);

create unique index if not exists notifications_user_dedupe_key
  on public.notifications(user_id, dedupe_key)
  where dedupe_key is not null;

create table if not exists public.career_opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  opportunity_type text not null check (opportunity_type in ('training', 'scholarship')),
  provider text,
  application_url text,
  location text,
  is_remote boolean not null default false,
  industries text[] not null default '{}',
  eligible_programmes text[] not null default '{}',
  eligible_candidate_types text[] not null default '{}',
  min_study_year integer,
  max_study_year integer,
  application_deadline date,
  status text not null default 'draft' check (status in ('draft', 'published', 'closed', 'archived')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((min_study_year is null or min_study_year > 0)
    and (max_study_year is null or max_study_year > 0)
    and (min_study_year is null or max_study_year is null or min_study_year <= max_study_year))
);

create table if not exists public.career_opportunity_skills (
  opportunity_id uuid not null references public.career_opportunities(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (opportunity_id, skill_id)
);

alter table public.career_opportunities enable row level security;
alter table public.career_opportunity_skills enable row level security;

drop policy if exists career_opportunities_published_read on public.career_opportunities;
create policy career_opportunities_published_read on public.career_opportunities
  for select using (status = 'published' or public.is_admin());
drop policy if exists career_opportunities_admin_write on public.career_opportunities;
create policy career_opportunities_admin_write on public.career_opportunities
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists career_opportunity_skills_published_read on public.career_opportunity_skills;
create policy career_opportunity_skills_published_read on public.career_opportunity_skills
  for select using (exists (
    select 1 from public.career_opportunities o
    where o.id = opportunity_id and (o.status = 'published' or public.is_admin())
  ));
drop policy if exists career_opportunity_skills_admin_write on public.career_opportunity_skills;
create policy career_opportunity_skills_admin_write on public.career_opportunity_skills
  for all using (public.is_admin()) with check (public.is_admin());

create index if not exists career_opportunities_status_deadline_idx
  on public.career_opportunities(status, application_deadline);
create index if not exists career_opportunity_skills_skill_idx
  on public.career_opportunity_skills(skill_id);

drop trigger if exists career_opportunities_updated_at on public.career_opportunities;
create trigger career_opportunities_updated_at
  before update on public.career_opportunities
  for each row execute function public.set_updated_at();

create or replace function public.opportunity_notification_match(
  p_user_id uuid,
  p_title text,
  p_description text,
  p_industries text[],
  p_types text[],
  p_category text,
  p_location text,
  p_is_remote boolean,
  p_eligible_programmes text[],
  p_eligible_candidate_types text[],
  p_min_study_year integer,
  p_max_study_year integer,
  p_skill_ids uuid[],
  p_learning_level text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile public.student_profiles%rowtype;
  v_preferences public.notification_preferences%rowtype;
  v_profile_terms text[];
  v_text text;
  v_score integer := 20;
  v_interest_hit boolean := false;
  v_industry_hit boolean := false;
  v_location_hit boolean := false;
  v_type_hit boolean := false;
  v_skill_count integer := 0;
  v_skill_matches integer := 0;
  v_user_skill_level text;
  v_resource_level_matches boolean := false;
  v_reasons text[] := array['Available opportunity'];
begin
  select sp.* into v_profile
  from public.student_profiles sp
  join public.profiles p on p.id = sp.id
  where sp.id = p_user_id and p.role = 'student';
  if not found then return null; end if;

  select np.* into v_preferences
  from public.notification_preferences np
  where np.user_id = p_user_id;

  if not found then
    v_preferences.enabled_categories := array[
      'new_job_match', 'internship_match', 'learning_recommendation',
      'training_recommendation', 'scholarship_opportunity', 'apprenticeship_programme',
      'deadline_reminder', 'application_update', 'interview_reminder',
      'employer_message', 'skill_gap_update', 'career_recommendation',
      'system_announcement'
    ]::text[];
    v_preferences.preferred_industries := '{}'::text[];
    v_preferences.preferred_opportunity_types := '{}'::text[];
    v_preferences.preferred_locations := '{}'::text[];
    v_preferences.remote_work := true;
    v_preferences.minimum_relevance_score := 30;
  end if;

  if not (p_category = any(coalesce(v_preferences.enabled_categories, '{}'::text[]))) then
    return null;
  end if;
  if p_is_remote and not coalesce(v_preferences.remote_work, true) then return null; end if;

  v_text := lower(concat_ws(' ', p_title, p_description, array_to_string(p_industries, ' ')));
  v_profile_terms := coalesce(v_profile.interests, '{}'::text[])
    || array_remove(array[v_profile.career_goal, v_profile.programme, v_profile.bio], null);

  if cardinality(coalesce(p_eligible_programmes, '{}'::text[])) > 0
    and not exists (
      select 1 from unnest(p_eligible_programmes) as eligible(programme)
      where lower(trim(eligible.programme)) = lower(trim(coalesce(v_profile.programme, '')))
    )
  then return null; end if;

  if cardinality(coalesce(p_eligible_candidate_types, '{}'::text[])) > 0
    and not (lower(coalesce(v_profile.candidate_type, 'student')) = any(
      select lower(trim(eligible.candidate_type))
      from unnest(p_eligible_candidate_types) as eligible(candidate_type)
    ))
  then return null; end if;

  if p_min_study_year is not null or p_max_study_year is not null then
    if v_profile.current_year_of_study is null
      or (p_min_study_year is not null and v_profile.current_year_of_study < p_min_study_year)
      or (p_max_study_year is not null and v_profile.current_year_of_study > p_max_study_year)
    then return null; end if;
  end if;

  if cardinality(coalesce(v_preferences.preferred_opportunity_types, '{}'::text[])) > 0 then
    select exists (
      select 1
      from unnest(v_preferences.preferred_opportunity_types) pref(value)
      join unnest(coalesce(p_types, '{}'::text[]) || array[p_category]) actual(value)
        on length(trim(pref.value)) > 0
          and case lower(replace(trim(pref.value), ' ', '_'))
            when 'jobs' then 'job'
            when 'internships' then 'internship'
            when 'scholarships' then 'scholarship'
            when 'funding' then 'scholarship'
            when 'courses' then 'course'
            else lower(replace(trim(pref.value), ' ', '_'))
          end = case lower(replace(trim(actual.value), ' ', '_'))
            when 'new_job_match' then 'job'
            when 'internship_match' then 'internship'
            when 'learning_recommendation' then 'training'
            when 'training_recommendation' then 'training'
            when 'scholarship_opportunity' then 'scholarship'
            when 'apprenticeship_programme' then 'apprenticeship'
            else lower(replace(trim(actual.value), ' ', '_'))
          end
    ) into v_type_hit;
    if not v_type_hit then return null; end if;
    v_score := v_score + 15;
    v_reasons := array_append(v_reasons, 'Matches your preferred opportunity type');
  end if;

  if cardinality(coalesce(v_preferences.preferred_locations, '{}'::text[])) > 0 then
    select exists (
      select 1 from unnest(v_preferences.preferred_locations) pref(value)
      where length(trim(pref.value)) > 0
        and (
          (p_location is not null and position(lower(trim(pref.value)) in lower(p_location)) > 0)
          or (lower(trim(pref.value)) in ('malawi', 'malawi-wide')
            and lower(coalesce(v_profile.country, '')) = 'malawi')
        )
    ) into v_location_hit;
    if not v_location_hit and not (p_is_remote and coalesce(v_preferences.remote_work, true)) then return null; end if;
    if v_location_hit then
      v_score := v_score + 15;
      v_reasons := array_append(v_reasons, 'Matches your preferred location');
    elsif p_is_remote then
      v_score := v_score + 5;
      v_reasons := array_append(v_reasons, 'Remote opportunity accepted by your preferences');
    end if;
  elsif p_location is not null and (
    (nullif(trim(v_profile.city), '') is not null and position(lower(trim(v_profile.city)) in lower(p_location)) > 0)
    or (nullif(trim(v_profile.district), '') is not null and position(lower(trim(v_profile.district)) in lower(p_location)) > 0)
  ) then
    v_score := v_score + 10;
    v_reasons := array_append(v_reasons, 'Near your profile location');
  end if;

  if cardinality(coalesce(v_preferences.preferred_industries, '{}'::text[])) > 0
    and cardinality(coalesce(p_industries, '{}'::text[])) > 0
  then
    select exists (
      select 1
      from unnest(v_preferences.preferred_industries) pref(value)
      join unnest(p_industries) actual(value)
        on length(trim(pref.value)) > 0 and length(trim(actual.value)) > 0
          and (position(lower(trim(pref.value)) in lower(actual.value)) > 0
            or position(lower(trim(actual.value)) in lower(pref.value)) > 0)
    ) into v_industry_hit;
    if not v_industry_hit then return null; end if;
    v_score := v_score + 15;
    v_reasons := array_append(v_reasons, 'Matches your preferred industry');
  end if;

  select exists (
    select 1 from unnest(v_profile_terms) term(value)
    where length(trim(term.value)) >= 3
      and position(lower(trim(term.value)) in v_text) > 0
  ) into v_interest_hit;
  if v_interest_hit then
    v_score := v_score + 25;
    v_reasons := array_append(v_reasons, 'Related to your interests, career goal, or programme');
  end if;

  v_skill_count := cardinality(coalesce(p_skill_ids, '{}'::uuid[]));
  if v_skill_count > 0 then
    if p_learning_level is not null then
      select us.level into v_user_skill_level
      from public.user_skills us
      where us.user_id = p_user_id and us.skill_id = any(p_skill_ids)
      order by case us.level when 'beginner' then 1 when 'intermediate' then 2 when 'advanced' then 3 else 4 end
      limit 1;
      v_resource_level_matches := v_user_skill_level is null
        or case lower(p_learning_level)
          when 'beginner' then v_user_skill_level = 'beginner'
          when 'intermediate' then v_user_skill_level in ('beginner', 'intermediate')
          when 'advanced' then v_user_skill_level in ('beginner', 'intermediate', 'advanced')
          when 'expert' then v_user_skill_level in ('beginner', 'intermediate', 'advanced', 'expert')
          else true
        end;
      if not v_resource_level_matches then return null; end if;
      v_score := v_score + 35;
      v_reasons := array_append(v_reasons, case when v_user_skill_level is null
        then 'Introduces a skill not yet recorded in your profile'
        else 'Develops a skill in your profile at or below the resource level' end);
    else
      select count(*) into v_skill_matches
      from public.user_skills us
      where us.user_id = p_user_id and us.skill_id = any(p_skill_ids);
    end if;
    if p_learning_level is null and v_skill_matches > 0 then
      v_score := v_score + least(35, (35 * v_skill_matches / v_skill_count));
      v_reasons := array_append(v_reasons, 'Matches skills in your profile');
    end if;
  end if;

  v_score := least(100, v_score);
  if v_score < coalesce(v_preferences.minimum_relevance_score, 30) then return null; end if;
  return jsonb_build_object('score', v_score, 'reasons', to_jsonb(v_reasons));
end;
$$;

create or replace function public.create_opportunity_notification(
  p_user_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_title text,
  p_description text,
  p_notification_type text,
  p_action_url text,
  p_industries text[],
  p_types text[],
  p_location text,
  p_is_remote boolean,
  p_eligible_programmes text[],
  p_eligible_candidate_types text[],
  p_min_study_year integer,
  p_max_study_year integer,
  p_skill_ids uuid[],
  p_learning_level text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match jsonb;
  v_key text;
begin
  v_match := public.opportunity_notification_match(
    p_user_id, p_title, p_description, p_industries, p_types, p_notification_type,
    p_location, p_is_remote, p_eligible_programmes, p_eligible_candidate_types,
    p_min_study_year, p_max_study_year, p_skill_ids, p_learning_level
  );
  v_key := p_entity_type || ':' || p_entity_id::text;
  if v_match is null then
    delete from public.notifications
    where user_id = p_user_id and dedupe_key = v_key;
    return false;
  end if;

  insert into public.notifications (
    user_id, title, message, notification_type, related_entity_type, related_entity_id,
    action_url, relevance_score, relevance_reasons, dedupe_key, is_read
  ) values (
    p_user_id,
    p_title,
    left(coalesce(p_description, 'A relevant opportunity is available.'), 500),
    p_notification_type,
    p_entity_type,
    p_entity_id,
    p_action_url,
    (v_match->>'score')::integer,
    array(select jsonb_array_elements_text(v_match->'reasons')),
    v_key,
    false
  )
  on conflict (user_id, dedupe_key) where dedupe_key is not null
  do update set
    title = excluded.title,
    message = excluded.message,
    notification_type = excluded.notification_type,
    action_url = excluded.action_url,
    relevance_score = excluded.relevance_score,
    relevance_reasons = excluded.relevance_reasons;
  return true;
end;
$$;

create or replace function public.notify_for_job_opportunity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notification_type text;
  v_industry text;
  v_types text[];
  v_skills uuid[];
  v_user record;
begin
  if new.status <> 'published' or (new.application_deadline is not null and new.application_deadline < current_date) then
    delete from public.notifications
    where related_entity_type = 'job' and related_entity_id = new.id
      and dedupe_key = 'job:' || new.id::text;
    return new;
  end if;
  v_notification_type := case
    when new.employment_type = 'internship' or new.opportunity_type in ('industrial_attachment', 'internship', 'graduate_internship', 'work_experience')
      then 'internship_match'
    when new.opportunity_type = 'apprenticeship' then 'apprenticeship_programme'
    else 'new_job_match'
  end;
  select ep.industry into v_industry from public.employer_profiles ep where ep.id = new.employer_id;
  v_types := array_remove(array[new.employment_type, new.opportunity_type, 'job', v_notification_type], null);
  select coalesce(array_agg(js.skill_id), '{}'::uuid[]) into v_skills
    from public.job_skills js where js.job_id = new.id and js.is_required;

  for v_user in
    select sp.id from public.student_profiles sp join public.profiles p on p.id = sp.id where p.role = 'student'
  loop
    perform public.create_opportunity_notification(
      v_user.id, 'job', new.id, new.title, new.description, v_notification_type,
      case when v_notification_type = 'internship_match'
        then '/student/internships/' || new.id::text else '/student/jobs/' || new.id::text end,
      case when v_industry is null then '{}'::text[] else array[v_industry] end,
      v_types, new.location, new.work_mode in ('remote', 'hybrid'),
      coalesce(new.eligible_programmes, '{}'::text[]), '{}'::text[],
      new.min_study_year, new.max_study_year, v_skills
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists jobs_opportunity_notification on public.jobs;
create trigger jobs_opportunity_notification
after insert or update of status, title, description, location, employment_type, opportunity_type,
  work_mode, eligible_programmes, min_study_year, max_study_year, application_deadline
on public.jobs for each row execute function public.notify_for_job_opportunity();

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
    select sp.id from public.student_profiles sp join public.profiles p on p.id = sp.id where p.role = 'student'
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
after insert or update of title, description, resource_type, url, skill_id, difficulty
on public.learning_resources for each row execute function public.notify_for_learning_resource();

create or replace function public.notify_for_career_opportunity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user record;
  v_notification_type text;
  v_skills uuid[];
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
  for v_user in
    select sp.id from public.student_profiles sp join public.profiles p on p.id = sp.id where p.role = 'student'
  loop
    perform public.create_opportunity_notification(
      v_user.id, 'opportunity', new.id, new.title, new.description, v_notification_type,
      new.application_url, coalesce(new.industries, '{}'::text[]), array[new.opportunity_type],
      new.location, new.is_remote, coalesce(new.eligible_programmes, '{}'::text[]),
      coalesce(new.eligible_candidate_types, '{}'::text[]), new.min_study_year,
      new.max_study_year, v_skills
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists career_opportunity_notification on public.career_opportunities;
create trigger career_opportunity_notification
after insert or update of status, title, description, opportunity_type, application_url, location,
  is_remote, industries, eligible_programmes, eligible_candidate_types, min_study_year,
  max_study_year, application_deadline, updated_at
on public.career_opportunities for each row execute function public.notify_for_career_opportunity();

create or replace function public.save_career_opportunity(
  p_opportunity jsonb,
  p_skill_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_input record;
  v_opportunity public.career_opportunities%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only administrators can manage training and scholarship opportunities';
  end if;

  select * into v_input from jsonb_to_record(p_opportunity) as input(
    id uuid, title text, description text, opportunity_type text, provider text,
    application_url text, location text, is_remote boolean, industries text[],
    eligible_programmes text[], eligible_candidate_types text[], min_study_year integer,
    max_study_year integer, application_deadline date, status text
  );
  if nullif(trim(v_input.title), '') is null or nullif(trim(v_input.description), '') is null then
    raise exception 'Opportunity title and description are required';
  end if;
  if v_input.opportunity_type not in ('training', 'scholarship') then
    raise exception 'Choose either a training programme or scholarship';
  end if;
  if v_input.status not in ('draft', 'published', 'closed', 'archived') then
    raise exception 'Choose a valid publication status';
  end if;
  if v_input.application_url is not null and v_input.application_url !~* '^https://' then
    raise exception 'Application links must use HTTPS';
  end if;
  if exists (
    select 1 from unnest(coalesce(v_input.eligible_candidate_types, '{}'::text[])) candidate(value)
    where candidate.value not in ('student', 'graduate')
  ) then
    raise exception 'Eligible candidate types must be student or graduate';
  end if;

  insert into public.career_opportunities (
    id, title, description, opportunity_type, provider, application_url, location, is_remote,
    industries, eligible_programmes, eligible_candidate_types, min_study_year, max_study_year,
    application_deadline, status, created_by
  ) values (
    coalesce(v_input.id, gen_random_uuid()), trim(v_input.title), trim(v_input.description),
    v_input.opportunity_type, nullif(trim(v_input.provider), ''), nullif(trim(v_input.application_url), ''),
    nullif(trim(v_input.location), ''), coalesce(v_input.is_remote, false),
    coalesce(v_input.industries, '{}'::text[]), coalesce(v_input.eligible_programmes, '{}'::text[]),
    coalesce(v_input.eligible_candidate_types, '{}'::text[]), v_input.min_study_year,
    v_input.max_study_year, v_input.application_deadline, v_input.status, auth.uid()
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
    status = excluded.status
  returning * into v_opportunity;

  delete from public.career_opportunity_skills where opportunity_id = v_opportunity.id;
  insert into public.career_opportunity_skills(opportunity_id, skill_id)
  select v_opportunity.id, selected.skill_id
  from (
    select distinct chosen.skill_id
    from unnest(coalesce(p_skill_ids, '{}'::uuid[])) as chosen(skill_id)
  ) selected
  on conflict (opportunity_id, skill_id) do nothing;

  update public.career_opportunities set updated_at = now() where id = v_opportunity.id;
  select * into v_opportunity from public.career_opportunities where id = v_opportunity.id;
  return to_jsonb(v_opportunity);
end;
$$;

create or replace function public.generate_opportunity_notifications()
returns integer
language plpgsql
security definer
set search_path = public
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
      v_row.application_url, coalesce(v_row.industries, '{}'::text[]), array[v_row.opportunity_type],
      v_row.location, v_row.is_remote, coalesce(v_row.eligible_programmes, '{}'::text[]),
      coalesce(v_row.eligible_candidate_types, '{}'::text[]), v_row.min_study_year, v_row.max_study_year,
      coalesce((select array_agg(os.skill_id) from public.career_opportunity_skills os where os.opportunity_id = v_row.id), '{}'::uuid[])
    );
    if v_added then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end;
$$;

create or replace function public.submit_employer_feedback(p_feedback jsonb, p_competencies jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employer_id uuid := auth.uid();
  v_input record;
  v_feedback public.employer_feedback%rowtype;
  v_competency record;
begin
  if v_employer_id is null or not exists (
    select 1 from public.employer_profiles ep where ep.id = v_employer_id
  ) then
    raise exception 'A signed-in employer account is required';
  end if;

  select * into v_input from jsonb_to_record(p_feedback) as input(
    candidate_id uuid, job_id uuid, application_id uuid, employment_id uuid,
    feedback_type text, review_date date, reviewer_role text, project_name text,
    organization text, strengths text, improvement_areas text, evidence text,
    development_plan text, next_review_goals text, overall_summary text
  );
  if v_input.candidate_id is null or (v_input.application_id is null and v_input.employment_id is null) then
    raise exception 'Choose a candidate and their application or employment record';
  end if;

  insert into public.employer_feedback (
    employer_id, candidate_id, job_id, application_id, employment_id, feedback_type,
    review_date, reviewer_role, project_name, organization, strengths, improvement_areas,
    evidence, development_plan, next_review_goals, overall_summary, status, created_by
  ) values (
    v_employer_id, v_input.candidate_id, v_input.job_id, v_input.application_id, v_input.employment_id,
    coalesce(v_input.feedback_type, 'employment'), coalesce(v_input.review_date, current_date),
    coalesce(v_input.reviewer_role, 'Supervisor'), v_input.project_name, v_input.organization,
    coalesce(v_input.strengths, ''), coalesce(v_input.improvement_areas, ''), coalesce(v_input.evidence, ''),
    coalesce(v_input.development_plan, ''), coalesce(v_input.next_review_goals, ''),
    coalesce(v_input.overall_summary, ''), 'submitted', v_employer_id
  ) returning * into v_feedback;

  for v_competency in
    select * from jsonb_to_recordset(coalesce(p_competencies, '[]'::jsonb)) as competency(
      name text, rating numeric, rating_label text, evidence text, comment text, not_observed boolean
    )
  loop
    if v_competency.name is null or length(trim(v_competency.name)) not between 1 and 120 then
      raise exception 'Each competency needs a name of 1 to 120 characters';
    end if;
    if coalesce(v_competency.not_observed, false) then
      v_competency.rating := null;
    elsif v_competency.rating is null or v_competency.rating < 0 or v_competency.rating > 5 then
      raise exception 'Competency ratings must be between 0 and 5, or marked not observed';
    end if;
    insert into public.employer_feedback_competencies (
      feedback_id, name, rating, rating_label, evidence, comment, not_observed
    ) values (
      v_feedback.id, trim(v_competency.name), v_competency.rating,
      coalesce(v_competency.rating_label, ''), coalesce(v_competency.evidence, ''),
      coalesce(v_competency.comment, ''), coalesce(v_competency.not_observed, false)
    );
  end loop;
  return to_jsonb(v_feedback);
end;
$$;

create or replace function public.respond_to_employer_feedback(
  p_feedback_id uuid,
  p_status text,
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_ack public.employer_feedback_acknowledgements%rowtype;
begin
  if v_user_id is null or not exists (
    select 1 from public.employer_feedback ef
    where ef.id = p_feedback_id and ef.candidate_id = v_user_id
  ) then
    raise exception 'You can only respond to feedback about your own profile';
  end if;
  if p_status not in ('acknowledged', 'disputed') then
    raise exception 'Choose whether to acknowledge or dispute this feedback';
  end if;
  if p_status = 'disputed' and length(trim(coalesce(p_notes, ''))) < 5 then
    raise exception 'Please explain your dispute in at least 5 characters';
  end if;

  insert into public.employer_feedback_acknowledgements (
    feedback_id, student_id, status, notes, acknowledged_at
  ) values (
    p_feedback_id, v_user_id, p_status, trim(coalesce(p_notes, '')), now()
  )
  on conflict (feedback_id, student_id) do update set
    status = excluded.status,
    notes = excluded.notes,
    acknowledged_at = excluded.acknowledged_at
  returning * into v_ack;
  return to_jsonb(v_ack);
end;
$$;

revoke all on function public.opportunity_notification_match(uuid, text, text, text[], text[], text, text, boolean, text[], text[], integer, integer, uuid[], text) from public;
revoke all on function public.create_opportunity_notification(uuid, text, uuid, text, text, text, text, text[], text[], text, boolean, text[], text[], integer, integer, uuid[], text) from public;
revoke all on function public.notify_for_job_opportunity() from public;
revoke all on function public.notify_for_learning_resource() from public;
revoke all on function public.notify_for_career_opportunity() from public;
revoke all on function public.generate_opportunity_notifications() from public;
revoke all on function public.save_career_opportunity(jsonb, uuid[]) from public;
revoke all on function public.submit_employer_feedback(jsonb, jsonb) from public;
revoke all on function public.respond_to_employer_feedback(uuid, text, text) from public;
grant execute on function public.generate_opportunity_notifications() to authenticated;
grant execute on function public.save_career_opportunity(jsonb, uuid[]) to authenticated;
grant execute on function public.submit_employer_feedback(jsonb, jsonb) to authenticated;
grant execute on function public.respond_to_employer_feedback(uuid, text, text) to authenticated;
