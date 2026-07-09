## 2026-07-09 - [Component Memoization in Dashboards]
**Learning:** Large sub-components like `PracticeUserManagement` (~900 lines) that receive stable props (`practices`) will redundantly re-render on every keystroke in a parent dashboard's search input. Memoizing these components significantly improves UI responsiveness during filtering.
**Action:** Always wrap large, data-driven sub-components in `React.memo` when they are hosted within parent components that manage frequent UI state (search, toggles, etc.).
