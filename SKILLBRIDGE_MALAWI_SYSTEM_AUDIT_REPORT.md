# SkillBridge Malawi System Audit

## Executive summary

The repository contains a broad career-development platform with student, employer, and administrator experiences, a Supabase-backed data layer, a separate Node API, AI-assisted services, and deployment configuration for GitHub Pages, Render, and Vercel.

The checked automated suite and frontend build pass: **348 tests, 347 passed, 0 failed, 1 skipped**; lint and build also passed. A read-only browser smoke check confirmed that the public home page renders. These results do not establish that the deployed application is healthy: the local Supabase/RLS integration test was skipped, and live authentication, database policies, storage, external providers, and authenticated dashboards were not tested.

**Deployment readiness: conditional / not yet certified.** Before release, confirm the live Supabase migration and RLS state, run authenticated student/employer/admin smoke tests with test accounts, and provide the deployment-specific environment variables. There is a significant historical dashboard failure in the available session evidence: Supabase returned `42P17: infinite recursion detected in policy for relation "applications"`, followed by dashboard/navigation errors. The current live database state was not rechecked. A rollback migration is present in the working tree but has not been confirmed as applied to Supabase.

No production data was changed. No real user accounts were used. Secret values were not inspected; only the placeholder environment template was read.

## Scope and method

This was a read-only source, migration, test, and configuration review, supplemented with the existing automated test/build results and a public-home-page browser smoke check. It covered nine logical areas:

1. Public pages, authentication, and role-based routing.
2. Student dashboard and career-development workflows.
3. Employer jobs, applications, and verification.
4. Administrator and labour-market workflows.
5. Shared navigation, UI components, and hooks.
6. API routing, authentication, CORS, rate limits, and error handling.
7. AI/Gemini, CV parsing, and notification services.
8. Supabase schemas, migrations, RLS, storage, and workflow functions.
9. Automated tests, quality checks, deployment configuration, and relevant documentation.

Static inspection cannot prove how the connected Supabase project is configured or which migrations it has applied. No live database writes, account actions, uploads, emails, SMS, Gemini requests, or external placement-feed calls were performed.

## Findings and severity

Severity describes the potential effect if the finding applies. “Unverified” means the source or historical evidence does not establish the current deployed behavior.

| ID | Severity | Status | Finding |
|---|---|---|---|
| F-01 | High | Historical runtime failure; current state unverified | A previously shared browser session showed Supabase `42P17` recursion on `applications` while loading dashboards, followed by React update-depth/navigation errors. This can prevent authenticated dashboards from rendering. A rollback migration exists locally, but its application to the connected database has not been verified. |
| F-02 | Medium | Confirmed in source | Admin assessment “create” and “edit” routes redirect to the assessment directory/detail instead of opening editors. The current admin service provides list, detail, and status-update operations, not assessment creation/editing. |
| F-03 | Medium | Confirmed in source | Several admin labour-market subroutes (skills, careers, sectors, jobs, trends, reports) resolve to the same overview module rather than distinct views. |
| F-04 | Medium | Conditional on deployment configuration | The placement-search frontend defaults to `http://localhost:4000` if its API URL is not configured. A production build missing the correct API URL may send requests to the user’s own device rather than the deployed API. |
| F-05 | Medium | Confirmed in source | The sign-in “Remember me” choice does not change persistence; the Supabase client persists sessions in either case. The control therefore does not match its behavior. |
| F-06 | Medium | Confirmed in source | Email delivery is explicitly unconfigured (`sendEmail()` returns a skipped result); no email or SMS provider implementation was confirmed. In-app notifications exist, but delivery of email/SMS should not be represented as operational. |
| F-07 | Medium | Potential; needs API-level confirmation | JSON request bodies have no maximum byte limit in the shared parser, although PDF input has explicit limits. Consider a conservative body-size limit appropriate to each endpoint. |
| F-08 | Medium | Potential role inconsistency | CV analysis checks for `student`, while other AI flows support `graduate`. Confirm intended graduate eligibility and align the server-side role check if graduates should use CV analysis. |
| F-09 | Medium | Documentation gap | `docs/database.md` describes migration order only through the employer-verification migration, while later migrations in the repository add authorization enforcement, monitoring, analytics/evaluation, and other controls. Update the documented migration inventory and rollout procedure to match the actual repository sequence. |
| F-10 | Low | Confirmed in source | The employer notifications route is registered twice. Both registrations target the same page; this appears redundant rather than a separate broken workflow. |
| F-11 | Low | Confirmed in source | `/api/placements/public-search` is named as public but requires authentication. The route name and access behavior should be made consistent or clearly documented. |
| F-12 | Low | Potential abuse surface | The sign-in-failure telemetry endpoint is unauthenticated and accepts incident reports. It is locally rate-limited, but its volume and data-handling behavior should be monitored. |
| F-13 | Low | Information exposure to review | The health endpoint reports rate-limit and CORS configuration. Confirm that these details are intended to be public and do not reveal deployment-sensitive information. |
| F-14 | Informational | Confirmed in source | Separate employer/admin dashboard components are placeholders or stale; the active routes render dashboard views embedded in their module pages. This is not evidence that the routed dashboards themselves are placeholders, but it can confuse maintenance. |
| F-15 | Informational | Confirmed in source | `aiService.getInterviewQuestions()` has an empty fallback and no caller was found in the frontend; the active interview-preparation page uses another method. |

