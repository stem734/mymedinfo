## 2025-05-15 - Memoizing expensive catalogue and sort operations
**Learning:** In the CardBuilder component, multiple lists were being sorted and mapped (including stringification and hashing for preview tokens) on every render. This was causing noticeable lag when interacting with the UI.
**Action:** Use useMemo for all table sorting and complex catalogue generation logic. Ensure dependency arrays include both the raw data and any UI state that affecting the output (like sort settings).

## 2025-05-15 - Fixing CI failures while optimizing
**Learning:** Even if a performance task doesn't touch certain files, CI might fail due to pre-existing linting errors in those files (like unused variables). destructuring with ignored variables (prefixed with _) might still trigger unused variable errors depending on the ESLint config.
**Action:** Always check the full lint output even for untouched files if CI is failing. Using Object.fromEntries with a filter is a safe way to omit specific keys from an object without declaring unused variables.
