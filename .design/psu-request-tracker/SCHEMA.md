# Backend: Supabase Schema

Project: `psu-request-tracker` (Supabase org: dmldavies, region: eu-west-1)

## Table: `public.requests`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `text` primary key | e.g. `REQ-1024` or generated `REQ-####-####` |
| `cluster` | `text` | Programme cluster (PEP, DPC, EPR, VPD, CSU, HSS) |
| `description` | `text` | |
| `requested_by` | `text` | |
| `location` | `text` | |
| `state` | `text` | Nigerian state / office |
| `date_sent` | `date` | |
| `status` | `text` | `Pending` \| `In Progress` \| `Completed` \| `On Hold` (check constraint) |
| `expected` | `date`, nullable | Auto-computed from the matched SLA's turnaround time |
| `actual` | `date`, nullable | Defaults to today on save if left blank when marking Completed |
| `sla_unit`, `sla_service`, `sla_business_area`, `sla_turnaround` | `text`, nullable | Matched entry from the SLA catalog (`src/sla_catalog.json`) |
| `notes` | `text` | |
| `history` | `jsonb` | Array of `{ t, by, note }` |
| `created_at`, `updated_at` | `timestamptz` | `updated_at` auto-refreshed by trigger |

## Row Level Security

RLS is **on**. Three policies:

1. **Public can view requests** (`select`, roles `anon, authenticated`) — anyone can read the full table. This mirrors the app's public Dashboard/Admin views, which have no login wall for viewing.
2. **Public can submit requests** (`insert`, roles `anon, authenticated`) — anyone can create a request, but the `with check` constrains it to `status = 'Pending' and actual is null`, so a request can't be forged as already-completed at submission time.
3. **Admins can update requests** (`update`, role `authenticated`) — any signed-in user can update any request. There's no per-row ownership model or separate `admins` table: being an authenticated Supabase Auth user *is* being an admin. Accounts are provisioned manually via the Supabase dashboard (Authentication > Users) — there is no public sign-up flow in the app.

No `delete` policy exists (default deny) — the app never deletes requests.

## Reproducing the schema

The DDL (table, indexes, trigger, RLS policies) was applied via Supabase migrations named `create_requests_table` and `harden_set_updated_at_search_path`. To recreate on a fresh project, pull the migration history with the Supabase CLI (`supabase migration list` / `supabase db pull`) against this project, or re-run the DDL from the Supabase dashboard's SQL editor — the full statements are in the migration history, not duplicated here to avoid drift.

## Data seeding

The original 55 real PSU requests were migrated once directly into this table via a one-time SQL insert, run outside of version control — they are **not** committed anywhere in this repo (source or migrations) since they contain real requester names and operational detail. If you need to reproduce a similar seed for a new environment, generate it from your own source data rather than pulling it from git history.