### Severity totals

| Severity | Count |
|---|---:|
| High | 1 historical, not reverified against the live environment |
| Medium | 8 |
| Low | 4 |
| Informational | 2 |
| **Total** | **15** |

These are audit findings, not 15 confirmed production incidents. Conditional and historical findings are explicitly marked above.

## Application and service inventory

### Frontend

- Route definitions and public/authenticated/role guards are centralized in `src/routes/`.
- Authentication and Supabase client setup are in `src/services/authService.js`, `src/contexts/AuthContext.jsx`, and `src/services/supabase.js`.
- Student career-development pages cover dashboard, career recommendations, skills, learning, portfolios/evidence, jobs, assessment, AI assistance, and placement search.
- Employer workflows cover dashboard, jobs, applications, candidate review, notifications, and verification.
- Administrator workflows cover overview, assessment review, labour-market data, governance/monitoring, and administrative tools.
- Shared layout, role navigation, notification UI, and reusable UI elements are in `src/components/`.

The active employer and admin dashboard views are embedded in their module pages. The similarly named standalone dashboard files are not the routed dashboard implementations.

### Backend and integrations

- `server/index.js` hosts health, administrative, placement, AI, CV, and chat endpoints. The Vercel adapter is `api/index.js`; local development launchers are under `scripts/`.
- Supabase bearer tokens are validated server-side; admin endpoints additionally check the profile role. Student and employer flows have role and ownership checks in their route handlers.
- CORS is allowlist-based. Rate limiting is route/IP/user-aware and can use Supabase-backed storage in production.
- Gemini calls are server-side, time-limited, schema-validated, and have deterministic fallback paths. CV text is treated as untrusted and redacted before provider submission.
- CV storage is private, with MIME/size/ownership checks and bounded DOCX extraction.
- In-app notification records and preferences are implemented. Email and SMS delivery are not configured.

### Database and authorization

- Migrations define profile provisioning, role constraints, job/application workflows, verification, storage policies, AI governance, telemetry, evaluation, and admin audit controls.
- RLS policies and security-definer functions are used for role and ownership boundaries.
- A database-level integration test exists for cross-role and ownership behavior, but it was skipped in this run because local Supabase URL/service/anon environment variables were absent.
- The working tree includes `supabase/migrations/20261122000003_revert_job_publication_application_policy_changes.sql` and `tests/employer-publication-rollback.test.js`. The migration removes the publication/eligibility triggers and restores prior application policies without deleting job/application records. It is a forward migration, not proof of the live database’s current state; review and apply it through the normal migration process if that rollback is still intended.
- Static inspection cannot determine whether migrations were applied, reordered, or manually changed in the connected project. The live policy, trigger, function, grant, constraint, and storage-bucket state remains unverified.

## Verification results

