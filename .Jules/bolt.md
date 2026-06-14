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
