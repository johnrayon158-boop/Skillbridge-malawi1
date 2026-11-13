# Labour Market Intelligence

This module analyses live job data already stored in SkillBridge rather than inventing market statistics.

## Scope

- Calculate skill demand from active jobs and `job_skills`
- Rank career demand from current role postings
- Measure sector, location and qualification demand
- Track month-over-month demand trends only when consecutive monthly data exists
- Return `Insufficient data` when the dataset is too thin to be reliable

## Data sources

The module reads from the existing tables already used by the application:

- `jobs`
- `job_skills`
- `skills`
- `careers`
- `employer_profiles`

## Guardrails

- No fabricated employer salaries, vacancy counts or pay bands
- No new database tables or duplicated stored data
- No automatic assumptions when a role or skill is not recorded
- No service that invents market trends from a small or empty dataset

## API endpoints

- `GET /api/labour-market/overview`
- `GET /api/labour-market/skills`
- `GET /api/labour-market/careers`
- `GET /api/labour-market/sectors`
- `GET /api/labour-market/trends`
- `POST /api/labour-market/student-insights`

These endpoints are intentionally conservative and return a clear `Insufficient data` summary if there is not enough real job information.

The Admin Labour Market view paginates through all matching published jobs, excludes expired postings from active-demand calculations, and clearly distinguishes query failures from empty results. Filters are applied together; analytics reflect SkillBridge postings only and should not be interpreted as national labour-market estimates.