| Check | Result | Notes |
|---|---|---|
| `npm test` | **Pass** | 348 tests total: 347 passed, 0 failed, 1 skipped. The skipped case is local Supabase RLS integration. |
| `npm run lint` | **Pass** | Existing project lint command completed successfully. |
| `npm run build` | **Pass** | Vite production build completed successfully. |
| Browser smoke check | **Pass, limited** | Public home page rendered and exposed expected navigation/content. No authenticated account was used. |
| Standalone type check | **Not available** | No dedicated type-check command is defined in `package.json`; build/lint are not a substitute for an independent type check. |
| Live Supabase/RLS integration | **Not tested** | Local integration test skipped; no live schema or cross-account behavior was queried. |
| Authenticated dashboard end-to-end | **Not reverified** | No test credentials/current authorized authenticated browser session were available for this audit. Historical `applications` RLS recursion is recorded in F-01. |
| Render/Vercel/GitHub Pages production | **Not tested** | Deployment configuration was statically inspected; deployment variables and service health were not queried. |
| Gemini, email/SMS, external placement feeds | **Not tested** | External credentials/services were not called. Email/SMS delivery is not implemented/configured in the inspected service. |

**Tested totals:** 348 automated test cases (347 passed, 1 skipped) and one public-page browser smoke check. The automated test runner does not provide a reliable count of distinct user-facing features, so test-case totals should not be presented as feature-coverage totals.

## Deployment and configuration assessment

- GitHub Pages workflow runs lint, tests, and build, and requires Supabase URL/publishable key plus an HTTPS API base URL as Actions variables.
- Render and Vercel deployment configurations are present. Their runtime behavior and secrets were not tested.
- `.env.example` contains placeholder values and documents frontend-public versus server-side configuration. The actual `.env` file was not read.
- Ensure deployment build variables point to the deployed API; the frontend placement service’s localhost fallback makes missing configuration especially important.
- Apply and verify migrations in a controlled environment before production. Do not infer the live migration state from repository files or test assertions.

## Recommended actions before release

1. **Resolve F-01 first:** inspect the connected Supabase migration history and `applications` policies/triggers; verify whether the rollback migration is pending or already applied. Then test student, employer, and admin dashboard loads with non-production test accounts and verify the resulting RLS policies do not recurse.
2. Run the skipped Supabase integration test against a disposable/local project with test-only credentials, then test cross-account reads/writes and private storage access.
3. Add a deployed-environment check for the frontend API URL and verify placement search reaches the intended API host.
4. Decide whether graduates may use CV analysis, and align the server-side role rule with product policy.
5. Either implement email/SMS delivery or clearly label those channels as unavailable; consider adjusting the “Remember me” control to accurately reflect session behavior.
6. Address the admin assessment route gaps and labour-market aliases, or label/disable those controls until the distinct workflows exist.
7. Add endpoint-appropriate JSON body-size limits and review telemetry/health endpoint exposure.
8. Update `docs/database.md` with the full ordered migration inventory and a safe verification/rollback procedure.
9. After these checks, run the deployment workflow and smoke-test the deployed public pages and authenticated role dashboards.

## Source references

- Routes and role routing: `src/routes/AppRoutes.jsx`, `src/routes/PublicOnlyRoute.jsx`, `src/routes/RoleRoute.jsx`, `src/contexts/AuthContext.jsx`.
- Frontend auth/session behavior: `src/services/authService.js`, `src/services/supabase.js`.
- Employer placement API URL: `src/services/internshipService.js`.
- Admin assessment/labour-market modules: `src/pages/admin/AdminModulePage.jsx`, `src/pages/admin/LabourMarketModulePage.jsx`, `src/services/adminService.js`.
- API routing and auth: `server/index.js`, `server/services/ai/aiRouteHandlers.js`, `api/index.js`.
- CORS/rate limits: `server/corsPolicy.js`, `server/rateLimitService.js`.
- Notifications: `server/services/notifications/emailService.js`, `server/services/notifications/notificationService.js`.
- Supabase migration guidance: `docs/database.md`; current rollback: `supabase/migrations/20261122000003_revert_job_publication_application_policy_changes.sql`.
- Deployment: `.github/workflows/deploy-pages.yml`, `render.yaml`, `vercel.json`, `.env.example`.
- Relevant authorization test: `tests/authorization-role-enforcement.test.js`.
