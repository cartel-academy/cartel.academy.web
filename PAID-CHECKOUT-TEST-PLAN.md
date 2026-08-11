# Paid checkout — manual test plan (Paymob sandbox)

This wasn't runnable from the Claude Code session that wrote it: that
environment's network policy blocks egress to `*.supabase.co` and Paymob's
domains, so the `checkout` / `create-payment` Edge Functions and Paymob's
hosted checkout were all unreachable. Everything below is written so a human
(or a session running in an environment with real network access) can
execute it and know exactly what "correct" looks like at each step.

## Prerequisites

- [ ] Paymob account is in **test/sandbox mode** (not live), with a card
      integration enabled.
- [ ] Supabase Edge Function secrets are set (Project Settings ▸ Edge
      Functions ▸ Secrets), specifically all of:
      `PAYMOB_SECRET_KEY`, `PAYMOB_PUBLIC_KEY`, `PAYMOB_INTEGRATION_IDS`,
      `PAYMOB_HMAC_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` — if any are
      missing, `create-payment` returns `{ok:false, error:"not_configured"}`
      and the checkout falls back to the "Payment not authenticated" toast
      instead of reaching Paymob at all (see `app.js` `submitOrder()`).
- [ ] In the Paymob dashboard, the integration's **Transaction processed
      callback** URL is set to your deployed `paymob-webhook` function URL
      (`{SUPABASE_URL}/functions/v1/paymob-webhook`). Without this, step 5
      below will never flip `payment_status` to `Paid`, even on a genuinely
      successful test payment.
- [ ] You have a current Paymob **test card number** from your own
      dashboard (Developers ▸ Test Cards / Test Credentials) — pull it live
      rather than trusting a number from memory or a third-party guide,
      since Paymob's test cards are region/account-specific (UAE vs Egypt)
      and change over time. As of writing, commonly-cited Paymob test cards
      (unverified against this specific account — confirm in-dashboard):
      Mastercard `5123456789012346`, Visa `4987654321098769`, any future
      expiry, any 3-digit CVV.
- [ ] Have two test emails ready that are **not already** in the
      `students` table (e.g. `paidtest+success1@yourdomain.com`,
      `paidtest+decline1@yourdomain.com`) — the `checkout` function
      rejects a repeat email/phone with `email_exists`/`phone_exists`.

## Part A — Happy path (successful payment)

1. Open the live site, click **Purchase course** on a paid tier (FXC Master
   or FXC Pro).
2. Fill in the checkout form with the first test email, a real-looking UAE
   phone number, and submit ("Pay `<amount>` AED securely").
3. **Check Supabase immediately** (before touching Paymob): a new row
   should exist in `public.students` with `payment_status = 'Pending'`,
   `order_id` populated, `course` matching the tier you picked, and
   `amount`/`vat`/`total` matching the checkout summary (5% VAT).
4. The browser should redirect to Paymob's Unified Checkout
   (`{PAYMOB_BASE_URL}/unifiedcheckout/?publicKey=...&clientSecret=...`).
   Confirm the amount shown there matches the total from step 3.
5. Pay with the test card (success one). Confirm in the **Paymob
   dashboard** that a transaction appears, `success = true`, and its
   `merchant_order_id` matches the `order_id` from step 3.
6. **Check Supabase again**: the same `students` row should now show
   `payment_status = 'Paid'`, `paymob_ref` set to the Paymob transaction
   id, `paid_at` populated, and `valid_until` ≈ one month from now. If
   it's still `Pending`, the webhook callback URL (prerequisites) or the
   `PAYMOB_HMAC_SECRET` is likely misconfigured — check the
   `paymob-webhook` function's logs for `hmac_mismatch`.
7. Confirm the browser lands back on the site with the **success modal**:
   "Successfully purchased `<course>` by `<name>`", the email shown
   correctly, and a working **"Log in to Student Portal"** button. The URL
   bar should have cleaned itself back to a bare path (no leftover query
   string — `history.replaceState` in `app.js`).
8. Click through to the portal. The email field should already be filled
   in (from the same-origin `localStorage` handoff). Submit it —
   `check_enrollment` should now return `enrolled/paid/valid = true`, and
   you should land on the OTP + set-password screen.
9. Complete the OTP flow (see the OTP-code email-template note below if
   you haven't fixed that yet) and set a password. Confirm you land in the
   portal showing **only** the course you purchased, with the right
   document list and Zoom schedule for that tier.
10. Reload the portal and log in again with the password you just set —
    confirms `link_account()` correctly attached the Supabase Auth user to
    this student row for the *next* login (password path, no OTP).

## Part B — Declined / failed payment

1. Repeat steps 1–2 above with the second test email, but pay with a
   **declining** test card (or an expired/invalid one) at the Paymob
   checkout.
2. Confirm the browser redirects back to the site with the failure toast
   ("**Payment not completed.** Your card payment for `<course>` didn't
   go through...") rather than the success modal. This is driven by
   Paymob's own `success` query param on the `redirection_url` — if the
   success modal shows instead for a card you know was declined, that's a
   real bug in the `success === 'false'`/`'0'` check in `app.js`
   (`checkPurchaseReturn`) and needs a closer look at what value Paymob
   actually sends for a decline (it may not be the literal string
   `"false"` — log `window.location.search` on that page load to see the
   real param name/value Paymob used, since this couldn't be confirmed
   without a live sandbox transaction).
3. **Check Supabase**: the `students` row for this email should still show
   `payment_status = 'Pending'` (the webhook explicitly no-ops on
   `obj.success` being falsy).
4. Try logging into the portal with this email — should hit the
   `payment_pending` friendly error ("Your enrollment is pending payment
   confirmation...").

## Part C — Duplicate checkout

1. Try checking out again with an email that's already `Paid` from Part A.
2. Confirm you get the "already registered" `confirm()` dialog offering to
   go to the Student Portal, rather than a second `students` row or a
   second Paymob charge.

## Known gap to double check while you're in there

`create-payment`'s `redirection_url` is only as good as Paymob actually
honoring it for your integration type. Follow-up research (still no live
transaction — that needs network access this session doesn't have) found
Paymob's own docs describing the redirect as carrying "the same keys found
in the transaction processed callback JSON object" flattened into the
query string, with `success` as the literal string `"true"`/`"false"` —
i.e. the same shape `paymob-webhook/index.ts` already parses from the POST
body, just query-string-encoded instead of JSON. `app.js`'s
`checkPurchaseReturn()` now checks for exactly `success === 'false'`
(previously it also treated a bare `'0'` as failure, which the confirmed
doc shape ruled out — removed).

This is still **documented behavior, not a live-captured example** — Step
B.2 in this plan is the actual first live confirmation. If a real decline
redirects back with anything other than `success=false` (e.g. a different
key name, or a non-`"false"` falsy value), that's a real bug: it would
show the success modal for a payment that actually failed. Capture the
full query string from that first real decline and diff it against what's
assumed here.
