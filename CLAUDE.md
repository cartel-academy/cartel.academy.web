# CLAUDE.md

Guidance for Claude Code (and other AI assistants) working in this repository.

## Git branch policy

Only ever work on `feature/supabase-migration` — this is the branch Render
actually deploys to production from. Do not check out, create commits on,
or push to any other branch (including `claude/website-pwa-google-drive-qm905q`)
without a new, explicit instruction from the user to do so.

Report every commit/push made to this branch to the user (what changed,
commit hash) rather than pushing silently.

> If your current session's own harness instructions name a *different*
> target branch (e.g. a `claude/...` working branch for a specific task),
> that per-session instruction takes precedence for that session — but
> flag the discrepancy to the user rather than silently overriding this
> policy, since it governs which branch Render actually serves.

## Project overview

**FX Cartel Academy** — a premium, minimal marketing site for a forex &
stock trading academy (Abu Dhabi), plus a payment-gated student portal.
Installable as a PWA, mobile-responsive. Backend is **Supabase** (Postgres
+ Auth + Edge Functions); payments via **Paymob**; hosted on **Render**.

This is a **100% static site** — no framework, no bundler, no
`package.json`, no build step. Every `.html` page is self-contained
(inline `<style>`/`<script>` plus a few shared `.js` files); the "backend"
runs entirely on Supabase/Paymob infrastructure and is called directly
from the browser via `fetch()` / the Supabase JS client — the static host
never sees that traffic.

For full product/setup detail beyond this summary, see `README.md` (file
map, go-live checklist, access model, Meta Pixel behavior) and
`DEPLOYMENT.md` (GitHub → Render CI/CD wiring). This file is the
AI-assistant-facing index; those two are the user-facing source of truth —
don't let this file drift from them.

## File map

| File / dir | Purpose |
|---|---|
| `index.html` | Main one-page site (hero, courses, gallery, testimonials, FAQ, contact) |
| `app.js` | Checkout, topics, PWA install, notifications, Supabase checkout/contact calls. Course/pricing data (`COURSES`, `TOPICS`) lives here |
| `app-notify.js` | Shared foreground notification helper (`window.FXCNotify`), used by `index.html`, `portal.html`, `tools.html` |
| `meta-pixel.js` | Meta Pixel bootstrap + cookie-consent banner. Only loads `fbq`/the pixel after the visitor accepts (`localStorage['fxc_cookie_consent']`) |
| `pwa-install.js` | PWA install-prompt handling |
| `sw.js` | Service worker — offline cache, foreground notification `showNotification()` |
| `portal.html` | Student portal: Supabase Auth login (email OTP + password), PDF viewer, Zoom classes, progress marking. PWA `start_url` |
| `mentors.html` | Mentors page |
| `tools.html` | Standalone "Trading tools" page — illustrative market ticker, TradingView Economic Calendar/Screener/Heatmap embeds, lot-size/pip calculators. Self-contained JS lives inline on the page (not in `app.js`) since it's the only page that needs it |
| `ceo-message.html` | Standalone "Message from our CEO" page |
| `privacy.html` | Privacy policy (Meta Pixel disclosure, data retention) — **not lawyer-reviewed**, see callout on the page |
| `trading-bg-animation.html` | Standalone background animation asset/demo |
| `manifest.webmanifest`, `icons/`, `assets/` | PWA install + branding |
| `pdfjs/` | Vendored Mozilla pdf.js (v5.4.149, MIT, trimmed build — no source maps, English-only, no demo/debug panel). Same-origin so `portal.html` can hook `pagechanging` for "resume where you left off" (`bookmarks.last_page`) — the browser's native PDF viewer can't report that back |
| `docs/` | Course PDFs, served directly by the static host (no external file storage) |
| `supabase/schema.sql` | Postgres schema: `students`, `leads`, `bookmarks` tables + RLS + `check_enrollment`/`link_account` RPCs |
| `supabase/functions/` | Edge Functions: `checkout`, `contact`, `create-payment`, `paymob-webhook`, `send-test-email` |
| `render.yaml` | Render static-site config (headers, cache rules, pretty-URL rewrites) — see below |
| `.github/workflows/deploy.yml` | CI validation only — see CI/CD section |
| `.mcp.json` | Project-level MCP config: Supabase MCP server, project ref `dyatxhudfbvburljycky` |
| `README.md` | Full product doc: file map, go-live checklist, portal access model, Meta Pixel event list, notification behavior |
| `DEPLOYMENT.md` | GitHub repo setup → Render connection → CI/CD pipeline walkthrough |
| `PAID-CHECKOUT-TEST-PLAN.md` | Manual Paymob-sandbox checkout test plan (not automatable — see Testing below) |

## Brand assets (logo/icons)

- **`assets/logo.png`** — the wide horizontal lockup (teal `#125B52` "FX"
  + gold `#FFBF00` triangle + **white** "CARTEL"), used in every page's
  `.topbar`/`footer`, both of which are dark (`#000` → navy gradient).
