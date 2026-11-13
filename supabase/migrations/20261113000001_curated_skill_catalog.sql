-- Keep existing skill IDs and relationships; catalogue cleanup is approval- and visibility-based.

create table if not exists public.skill_catalog_migration_backup (
  migration_name text not null,
  source_table text not null,
  source_key text not null,
  record_data jsonb not null,
  captured_at timestamptz not null default now(),
  primary key (migration_name, source_table, source_key)
);

alter table public.skill_catalog_migration_backup enable row level security;
revoke all on public.skill_catalog_migration_backup from public, anon, authenticated;
grant all on public.skill_catalog_migration_backup to service_role;

insert into public.skill_catalog_migration_backup (
  migration_name, source_table, source_key, record_data
)
select
  '20261113000001_curated_skill_catalog',
  'skills',
  skill.id::text,
  to_jsonb(skill)
from public.skills skill
union all
select
  '20261113000001_curated_skill_catalog',
  'job_skills',
  requirement.id::text,
  to_jsonb(requirement)
from public.job_skills requirement
join public.skills skill on skill.id = requirement.skill_id
where skill.name in (
  'bookkeeping',
  'copywriting',
  'curriculum-design',
  'lesson-planning',
  'video-editing'
)
on conflict (migration_name, source_table, source_key) do nothing;

alter table public.skills
  add column if not exists approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected')),
  add column if not exists is_internal boolean not null default false;

update public.skills
set normalized_name = trim(lower(regexp_replace(trim(name), '[^a-z0-9]+', ' ', 'g')));

update public.skills
set category = case
  when name ilike any (array['%programming%', '%software%', '%computer%', '%database%', '%network%', '%cybersecurity%', '%data analysis%', '%excel%', '%web development%', '%cloud computing%', '%IT support%', '%digital literacy%'])
    or category ilike any (array['technology', 'technical', 'digital', 'information technology'])
    then 'Information Technology and Software Development'
  when name ilike any (array['%design%', '%creative%', '%illustrat%', '%photograph%', '%video edit%', '%animation%', '%branding%', '%fine art%', '%visual art%', '%creative arts%'])
    or category ilike any (array['creative', 'design', 'arts'])
    then 'Graphic Design and Creative Arts'
  when name ilike any (array['%account%', '%bookkeep%', '%finance%', '%financial%', '%budget%', '%payroll%', '%tax preparation%', '%audit%'])
    or category ilike any (array['finance', 'financial', 'accounting'])
    then 'Accounting and Finance'
  when name ilike any (array['%health%', '%medical%', '%nurs%', '%clinical%', '%patient%', '%first aid%', '%infection prevention%'])
    or category ilike any (array['healthcare', 'health', 'medical'])
    then 'Health and Medical Sciences'
  when name ilike any (array['%agricultur%', '%agronom%', '%farm%', '%livestock%', '%crop production%', '%irrigation%', '%soil management%', '%environment%', '%forestry%'])
    or category ilike any (array['agriculture', 'environmental'])
    then 'Agriculture and Environmental Sciences'
  when name ilike any (array['%teach%', '%education%', '%curriculum%', '%classroom%', '%pedagogy%', '%lesson plan%', '%literacy instruction%', '%facilitation%'])
    or category ilike any (array['education', 'teaching'])
    then 'Education and Teaching'
  when name ilike any (array['%engineering%', '%welding%', '%plumbing%', '%carpentry%', '%electrical installation%', '%construction%', '%mechanic%', '%solar installation%', '%maintenance and repair%'])
    or category ilike any (array['engineering', 'construction', 'technical trades'])
    then 'Engineering and Technical Trades'
  when name ilike any (array['%communication%', '%writing%', '%journalism%', '%media%', '%public relations%', '%copywriting%', '%public speaking%', '%report writing%'])
    or category ilike any (array['communication', 'media'])
    then 'Communication and Media'
  when name ilike any (array['%hospitality%', '%tourism%', '%hotel%', '%catering%', '%culinary%', '%food safety%', '%tour guiding%', '%travel planning%'])
    or category ilike any (array['hospitality', 'tourism'])
    then 'Hospitality and Tourism'
  when name ilike any (array['%business%', '%management%', '%leadership%', '%marketing%', '%sales%', '%customer service%', '%human resource%', '%project management%', '%entrepreneurship%', '%procurement%', '%supply chain%'])
    or category ilike any (array['business', 'management', 'entrepreneurship', 'customer service'])
    then 'Business and Management'
  else 'General and Transferable Skills'
