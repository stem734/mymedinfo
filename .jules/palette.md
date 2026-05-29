## 2025-05-29 - Form Accessibility Pattern
**Learning:** This application follows a pattern where form fields are grouped in `form-field` or `dashboard-field` divs, but `<label>` elements are frequently not associated with their respective `<input>` or `<select>` elements using `htmlFor` and `id`. Additionally, helper text in `p` tags is not linked to inputs via `aria-describedby`.
**Action:** Always check for `htmlFor`/`id` associations and `aria-describedby` for helper text when encountering form components in this repository.
