## 2025-05-15 - Memoizing expensive catalogue and sort operations
**Learning:** In the CardBuilder component, multiple lists were being sorted and mapped (including stringification and hashing for preview tokens) on every render. This was causing noticeable lag when interacting with the UI.
**Action:** Use useMemo for all table sorting and complex catalogue generation logic. Ensure dependency arrays include both the raw data and any UI state that affecting the output (like sort settings).
