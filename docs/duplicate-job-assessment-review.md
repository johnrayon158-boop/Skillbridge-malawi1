# Job and Assessment Duplicate Review

**Audit date:** 2026-11-12  
**Scope:** Read-only review of the connected Supabase database and repository seed/generation paths. No production records were changed.

## Findings

### Graphic Designer jobs

The database contains two published opportunities for **Ri designs** in **Lilongwe**:

| Record | Employment type | Posted | Closes | Applications | Other references |
| --- | --- | --- | --- | ---: | --- |
| `bdcb289f…` | Part time | 2026-10-10 | 2026-11-20 | 0 | 1 notification |
| `aa2312f7…` | Part time | 2026-10-10 | 2026-11-20 | 1 | 5 required-skill links, 1 saved-job link, 2 assessment assignments, 1 notification |

Both have the same normalized title, location, employment type, posting and closing dates. Their normalized descriptions match exactly. The second job also has an application with an interview and an offer associated with its application. The first job has no applications, saved-job records, matches, skill links, or assessment assignments.

**Recommendation:** retain `aa2312f7…`. An administrator may archive `bdcb289f…` after confirming the record; keep its notification and job row for history. Do not merge automatically.

### Graphic Designer assessments

The two published `Graphic designer Skills Assessment` records (`8d9d0c07…` and `a00d7fdf…`) both target job `aa2312f7…`, have assessment type `job`, and contain five questions. The normalized question payloads—including options and answers—are identical. Each has one job assignment and one result.

**Recommendation:** an administrator should retain one published assessment and archive the other only after review. Do not merge or delete: each result must remain attached to its original assessment record.

## Likely sources and safeguards

- The seed migration inserts only two `Demo …` jobs for the explicitly named SkillBridge Demo Employer; it does not seed either Graphic Designer job. It seeds a Graphic Designer **career**, not a job.
- The jobs table has no duplicate constraint or creator/provenance field. The editor’s stable job ID makes retries in one form session idempotent, but separate create sessions can still save identical opportunities. The records’ creation path cannot be proven from current data.
- The assessment generator inserts a new assessment and assignment. The repository’s later request-fingerprint guard is present in the connected schema, but both existing assignments have no fingerprint. Their question content is identical, consistent with duplicate generator requests before fingerprinting or another equivalent path; the database does not record enough provenance to distinguish them.
- `job_assessments` is a many-to-many relation, so an assessment can be assigned to multiple jobs. The current employer UI generates job-specific assessments and has no reuse picker.
- Existing application, interview, offer, notification, saved-job, skill, assignment, question, and result records were only counted/read. No merge, archive, or other write was performed.

## Duplicate safeguards added for review

- Job create/edit now checks for likely matches using employer, normalized title, location, employment type, posting/closing dates, and description similarity. It warns but does not block a separate vacancy; the employer must explicitly confirm that the new listing is distinct.
- The administrator Jobs and Assessments directories show possible duplicate pairs and link to each record for review. These are heuristic warnings, not automatic archive, merge, or delete actions.
- Assessment generation compares the proposed questions with assessments already assigned to that job. One exact active match prevents another copy; multiple exact legacy matches require administrator review. Similar, non-identical content requires an explicit confirmation.
- Migration `20261119000001_legacy_assessment_duplicate_guard.sql` extends the existing request-fingerprint safeguard to detect matching legacy assessment content that predates fingerprints. One matching published record is reused; multiple matching records or a non-published match raise a review-required error. It preserves all existing records, questions, assignments, and results.
- The employer interface explains that assessment records can be assigned to multiple jobs through the many-to-many relationship, while the current generator creates a separate assessment per job and has no reuse selector.

The new migration has **not** been applied to the connected database. Existing duplicate jobs and assessments remain unchanged and require an administrator to review their application, notification, assignment, and result history before archiving.

## Safe cleanup and rollout sequence

1. Before any production cleanup or migration, take a Supabase point-in-time/database snapshot and an access-controlled export of the affected job, assessment, question, assignment, application, result, notification, saved-job, and match rows.
2. Recheck current references and confirm the employer/job ownership. Do not rely on this audit snapshot alone for a later cleanup decision.
3. If administrators confirm the no-application job is redundant, archive it rather than deleting or merging it; retain its notification and other historical references.
4. For the duplicate assessments, identify the assessment to remain available, verify the assignment and result records, then archive only the redundant assessment if appropriate. Do not move or merge results.
5. Apply the new assessment guard migration, deploy the application safeguards, and run database integrity checks for preserved foreign-key references and unique request fingerprints. Do not apply a uniqueness rule to job identity fields: legitimate separate vacancies can share those details.

No backup or cleanup was executed because this session made no production data changes.