end;

update public.skills
set skill_type = case category
  when 'Information Technology and Software Development' then 'digital'
  when 'Graphic Design and Creative Arts' then 'creative'
  when 'Business and Management' then 'business'
  when 'Accounting and Finance' then 'financial'
  when 'Health and Medical Sciences' then 'healthcare'
  when 'Agriculture and Environmental Sciences' then 'agriculture'
  when 'Education and Teaching' then 'education'
  when 'Engineering and Technical Trades' then 'engineering'
  when 'Communication and Media' then 'communication'
  when 'Hospitality and Tourism' then 'hospitality'
  else 'other'
end;

update public.skills
set status = 'archived',
    approval_status = 'rejected',
    is_internal = true
where name ~* '(claude[[:space:]]+skills[[:space:]]+catalog|catalog[[:space:]]*page[[:space:]]*[0-9]*|built[- ]?in[- ]?browser|mcp[- ]?builder|skill[- ]?testing|public[[:space:]_-]*read|^examples?([[:space:].]|$)|^source[[:space:]]*what|^status[[:space:]]*what|^page[[:space:]]*[0-9]+$)'
   or name ~* '^examples?'
   or name ~* '^and([[:space:]]|$)'
   or name ~* '(benepass|installed[[:space:]]*editable|fill[[:space:]]+pdf[[:space:]]+forms)'
   or lower(trim(name)) = 'guides)';

insert into public.skill_aliases (skill_id, alias, normalized_alias, alias_type)
select canonical.id, 'Guides)', 'guides', 'legacy_term'
from public.skills canonical
where canonical.normalized_name = 'guides'
  and canonical.name <> 'Guides)'
  and canonical.status <> 'archived'
  and not canonical.is_internal
  and exists (
    select 1 from public.skills duplicate
    where lower(trim(duplicate.name)) = 'guides)'
  )
on conflict (skill_id, normalized_alias) do nothing;

