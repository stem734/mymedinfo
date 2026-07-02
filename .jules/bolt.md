# Bolt's Journal - Performance Learnings

## 2025-05-15 - Optimizing Data-Heavy Admin Dashboard
**Learning:** In components that handle large lists (like `practices` in `AdminDashboard.tsx`), performing O(N) filtering and derived statistics calculations on every render noticeably impacts UI responsiveness, especially during text input.
**Action:** Always use `useMemo` for O(N) transformations of large data sets. Combine `useDeferredValue` with `useMemo` for search inputs to ensure keystrokes remain fluid while the list filtering happens asynchronously. Ensure conditional returns are placed after these hooks to satisfy React's Rules of Hooks.
