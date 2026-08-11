// FX Cartel Academy — create-payment Edge Function
// Calls Paymob's Intention API (v1/intention/) using the secret key
// (server-side only) to start a paid checkout, returning the client_secret
// the frontend needs to open Paymob's Unified Checkout with the public key.
//
// Replaces createPaymobLink() from apps-script-backend.gs, which used the
// older 3-step auth-token/order/payment-key flow — the Intention API (what
// the public/secret keys are for) does the same job in one call.
//
// Call this AFTER the `checkout` function has created/renewed the Students
// row for a paid course (amount > 0); the free course never reaches this
// function since it's confirmed instantly.

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

// Paymob runs a separate API domain per region. The "are_" key prefix
// (ISO 3166-1 alpha-3 for the United Arab Emirates) points at a UAE
// account, whose Intention API lives on uae.paymob.com rather than the
// Egypt-default accept.paymob.com. CONFIRM this against the exact snippet
// shown in your Paymob dashboard (Developers ▸ Integration) — if it's
// different, set PAYMOB_BASE_URL as an Edge Function secret to override
// this default, no code change needed.
const DEFAULT_BASE_URL = 'https://uae.paymob.com';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return json({ ok: false, error: 'bad_request' }, 400);
  }

  const orderId = String(b.orderId || '');
  const amount = Number(b.amount) || 0;
  const name = String(b.name || 'Student');
  const phone = String(b.phone || '');
  const email = String(b.email || 'na@fxcartel.ae');
  // Built client-side (index.html already knows the course/name/email at
  // checkout time) so the browser can show a success screen immediately on
  // return, without a second lookup. Only forwarded to Paymob as-is — this
  // function never trusts it as an auth or redirect-target decision.
  const returnUrl = b.returnUrl ? String(b.returnUrl) : undefined;
  if (!orderId || amount <= 0) return json({ ok: false, error: 'bad_request' }, 400);

  const secretKey = Deno.env.get('PAYMOB_SECRET_KEY');
  const publicKey = Deno.env.get('PAYMOB_PUBLIC_KEY');
  const baseUrl = Deno.env.get('PAYMOB_BASE_URL') || DEFAULT_BASE_URL;
  const integrationIds = (Deno.env.get('PAYMOB_INTEGRATION_IDS') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);

  if (!secretKey || !publicKey || !integrationIds.length) {
    // PAYMOB_INTEGRATION_IDS isn't set yet — this needs the numeric
    // Integration ID(s) from Paymob dashboard ▸ Settings ▸ Payment
    // Integrations (one per payment method: card, wallet, etc.), as a
    // comma-separated Edge Function secret.
    return json({ ok: false, error: 'not_configured' }, 500);
  }

  const nameParts = name.split(' ');
  let intentionRes: Response;
  try {
    intentionRes = await fetch(`${baseUrl}/v1/intention/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${secretKey}`,
      },
      body: JSON.stringify({
        amount: Math.round(amount * 100), // AED fils, same cents-style unit as the old integration
        currency: 'AED',
        payment_methods: integrationIds,
        merchant_order_id: orderId,
        ...(returnUrl ? { redirection_url: returnUrl } : {}),
        items: [],
        billing_data: {
          apartment: 'NA', floor: 'NA', street: 'NA', building: 'NA',
          city: 'Abu Dhabi', country: 'ARE', state: 'NA',
          shipping_method: 'NA', postal_code: 'NA',
          first_name: nameParts[0] || 'Student',
          last_name: nameParts.slice(1).join(' ') || '-',
          phone_number: phone || '+971500000000',
          email,
        },
      }),
    });
  } catch {
    return json({ ok: false, error: 'paymob_unreachable' }, 502);
  }

  if (!intentionRes.ok) {
    return json({ ok: false, error: 'paymob_error' }, 502);
  }
  const intention = await intentionRes.json();
  const clientSecret = intention.client_secret;
  if (!clientSecret) return json({ ok: false, error: 'paymob_error' }, 502);

  return json({
    ok: true,
    checkoutUrl: `${baseUrl}/unifiedcheckout/?publicKey=${publicKey}&clientSecret=${clientSecret}`,
  });
});
