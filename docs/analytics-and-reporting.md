# Analytics and Reporting

## Overview

SkillBridge analytics are intentionally built on real platform data and are designed to remain explainable, permission-aware, and conservative when data is incomplete. Every metric either comes from existing records or is clearly marked as insufficient data.

## Architecture

The analytics layer is centralized under `server/services/analytics/` and reuses the existing tables already used in the student, employer, admin, labour-market, and AI modules. The service layer is intentionally separate from frontend rendering so the same logic can be reused by dashboards and reports.

## Student analytics

Student analytics summarize:

- overall career readiness
- skill development and growth
- assessment summaries
- learning progress and active paths
- portfolio and certificate growth
- application counts and conversion signals
- interview and offer progress

These calculations use the student’s actual profile, career progress, applications, learning, and portfolio data.

## Employer analytics

Employer analytics summarize:

- active jobs and closed jobs
- application funnel metrics
- shortlisting, assessment, interview, and offer counts
- recruitment conversion rates
- organization-scoped performance summaries

The platform intentionally restricts employer-visible data to that employer’s authorized records.

## Admin analytics

Admin analytics provide aggregate views of:

- total users
- jobs and applications
- interviews and offers
- employment records
- skills and careers
- AI recommendations and monitoring signals

Administrative metrics remain high-level and avoid exposing individual private user details.

## Reports

Reporting is generated from the real stored data using the centralized report service. Reports include:

- report title
- generated timestamp
- selected filters
- dataset notes and limitations
- CSV export output

## Data quality and integrity

- missing data is not silently turned into zero
- rates are only shown when valid denominators exist
- date filters support today, 7 days, 30 days, 90 days, year, previous year, and custom windows
- any insufficient result is labelled clearly as “Insufficient data”

## Privacy and access

- student analytics are scoped to the current student
- employer analytics are scoped to the employer’s organisation
- admin analytics are platform aggregate views only
- private messages and authentication secrets are never included in analytics output

## Performance notes

Analytics are organized as reusable server-side calculations rather than repeated browser-side aggregation. This keeps the frontend efficient while preserving a single source of truth for calculations.
