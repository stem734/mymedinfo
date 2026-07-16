# Bolt's Performance Journal

## 2025-03-05 - Dashboard Search Allocation & Short-Circuit Optimization
**Learning:** Frequent React rendering loops that execute multi-field search filtering (e.g., using `[val1, val2, val3].some(v => v.toLowerCase().includes(query))`) suffer from constant garbage collection pressure and CPU overhead due to allocating temporary arrays and unconditionally converting all fields to lowercase on every single item in the collection, even after a match is found.
**Action:** Avoid allocating temporary array objects inside loop iterations. Replace `.some(...)` array checks on search criteria with explicit short-circuiting logical boolean operators (`||`), and execute `.toLowerCase()` lazily so that evaluation stops as soon as a match is found.
