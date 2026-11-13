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

