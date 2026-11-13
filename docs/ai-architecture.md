# SkillBridge Malawi AI architecture

## Overview

The AI layer is intentionally hybrid: deterministic platform scoring handles the real data, while Gemini can provide optional explanation and personalization when configured. The app never exposes API keys in client-side code.

## AI design principle

The project uses this flow:

1. Read the real student, job, and career data from Supabase.
2. Run deterministic scoring across matching factors.
3. Validate the result.
4. Optionally enrich the explanation through Gemini.
5. Store the recommendation result and allow feedback.

This keeps the system transparent and explainable.

## Services

### Deterministic scoring

The scoring logic is implemented in `server/services/ai/aiScoringService.js` and is the default source of truth. It computes:

- Career recommendation scores
- Skills-gap analysis
- Learning recommendations
- Job match scores
- Job readiness
- Career roadmap steps
- Career comparison summaries

### Gemini integration

Gemini is called server-side only. Generate Content responses are read from `candidates[].content.parts[].text`; Interactions responses are read from `steps[].content[].text`, with URL citations taken from their annotations. The shared AI response parser validates feature-specific JSON schemas and retries malformed output once with a correction prompt.

## Data sources

The AI layer uses existing platform tables, including:

- `profiles`
- `student_profiles`
- `education`
- `skills`
- `user_skills`
- `skill_evidence`
- `careers`
- `career_skills`
- `career_recommendations`
- `career_feedback`
- `career_roadmaps`
- `assessments`
- `assessment_results`
- `learning_resources`
- `learning_progress`
- `projects`
- `job_matches`
- `jobs`
- `job_skills`
- `ai_recommendations`
- `ai_feedback`

## Privacy and security

- No API keys are exposed in frontend code.
- AI requests are server-side only.
- Only the minimum required profile and competency information is included in prompts.
- Students can only access their own recommendation records.
- Admins can monitor recommendation and feedback records without exposing student data unnecessarily.

## Failure handling

Career recommendations, learning suggestions, skill gaps, and job matches use validated deterministic scoring and can be recomputed if a scorer returns malformed data. Career chat returns structured profile-based guidance or a public-feed job-search fallback when Gemini is unavailable. CV analysis keeps its deterministic evidence score and saves structured deterministic guidance if Gemini output is unavailable or invalid.

Chat and CV history responses normalize legacy records and skip or repair malformed entries. Provider failures are logged with technical status and response identifiers only; prompts, chat messages, and CV contents are not logged.

## Recommendation outputs

Each recommendation includes:

- overall score
- skill match details
- strong skills
- developing skills
- missing skills
- explanation
- next step

This keeps the results explainable and auditable.
