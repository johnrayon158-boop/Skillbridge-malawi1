# SkillBridge Malawi Controlled Fix Report

**Run date:** 2026-11-19

**Execution status:** Stage 1 implementation prepared; live database verification pending. Stage 2 changes are implemented and repository checks pass, but its new database function has not been applied. Stages 3–5 have not been started.

## Stage 1 — Supabase application RLS recursion (F-01)

### Root cause

The application policies in the previously supplied SQL check a caller’s role by querying `public.profiles` directly. The authorization migration also adds profile policies that query `public.applications` to determine employer candidate visibility. An application-policy read of `profiles` can therefore re-enter the application policies and produce PostgreSQL `42P17` recursion.

The role-enforcement migration already uses `SECURITY DEFINER` helpers for employer and admin checks, but the student application path did not have an equivalent helper. `owns_student()` only compares the authenticated user ID with the candidate ID; it does not establish that the account is a student.

### Fix prepared

Added `supabase/migrations/20261122000004_application_rls_recursion_fix.sql`. It:

- Adds `current_user_is_student()`, a narrowly scoped `SECURITY DEFINER` helper, and uses it from application policies instead of querying `profiles` in those policies.
- Rebuilds student application select/insert and employer application-read policies. Employer access remains limited to applications for that employer’s jobs; an employer cannot read an application whose candidate ID is the employer ID.
- Keeps the existing admin-all policy intact.
- Replaces `can_access_application()` so the student, employer, and admin branches require the appropriate role/ownership. This also protects dependent application-event, interview, offer, and stage-progress policies.
- Restores a server-side insert trigger that rejects non-student candidate identities and self-applications.
- Keeps application status changes on the standardized RPC workflow: direct employer-update and student-withdraw policies are not recreated. Student withdrawal and offer-response RPCs now also verify the caller’s student role.
- Does not alter table structure, delete or rewrite records, or change job publication objects.

### Existing rollback review

The existing `20261122000003_revert_job_publication_application_policy_changes.sql` was **not applied**. It is broader than an application-RLS repair: it drops the employer publication guard/RPC and candidate-eligibility trigger, and replaces `can_access_application()` with a student branch that checks identity but not student role. The new migration re-establishes application eligibility and role-scoped access after that rollback if both migrations are later applied in filename order. It does not restore the publication guard, consistent with the earlier request to undo that publication change.

The rollback migration and its test were left untouched. Because both migration files are present in the migrations directory, a future migration push may include both; review the desired publication behavior and the migration history before applying either to any database.

### Files modified for Stage 1

1. `supabase/migrations/20261122000004_application_rls_recursion_fix.sql` — new forward migration.
2. `tests/authorization-role-enforcement.test.js` — static regression assertions and local integration assertions for the student-role helper, cross-account insertion, and self-application rejection.
3. `SKILLBRIDGE_MALAWI_FIX_REPORT.md` — this Stage 1 report.

Pre-existing, unrelated-to-this-edit untracked files `supabase/migrations/20261122000003_revert_job_publication_application_policy_changes.sql` and `tests/employer-publication-rollback.test.js` were not modified.

### Tests and verification

| Check | Result |
|---|---|
| Targeted authorization/status/rollback tests | **8 passed, 0 failed, 1 skipped** |
| Full `npm test` | **349 total; 348 passed, 0 failed, 1 skipped** |
| `npm run lint` | **Passed** |
| `npm run build` | **Passed** |
| Local RLS integration | **Skipped** because local Supabase test URL/service/anon variables were unavailable |
| SQL migration execution | **Not run**; neither `psql` nor the Supabase CLI is installed in this environment |
| Live database policy/history inspection | **Not run**; no production database was accessed |

The regression tests verify the migration’s policy/helper shape and the local integration test now covers role and ownership cases, but the integration test did not execute. Therefore the code-level repair is prepared and repository checks pass; **F-01 is not yet verified as fixed in the connected or deployed database**.

### Required verification before proceeding

1. Apply the migration sequence only to a disposable/local Supabase project with test-only credentials. Confirm how the pending rollback and new fix appear in migration history before pushing.
2. Run `tests/authorization-role-enforcement.test.js` with the local-only test variables set. The test refuses non-local Supabase hosts.
3. Verify student access to their own applications, denial of cross-account reads/inserts, employer access only to applications for owned jobs, admin access, and rejection of employer/student self-application attempts.
4. Confirm the `applications` policies contain no direct profile-table role query and that authenticated dashboard queries no longer return `42P17`.
5. Only after those checks pass should Stage 1 be marked verified. Stage 2 proceeded at the user's direction while this verification remains pending.

## Stage 2 — Frontend and backend findings

