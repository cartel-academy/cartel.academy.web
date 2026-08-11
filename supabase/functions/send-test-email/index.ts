// FX Cartel Academy — send-test-email Edge Function
// One-off sanity check that the Resend account/API key actually works,
// independent of the Supabase Auth SMTP relay setup (see
// supabase/functions/paymob-webhook for the unrelated OTP-email problem
// that setup solves) — this hits Resend's API directly rather than going
// through SMTP, purely to confirm the key is valid and the account can
// send. Safe to delete once you've confirmed an email arrives.
//
// The API key is never committed to the repo — it's read from the
// RESEND_API_KEY Edge Function secret. Set it with:
//   supabase secrets set RESEND_API_KEY=re_xxxxxxxxx
// (run that yourself; this session has no Supabase CLI session to run it
// for you). Then deploy and call this function once, check your inbox,
// and delete the function/secret if you don't need it long-term.

import { Resend } from 'npm:resend';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) return json({ ok: false, error: 'RESEND_API_KEY secret not set' }, 500);

  const resend = new Resend(apiKey);

  // onboarding@resend.dev is Resend's own shared test sender — works
  // without verifying a domain, but only for quick sanity checks like
  // this one, not for real production mail (use your own verified
  // domain + the SMTP relay settings in Supabase Auth for that).
  const { data, error } = await resend.emails.send({
    from: 'onboarding@resend.dev',
    to: 'zharanbabu@gmail.com',
    subject: 'Hello World',
    html: '<p>Congrats on sending your <strong>first email</strong>!</p>',
  });

  if (error) return json({ ok: false, error }, 502);
  return json({ ok: true, data });
});
