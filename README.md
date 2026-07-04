# MyMedInfo

MyMedInfo is a React and TypeScript application for delivering patient information cards for medications, health checks, screening, immunisations, and long-term conditions.

## Current stack

- Frontend: React 19, TypeScript, Vite
- Hosting: Vercel
- Data and auth: Supabase
- Patient entry point: `/patient` with SystmOne-style URL parameters
- Admin tooling: `/admin/dashboard` and `/admin/card-builder`

## Active application areas

- Patient viewer for medication and pathway content
- Vercel serverless PDF rendering endpoint (`api/pdf.ts`)
- Practice dashboard for adopting and customising cards
- Admin card builder for medication and template content
- Supabase Edge Functions for save, restore, audit, user management, and practice actions

## Local development

1. Install dependencies:

```bash
npm install
```

2. Copy the environment template and add your Supabase values:

```bash
cp .env.example .env.local
```

For auth invite/reset flows handled by Supabase Edge Functions, set `BREVO_API_KEY`
(and optionally `BREVO_FROM_EMAIL`, `BREVO_FROM_NAME`, `APP_BASE_URL`) as Supabase
Edge Function secrets — see `.env.example` for details. These are not Vercel env vars.

3. Start the dev server:

```bash
npm run dev
```

## Quality checks

```bash
npm run lint
npm run build
npm test
```

## Supabase SQL layout

The active database setup lives in:

- `supabase/schema.sql`
- `supabase/rls.sql`
- `supabase/rpc.sql`
- `supabase/seed-medications.sql`

Incremental migrations and advisor fixes (`migrate-*.sql`, `add-*.sql`,
`resolve-*.sql`, and feature-specific SQL) also live in `supabase/` and are
applied on top of the base schema.

Historical one-shot deployment bundles are archived under `archive/supabase-snapshots/`.

## Archived legacy material

Legacy Firebase assets, migration scripts, and historical review notes have been moved under `archive/` so they do not read as active deployment instructions:

- `archive/firebase/`
- `archive/migration/`
- `archive/reviews/`
- `archive/supabase-functions/`
- `archive/supabase-snapshots/`

## Route compatibility

`/admin/card-builder` is the canonical builder route. Older `/drug-builder` aliases are still kept as compatibility routes for existing bookmarks.