insert into public.skills (
  name, category, skill_type, status, approval_status, is_internal, normalized_name, description
)
values
  ('Programming', 'Information Technology and Software Development', 'digital', 'active', 'approved', false, 'programming', 'Writing, testing and maintaining software.'),
  ('Networking', 'Information Technology and Software Development', 'digital', 'active', 'approved', false, 'networking', 'Designing, configuring and maintaining connected systems.'),
  ('Software Development', 'Information Technology and Software Development', 'digital', 'active', 'approved', false, 'software development', 'Designing, building and maintaining software applications.'),
  ('Web Development', 'Information Technology and Software Development', 'digital', 'active', 'approved', false, 'web development', 'Building and maintaining websites and web applications.'),
  ('Mobile App Development', 'Information Technology and Software Development', 'digital', 'active', 'approved', false, 'mobile app development', 'Building and maintaining applications for mobile devices.'),
  ('Database Management', 'Information Technology and Software Development', 'digital', 'active', 'approved', false, 'database management', 'Designing, querying and maintaining databases.'),
  ('Data Analysis', 'Information Technology and Software Development', 'analytical', 'active', 'approved', false, 'data analysis', 'Interpreting data to support sound decisions.'),
  ('Data Visualization', 'Information Technology and Software Development', 'analytical', 'active', 'approved', false, 'data visualization', 'Presenting data clearly through charts and visual reports.'),
  ('Cybersecurity', 'Information Technology and Software Development', 'digital', 'active', 'approved', false, 'cybersecurity', 'Protecting digital systems, networks and information.'),
  ('Network Administration', 'Information Technology and Software Development', 'digital', 'active', 'approved', false, 'network administration', 'Configuring and maintaining computer networks.'),
  ('IT Support', 'Information Technology and Software Development', 'digital', 'active', 'approved', false, 'it support', 'Troubleshooting and supporting computer systems and users.'),
  ('Computer Literacy', 'Information Technology and Software Development', 'digital', 'active', 'approved', false, 'computer literacy', 'Using computers and common digital tools effectively.'),
  ('Digital Literacy', 'Information Technology and Software Development', 'digital', 'active', 'approved', false, 'digital literacy', 'Using digital tools safely and effectively.'),
  ('Microsoft Excel', 'Information Technology and Software Development', 'digital', 'active', 'approved', false, 'microsoft excel', 'Organising, analysing and presenting information in spreadsheets.'),
  ('Microsoft Office', 'Information Technology and Software Development', 'digital', 'active', 'approved', false, 'microsoft office', 'Using common office productivity applications.'),
  ('Cloud Computing', 'Information Technology and Software Development', 'digital', 'active', 'approved', false, 'cloud computing', 'Using and managing cloud-based computing services.'),
  ('Graphic Design', 'Graphic Design and Creative Arts', 'creative', 'active', 'approved', false, 'graphic design', 'Creating effective visual communication for print and digital media.'),
  ('Design', 'Graphic Design and Creative Arts', 'creative', 'active', 'approved', false, 'design', 'Creating useful, clear and accessible visual or product experiences.'),
  ('Adobe Photoshop', 'Graphic Design and Creative Arts', 'creative', 'active', 'approved', false, 'adobe photoshop', 'Editing and composing digital images.'),
  ('Adobe Illustrator', 'Graphic Design and Creative Arts', 'creative', 'active', 'approved', false, 'adobe illustrator', 'Creating vector graphics and illustrations.'),
  ('Branding', 'Graphic Design and Creative Arts', 'creative', 'active', 'approved', false, 'branding', 'Developing consistent and recognisable brand identities.'),
  ('Illustration', 'Graphic Design and Creative Arts', 'creative', 'active', 'approved', false, 'illustration', 'Creating visual artwork to communicate ideas.'),
  ('Photography', 'Graphic Design and Creative Arts', 'creative', 'active', 'approved', false, 'photography', 'Capturing and editing photographs for a defined purpose.'),
  ('Video Editing', 'Graphic Design and Creative Arts', 'creative', 'active', 'approved', false, 'video editing', 'Editing video and audio into clear, engaging content.'),
  ('Animation', 'Graphic Design and Creative Arts', 'creative', 'active', 'approved', false, 'animation', 'Creating animated visual content.'),
  ('User Interface Design', 'Graphic Design and Creative Arts', 'creative', 'active', 'approved', false, 'user interface design', 'Designing clear and usable digital interfaces.'),
  ('Business Analysis', 'Business and Management', 'business', 'active', 'approved', false, 'business analysis', 'Identifying business needs and evaluating practical solutions.'),
  ('Business Development', 'Business and Management', 'business', 'active', 'approved', false, 'business development', 'Building partnerships and opportunities for organisational growth.'),
  ('Business Planning', 'Business and Management', 'business', 'active', 'approved', false, 'business planning', 'Setting business objectives and planning how to achieve them.'),
  ('Customer Service', 'Business and Management', 'customer_service', 'active', 'approved', false, 'customer service', 'Helping customers resolve questions and access services.'),
  ('Entrepreneurship', 'Business and Management', 'entrepreneurship', 'active', 'approved', false, 'entrepreneurship', 'Identifying opportunities and developing sustainable ventures.'),
  ('Human Resource Management', 'Business and Management', 'management', 'active', 'approved', false, 'human resource management', 'Supporting recruitment, staff development and people operations.'),
  ('Marketing', 'Business and Management', 'business', 'active', 'approved', false, 'marketing', 'Understanding audiences and promoting products or services.'),
  ('Project Management', 'Business and Management', 'management', 'active', 'approved', false, 'project management', 'Planning, coordinating and delivering project outcomes.'),
  ('Procurement', 'Business and Management', 'business', 'active', 'approved', false, 'procurement', 'Sourcing goods and services through accountable processes.'),
  ('Sales', 'Business and Management', 'business', 'active', 'approved', false, 'sales', 'Understanding customer needs and supporting responsible sales.'),
  ('Supply Chain Management', 'Business and Management', 'management', 'active', 'approved', false, 'supply chain management', 'Coordinating the flow of goods and services.'),
  ('Accounting', 'Accounting and Finance', 'financial', 'active', 'approved', false, 'accounting', 'Recording, analysing and reporting financial information.'),
  ('Bookkeeping', 'Accounting and Finance', 'financial', 'active', 'approved', false, 'bookkeeping', 'Maintaining accurate financial records and ledgers.'),
  ('Budgeting', 'Accounting and Finance', 'financial', 'active', 'approved', false, 'budgeting', 'Preparing and monitoring budgets against planned activities.'),
  ('Financial Analysis', 'Accounting and Finance', 'analytical', 'active', 'approved', false, 'financial analysis', 'Analysing financial information to inform decisions.'),
  ('Financial Modelling', 'Accounting and Finance', 'financial', 'active', 'approved', false, 'financial modelling', 'Building structured financial projections and scenarios.'),
  ('Financial Reporting', 'Accounting and Finance', 'financial', 'active', 'approved', false, 'financial reporting', 'Preparing accurate financial statements and reports.'),
  ('Payroll Administration', 'Accounting and Finance', 'financial', 'active', 'approved', false, 'payroll administration', 'Processing payroll and maintaining related records.'),
  ('Tax Preparation', 'Accounting and Finance', 'financial', 'active', 'approved', false, 'tax preparation', 'Preparing tax calculations, records and returns.'),
  ('Auditing', 'Accounting and Finance', 'financial', 'active', 'approved', false, 'auditing', 'Reviewing records and controls for accuracy and compliance.'),
  ('Community Health', 'Health and Medical Sciences', 'healthcare', 'active', 'approved', false, 'community health', 'Supporting health promotion and services in communities.'),
  ('First Aid', 'Health and Medical Sciences', 'healthcare', 'active', 'approved', false, 'first aid', 'Providing immediate basic care in an emergency.'),
  ('Health Education', 'Health and Medical Sciences', 'healthcare', 'active', 'approved', false, 'health education', 'Communicating practical information that supports health.'),
  ('Medical Records Management', 'Health and Medical Sciences', 'healthcare', 'active', 'approved', false, 'medical records management', 'Maintaining accurate and confidential medical records.'),
  ('Nursing', 'Health and Medical Sciences', 'healthcare', 'active', 'approved', false, 'nursing', 'Providing safe, compassionate nursing care.'),
  ('Healthcare', 'Health and Medical Sciences', 'healthcare', 'active', 'approved', false, 'healthcare', 'Supporting safe and effective health services.'),
  ('Patient Care', 'Health and Medical Sciences', 'healthcare', 'active', 'approved', false, 'patient care', 'Supporting patients with safe and respectful care.'),
  ('Public Health', 'Health and Medical Sciences', 'healthcare', 'active', 'approved', false, 'public health', 'Promoting and protecting the health of communities.'),
  ('Infection Prevention', 'Health and Medical Sciences', 'healthcare', 'active', 'approved', false, 'infection prevention', 'Applying practices that reduce the spread of infection.'),
  ('Agribusiness', 'Agriculture and Environmental Sciences', 'agriculture', 'active', 'approved', false, 'agribusiness', 'Managing commercial and value-chain aspects of agriculture.'),
  ('Agriculture', 'Agriculture and Environmental Sciences', 'agriculture', 'active', 'approved', false, 'agriculture', 'Applying practical knowledge to agricultural production and extension.'),
  ('Agricultural Extension', 'Agriculture and Environmental Sciences', 'agriculture', 'active', 'approved', false, 'agricultural extension', 'Sharing practical agricultural knowledge with farming communities.'),
  ('Agronomy', 'Agriculture and Environmental Sciences', 'agriculture', 'active', 'approved', false, 'agronomy', 'Applying crop, soil and plant science to production.'),
  ('Crop Production', 'Agriculture and Environmental Sciences', 'agriculture', 'active', 'approved', false, 'crop production', 'Planning and carrying out crop cultivation activities.'),
  ('Environmental Conservation', 'Agriculture and Environmental Sciences', 'industry_specific', 'active', 'approved', false, 'environmental conservation', 'Protecting natural resources and ecosystems.'),
  ('Farm Management', 'Agriculture and Environmental Sciences', 'agriculture', 'active', 'approved', false, 'farm management', 'Planning and managing farm operations and resources.'),
  ('Livestock Management', 'Agriculture and Environmental Sciences', 'agriculture', 'active', 'approved', false, 'livestock management', 'Caring for livestock and managing animal production.'),
  ('Irrigation', 'Agriculture and Environmental Sciences', 'agriculture', 'active', 'approved', false, 'irrigation', 'Planning and maintaining efficient water delivery for crops.'),
  ('Soil Management', 'Agriculture and Environmental Sciences', 'agriculture', 'active', 'approved', false, 'soil management', 'Assessing and managing soil for productive, sustainable use.'),
  ('Climate-Smart Agriculture', 'Agriculture and Environmental Sciences', 'agriculture', 'active', 'approved', false, 'climate smart agriculture', 'Applying agricultural practices that support resilience and sustainability.'),
  ('Classroom Management', 'Education and Teaching', 'education', 'active', 'approved', false, 'classroom management', 'Creating supportive and organised learning environments.'),
  ('Curriculum Design', 'Education and Teaching', 'education', 'active', 'approved', false, 'curriculum design', 'Planning learning programmes and curriculum materials.'),
  ('Early Childhood Education', 'Education and Teaching', 'education', 'active', 'approved', false, 'early childhood education', 'Supporting learning and development in early childhood.'),
  ('Lesson Planning', 'Education and Teaching', 'education', 'active', 'approved', false, 'lesson planning', 'Preparing structured lessons aligned with learning objectives.'),
  ('Literacy Instruction', 'Education and Teaching', 'education', 'active', 'approved', false, 'literacy instruction', 'Teaching reading and writing skills.'),
  ('Pedagogy', 'Education and Teaching', 'education', 'active', 'approved', false, 'pedagogy', 'Applying effective approaches to teaching and learning.'),
  ('Teaching', 'Education and Teaching', 'education', 'active', 'approved', false, 'teaching', 'Designing and facilitating learning experiences.'),
  ('Training and Facilitation', 'Education and Teaching', 'education', 'active', 'approved', false, 'training and facilitation', 'Facilitating structured learning and group activities.'),
  ('Automotive Mechanics', 'Engineering and Technical Trades', 'engineering', 'active', 'approved', false, 'automotive mechanics', 'Inspecting, maintaining and repairing motor vehicles.'),
  ('Building Construction', 'Engineering and Technical Trades', 'construction', 'active', 'approved', false, 'building construction', 'Applying safe construction methods and practices.'),
  ('Carpentry', 'Engineering and Technical Trades', 'construction', 'active', 'approved', false, 'carpentry', 'Measuring, shaping and assembling wood components.'),
  ('Electrical Installation', 'Engineering and Technical Trades', 'engineering', 'active', 'approved', false, 'electrical installation', 'Installing and maintaining electrical systems safely.'),
  ('Engineering Drawing', 'Engineering and Technical Trades', 'engineering', 'active', 'approved', false, 'engineering drawing', 'Reading and preparing technical drawings.'),
  ('Plumbing', 'Engineering and Technical Trades', 'construction', 'active', 'approved', false, 'plumbing', 'Installing and maintaining water and drainage systems.'),
  ('Solar Installation', 'Engineering and Technical Trades', 'engineering', 'active', 'approved', false, 'solar installation', 'Installing and maintaining solar energy systems.'),
  ('Welding', 'Engineering and Technical Trades', 'engineering', 'active', 'approved', false, 'welding', 'Joining and repairing metal components safely.'),
  ('Maintenance and Repair', 'Engineering and Technical Trades', 'engineering', 'active', 'approved', false, 'maintenance and repair', 'Maintaining equipment and diagnosing common faults.'),
  ('Civil Engineering', 'Engineering and Technical Trades', 'engineering', 'active', 'approved', false, 'civil engineering', 'Applying engineering principles to infrastructure and the built environment.'),
  ('Engineering', 'Engineering and Technical Trades', 'engineering', 'active', 'approved', false, 'engineering', 'Applying technical and scientific principles to build solutions.'),
  ('Business Writing', 'Communication and Media', 'communication', 'active', 'approved', false, 'business writing', 'Writing clear, audience-appropriate workplace documents.'),
  ('Communication', 'Communication and Media', 'communication', 'active', 'approved', false, 'communication', 'Sharing information clearly in written, verbal and digital formats.'),
  ('Copywriting', 'Communication and Media', 'communication', 'active', 'approved', false, 'copywriting', 'Writing concise content for defined audiences and purposes.'),
  ('Journalism', 'Communication and Media', 'media', 'active', 'approved', false, 'journalism', 'Researching and reporting accurate news and information.'),
  ('Media Production', 'Communication and Media', 'media', 'active', 'approved', false, 'media production', 'Planning and producing audio-visual media content.'),
  ('Public Speaking', 'Communication and Media', 'communication', 'active', 'approved', false, 'public speaking', 'Presenting information confidently to an audience.'),
  ('Public Relations', 'Communication and Media', 'communication', 'active', 'approved', false, 'public relations', 'Managing communication and relationships with stakeholders.'),
  ('Report Writing', 'Communication and Media', 'communication', 'active', 'approved', false, 'report writing', 'Preparing structured reports from evidence and analysis.'),
  ('Catering', 'Hospitality and Tourism', 'hospitality', 'active', 'approved', false, 'catering', 'Planning and providing food services for individuals and events.'),
  ('Culinary Skills', 'Hospitality and Tourism', 'hospitality', 'active', 'approved', false, 'culinary skills', 'Preparing food using safe and appropriate methods.'),
  ('Food Safety', 'Hospitality and Tourism', 'hospitality', 'active', 'approved', false, 'food safety', 'Applying safe food handling and hygiene practices.'),
  ('Guest Relations', 'Hospitality and Tourism', 'hospitality', 'active', 'approved', false, 'guest relations', 'Welcoming guests and responding to their needs.'),
  ('Hotel Operations', 'Hospitality and Tourism', 'hospitality', 'active', 'approved', false, 'hotel operations', 'Supporting the daily operations of accommodation services.'),
  ('Housekeeping', 'Hospitality and Tourism', 'hospitality', 'active', 'approved', false, 'housekeeping', 'Maintaining clean, safe and welcoming facilities.'),
  ('Tour Guiding', 'Hospitality and Tourism', 'hospitality', 'active', 'approved', false, 'tour guiding', 'Leading visitors and sharing accurate local information.'),
  ('Tourism Management', 'Hospitality and Tourism', 'hospitality', 'active', 'approved', false, 'tourism management', 'Planning and managing tourism services and experiences.'),
  ('Adaptability', 'General and Transferable Skills', 'professional', 'active', 'approved', false, 'adaptability', 'Adjusting constructively to changing tasks and circumstances.'),
  ('Analytical Thinking', 'General and Transferable Skills', 'analytical', 'active', 'approved', false, 'analytical thinking', 'Examining information and evidence to reach sound conclusions.'),
  ('Conflict Resolution', 'General and Transferable Skills', 'professional', 'active', 'approved', false, 'conflict resolution', 'Addressing disagreements constructively and fairly.'),
  ('Critical Thinking', 'General and Transferable Skills', 'analytical', 'active', 'approved', false, 'critical thinking', 'Evaluating claims, evidence and possible solutions.'),
  ('Decision Making', 'General and Transferable Skills', 'professional', 'active', 'approved', false, 'decision making', 'Choosing a course of action using relevant evidence.'),
  ('Interpersonal Skills', 'General and Transferable Skills', 'communication', 'active', 'approved', false, 'interpersonal skills', 'Working respectfully and effectively with other people.'),
  ('Leadership', 'General and Transferable Skills', 'leadership', 'active', 'approved', false, 'leadership', 'Guiding people and decisions toward shared outcomes.'),
  ('Problem Solving', 'General and Transferable Skills', 'analytical', 'active', 'approved', false, 'problem solving', 'Breaking down problems and evaluating practical solutions.'),
  ('Research', 'General and Transferable Skills', 'research', 'active', 'approved', false, 'research', 'Gathering and evaluating information systematically.'),
  ('Time Management', 'General and Transferable Skills', 'professional', 'active', 'approved', false, 'time management', 'Prioritising tasks and using time effectively.'),
  ('Work Ethic', 'General and Transferable Skills', 'professional', 'active', 'approved', false, 'work ethic', 'Demonstrating reliability, accountability and care in work.')
