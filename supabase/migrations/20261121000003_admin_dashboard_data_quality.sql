alter table public.employer_profiles
  add column if not exists is_demo boolean not null default false;

alter table public.jobs
  add column if not exists is_demo boolean not null default false;

alter table public.learning_resources
  add column if not exists is_demo boolean not null default false;

update public.employer_profiles
set is_demo = true
where company_name = 'SkillBridge Demo Employer';

update public.jobs j
set is_demo = true
from public.employer_profiles e
where j.employer_id = e.id
  and e.company_name = 'SkillBridge Demo Employer'
  and (
    (j.title = 'Demo Graduate Project Assistant'
      and j.description = 'Development job template for testing the application journey.')
    or (j.title = 'Demo Junior Data Assistant'
      and j.description = 'Development job template for testing skills and application records.')
  );

update public.learning_resources
set is_demo = true
where provider = 'SkillBridge Demo Library'
  and title in (
    'Demo: Workplace Communication Basics',
    'Demo: Spreadsheet Data Analysis',
    'Demo: Project Planning Fundamentals',
    'Demo: Building a Portfolio Project'
  )
  and url like 'https://example.com/skillbridge-demo-%';
