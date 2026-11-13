# AI interview preparation

This feature pulls role requirements and the student profile into a single preparation view. The backend generates a structured interview plan using the current job requirements, candidate skills, and evidence available in the platform.

## What it uses
- Published work opportunities from the jobs table
- Student skills from the user skill profile
- Assessment outcomes and portfolio evidence
- Gaps that are already identified by the career recommendation engine

## How it works
1. Read the selected job requirements and skill list.
2. Match them against the student skill profile.
3. Score the current readiness signal.
4. Generate technical, behavioural, situational and project-based questions.
5. Suggest revision topics to improve confidence before the interview.

## Design rule
The system does not invent skills; it only uses data already stored in Supabase or the request payload. If the data is missing, it falls back to a generic preparation message instead of making a false claim.
