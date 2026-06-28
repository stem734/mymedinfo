## 2026-06-28 - Heavy export libs leak into the eager patient-page chunk
**Learning:** Even though patient pages are `React.lazy` routes, a top-level `import { saveElementAsPdf } from '../pdfExport'` makes Rollup pull jsPDF + html2canvas (~601 kB / ~177 kB gzip) into a chunk those pages import *statically* — so it's fetched on initial page load, not when the "Download PDF" button is clicked. `React.lazy` on the route does NOT defer a heavy dependency that the route imports statically; the dependency must itself be behind a dynamic `import()`.
**Action:** For features used only on interaction (PDF export, charts, editors), import the heavy module with `await import(...)` inside the handler, not at module top level. Verify by grepping the built `dist/assets/<Page>-*.js` chunk: a static `import{...}from"./<lib>-*.js"` means it's eager; `await import("./<lib>-*.js")` means it's deferred. The patient views (ResourceView / CombinedPatientView / HealthCheckView) are the hot path — keep their initial chunks lean.

## 2025-06-14 - Eliminate Cascading Renders via Lazy State Initialization
**Performance Issue:** The `CombinedPatientView.tsx` component parsed `sessionStorage` and called `setState` inside `useEffect` on mount, triggering cascading re-renders even when the initial state was already correct. The component was computing cache values in `useMemo`, then immediately overwriting the state with the same values.

**Impact:** Extra render cycles on every page load, even when validation cache was valid. This delays paint and increases computation overhead.

**Learning:** Lazy state initializers can be more sophisticated than simple fallbacks. When a component needs to compute initial state based on multiple dependencies (isDemoMode, hasPracticeIdentifier, cachedValidation), move all that logic into the initializer function rather than delegating to `useEffect`. This eliminates the "initialize then immediately reset" pattern.

**Solution Implemented:**
1. Upgraded `isAuthorised` lazy initializer to handle isDemoMode, hasPracticeIdentifier, and cached validation in a single pass
2. Upgraded `practiceFeatures` lazy initializer to return the correct default based on isDemoMode
3. Removed redundant setState calls from useEffect that were re-setting values already initialized correctly
4. Kept setState calls in the effect only for async validation results and error states

**Result:** Eliminates one full render cycle on mount when demo mode or cached validation is present. Reduces work in useEffect setup phase, allowing browser paint to happen sooner.

**Pattern to Reuse:** When multiple pieces of state depend on the same initialization logic, prefer upgrading the lazy initializer over using useEffect to "fix up" state. This keeps state management predictable and prevents render loop overhead.