on conflict (name) do update
set category = excluded.category,
    skill_type = excluded.skill_type,
    status = excluded.status,
    approval_status = excluded.approval_status,
    is_internal = false,
    normalized_name = excluded.normalized_name,
    description = coalesce(public.skills.description, excluded.description),
    updated_at = now();

insert into public.skill_aliases (skill_id, alias, normalized_alias, alias_type)
select skills.id, aliases.alias, lower(regexp_replace(trim(aliases.alias), '[^a-z0-9]+', ' ', 'g')), 'common_name'
from (values
  ('Microsoft Excel', 'Excel'),
  ('Microsoft Excel', 'MS Excel'),
  ('Microsoft Office', 'MS Office'),
  ('Computer Literacy', 'Basic Computer Skills'),
  ('Programming', 'Coding'),
  ('Programming', 'Computer Programming'),
  ('Graphic Design', 'Visual Design'),
  ('Bookkeeping', 'Book Keeping'),
  ('Agricultural Extension', 'Agriculture Extension'),
  ('Customer Service', 'Customer Care'),
  ('Human Resource Management', 'Human Resources'),
  ('Tour Guiding', 'Tour Guide')
) as aliases(skill_name, alias)
join public.skills on public.skills.name = aliases.skill_name
where not public.skills.is_internal
on conflict (skill_id, normalized_alias) do nothing;

