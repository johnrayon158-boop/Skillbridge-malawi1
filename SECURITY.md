# Security hardening overview

This project keeps the existing Supabase-first architecture and adds explicit hardening around the live app without creating a second database or altering the role model.

## Current protections

- Authentication is handled through Supabase Auth and session hydration in the app auth context.
- Route access is enforced by `ProtectedRoute` and `RoleRoute` before any student, employer, or admin page is rendered.
- Database access remains governed by Supabase tables and row-level security instead of a parallel backend-only dataset.
- The Express API now applies allowlisted CORS, strict response headers, and a sliding-window rate limit for abusive traffic.
- Security and data-quality checks are exposed in the admin module under the Security Overview view.

## Configuration expectations

Set the runtime environment variables required by the app before launching in production or staging:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `CLIENT_URL` or `VITE_APP_URL` when running behind a custom frontend origin
- `PORT` for the API server if needed

## Operational guidance

- Review the admin Security Overview page regularly for configuration and protection status.
- Keep Supabase RLS policies aligned with the role model and avoid expanding access beyond the current schema design.
- Treat the backend API as untrusted input and validate all request payloads before writing to shared records.
- Prefer updating existing tables and service patterns to adding duplicate platforms or storage layers.

## Security review checklist

- Admin-only screens remain behind role checks.
- Student and employer dashboards are protected from unauthenticated access.
- API responses include protections against XSS and clickjacking-related headers.
- Sensitive environment values remain outside version control via `.env` files.
- New endpoints should continue using the existing Supabase auth and role-aware access patterns.
