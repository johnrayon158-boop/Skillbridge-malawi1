# AI Governance, Fairness, Explainability and Responsible AI

## Overview

The SkillBridge Malawi AI system uses a hybrid architecture: deterministic platform logic remains the source of truth for profile, skills, labour-market and evidence-based recommendations, while AI assistance is limited to explanation and personalization when available. The project does not treat AI as the authority on jobs, careers, skills, or evidence.

## Data flow

1. Student, employer and job data are read from the existing platform tables.
2. Deterministic logic calculates recommendation scores using verified data.
3. AI validation checks input structure, entity references and score ranges.
4. A structured explanation is generated from grounded evidence only.
5. The recommendation is stored alongside audit metadata and feedback status.
6. Human users can review the recommendation and provide feedback.

## Deterministic vs AI responsibilities

Deterministic services remain responsible for:

- ranking careers and jobs
- evaluating skill gaps
- measuring readiness
- comparing labour-market demand against real job data
- validating known entities and score ranges

AI assistance is limited to:

- explanation phrasing
- personalization where appropriate
- optional enrichment of narrative summaries

The platform never treats AI output as the source of truth for raw data.

## Explainability

Each recommendation contains a structured explanation with:

- summary
- strengths
- partial matches
- gaps
- evidence
- factors
- next actions
- limitations

The explanation is grounded in the current SkillBridge profile and recorded evidence only. It does not invent job, education or skill facts.

## Confidence

Confidence is expressed as a clear qualitative label: High, Medium, Low or Insufficient Data.

This is based on:

- profile completeness
- assessment coverage
- evidence availability
- skill coverage
- missing-data conditions

It is not presented as a statistical certainty unless it is actually calculated from real data.

## Validation

All AI inputs and outputs are checked before use.

Input validation rejects:

- malformed profile identifiers
- empty or invalid skill references
- invalid job or career identifiers
- assessment scores outside 0-100

Output validation rejects:

- invalid career IDs
- invalid learning resources
- invalid numeric ranges
- references to unsupported entities

## Hallucination protection

The platform applies grounding rules:

- use structured database records
- verify entity IDs before display
- keep AI explanation separate from raw system data
- show deterministic scores before any AI narrative
- store recommendation results for audit and review

## Fairness and bias monitoring

Fairness monitoring is limited to lawful, relevant and already-collected data.

The system monitors:

- unexpected score differences across available groups
- missing-data effects
- inconsistent recommendation patterns
- over-reliance on a single factor

It does not claim to prove the system is unbiased. Instead, it provides monitoring and human review.

## Human oversight

AI recommendations are decision-support suggestions. Employers remain responsible for hiring decisions, and students may review and provide feedback on recommendations.

## Feedback loop

The platform accepts student and employer feedback such as:

- helpful
- not helpful
- not relevant
- wrong skill
- wrong career
- wrong learning resource

Feedback is stored without overwriting the original recommendation.

## Audit logging

AI decisions and governance events are recorded in audit logs with:

- feature type
- recommendation identifier
- user identifier where appropriate
- deterministic score
- AI score if available
- confidence label
- explanation
- validation status
- timestamp

No secret or authentication material is stored.

## Security and access control

- AI API keys remain server-side only.
- AI endpoints are access-controlled through the existing platform authorization model.
- Students can view their own recommendation records and feedback.
- Employers can view only authorized candidate or job information.
- Admins can review AI monitoring and governance records according to platform permissions.

## Failure handling

If the AI provider is unavailable, the system continues using deterministic services. The UI never displays fake AI data or fabricated job or course recommendations.

## Limitations

This governance layer is a monitoring and explainability mechanism, not proof of perfect fairness or complete labour-market coverage. It is explicitly bounded by the data available in SkillBridge and does not claim to represent the entire Malawi labour market unless representative external data is added in the future.