Stage 2 addresses F-02, F-03, F-04, F-05, and F-08. Changes were limited to these paths and their tests; no production accounts or data were used.

### F-02 — Administrator assessment create/edit routes

- **Root cause:** The create and edit routes redirected to the assessment directory/detail view. The admin service had no assessment-save operation.
- **Fix:** The routes now open an assessment editor with multiple-choice question management. Saves call the admin-only `admin_save_assessment` RPC. New records are always drafts; edits preserve status, published assessments must first be moved to draft, and questions are locked after attempts or when the editor cannot safely represent their question type. Publishing remains a separate status action and requires at least one question.
- **Files:** `src/pages/admin/AdminModulePage.jsx`, `src/services/adminService.js`, `src/utils/assessmentEditorValidation.js`, `supabase/migrations/20261122000005_admin_assessment_editor.sql`, `tests/assessment-editor-validation.test.js`.
- **Tests:** Draft validation, answer-option validation, route wiring, admin-only RPC access, draft-only creation, protected editing, and the separate question-required publish path are covered by automated tests.
- **Verification:** Repository tests, lint, and build pass. The new SQL function was not applied or exercised against Supabase; database behavior remains unverified.

### F-03 — Labour-market sections

- **Root cause:** Every labour-market route rendered the same overview and called `getOverview()`.
- **Fix:** Skills, careers, sectors, jobs, trends, and reports now load separate service methods and display section-specific content. The existing filters are passed through to each section; the overview remains unchanged.
- **Files:** `src/pages/admin/LabourMarketModulePage.jsx`, `src/services/labourMarketService.js`, `src/utils/labourMarketSections.js`, `tests/labour-market-sections.test.js`.
- **Tests:** Route-to-service selection, filter forwarding, and explicit handling of unknown sections are covered.
- **Verification:** Targeted and full automated tests, lint, and build pass.

### F-04 — Production API URL resolution

- **Root cause:** API clients had inconsistent URL selection; some fell back to `http://localhost:4000` in production.
- **Fix:** A shared resolver prioritizes `VITE_API_BASE_URL`, supports the legacy `VITE_AI_API_URL`, uses the browser host on local development, rejects loopback or non-HTTPS production configuration, and preserves the documented same-origin API behavior for Vercel when the variable is unset. Static hosting still requires its public API URL.
- **Files:** `src/utils/apiBaseUrl.js`, `src/services/adminService.js`, `src/services/aiService.js`, `src/services/aiGovernanceService.js`, `src/services/skillService.js`, `src/services/internshipService.js`, `tests/api-base-url.test.js`, `README.md`.
- **Tests:** Configured URL precedence, development host selection, production loopback/insecure URL rejection, and the Vercel same-origin fallback are covered. A source search found no localhost API fallback in `src`.
- **Verification:** Targeted and full automated tests, lint, and build pass.

### F-05 — Remember Me

- **Root cause:** Supabase was configured to persist every session in local storage. Calling `setSession()` after sign-in did not change the storage medium.
- **Fix:** Supabase now uses an adapter that stores remembered sessions in local storage and temporary sessions in session storage. It infers the storage mode when restoring a session, keeps refreshed temporary sessions temporary, and removes both copies on sign-out.
- **Files:** `src/utils/authStorage.js`, `src/services/supabase.js`, `src/services/authService.js`, `tests/auth-storage.test.js`.
- **Tests:** Remembered/temporary storage, storage switching, session restoration, refresh persistence, and clearing on sign-out are covered.
- **Verification:** Automated storage tests, full suite, lint, and build pass. A live Supabase sign-in/session-refresh flow was not run.

### F-08 — Graduate CV-analysis eligibility

- **Root cause:** The CV-analysis gate allowed only `profile.role === 'student'`, despite its error message and other AI handlers allowing graduate accounts. In the current schema, graduates are normally student-role accounts with `student_profiles.candidate_type = 'graduate'`; those accounts already passed the old role check. The mismatch affected any supported/legacy profile whose role is explicitly `graduate` and left candidate eligibility implicit.
- **Fix:** CV analysis now uses an explicit eligibility helper that allows student and graduate roles and the supported student/graduate candidate types, while rejecting unrelated roles. No profile-role constraint or database structure was changed.
- **Files:** `server/index.js`, `server/services/ai/cvAnalysisEligibility.js`, `tests/cv-analysis-eligibility.test.js`.
- **Tests:** Student candidates, graduate candidates, legacy graduate roles, and ineligible roles/types are covered.
- **Verification:** Targeted and full automated tests, lint, and build pass.

### Stage 2 verification and limitations

