# Sheet2Dashboard — v1 plan

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
7. [ ] Chat
8. [ ] Widget editing (add/remove/change)
9. [ ] Demo mode with sample data

## Later

- Profit widgets (expenses / net profit)
- Writes back to the sheet (e.g. mark order done)
- Multi-business support
