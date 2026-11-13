-- SkillBridge Malawi Step 3: development catalog seed data.
-- No auth users are created here. Demo jobs only appear when a matching employer profile exists.

insert into public.skills (name, category, description) values
  ('Programming', 'Technology', 'Writing and maintaining software.'),
  ('Communication', 'Professional', 'Clear written and verbal communication.'),
  ('Leadership', 'Professional', 'Guiding people and decisions toward outcomes.'),
  ('Problem Solving', 'Professional', 'Breaking down problems and evaluating solutions.'),
  ('Data Analysis', 'Technology', 'Interpreting data to support decisions.'),
  ('Project Management', 'Business', 'Planning, coordinating and delivering work.'),
  ('Accounting', 'Finance', 'Recording, analysing and reporting financial information.'),
  ('Marketing', 'Business', 'Understanding audiences and promoting products or services.'),
  ('Teaching', 'Education', 'Designing and facilitating learning experiences.'),
  ('Engineering', 'Engineering', 'Applying technical and scientific principles to build solutions.'),
  ('Healthcare', 'Healthcare', 'Supporting safe and effective health services.'),
  ('Design', 'Creative', 'Creating useful and accessible visual or product experiences.'),
  ('Networking', 'Technology', 'Designing and operating connected systems.'),
  ('Database Management', 'Technology', 'Structuring, querying and maintaining data systems.'),
  ('Agriculture', 'Agriculture', 'Applying practical knowledge to agricultural production and extension.')
on conflict (name) do update set category = excluded.category, description = excluded.description, updated_at = now();

insert into public.careers (title, sector, description, entry_level, growth_path, salary_range, demand_level)
select seed.title, seed.sector, seed.description, seed.entry_level, seed.growth_path, seed.salary_range, seed.demand_level
from (values
  ('Software Developer', 'Technology', 'Builds and maintains software applications.', 'Junior developer', 'Developer to technical lead', 'MWK 250,000-1,500,000', 'high'),
  ('Data Analyst', 'Technology', 'Turns data into useful business insights.', 'Data assistant', 'Analyst to analytics manager', 'MWK 300,000-1,800,000', 'high'),
  ('Accountant', 'Finance', 'Maintains financial records and reporting.', 'Accounts assistant', 'Accountant to finance manager', 'MWK 250,000-1,500,000', 'high'),
  ('Teacher', 'Education', 'Plans and delivers learning programmes.', 'Teaching assistant', 'Teacher to school leader', 'MWK 200,000-1,200,000', 'high'),
  ('Nurse', 'Healthcare', 'Provides safe and compassionate patient care.', 'Nurse technician', 'Nurse to clinical leader', 'MWK 300,000-1,800,000', 'high'),
  ('Marketing Officer', 'Business', 'Plans campaigns and grows audience engagement.', 'Marketing assistant', 'Officer to marketing manager', 'MWK 250,000-1,500,000', 'medium'),
  ('Graphic Designer', 'Creative', 'Creates visual communication for organisations.', 'Junior designer', 'Designer to creative lead', 'MWK 200,000-1,300,000', 'medium'),
  ('Civil Engineer', 'Engineering', 'Designs and oversees infrastructure projects.', 'Graduate engineer', 'Engineer to project director', 'MWK 400,000-2,000,000', 'high'),
  ('Human Resource Officer', 'Business', 'Supports people operations and employee development.', 'HR assistant', 'Officer to HR manager', 'MWK 250,000-1,500,000', 'medium'),
  ('Project Manager', 'Business', 'Coordinates resources, people and delivery outcomes.', 'Project coordinator', 'Manager to programme director', 'MWK 400,000-2,500,000', 'high'),
  ('Agricultural Extension Officer', 'Agriculture', 'Connects farmers with practical agricultural knowledge.', 'Field assistant', 'Officer to regional coordinator', 'MWK 250,000-1,400,000', 'high'),
  ('Customer Service Officer', 'Services', 'Helps customers resolve questions and access services.', 'Customer service assistant', 'Officer to service manager', 'MWK 180,000-1,000,000', 'medium')
) as seed(title, sector, description, entry_level, growth_path, salary_range, demand_level)
where not exists (select 1 from public.careers c where c.title = seed.title);

insert into public.learning_resources (title, description, resource_type, provider, difficulty, free, url)
select seed.title, seed.description, seed.resource_type, seed.provider, seed.difficulty, seed.free, seed.url
from (values
  ('Demo: Workplace Communication Basics', 'A development resource for practising clear workplace communication.', 'course', 'SkillBridge Demo Library', 'beginner', true, 'https://example.com/skillbridge-demo-communication'),
  ('Demo: Spreadsheet Data Analysis', 'A development resource for learning practical spreadsheet analysis.', 'tutorial', 'SkillBridge Demo Library', 'beginner', true, 'https://example.com/skillbridge-demo-data'),
  ('Demo: Project Planning Fundamentals', 'A development resource for planning projects and tracking delivery.', 'video', 'SkillBridge Demo Library', 'beginner', true, 'https://example.com/skillbridge-demo-projects'),
  ('Demo: Building a Portfolio Project', 'A development project prompt for documenting evidence of skills.', 'project', 'SkillBridge Demo Library', 'intermediate', true, 'https://example.com/skillbridge-demo-portfolio')
) as seed(title, description, resource_type, provider, difficulty, free, url)
where not exists (select 1 from public.learning_resources r where r.title = seed.title);

-- Seed job templates for any explicitly created demo employer profile. The public signup flow never creates these records.
insert into public.jobs (employer_id, title, description, location, employment_type, work_mode, status, published_at)
select ep.id, seed.title, seed.description, 'Lilongwe', seed.employment_type, 'hybrid', 'published', now()
from public.employer_profiles ep
cross join (values
  ('Demo Graduate Project Assistant', 'Development job template for testing the application journey.', 'graduate'),
  ('Demo Junior Data Assistant', 'Development job template for testing skills and application records.', 'internship')
) as seed(title, description, employment_type)
where ep.company_name = 'SkillBridge Demo Employer'
  and not exists (select 1 from public.jobs j where j.employer_id = ep.id and j.title = seed.title);