| Check | Result |
|---|---|
| Full `npm test` | **365 total; 364 passed, 0 failed, 1 skipped** |
| `npm run lint` | **Passed** |
| `npm run build` | **Passed** |
| `git diff --check` | **Passed** |
| Local RLS/Supabase integration | **Skipped** because local test credentials/services were unavailable |
| Assessment RPC migration execution | **Not run**; no local database/SQL CLI is available |
| Live Remember Me/auth or admin UI flow | **Not run**; no test account/browser integration was used |
| Separate type-check command | **Unavailable**; the project has no configured type-check script |

### Database migration created

- `supabase/migrations/20261122000005_admin_assessment_editor.sql` adds the `admin_save_assessment` security-definer RPC and grants execution to authenticated users, with an explicit administrator check. It uses existing assessment tables; it adds no tables or columns and changes no records by itself.
- This migration was not applied. The pending `20261122000003` rollback and `20261122000004` RLS migration are also unapplied; review the migration history and desired publication behavior before pushing any of these files.

### Deployment configuration

- GitHub Pages requires the Actions variable `VITE_API_BASE_URL` to contain the deployed API's HTTPS URL; the existing deployment workflow enforces this.
- GitHub Pages also requires the Actions variable `VITE_SUPABASE_PUBLISHABLE_KEY`; the latest deployment attempt stopped at configuration validation because this variable was empty. It is a client-side publishable key, not a service-role credential.
- Vercel can leave `VITE_API_BASE_URL` unset to use its same-origin `/api` function. For a separately hosted API, set the public HTTPS URL and configure the backend CORS allowlist.
- Keep all service-role and AI-provider credentials on the backend; do not expose them through `VITE_` variables.

### Student/graduate connection-error investigation

The attached screenshots show the frontend running at `http://192.168.1.200:5173`.

- The local API was reachable on port 4000, but its development CORS allowlist did not include the LAN origin. A direct preflight from `http://192.168.1.200:5173` to port 4000 returned **403**.
- Most browser API clients used a development fallback to port 4000 directly, bypassing the existing Vite `/api` proxy. This caused the browser to surface CORS rejections as the generic `Connection problem`.
- **Fix:** development API clients now use the Vite same-origin URL, even if a production `VITE_API_BASE_URL` is configured. Vite proxies both `/api` and `/health` to the local API, removing the cross-origin browser request. Production URL resolution is unchanged.
- **Verification:** the active LAN Vite server's `/health` proxy returned **200** with the local API status `ok`; the focused API URL/CORS tests passed (**7/7**), lint passed, and the production build passed. Signed-in feature flows were not exercised.

Restart `npm run dev -- --host 0.0.0.0` and refresh the student/graduate pages to load the updated client and Vite proxy configuration.

### Separate GitHub Pages/Render deployment blocker

This is separate from the LAN screenshots, but blocks the public GitHub Pages deployment:

- The GitHub Pages URL returned **404** when checked. The latest `Deploy to GitHub Pages` run stopped at deployment configuration validation because `VITE_SUPABASE_PUBLISHABLE_KEY` was empty; lint, tests, build, and upload were not reached.
- The configured API's public `/health` endpoint returned `cors.allowedOrigins: []` and rate-limit storage status `unavailable` / `not_configured`. An `OPTIONS` request from `https://johnrayon158-boop.github.io` to the CV-analysis API returned **403** without `Access-Control-Allow-Origin`.
- The checked-in `render.yaml` declares the expected GitHub Pages origin, but the running backend configuration does not reflect it.

To restore the public deployment, add `VITE_SUPABASE_PUBLISHABLE_KEY` as a GitHub Actions repository variable, set `CORS_ALLOWED_ORIGINS` to `https://johnrayon158-boop.github.io` in Render, and configure backend-only `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `GEMINI_API_KEY`. Redeploy and verify the CORS allowlist and operational shared rate limiting. Do not paste keys into chat; service-role and AI-provider keys must remain backend-only. These hosting settings cannot be applied from this workspace, and weakening production CORS or rate-limit protections is not a safe workaround.

## Remaining work

- **Stage 1:** live/local Supabase migration and RLS verification is pending.
- **Stage 2:** F-02 through F-05 and F-08 are implemented and pass repository checks; live database/auth verification and applying the new RPC remain pending.
- **Student/graduate LAN connection error:** code fix is implemented and local proxy transport is verified; signed-in feature flows still need user verification after restarting `npm run dev`.
- **Public GitHub Pages deployment:** GitHub Actions and Render configuration updates plus deployment verification remain pending.
- **Stage 3 (not started):** F-06 email/notification provider integration.
- **Stage 4 (not started):** F-07, F-09, F-10, F-11, F-12, F-13, F-14, and F-15.

No migrations were applied to a database. No production accounts, secrets, or production records were used or changed.
