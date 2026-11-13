# Step 19 — UI/UX Audit Checklist

This checklist records verified issues from the shared UI surfaces inspected for Step 19. It is an implementation checklist, not a claim that every individual page or browser has been visually tested.

## Verified issues

- [x] Starter-template styles remained in `src/App.css`; confirmed unreferenced and removed.
- [x] Global styles have only a few brand variables and no shared focus-visible or reduced-motion rules.
- [x] Shared buttons/cards use large radii inconsistently with compact operational UI; button variants lack a destructive state and disabled-state styling.
- [x] Desktop sidebar exposes long, flat role-specific navigation lists; admin navigation is particularly dense.
- [x] Mobile bottom navigation always shows student destinations, including for employer and admin accounts.
- [x] Header included a search-looking element that was not an input/action and a notification icon without an action.
- [x] Landing page includes a hard-coded named candidate and sample scores, which can be mistaken for live platform data.
- [x] Landing page header has no accessible mobile navigation for its About/Features/For Employers links.
- [x] Login form provides labels and loading/error states, but no password visibility control and errors are not announced as an alert.
- [x] Profile dropdown has no outside-click/Escape dismissal and its trigger does not expose expanded state.

## Implementation checklist

- [x] Establish shared semantic tokens and keyboard/reduced-motion defaults.
- [x] Tighten shared button/card primitives and make destructive/disabled states explicit.
- [x] Make mobile role navigation reflect the authenticated role and provide access to every role route.
- [x] Remove misleading decorative controls or give them real destinations/actions.
- [x] Replace sample personal metrics on the public landing page with a non-personal platform journey preview.
- [x] Make the landing-page navigation usable on narrow screens.
- [x] Improve authentication visibility and accessible feedback without changing auth behavior.
- [x] Improve profile-menu keyboard/dismissal behavior.
- [x] Restore job-list access through debounced server search and offset pagination; add retry feedback for failed list loads.
- [x] Group desktop and mobile role navigation with section labels; keep desktop navigation accessible on shorter screens with independent scrolling.
- [x] Add cache behavior regression tests and invalidate cached public job lists after employer edits.
- [x] Run lint, tests, production build, and public-route responsive browser checks; protected user journeys remain unverified.

## Scope note

The code review sampled shared layout and primitives plus the landing and login pages; the browser sweep covered public routes. A full visual walkthrough of every authenticated feature and real Supabase journey requires configured role accounts. Only the integrated Chromium browser was available; no Chrome/Edge/Firefox multi-engine result is claimed.
