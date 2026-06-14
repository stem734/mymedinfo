## 2026-06-12 - Form Accessibility Pattern
**Learning:** The application's form components (e.g., PracticeForm, LoginForm) consistently omit explicit 'id' and 'htmlFor' associations, as well as 'aria-describedby' links for help text. This is a recurring pattern that impacts screen reader accessibility across the project.
**Action:** When modifying or creating forms, explicitly link labels to inputs using unique IDs and associate help text using aria-describedby to ensure consistent accessibility.
