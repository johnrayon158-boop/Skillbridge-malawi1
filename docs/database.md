# SkillBridge Malawi database foundation

## Migration order

Apply the files in `supabase/migrations/` by filename order:

1. `20261001_create_profiles_table.sql` preserves the Step 2 `profiles` and auth trigger.
2. `20261001000001_profiles_and_people.sql` adds shared functions, student/employer profiles and education.
3. `20261001000002_skills_and_careers.sql` adds the cross-sector skill taxonomy, evidence and career records.
4. `20261001000003_assessments_and_learning.sql` adds assessments and learning resources/paths.
5. `20261001000004_portfolios_and_projects.sql` adds projects, certificates and portfolios.
6. `20261001000005_jobs_and_applications.sql` adds jobs, skills, future match storage and applications.
7. `20261001000006_recruitment_and_employment.sql` adds recruitment, interviews, offers and employment.
8. `20261001000007_platform_and_security.sql` adds notifications, AI storage, audit logs and RLS.
9. `20261001000008_seed_data.sql` adds clearly labelled development catalog data.
10. `20261001000009_assessment_grading.sql` grades submitted answers inside PostgreSQL without exposing answer keys.
11. `20261001000010_employer_workflows.sql` adds employer candidate visibility and audited hiring workflow functions.
12. `20261001000011_admin_provisioning.sql` enables controlled privileged admin-role provisioning.
13. `20261001000012_profile_role_fallback.sql` and `20261001000013_profile_insert_policy_fix.sql` harden profile creation for supported signup and provisioning paths.
14. `20261001000014_profile_pictures_bucket.sql` provisions the public profile-picture bucket with per-user write policies.
15. `20261001000015_employer_assessment_result_scope.sql` limits employer access to results for assessments assigned to a job the candidate applied to.
16. `20261001000100_skill_taxonomy.sql` adds canonical taxonomy support for skills and job requirements.
17. `20261001000150_ai_governance.sql` adds governance and audit controls for AI-supported workflows.
18. `20261116000003_employer_verification_workflow.sql` adds employer submissions, review history, a private evidence bucket, and admin-only review controls.

The employer job validation migration, `20261116000002_employer_job_creation_validation.sql`, rejects blank job titles or descriptions on new and updated records and requires at least one active, approved, non-internal required skill when a draft or closed job is published. Drafts remain valid without skills.

The employer verification migration, `20261116000003_employer_verification_workflow.sql`, intentionally maps legacy `verified` flags to `unverified` because the previous flag has no approved verification record or audit trail. It does not delete employer profiles or job/application relationships. Employers must submit evidence again before the platform will display them as verified.

## Relationship overview

```text
profiles
├── student_profiles
│   ├── education
│   ├── user_skills
│   │   └── skill_evidence
│   ├── projects
│   ├── certificates
│   ├── portfolios
│   ├── assessments/results
│   ├── learning paths/progress
│   ├── applications
│   └── employment
└── employer_profiles
    ├── jobs
    │   ├── job_skills
    │   ├── assessments
    │   └── applications
    ├── verification submissions and audit events
    ├── recruitment stages
    └── employment
```

## Roles and RLS

- `auth.users` remains the authentication source of truth.
- `public.profiles` stores application identity and one of `student`, `employer`, or `admin`.
- The role-change trigger rejects self-service role changes. Admin updates are allowed through the admin policy.
- Students can access rows owned by their `student_profiles.id`.
- Employers can access rows owned by their `employer_profiles.id` and jobs they own.
- Published catalog data such as careers, skills, learning resources and published jobs has selective public read access.
- Private student, employer, application, message, notification and AI records are protected by RLS.
- Employer assessment-result access is limited to assessments assigned to the specific employer-owned job the candidate applied to.
- Employer verification evidence is stored in a private bucket. Employers can access their own files and submission history; administrators can review submissions and receive short-lived signed file links.
- Employer verification status is one of `unverified`, `pending`, `verified`, or `rejected`. A status of `verified` requires a reviewed, approved submission; the legacy boolean is synchronized and cannot be self-edited.
- `public.is_admin()` is a security-definer helper used by administrative policies.

## Seed data

The seed migration creates skills across technology, business, finance, education, healthcare, engineering, creative and agriculture sectors, plus careers and demo learning resources. It does not create fake auth users. Demo jobs are inserted only for a real employer profile named `SkillBridge Demo Employer`.

## Frontend services

The service layer uses the existing Supabase client and keeps queries out of React components:

- `profileService.js`
- `skillService.js`
- `careerService.js`
- `jobService.js`
- `applicationService.js`
- `notificationService.js`

## Applying and resetting

With the Supabase CLI linked to the project:

```bash
npx supabase login
npx supabase link --project-ref bmdcuelcixzhiayjwlmn
npx supabase db push
```

Without the CLI, open Supabase Dashboard > SQL Editor and run each migration in filename order. Do not rerun a migration partially; use a fresh development project or reset it with the CLI:

```bash
supabase db reset
```

The frontend needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env`. The legacy `VITE_SUPABASE_ANON_KEY` remains supported as a fallback. Never put a service-role key in the frontend.

## Verification checklist

After applying migrations, inspect `public` tables, foreign keys, indexes and RLS in Supabase Table Editor. Create a normal student and employer through `/register`, verify that the profile trigger creates the matching role-specific row, and confirm that a user cannot select or update another user's private records. Published jobs and catalog rows should be readable without exposing private profiles.