do $$
declare
  mapping record;
  job_skill_count bigint;
begin
  for mapping in
    select pairs.duplicate_name, pairs.canonical_name,
      duplicate_skill.id as duplicate_id, canonical_skill.id as canonical_id
    from (values
      ('bookkeeping', 'Bookkeeping'),
      ('copywriting', 'Copywriting'),
      ('curriculum-design', 'Curriculum Design'),
      ('lesson-planning', 'Lesson Planning'),
      ('video-editing', 'Video Editing')
    ) as pairs(duplicate_name, canonical_name)
    left join public.skills duplicate_skill on duplicate_skill.name = pairs.duplicate_name
    left join public.skills canonical_skill on canonical_skill.name = pairs.canonical_name
  loop
    if mapping.duplicate_id is null or mapping.canonical_id is null
      or mapping.duplicate_id = mapping.canonical_id
    then
      raise exception 'Expected canonical and duplicate skill rows were not found for "%".', mapping.duplicate_name;
    end if;

    if exists (select 1 from public.user_skills where skill_id = mapping.duplicate_id)
      or exists (select 1 from public.career_skills where skill_id = mapping.duplicate_id)
      or exists (select 1 from public.job_skills where canonical_skill_id = mapping.duplicate_id)
      or exists (select 1 from public.project_skills where skill_id = mapping.duplicate_id)
      or exists (select 1 from public.certificate_skills where skill_id = mapping.duplicate_id)
      or exists (select 1 from public.portfolio_skills where skill_id = mapping.duplicate_id)
      or exists (select 1 from public.career_opportunity_skills where skill_id = mapping.duplicate_id)
      or exists (select 1 from public.assessments where skill_id = mapping.duplicate_id)
      or exists (select 1 from public.learning_resources where skill_id = mapping.duplicate_id)
      or exists (select 1 from public.skill_aliases where skill_id = mapping.duplicate_id)
      or exists (select 1 from public.skill_relationships where source_skill_id = mapping.duplicate_id or target_skill_id = mapping.duplicate_id)
      or exists (select 1 from public.skills where parent_skill_id = mapping.duplicate_id)
    then
      raise exception using
        errcode = 'P0001',
        message = format('Unexpected linked records reference duplicate skill "%s".', mapping.duplicate_name),
        hint = 'Stop and review those relationships before archiving this duplicate.';
    end if;

    select count(*) into job_skill_count
    from public.job_skills
    where skill_id = mapping.duplicate_id;

    if mapping.duplicate_name = 'video-editing' then
      if job_skill_count > 1 then
        raise exception 'Expected at most one Video Editing job requirement; found %.', job_skill_count;
      end if;
      if exists (
        select 1
        from public.job_skills duplicate_requirement
        join public.job_skills canonical_requirement
          on canonical_requirement.job_id = duplicate_requirement.job_id
         and canonical_requirement.skill_id = mapping.canonical_id
        where duplicate_requirement.skill_id = mapping.duplicate_id
      ) then
        raise exception using
          errcode = 'P0001',
          message = 'A job already has both the Video Editing duplicate and canonical skill requirement.',
          hint = 'Review and combine that job''s requirement levels and importance before rerunning this migration.';
      end if;
      update public.job_skills
      set skill_id = mapping.canonical_id,
          canonical_skill_id = case
            when canonical_skill_id = mapping.duplicate_id then mapping.canonical_id
            else canonical_skill_id
          end
      where skill_id = mapping.duplicate_id;
    elsif job_skill_count > 0 then
      raise exception 'Unexpected job requirement references duplicate skill "%".', mapping.duplicate_name;
    end if;

    insert into public.skill_aliases (skill_id, alias, normalized_alias, alias_type)
    values (
      mapping.canonical_id,
      mapping.duplicate_name,
      trim(lower(regexp_replace(trim(mapping.duplicate_name), '[^a-z0-9]+', ' ', 'g'))),
      'legacy_term'
    )
    on conflict (skill_id, normalized_alias) do nothing;

    update public.skills
    set status = 'archived',
        approval_status = 'rejected'
    where id = mapping.duplicate_id;
  end loop;
