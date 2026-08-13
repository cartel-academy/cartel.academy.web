// FX Cartel Academy — capi-event Edge Function
// Server-side mirror of client-tracked Meta Pixel events, via Meta's
// Conversions API. This is NOT the Purchase-confirmation path — see
// paymob-webhook/index.ts, which stays the sole source of truth for a
// "Purchase" event (webhook-verified, real email/phone; this endpoint's
// ALLOWED_EVENTS list deliberately excludes "Purchase" so a crafted
// request here can never report one).
//
// Exists so browsing-level events (PageView, ViewContent,
// InitiateCheckout, Contact, Lead, CompleteRegistration,
// AddPaymentInfo) — already tracked client-side via fbq() in
// meta-pixel.js — also get a server-side copy, for better match quality
// against ad blockers and Safari's ITP. This is the same outcome Meta's
// separate Conversions API Gateway product provides, without needing a
// persistent server this static site doesn't have.
//
// Called fire-and-forget from meta-pixel.js's fxcTrack(), sharing one
// event_id with the matching browser-side fbq() call so Meta dedupes
// them into a single event instead of double-counting.

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

const ALLOWED_EVENTS = new Set([
  'PageView',
  'ViewContent',
  'InitiateCheckout',
  'Contact',
  'Lead',
  'CompleteRegistration',
  'AddPaymentInfo',
]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const pixelId = Deno.env.get('META_PIXEL_ID');
  const accessToken = Deno.env.get('META_CAPI_ACCESS_TOKEN');
  // Silently no-op, matching paymob-webhook's convention — missing
  // config or a Meta API hiccup must never surface as an error to the
  // client calling this fire-and-forget endpoint.
  if (!pixelId || !accessToken) return json({ ok: true, skipped: true });

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return json({ ok: false, error: 'bad_request' }, 400);
  }

  const eventName = String(b.event_name || '');
  if (!ALLOWED_EVENTS.has(eventName)) {
    return json({ ok: false, error: 'event_not_allowed' }, 400);
  }

  try {
    const userData: Record<string, string> = {};
    const fbp = b.fbp ? String(b.fbp) : '';
    const fbc = b.fbc ? String(b.fbc) : '';
    if (fbp) userData.fbp = fbp;
    if (fbc) userData.fbc = fbc;
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    if (clientIp) userData.client_ip_address = clientIp;
    const ua = req.headers.get('user-agent');
    if (ua) userData.client_user_agent = ua;

    const payload: Record<string, unknown> = {
      data: [{
        event_name: eventName,
        event_id: b.event_id ? String(b.event_id) : undefined,
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        event_source_url: b.event_source_url ? String(b.event_source_url) : 'https://www.cartel.academy/',
        user_data: userData,
        custom_data: (b.custom_data && typeof b.custom_data === 'object') ? b.custom_data : {},
      }],
      access_token: accessToken,
    };
    const testEventCode = Deno.env.get('META_TEST_EVENT_CODE');
    if (testEventCode) payload.test_event_code = testEventCode;

    await fetch(`https://graph.facebook.com/v19.0/${pixelId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.error('Meta CAPI event relay failed:', err);
  }

  return json({ ok: true });
});
