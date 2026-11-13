create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled_categories text[] not null default array[
    'new_job_match',
    'internship_match',
    'learning_recommendation',
    'training_recommendation',
    'scholarship_opportunity',
    'apprenticeship_programme',
    'deadline_reminder',
    'application_update',
    'interview_reminder',
    'employer_message',
    'skill_gap_update',
    'career_recommendation',
    'system_announcement'
  ]::text[],
  preferred_industries text[] not null default '{}'::text[],
  preferred_opportunity_types text[] not null default '{}'::text[],
  preferred_locations text[] not null default '{}'::text[],
  remote_work boolean not null default true,
  deadline_reminders boolean not null default true,
  minimum_relevance_score integer not null default 30 check (minimum_relevance_score between 0 and 100),
  digest_frequency text not null default 'off' check (digest_frequency in ('off', 'daily', 'weekly')),
  email_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

drop policy if exists notification_preferences_owner_all on public.notification_preferences;
create policy notification_preferences_owner_all
  on public.notification_preferences
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop trigger if exists notification_preferences_updated_at on public.notification_preferences;
create trigger notification_preferences_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();