- **`assets/logo-dark.png`** — same horizontal lockup with **black**
  "CARTEL" instead, for a light background. Not currently referenced by
  any page (every header/footer on the site is dark) — kept correct and
  on-brand for whenever a light-background placement is needed; don't
  delete it as "unused," and don't recolor it back to anything
  low-contrast against its own glyphs.
- **`icons/favicon-*-v2.png`** (48/180/192/512) — the square icon-only
  mark (teal "FX" + gold triangle, no wordmark — a wordmark doesn't read
  at favicon sizes), referenced from every page's `<head>`,
  `manifest.webmanifest`, and `sw.js`'s precache list.
- **Icon filenames carry a `-v2` (etc.) suffix on purpose**:
  `render.yaml` sets `Cache-Control: public, max-age=31536000, immutable`
  on everything under `/icons/*`, so browsers that already fetched an old
  icon **will not re-check it for a year** even on a hard refresh —
  in-place overwrites silently fail to propagate. If you ever need to
  change an icon file again, add a new version suffix and update every
  reference (the `<link>` tags in all 6 HTML pages, `manifest.webmanifest`,
  `sw.js`'s `ASSETS` array, and `app-notify.js`'s notification
  `icon`/`badge`) rather than overwriting the file in place. `assets/*`
  has no such rule, so `logo.png`/`logo-dark.png` can be overwritten
  in-place safely.
- Whenever any precached file's bytes change (including the above),
  **bump `sw.js`'s `CACHE` version string** (e.g. `fxcartel-v96` →
  `fxcartel-v97`) — `sw.js` itself is `no-cache`, but its own Cache
  Storage entries only refresh when the browser detects the service
  worker script's content differs, which only happens if the `CACHE`
  literal (or something else in the file) actually changes.

## Hosting & deploy (Render)

