# SkillBridge Malawi admin module

## Architecture

The admin module reuses the existing `AuthProvider`, `ProtectedRoute`, `RoleRoute`, `AppShell`, UI primitives, Supabase client, and service error handling. Admin pages are rendered through `AdminModulePage.jsx`; database access is kept in `adminService.js`.

## Routes

- `/admin/dashboard`
- `/admin/users` and `/admin/users/:id`
- `/admin/employers` and `/admin/employers/:id`
- `/admin/jobs` and `/admin/jobs/:id`
- `/admin/skills`, `/admin/skills/create`, `/admin/skills/:id/edit`
- `/admin/careers`, `/admin/careers/create`, `/admin/careers/:id`, `/admin/careers/:id/edit`
- `/admin/learning`, `/admin/learning/create`, `/admin/learning/:id`, `/admin/learning/:id/edit`
- `/admin/assessments`, `/admin/assessments/create`, `/admin/assessments/:id`, `/admin/assessments/:id/edit`
- `/admin/applications` and `/admin/applications/:id`
- `/admin/analytics`
- `/admin/ai-monitoring`
- `/admin/reports`
- `/admin/audit-logs`
- `/admin/settings`

Every route is wrapped by `ProtectedRoute` and `RoleRoute` with the `admin` role. Non-admin users are redirected to their own dashboard.

## Permissions and RLS

The module relies on the Step 3 `public.is_admin()` security-definer helper and existing admin policies. Admin policies are additive and do not remove student or employer isolation. The browser never receives a service-role key and all queries use the existing Supabase client.

The admin module does not expose passwords, auth tokens, or private authentication metadata. Historical job/application/audit records use status changes and read-only monitoring rather than destructive deletion.

Assessment administration provides a searchable, filterable library, assessment detail summaries, and status controls. Publishing is blocked until at least one question exists. Assessment question correct answers are not selected for the admin overview.
Assessment creation and question-authoring are not available in the admin interface yet; the create route returns to the library, and the edit route opens the assessment detail view.

Admin Settings shows the signed-in administrator's account name, email, role, and account creation date as read-only identity details. Administrators can update or remove their profile picture and use the existing password-reset flow. The page does not claim to manage platform-wide preferences.

Learning Resource administration supports searchable and type-filtered listings, resource details, and create/edit flows for the fields defined in `learning_resources`. Resource links are restricted to HTTP or HTTPS URLs.

Application administration is read-only and supports applicant/job search, status filtering, pagination, and per-application event timelines. CV file URLs and private assessment results are omitted from the platform-wide view.

Admin Analytics displays current database totals for users, opportunities, applications, interviews, and platform content. These totals are a point-in-time snapshot, not date-filtered trends.

Admin Reports can generate a platform overview, jobs and applications summary, or platform content summary from the same current database counts, preview the rows, and download them as CSV. Exports contain aggregate counts only and are not date-filtered.

Data Quality checks schema-backed required fields and allowed values across platform records, paginating through each checked table. Query failures are shown as errors; database availability reflects successful checks, while API, authentication, and AI service monitoring are explicitly marked as not monitored by this page.

Security Overview summarizes application configuration and controls visible in the codebase; it is not a live security audit. It reports the current wildcard API CORS policy and the absence of configured API rate limiting as items needing attention. Server secrets and live infrastructure settings are not inspected by the browser.

## Services and data

`adminService.js` reads and writes the existing tables:

- `profiles`, `student_profiles`, `employer_profiles`
- `jobs`, `applications`, `interviews`, `employment`
- `skills`, `careers`, `learning_resources`, `assessments`
- `ai_recommendations`, `ai_feedback`, `career_recommendations`, `job_matches`
- `admin_logs`

Dashboard counts use Supabase count queries. Empty and insufficient-data states are shown instead of fabricated statistics.

## Audit logging

The `admin_logs` page reads recent activity in descending timestamp order, supports text search over action, entity type, and description, and paginates 25 records at a time. It shows the administrator profile where available, while omitting arbitrary metadata. Query failures have an explicit retry state; logs are read-only and no destructive actions are available.

## AI monitoring

AI Monitoring displays exact counts and the 20 most recent stored recommendation, feedback, decision-log, review-queue, and governance-event records. It omits user prompts, recommendation outputs, feedback comments, and user IDs. Failures to query governance records are shown as page errors rather than empty activity. It does not call Gemini, generate recommendations, or calculate matches; fairness analysis is explicitly marked as not assessed because comparable-group metrics are not configured.

## Verification

Run:

```bash
npm run build
npx eslint src/pages/admin/AdminModulePage.jsx src/services/adminService.js src/routes/AppRoutes.jsx src/components/layout/AppSidebar.jsx
```

Live RLS and admin queries require the migrations to be applied to the linked Supabase project.

## Creating an admin account

1. In Supabase Dashboard, open **Authentication > Users** and create the user with the desired email and password. Do not use the public `/register` form for admins.
2. Apply migrations through `20261001000011_admin_provisioning.sql`.
3. In Supabase Dashboard **SQL Editor**, promote the Auth user by email:

```sql
update public.profiles
set role = 'admin', updated_at = now()
where email = 'admin@example.com';
```

4. Confirm that exactly one profile was updated, then sign in at `/login`.

The provisioning migration permits role changes only from a privileged SQL/service-role context. Normal authenticated users remain unable to change their own role, and public signup metadata is still restricted to student or employer roles.