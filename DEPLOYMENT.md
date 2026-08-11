# Deploying FX Cartel Academy → GitHub + hosting (CI/CD)

The repo is already initialized and committed on the `main` branch. Follow these steps to push it to your GitHub and wire up automatic deploys. Total time ~5 minutes.

**This site is 100% static** — no server, no build step. The "backend" (Supabase: Postgres + Auth + Edge Functions, plus Paymob) runs entirely on Supabase's/Paymob's own infrastructure; the browser talks to it directly via `fetch()`/the Supabase client SDK, so whichever static host you pick below never sees that traffic at all. That means any of these free tiers stays free regardless of how much backend/checkout/login activity happens.

**Hosting: Render** — free static-site hosting with no commercial-use restriction and no bandwidth cap. (This project previously tried Cloudflare and Netlify; both were dropped after repeated deployment friction — Render is now the only supported host.)

---

## Step 1 — Create the GitHub repo
1. Go to https://github.com/new
2. Name it e.g. `fxcartel-website`. Leave it **empty** (no README, no .gitignore — you already have them).
3. Click **Create repository**.

## Step 2 — Push this code
From the project folder on your machine (after downloading/unzipping):

```bash
# point the local repo at your new GitHub repo
git remote add origin https://github.com/YOUR_USERNAME/fxcartel-website.git
git push -u origin main
```

If you use SSH instead of HTTPS:
```bash
git remote add origin git@github.com:YOUR_USERNAME/fxcartel-website.git
git push -u origin main
```

Your code (including the CI/CD workflow) is now on GitHub.

---

## Step 3 — Connect Render

1. Go to https://dashboard.render.com → **New +** → **Static Site**.
2. Connect your GitHub account if you haven't, then pick this repo.
3. Build settings: **Build Command** = leave empty (or `echo "Static site — no build step"`), **Publish directory** = `.` (repo root — this is a static site, nothing to build). Click **Create Static Site**.
4. Done — every push now auto-deploys, and you'll get a free `*.onrender.com` URL immediately.

The repo's `render.yaml` already declares this same configuration as code (Render calls this a "Blueprint") — security headers, the `sw.js` no-cache rule, long-cache rules for `icons/`/`docs/`, and `/portal`/`/home` pretty-URL rewrites. If you instead use **New + → Blueprint** and point it at this repo, Render should pick up `render.yaml` automatically instead of needing steps 2-3 filled in manually. Either path (manual Static Site, or Blueprint) ends up at the same result — use whichever the Render dashboard makes easier at the time, since this hasn't been deploy-tested end-to-end yet from this side.

Render's static sites have no automatic `.html`-extension-stripping behavior, so the `/portal → /portal.html` and `/home → /index.html` rewrites declared in `render.yaml` are what makes those pretty URLs work.

`.github/workflows/deploy.yml` in this repo only runs validation (file checks, HTML/JS syntax) — it does **not** deploy anything. That's intentional: Render's own Git integration above is what actually redeploys the live site on every push.

---

## Step 4 — Wire the backend (before going live)
The site deploys fine without this, but checkout/forms stay in demo mode until you:
1. Create a Supabase project and apply `supabase/schema.sql` (see `README.md` go-live checklist).
2. Deploy the Edge Functions in `supabase/functions/` (`checkout`, `contact`, `create-payment`, `paymob-webhook`).
3. Add your Paymob keys, Integration ID(s), and HMAC secret as Edge Function secrets (Dashboard → Edge Functions → Secrets) — never commit these to git.
4. Point your Paymob integration's "Transaction processed callback" at the deployed `paymob-webhook` function URL — that's what marks orders as Paid and unlocks portal access. Test with a real sandbox transaction before relying on it.
5. `SUPABASE_URL`/`SUPABASE_ANON_KEY` in `app.js`/`portal.html` only need updating if you point this at a different Supabase project — the anon/publishable key is safe to commit (protected by Row Level Security). Commit and push if you do change them:
   ```bash
   git add app.js portal.html
   git commit -m "Point at new Supabase project"
   git push
   ```

---

## Everyday workflow after setup
```bash
# make changes, then:
git add -A
git commit -m "describe your change"
git push
# → GitHub Actions validates (independently) while Render's Git integration deploys → live in ~1 min
```

## Custom domain
Render dashboard → your static site → **Settings → Custom Domains** → add `fxcartel.ae` (or a subdomain), follow the DNS instructions shown. HTTPS is automatic — required for the PWA install flow and Paymob to work.

---

## Pipeline summary
| Trigger | What runs |
|---|---|
| Pull request | `validate` job only (checks files, HTML, JS syntax) — informational, doesn't block deploys |
| Push | `validate` runs in GitHub Actions; **separately**, Render's own Git integration deploys the live site |

Secrets live in GitHub (never in code). `.env` and `secrets.json` are gitignored.
