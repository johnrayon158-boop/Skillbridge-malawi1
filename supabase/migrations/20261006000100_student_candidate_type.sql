alter table public.student_profiles
  add column if not exists candidate_type text not null default 'student'
  check (candidate_type in ('student', 'graduate'));
