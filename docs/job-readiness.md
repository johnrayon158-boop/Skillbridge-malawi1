# Job readiness

This page estimates the likely readiness of a student for a published role based on real skill alignment and recent performance evidence.

## Inputs
- Job skill requirements
- Student skill profile
- Assessment completion and outcomes
- Portfolio and project evidence

## Output
The readiness panel returns a score, an overlap count and a clear set of next actions. This gives the student a practical step list before applying or interviewing.

## Limitations
Job readiness is a supporting decision tool, not a hiring verdict. It helps students prepare strategically while the actual employer decision remains separate.

## Employer match analysis
Employer match scores use the same deterministic evidence-based calculation and are stored per candidate and opportunity. Changes to candidate skills, education, employment, assessment results, projects, portfolio evidence, job requirements or employer industry mark affected scores as pending. The next student match refresh or employer candidate review recalculates pending and missing results; completed and unavailable results are reused until relevant data changes.

Each saved match records its status (`pending`, `completed` or `unavailable`), reason and last calculation timestamp. The employer review displays the reason when a calculation is pending or unavailable. Scores are advisory evidence only and must not make or replace a hiring decision.

Apply the `20261115000001_recalculate_employment_matches.sql` migration to enable match state tracking and automatic invalidation.
