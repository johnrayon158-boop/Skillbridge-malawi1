# Skill Taxonomy and Matching Intelligence

## Overview

SkillBridge uses a canonical skill model to reduce duplicate entries and improve matching quality across student skills, jobs, careers, assessments, projects and labour-market analytics.

## Core principles

- Canonical skills are the single source of truth for skill identity.
- Aliases and common terms are mapped to a canonical skill without deleting the original employer or user wording.
- Related skills are tracked separately from exact matches.
- Parent and child relationships are used for broad competency analysis.
- Proficiency remains standardized across the platform using a 1-5 scale.
- New and unclassified legacy skills remain pending until an administrator reviews them.
- Student and employer selectors expose only active, approved, non-internal skills.

## Curated categories

The shared catalog uses these cross-sector categories:

- Information Technology and Software Development
- Graphic Design and Creative Arts
- Business and Management
- Accounting and Finance
- Health and Medical Sciences
- Agriculture and Environmental Sciences
- Education and Teaching
- Engineering and Technical Trades
- Communication and Media
- Hospitality and Tourism
- General and Transferable Skills

## Catalog review and visibility

- Administrators can search the catalog, review pending entries, correct names/categories/descriptions, approve or reject them, and archive records without deleting their relationship IDs.
- PDF-imported skills are proposals; each needs an administrator-written, meaningful description and stays hidden until approved.
- Catalog submissions and administrator decisions are recorded in `skill_catalog_review_events`, including the actor when the change comes from an authenticated administrator.
- New PDF imports record their `source_type`; legacy rows have unknown provenance and remain labelled `legacy` rather than being attributed to an unverified source.
- Duplicate punctuation variants are normalized, and a database uniqueness guard prevents new visible duplicates.
- Confirmed internal or contaminated rows are archived and hidden rather than deleted, preserving existing relationship IDs.
- Before the curated cleanup migration changes catalog rows, it stores the original skill rows and the affected duplicate job-skill rows in the restricted `skill_catalog_migration_backup` table.
- Database policies hide pending, rejected, archived, and internal skill records from public catalog reads. Writes that add skills to student profiles or job requirements must reference an active, approved skill.
- Draft jobs may be saved without skill requirements, but publication requires at least one active, approved, non-internal required skill; preferred skills do not satisfy that rule.
- Existing uncertain records are preserved as pending for administrator review; the migration does not rewrite user, job, career, assessment, or portfolio relationships.
- Stored recommendation and recruiter-match skill labels are filtered against the approved catalog when read; stale explanations are replaced if they include a hidden skill label.

## Proficiency model

1. Beginner
2. Basic
3. Intermediate
4. Advanced
5. Expert

This is used consistently across:

- student skill records
- career requirements
- job requirements
- assessments
- project evidence
- employer skill expectations

## Normalization rules

- Trim whitespace
- Lowercase values before comparison
- Remove punctuation noise
- Map known aliases such as `JS` to `JavaScript`
- Map `MS Excel` and `Excel` to `Microsoft Excel` when appropriate
- Allow human confirmation before creating a new canonical skill when a possible duplicate exists

## Relationship types

- exact
- alias
- related
- parent
- child
- different

## Matching weights

The matching weights are centralized in `server/services/matching/matchingConfig.js` so they are easy to adjust without scattering constants throughout the app.

## Evidence integration

Skill matching does not assume that a declared skill is fully verified. Evidence strength and proficiency are evaluated together, allowing partial matches and evidence-aware gap analysis to remain explainable.

## Security and integrity

- Student data remains limited to their own skill records.
- Employer skill editing remains restricted to their own jobs.
- Admin-only changes are allowed for taxonomy updates.
- Historical records remain intact; skills are deactivated instead of deleted when duplicates are resolved.

## Testing coverage

The matching system is validated with focused tests covering:

- exact and partial matches
- alias handling and normalization
- parent/child logic
- optional and mandatory skill penalties
- duplicate detection and evidence-aware matching
