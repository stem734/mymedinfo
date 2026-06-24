# Bolt's Journal - Performance Optimization Learnings

## 2025-05-15 - Memoization of Sorted Table Data
**Learning:** In large components with many state variables (like `CardBuilder.tsx`), calling sorting or mapping functions directly in the JSX causes these expensive operations to run on every render. Even small state changes unrelated to the table data (like toggling a modal) trigger re-sorting.
**Action:** Always memoize results of `sortRows` or similar data transformation functions using `useMemo`. Ensure that the memoization hook is placed after the data and the sorting hook it depends on. Use the entire table hook object as a dependency if the sorting state is managed within it.
