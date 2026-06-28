## 2026-06-12 - Form Accessibility Pattern
**Learning:** The application's form components (e.g., PracticeForm, LoginForm) consistently omit explicit 'id' and 'htmlFor' associations, as well as 'aria-describedby' links for help text. This is a recurring pattern that impacts screen reader accessibility across the project.
**Action:** When modifying or creating forms, explicitly link labels to inputs using unique IDs and associate help text using aria-describedby to ensure consistent accessibility.

## 2026-06-28 - Shared Modal had no dialog semantics
**Learning:** The shared `components/Modal.tsx` exposed an `ariaLabelledBy` prop and set `id={ariaLabelledBy}` on its title, but the panel itself had no `role="dialog"`, no `aria-modal`, and never referenced that id — and no caller ever passed the prop. The "half-wired" prop made it look accessible while screen readers saw a plain div. Generic-looking shared UI primitives in this repo can hide this gap because the intent (a prop name) exists without the implementation.
**Action:** For dialog/overlay primitives, self-contain the accessible name: generate a stable id with `useId`, set `role="dialog"`/`aria-modal="true"`/`aria-labelledby` on the panel, and provide an `aria-label` fallback for header-less modals — don't rely on callers to pass an id prop.