end
$$;

update public.skills skill
set aliases = coalesce((
  select jsonb_agg(distinct merged.alias order by merged.alias)
  from (
    select legacy.alias
    from jsonb_array_elements_text(
      case when jsonb_typeof(skill.aliases) = 'array' then skill.aliases else '[]'::jsonb end
    ) as legacy(alias)
    union
    select alias.alias
    from public.skill_aliases alias
    where alias.skill_id = skill.id
  ) as merged
), '[]'::jsonb)
where exists (
  select 1 from public.skill_aliases alias
  where alias.skill_id = skill.id
);

do $$
declare
  duplicate_details text;
begin
  select string_agg(
    format('%s (%s): %s', duplicates.normalized_name, duplicates.skill_count, duplicates.skills),
    '; ' order by duplicates.normalized_name
  )
  into duplicate_details
  from (
    select normalized_name,
      count(*) as skill_count,
      string_agg(format('%s [%s]', name, id), ', ' order by name, id) as skills
    from public.skills
    where status <> 'archived' and not is_internal
    group by normalized_name
    having count(*) > 1
  ) as duplicates;

  if duplicate_details is not null then
    raise exception using
      errcode = 'P0001',
      message = 'Unresolved normalized skill-name duplicates remain.',
      detail = duplicate_details,
      hint = 'Review the listed IDs and their relationships. Archive only confirmed duplicate or internal records; do not delete or merge uncertain records.';
  end if;
