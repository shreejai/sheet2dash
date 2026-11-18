# Sheet2Dash — v1 plan

First user: a small cake business.

A live, phone-friendly dashboard for a small cake business, built on top of its existing Google Sheet. Personal use + portfolio piece (non-commercial, Vercel Hobby).

## Decisions

| Topic | Decision |
|---|---|
| Users | One business for now; every row keyed by Clerk `userId` so multi-tenant is possible later |
| Auth | Clerk (free tier), Google sign-in using our own Google OAuth credentials |
| Sheet access | One-click: Google consent → Google Picker → pick spreadsheet. Scope: `drive.file` only (no Google verification needed). Token fetched server-side from Clerk. **Read-only** — the app never writes to the sheet |
| Sheet shape | One tab per year, identical headers, one row per order. All year tabs are merged into one dataset |
| Dashboard generation | Rule-based from detected column roles, user can add/remove/edit widgets |
| Live updates | Poll every 30–60s while open + manual refresh; server cache ~30s per sheet to protect Google quota |
| Chat | Vercel AI SDK + cheapest suitable OpenAI mini/nano model. Model gets a data summary + an aggregation tool (numbers are computed, not guessed). Streaming, daily message cap, no stored history in v1 |
| Locale | AUD (`A$1,234`), `en-AU`, DD/MM/YYYY, weeks start Monday, calendar year |
| Hosting | Vercel Hobby |
| Portfolio | "Try with sample data" demo mode — no sign-in, fake cake-business dataset |

## Sheet columns

| Column | Role | Used for |
|---|---|---|
| due date | Primary date | Filters, trends, comparisons, upcoming |
| Pick up time | Time on due date | Sorting upcoming orders |
| Cake type | Category | Top cakes |
| name | Customer | Repeat vs new, top customers (names normalised: trim + case-insensitive) |
| charged | Amount (AUD) | Revenue, average order value |
| expenses, net profit, total till date | — | Ignored in v1 |

Parsing rules: request raw values from Sheets (`UNFORMATTED_VALUE`, dates as serial numbers) to avoid DD/MM vs MM/DD ambiguity; parse text pickup times leniently ("10am", "2:30 pm"); skip blank rows and rows without a due date or charged amount, and report the count on the confirm screen.

## v1 dashboard

- Date range filter: this month / last 30 days / this year / last year / custom
- KPI cards: revenue, orders, average order value, repeat-customer % — each with Δ vs previous period and vs same period last year
- Revenue trend (week/month buckets) with last year as a faint comparison line
- Top cake types (by revenue, toggle to count)
- Busiest pickup days of the week
- Top customers
- Upcoming orders: next 14 days, grouped by day, sorted by pickup time

## Stack

Next.js (App Router) · TypeScript · Tailwind · shadcn/ui · Clerk · Google Picker + Sheets API · Neon Postgres + Drizzle · shadcn charts (Recharts) · TanStack Query · Vercel AI SDK + OpenAI

## Build order

1. [x] Project setup, Clerk login, database schema
2. [x] Google connect + Picker + fetch/merge year tabs
3. [x] Column detection + confirm screen
4. [x] Dashboard generator + widgets, date filter, period comparisons
5. [x] Upcoming orders view
6. [x] Polling refresh + mobile polish
7. [x] Chat
8. [x] Widget editing (add/remove/change)
9. [x] Demo mode with sample data

## Later

- Profit widgets (expenses / net profit)
- Writes back to the sheet (e.g. mark order done)
- Multi-business support

---

# v2 plan: several sheets per account and a Fitness dashboard

Second use case: the owner's workout tracker ("Reacher Revamp — CBVT Workout Progress Tracker"), kept under the same Google account as the cake sheet.

## Decisions

| Topic | Decision |
|---|---|
| Sheets per account | Many. Each connected sheet has its own **kind**, column mapping, dashboard layout and sharing list |
| Kinds | `orders` (the existing cake dashboard, unchanged) and `fitness`. Chosen when connecting; detection pre-selects it from the headers |
| Switching | Sheet switcher in the dashboard header; URL carries the sheet (`/dashboard/<sheetId>`, `/dashboard/<sheetId>/chat`). `/dashboard` opens the last used sheet |
| Sharing | **Per sheet.** Existing viewers keep access to the cake dashboard only; the fitness dashboard is private until shared |
| Existing data | Migration backfills: current connection becomes kind `orders`, its dashboard and viewers are linked to it. Nothing changes for current viewers |
| Chat cap | Still per person per day, across all sheets |
| Demo | Stays cake-only |

## Fitness sheet shape (from the owner's sheet)

Title, subtitle and a summary band sit above the table; the header row is row 8. One row per exercise per session.

| Column | Role | Notes |
|---|---|---|
| Date | Session date (required) | `2026-10-13`; text or real dates both accepted |
| Exercise Name | Exercise (required) | Some names carry the block, e.g. "Seated Cable Rows / Back Block B1" |
| Target Muscle | Muscle (optional) | Free text; grouped into chest / back / shoulders / biceps / triceps / forearms / legs / core by keywords |
| Sets | Sets (optional) | Number; `—` = not logged |
| Reps | Reps (optional) | Range `10-12` or single number; `—` = not logged |
| Load / Setting | Load (optional) | `Bodyweight`, `6 kg DBs`, `6 kg / 8 kg DBs`, `Stack 5`, `Stack 7-8`, `Light Stack`. Parsed into kg, stack level or bodyweight; progress is only compared within the same unit |
| Routine Block | Block (optional) | "Push Block P1" → day type "Push" |
| Notes | — | Shown in session lists, not analysed |

Parsing changes: the header row is the first row that looks like a header (several short text cells followed by data rows), not the first non-blank row, so title rows and summary bands are skipped.

## Fitness dashboard

- Date range filter (same as orders)
- KPI cards: sessions, exercises, sets logged, average sets per session, each with Δ vs previous period
- Sets per week (bar), split by day type (Push / Arms / Shoulders / Back …)
- Sets by muscle group
- Training calendar: days trained, with the session's day type
- Exercise progress: per exercise, first vs latest load and reps, and a load-over-time chart for one chosen exercise
- Recent sessions: grouped by date, with notes
- Chat tools: sessions in a period, an exercise's history, sets by muscle

## Build order

1. [x] Several sheets per account: schema migration + backfill, sheet-scoped routes, switcher, per-sheet cache and sharing. Cake dashboard behaves exactly as before
2. [ ] Smarter header-row detection (skip title rows and summary bands)
3. [ ] Fitness kind: column roles, detection, confirm screen, parsing (sets, rep ranges, loads)
4. [ ] Fitness metrics + widgets + dashboard generator, widget editing
5. [ ] Fitness chat tools
6. [ ] Privacy page update (workout data), README
