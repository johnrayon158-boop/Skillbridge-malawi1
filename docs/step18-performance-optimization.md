# Step 18 — Performance & Low-Bandwidth Optimization

## Objective

Keep the current SkillBridge Malawi architecture intact while reducing unnecessary client loads, improving route startup, lowering repeat network work, and adding a basic low-bandwidth mode for slower connections.

## What was implemented

### 1. Route-level code splitting

The app now lazy-loads the main role modules and public pages through React.lazy and Suspense in [src/routes/AppRoutes.jsx](../src/routes/AppRoutes.jsx). This prevents the entire application bundle from loading on first paint for every user and keeps route-heavy screens isolated into smaller chunks.

### 2. Cache-backed data fetching for common lists

The most frequently reused reference data now uses lightweight in-memory caching in [src/utils/performanceCache.js](../src/utils/performanceCache.js). The job and skill services now cache list responses for a short TTL so repeated filters, list refreshes, and navigation do not keep re-fetching the same data.

- [src/services/jobService.js](../src/services/jobService.js)
- [src/services/skillService.js](../src/services/skillService.js)

### 3. Low-bandwidth mode and connection awareness

A network-aware preference is available in the student settings flow through [src/components/ui/LowBandwidthToggle.jsx](../src/components/ui/LowBandwidthToggle.jsx) and [src/hooks/useNetworkStatus.js](../src/hooks/useNetworkStatus.js). It checks online status, effective connection type, and a saved user preference so the client can gracefully adapt when connectivity is constrained.

This is surfaced in the student profile/settings screen in [src/pages/student/StudentModulePage.jsx](../src/pages/student/StudentModulePage.jsx).

### 4. Search and list optimizations

The jobs and skills list query pattern has been narrowed to only the necessary fields and supports a limited, filtered range instead of retrieving every matching item at once. This avoids large list payloads on dashboard-heavy screens.

## Verification

The app was verified with the project’s existing checks after the optimization changes:

- 46 tests passed
- 0 failed
- Vite production build succeeded
- ESLint passed

The proof command was:

npm test && npm run build && npm run lint

## Notes

This optimization pass intentionally preserves the current product and data model. It does not add a second database, remove role protections, or redesign the existing architecture. It focuses on the highest-value wins available in the current system: route splitting, list caching, connection-aware client behavior, and reduced payload sizes.