end
$$;

create unique index if not exists skills_normalized_name_visible_unique
  on public.skills (normalized_name)
  where status <> 'archived' and not is_internal;
create index if not exists skills_approval_visibility_idx
  on public.skills (approval_status, status, is_internal);

create or replace function public.set_normalized_skill_name()
returns trigger
language plpgsql
as $$
begin
  new.normalized_name := trim(lower(regexp_replace(trim(new.name), '[^a-z0-9]+', ' ', 'g')));
  return new;
end;
$$;

drop trigger if exists skills_normalized_name on public.skills;
create trigger skills_normalized_name
before insert or update of name on public.skills
for each row execute function public.set_normalized_skill_name();

drop policy if exists skills_public_read on public.skills;
create policy skills_public_read on public.skills
for select using (
  status = 'active'
  and approval_status = 'approved'
  and not is_internal
);

drop policy if exists skill_aliases_public_read on public.skill_aliases;
create policy skill_aliases_public_read on public.skill_aliases
for select using (
  exists (
    select 1 from public.skills skill
    where skill.id = skill_aliases.skill_id
      and skill.status = 'active'
      and skill.approval_status = 'approved'
      and not skill.is_internal
  )
);

alter table public.skill_relationships enable row level security;
drop policy if exists skill_relationships_public_read on public.skill_relationships;
create policy skill_relationships_public_read on public.skill_relationships
for select using (
  exists (
    select 1 from public.skills source_skill
    where source_skill.id = skill_relationships.source_skill_id
      and source_skill.status = 'active'
      and source_skill.approval_status = 'approved'
      and not source_skill.is_internal
  )
  and exists (
    select 1 from public.skills target_skill
    where target_skill.id = skill_relationships.target_skill_id
      and target_skill.status = 'active'
      and target_skill.approval_status = 'approved'
      and not target_skill.is_internal
  )
);
drop policy if exists skill_relationships_admin_all on public.skill_relationships;
create policy skill_relationships_admin_all on public.skill_relationships
for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.require_approved_skill_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.skill_id is not distinct from old.skill_id then
      return new;
    end if;
  end if;

  if not exists (
    select 1 from public.skills skill
    where skill.id = new.skill_id
      and skill.status = 'active'
      and skill.approval_status = 'approved'
      and not skill.is_internal
  ) then
    raise exception 'Only active, approved professional skills can be assigned.';
  end if;
  return new;
end;
$$;

drop trigger if exists user_skills_require_approved_skill on public.user_skills;
create trigger user_skills_require_approved_skill
before insert or update of skill_id on public.user_skills
for each row execute function public.require_approved_skill_reference();

drop trigger if exists job_skills_require_approved_skill on public.job_skills;
create trigger job_skills_require_approved_skill
before insert or update of skill_id on public.job_skills
for each row execute function public.require_approved_skill_reference();
