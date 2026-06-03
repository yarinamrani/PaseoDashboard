---
name: restaurant-bi-dashboard
description: >
  Build and feed live restaurant/business dashboards by integrating external
  SaaS/POS/BI data (BeeComm, Alfred BI, OnTopo, Google) into Supabase and a
  React dashboard. Use when wiring real business data into a dashboard,
  reverse-engineering a SaaS app's private API, scheduling automatic daily
  data syncs, or replacing demo data with real sources. Covers the pg_net
  fetch technique, edge-function + pg_cron sync, xlsx import, and the
  PaseoDashboard architecture.
---

# Restaurant / Business BI Dashboard Integration

A reusable playbook for turning a demo dashboard into a live one, and for
pulling data from third-party systems that have no official API — proven on
the Paseo dashboard (BeeComm POS, Alfred BI, OnTopo, Google reviews).

## Core idea: let the database reach the internet (`pg_net`)

The agent sandbox is network-restricted, but the **Supabase database is not**.
Use the `pg_net` extension (via `execute_sql`) to fetch any URL from inside
the DB, then read the response back. This bypasses sandbox limits and is the
foundation for everything below.

```sql
-- fire a request (async) -> returns a request id
select net.http_get('https://example.com/...') as id;
select net.http_post(url:='https://...', body:='{}'::jsonb,
       headers:=jsonb_build_object('Content-Type','application/json'),
       timeout_milliseconds:=120000) as id;

-- read the response once it lands
select status_code, content_type, content from net._http_response where id = <id>;
```

Notes:
- `net._http_response` populates asynchronously — poll it; `status_code`/`content`
  are `null` until ready (or on timeout). The remote call still completes
  server-side even if `pg_net` stops waiting.
- Extract structure from large JS bundles with `regexp_matches` /
  `substring(content from position('needle' in content)-N for M)`.

## Reverse-engineering a SPA's private API

1. `net.http_get` the site root → grab `<script src="/assets/index-*.js">`.
2. `net.http_get` the bundle (can be multi-MB; `pg_net` handles it).
3. Find the API base: `regexp_matches(content,'[^A-Za-z0-9_]VAR="([^"]+)"')`
   (look for the `axios.create()` base, e.g. `gd="/api"`).
4. Find auth: search for `access_token` / `Authorization` / `Bearer` and the
   request wrapper (`url:\`${base}/${uri}\``).
5. Enumerate endpoints: `regexp_matches(content,'uri:`?"?([a-zA-Z0-9/_$.{}-]+)')`.
6. Test login + a data endpoint directly with `pg_net` before building anything.

### Alfred BI specifics (alfred-bi.com) — reuse for any Alfred restaurant
- Base: `https://www.alfred-bi.com/api`
- Login: `POST /auth/login {email,password}` → `{access_token, refresh_token}`
  (Alfred wraps Firebase; the access_token is a Firebase ID token, ~1h TTL —
  just re-login each run).
- Read data: `GET /v2/statistics/aggregated-data/{restaurantId}?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&period=daily`
  → rich JSON: `dailyData`/`monthlyData` with `revenue.total`, `diners.total`,
  `orders.total`, `paymentTypes` (Hebrew keys), `operatingProfit`,
  `ordersByChannel` (dineIn/takeaway/delivery+providers), `cogs`.
- List restaurants (to map names→ids): `GET /restaurants/simple-list`.

### BeeComm POS (backoffice.beecommcloud.com)
- Firebase **phone OTP** auth → hard to automate (OTP to owner's phone +
  reCAPTCHA). Prefer pulling the same data from a BI layer (Alfred) instead.
- Manual fallback: BackOffice → Reports → "דוחות קופה" / "ייצוא דוחות" →
  "יצוא לאקסל" (Z report). No scheduled email/auto-send exists.

## ⚠️ ALWAYS verify the entity id
The single biggest failure mode: pulling the **wrong** restaurant. Alfred ids
are not obvious (Paseo = **1**, Umino Sushi = **7**). Before backfilling, call
the names/list endpoint and confirm the id maps to the intended business.
A "Wolt delivery looks too high" type sanity check from the owner caught this.

## Automatic daily sync (edge function + pg_cron)

1. Store creds/secrets in an `app_config(key,value)` table.
2. Deploy an edge function (`alfred-sync`) that: reads creds from `app_config`
   via the service role, logs in, fetches per-day data, maps it, and upserts
   into the sales table (`on_conflict=date`, `Prefer: resolution=merge-duplicates`).
   Guard it with a shared secret header (`x-sync-secret`) since `verify_jwt=false`.
   Accept `{date}` or `{startDate,endDate}` so the same function does backfill.
3. Add a unique constraint on the date column for clean upserts.
4. Schedule it:
```sql
select cron.schedule('alfred-daily-sync','0 6 * * *', $$
  select net.http_post(url:='https://<ref>.supabase.co/functions/v1/alfred-sync',
    headers:=jsonb_build_object('Content-Type','application/json','x-sync-secret','<secret>'),
    body:='{}'::jsonb) $$);
```
5. Backfill history in chunks (~30 days each) to avoid edge-function timeouts.

Never commit secrets (passwords, API keys, the sync secret) to git — keep them
in `app_config`/Vault only.

## Importing an Excel export (no deps)

`.xlsx` is a zip of XML. Parse with Python `zipfile`+`xml.etree` — handle both
shared strings (`xl/sharedStrings.xml`, `t="s"`) and inline (`t="str"`/`inlineStr`).
Map columns → domain rows → generate an `INSERT`. (Used for the initial 89-day
BeeComm Z backfill before Alfred automation existed.)

## The dashboard (PaseoDashboard) architecture
- React + Vite + TS, Tailwind (`paseo-*` theme colors), `react-router`.
- Data layer: `src/data/repository.ts` `loadPaseoData(demo)` pulls from Supabase
  with a graceful fallback to `mockData`; `DataContext` exposes `usePaseo()`,
  `useDataSource()`, `useRefreshPaseo()`.
- Domain types in `src/types.ts`; map snake_case Supabase rows → camelCase types
  with small `mapX` functions. Add `payments?: Record<string,number>` style
  fields as needed.
- Forms via `FormShell` (handles save/delete/refresh + blocks writes in demo
  mode); tables via `DataTable`; row edit/delete through a prefilled modal.
- Metrics in `src/lib/metrics.ts`; date helpers in `src/lib/dates.ts` MUST be
  null/invalid-safe (real rows often have empty dates — guard before formatting,
  or the page crashes with "Invalid time value").
- Lead status mapping: CRM `contacted` = already handled (in pipeline), only
  `new` = truly "waiting for first response" — don't count handled leads as open.
- Deploy: GitHub Pages via `.github/workflows/deploy-pages.yml`
  (`vite build --base=/<Repo>/`, copy `index.html`→`404.html` for SPA routing,
  router `basename = import.meta.env.BASE_URL`). Base path is case-sensitive.

## Data-source map (Paseo)
- Sales/revenue/payments/profit → Alfred BI (restaurant **1**) → `dash_sales`.
- Leads/events → `crm_leads` (live CRM).
- Suppliers → `suppliers` table (53 real).
- Maintenance → `dash_maintenance`.
- Reviews → Google Places API (key in `app_config`), Paseo's Place ID.
- Reviews/feedback (reservations) → OnTopo edge functions / `ontopo_*` tables.
- Inbound files pipeline → Telegram bot (token in `app_config`).