- `render.yaml` declares: security headers (`X-Frame-Options`,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`),
  `no-cache` on `sw.js`, long-cache on `icons/*`, day-cache on `docs/*`,
  and pretty-URL rewrites `/portal → /portal.html`, `/home → /index.html`.
- Render's own GitHub integration deploys on every push to the connected
  branch — there is no deploy step in CI. Previously tried
  Cloudflare/Netlify; both dropped for deployment friction. **Render is
  the only supported host.**
- Custom domain / HTTPS is handled in the Render dashboard (HTTPS is
  required for the PWA install flow and for Paymob).

## Backend / data model (Supabase)

Three tables, RLS enabled on all, two RPCs — see `supabase/schema.sql` for
the authoritative source and inline comments explaining each decision.

- **`students`** — one row per enrollment; `user_id` is null until first
  portal login links it (`link_account()`). Mobile and email are both
  `unique`. `payment_status` (`Pending`/`Paid`), `valid_until` (access
  expiry), `is_superuser` (locked out at the **column-grant level**, not
  just RLS — the `grant update (...)` list deliberately omits it, so no
  client-side path can ever set it; the only way is a manual `UPDATE` in
  the SQL editor).
  - RLS: a logged-in student can `select`/`update` only their own row, and
    only the profile fields the "complete your profile" form touches
    (`address`, `dob`, `profile_complete`). All payment/course/order
    fields are written **only** by the `checkout`/`paymob-webhook` Edge
    Functions using the service-role key (bypasses RLS) — no
    insert/delete grant exists for anon/authenticated at all.
- **`leads`** — contact form submissions. No RLS policies at all (not even
  select) — only the `contact` Edge Function (service role) touches it.
- **`bookmarks`** — per-student progress/PDF resume position, denormalized
  `user_id` for a simple RLS equality check. Student can select/insert/
  update only their own rows.
- **`check_enrollment(p_email)`** — anon-callable RPC, returns only
  booleans (`enrolled`, `paid`, `valid`, `account_linked`), never the row
  itself — can't be used to enumerate student data.
- **`link_account()`** — authenticated-only RPC, links the caller's
  Supabase Auth user to their `students` row by matching their **verified
  session's own email** — can't link anyone else's row.

**Portal access model** (see `README.md` for full detail): the portal
identifies a student by **email**, not phone. A student reaches the portal
only if `payment_status = 'Paid'` **and** `valid_until` hasn't passed.
Every course grants **one month** of access from payment confirmation
(instant for the free course, on Paymob webhook confirmation for paid
ones). Re-checkout on the same phone/email only succeeds if the existing
course has expired or they're switching courses (renews the same row);
buying the same still-valid course again is rejected as a duplicate.
First login is email → OTP → set password; returning visits are
email + password via Supabase Auth (no custom crypto in this codebase).

## Edge Functions (`supabase/functions/`)

Deno + TypeScript, `createClient` from `https://esm.sh/@supabase/supabase-js@2`,
shared CORS-header pattern (`Access-Control-Allow-Origin: *` +
`Access-Control-Allow-Headers`). Deploy via Supabase CLI
(`supabase functions deploy <name>`) or dashboard.

- **`checkout`** — creates/renews a `students` row before payment; enforces
  the duplicate/renewal/upgrade rule above; runs with the service-role
  key since checkout happens pre-auth.
- **`contact`** — writes to `leads`.
- **`create-payment`** — calls Paymob's Intention API to start a paid
  checkout; returns the Paymob Unified Checkout redirect URL.
- **`paymob-webhook`** — Paymob's "Transaction processed callback" target.
  Verifies the payload via **HMAC-SHA512** (`PAYMOB_HMAC_SECRET`) using
  Deno's native Web Crypto API, then flips `payment_status` to `Paid`,
  sets `paymob_ref`/`paid_at`/`valid_until`. **This is the only place in
  the codebase that ever fires a Meta `Purchase` event** — via the Meta
  Conversions API (server-side), with email/phone SHA-256-hashed before
  sending (Advanced Matching requirement, no raw PII transmitted).
  Silently no-ops the Meta call if `META_PIXEL_ID`/`META_CAPI_ACCESS_TOKEN`
  secrets aren't set — a Meta API hiccup must never block a payment
  confirmation. Client-side code (`app.js`, `meta-pixel.js`) deliberately
  never fires `Purchase` itself, since a checkout redirect isn't proof of
  payment.
- **`send-test-email`** — optional one-off Resend API sanity check, not
  part of the normal site flow; delete once Resend is confirmed working.

## Secrets & config conventions

- **Safe to hardcode client-side** (already in `app.js`/`portal.html`/
  `meta-pixel.js`): `SUPABASE_URL`, the Supabase **anon/publishable**
  key (protected by RLS, not a secret), `META_PIXEL_ID` (public pixel ID).
- **Edge Function secrets, never committed** (Dashboard → Edge Functions →
  Secrets): `SUPABASE_SERVICE_ROLE_KEY`, `PAYMOB_SECRET_KEY`,
  `PAYMOB_PUBLIC_KEY`, `PAYMOB_INTEGRATION_IDS`, `PAYMOB_HMAC_SECRET`,
  optional `PAYMOB_BASE_URL`, optional `RESEND_API_KEY`, and for Meta
  CAPI reporting `META_PIXEL_ID` + `META_CAPI_ACCESS_TOKEN`.
- `.gitignore` excludes `.env`, `.env.*`, `secrets.json` — if you ever add
  local tooling that needs secrets, keep them out of git the same way.

## CI/CD

- `.github/workflows/deploy.yml` runs on push/PR: checks required files
  exist, `html-validate` on `index.html`/`portal.html`, `node --check
  app.js` (syntax only). **It does not deploy anything** — that's
  intentional, informational-only. Render's own git integration is the
  actual deploy path, triggered independently by the same push.
- Everyday workflow: commit → push → GitHub Actions validates while Render
  deploys in parallel, live in ~1 min.

## Testing

There is no automated test suite (static site, no framework). For
checkout/payment changes, `PAID-CHECKOUT-TEST-PLAN.md` is a manual,
step-by-step Paymob-sandbox test plan — use it when touching
`checkout`/`create-payment`/`paymob-webhook` or the portal login flow.
Note: some Claude Code network environments block egress to
`*.supabase.co` and Paymob's domains, making these Edge Functions/Paymob's
hosted checkout unreachable from inside a session — the test plan is
written assuming a human or a session with real network access executes
it.

## Conventions to preserve when editing

- **Notifications are foreground-only** — Notification API + service
  worker `showNotification()`, triggered only while the app is open,
  capped at once/day per type. There's no Web Push/VAPID backend, so
  nothing fires while the app is fully closed. Don't add a background-push
  code path without deliberately building that backend.
- **Market ticker / calculators are illustrative-only**, clearly labelled
  — no live financial data or profit claims, for compliance. The same
  rule applies to market-move notification copy.
- **Cookie consent gates the Meta Pixel via Meta's own Consent Mode**
  (`fbq('consent','revoke'/'grant')`), not by withholding the script.
  `fbevents.js` loads and `fbq('init', ...)` runs unconditionally on
  every page load (immediately preceded by `consent:'revoke'`), so
  Meta's own tooling (Events Manager health checks, the "Add events" URL
  scanner, Pixel Helper) can see the pixel is installed — while revoked,
  Meta's SDK guarantees no event data is sent and no cookies are set.
  Real tracking only starts once a visitor accepts the banner
  (`localStorage['fxc_cookie_consent']`), which calls
  `fbq('consent','grant')`. Don't go back to withholding the script
  entirely — that made the pixel undetectable by Meta's own diagnostics.
- **Graceful demo-mode fallback** — checkout/login/contact calls should
  never dead-end the UI if an Edge Function or Paymob is unreachable;
  preserve existing try/catch + toast fallback patterns in `app.js`.
- **`is_superuser` has no UI/RPC/Edge Function surface yet** — it's
  intentionally locked down at the Postgres grant level (see schema
  section above). Don't add a code path that writes it without a
  deliberate, reviewed decision to do so.
- A local `.mcp.json` wires up the **Supabase MCP server** for this
  project (`project_ref=dyatxhudfbvburljycky`) — prefer it (`list_tables`,
  `execute_sql`, `get_advisors`, `get_logs`, etc.) over guessing at schema
  or DB state when making backend changes.
