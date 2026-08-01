# PSU Request Tracker

A support-request tracker for WHO Nigeria's Programme Support Unit (PSU) — submit requests, track them on a dashboard, and manage status/SLA in Admin. Built with React + Vite, backed by Supabase (Postgres + Auth).

## Stack

- **Frontend**: React 19, Vite, plain CSS custom properties for theming (light/dark)
- **Backend**: Supabase — Postgres table (`requests`) with Row Level Security, Supabase Auth for admin sign-in
- **Deployment**: Vercel (frontend), Supabase (managed backend)

## Local setup

```bash
npm install
cp .env.example .env   # then fill in your Supabase project URL + anon key
npm run dev
```

Get the values for `.env` from your Supabase project's **Settings > API** page.

## Data model

A single `requests` table holds every submitted request (see `.design/psu-request-tracker/` for the schema and design docs). Row Level Security enforces:

- Anyone (`anon`) can **read** all requests and **submit** a new one (status must be `Pending` on insert).
- Only **authenticated** users can **update** a request's status, SLA classification, or completion dates.

There is no public sign-up flow in the app — admin accounts are created directly in the Supabase dashboard (**Authentication > Users > Add user**).

## Project structure

- `src/App.jsx` — the whole UI (Submit / Dashboard / Admin views)
- `src/supabaseClient.js` — Supabase client + row↔record mapping
- `src/slaData.js`, `src/sla_catalog.json` — WHO PSU/CSU SLA reference catalog (static, non-sensitive)
- `src/tokens.css` — design tokens (colors, spacing, type), light + dark
- `.design/psu-request-tracker/` — design brief, review, and schema notes

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run preview` — preview the production build locally
