# Career Journey System

## Overview

The student career journey is driven by real database and profile data instead of fixed hard-coded stages. The system calculates the current stage from the student’s actual profile, skill set, portfolio evidence, applications, interviews, and employment history.

## Current stage logic

The stage is derived in the student module by evaluating the latest available records:

- Profile exists: `Exploring`
- Skills or assessments exist: `Building Skills`
- Projects or certificates exist: `Developing Evidence`
- Readiness score >= 70: `Job Ready`
- Applications exist: `Actively Applying`
- Interviews exist: `Interviewing`
- Employment records exist: `Career Development`

This logic lives in the data-driven helper used by the student journey component, so it stays aligned with real activity rather than static UI state.

## Readiness model

Career readiness is a composite score built from multiple evidence sources:

- overall readiness
- skill readiness
- education readiness
- assessment readiness
- evidence readiness
- portfolio readiness

The dashboard exposes these values and surfaces a progress bar for each category so students can see where they are strongest and what is missing.

## Workflow

1. Student completes profile and education details.
2. Student records or updates skills and completes assessments.
3. The system creates evidence through projects and certificates.
4. Career recommendations and job match insights are generated from real profile data.
5. Applications and interviews update the transfer from preparation to hiring.
6. Employment records advance the student into the development stage.

## Why this matters

This approach keeps the journey realistic, explainable, and tied to platform activity. It also prevents the UI from showing a stage that does not reflect the student’s actual operations or database state.

## Platform safeguards

- Supabase auth and RLS enforce user and role restrictions.
- Role changes are not permitted through normal student flows.
- Admin role changes must happen in a privileged administrative context.
- AI recommendations remain optional and server-side, with graceful fallbacks when external services are unavailable.

## Key files

- `src/pages/student/StudentModulePage.jsx`
- `src/services/studentService.js`
- `src/services/applicationService.js`
- `src/services/portfolioService.js`
- `server/index.js`
- `server/services/ai/aiScoringService.js`
