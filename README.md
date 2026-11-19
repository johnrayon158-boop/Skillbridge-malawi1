# skillbridge-malawi

## Deploy the frontend to GitHub Pages

This repository includes a GitHub Actions workflow that builds and deploys the Vite frontend when changes are pushed to `main`. The site URL is:

<https://johnrayon158-boop.github.io/Skillbridge-malawi1/>

Before the first deployment:

1. Deploy the Node API separately using the repository's `render.yaml`: in Render, create a **Blueprint** from this repository and provide the requested Supabase service-role key and Gemini API key as secret environment values. Render will provide the API's public HTTPS URL.
2. In **Settings → Secrets and variables → Actions → Variables**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` (the Supabase publishable/anon key; never use a service-role key)
   - `VITE_API_BASE_URL` (the Render HTTPS URL, without a trailing slash)
3. In **Settings → Pages**, set the build and deployment source to **GitHub Actions**.
4. In Supabase Authentication URL settings, allow the site URL above and the redirect URL `https://johnrayon158-boop.github.io/Skillbridge-malawi1/reset-password`.
5. Push to `main`, or run **Deploy to GitHub Pages** from the repository's Actions tab. The workflow runs lint, tests, and the production build before deploying.

The Render blueprint configures the API CORS allowlist for the GitHub Pages origin and uses Render's health check at `/health`. GitHub Pages hosts only the static frontend; it does not run this repository's Node server. Frontend `VITE_` values are included in the public build, so do not put server secrets such as service-role keys or AI provider keys in GitHub Actions variables prefixed with `VITE_`.

## Run locally

Run `npm run dev -- --host 0.0.0.0` to start the frontend and API together. In development, browser API clients use the same-origin Vite proxy, which forwards `/api` and `/health` requests to the local API even when a production `VITE_API_BASE_URL` is configured. This also lets the app work from another device on the same network without adding that device's address to the API CORS allowlist.

## Deploy frontend and API to Vercel

The Vercel deployment uses the Vite static build plus the shared Node.js function in `api/index.js`; `vercel.json` rewrites nested `/api/*` routes to this function while preserving their original paths. It does not start the standalone server process. Browser API clients use same-origin routes when `VITE_API_BASE_URL` is unset; this is intended for Vercel's API function. Static hosting such as GitHub Pages must configure the public API URL.

Set these Vercel environment variables for the required environments, then redeploy:

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the browser client. Never use a service-role key for either variable.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `GEMINI_API_KEY` for the server function. Keep these server-only and do not prefix them with `VITE_`.
- `RATE_LIMIT_HASH_SECRET` as a random secret.
- `CORS_ALLOWED_ORIGINS` for any custom domains or external frontend origins. Vercel preview and production project domains are added from Vercel's runtime environment.

Leave `VITE_API_BASE_URL` unset to use the Vercel API function. If the frontend uses a separately deployed Render API instead, set `VITE_API_BASE_URL` to that API's public HTTPS URL and add the exact Vercel frontend origin(s) to the Render API's `CORS_ALLOWED_ORIGINS`. The Vercel API health check is available at `/api/health`.

