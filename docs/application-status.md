# Application status workflow

Applications use one current status from this lifecycle:

`Applied → Under review → Shortlisted → Assessment → Interview → Offer → Accepted`

Employers may also record `Rejected`, `Expired`, or `Position closed`; students may withdraw an open application or respond to an offer with `Accepted` or `Offer declined`. Terminal statuses cannot be reopened. An interview may be scheduled from an active review stage, which moves the application to `Interview`.

Legacy values are normalized by the migration: `saved`, `interested`, `preparing`, and `submitted` become `Applied`; `viewed` becomes `Under review`; `second_interview` becomes `Interview`; `selected` and `hired` become `Accepted`. Existing application events are preserved, and status normalization adds an event rather than deleting history.

The migration `20261114000001_standardize_application_statuses.sql` enforces valid transitions, records each status change once, routes status notifications, limits direct application/offer writes, and supplies RPCs for employer updates, interview scheduling, offer creation, student offer responses, and withdrawals. It also enforces one pending offer per application. Apply it through the normal Supabase migration process; do not run it against production before backing up and reviewing any conflict IDs it reports.

Dashboard counters describe current application statuses. An outstanding offer is an application currently in `Offer`, not every historical offer row. Interview summaries use actual scheduled or rescheduled interview records and their scheduled times. Analytics expose current status counts separately from historical application events.
