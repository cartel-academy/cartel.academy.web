// FX Cartel Academy — Paymob webhook Edge Function
// Replaces handlePaymobWebhook()/markOrderPaid() from apps-script-backend.gs.
// Deno has a native Web Crypto API, so HMAC-SHA512 verification is a
// couple of lines here — no BigInt workaround, no custom SHA-512
// implementation like the Sheets backend needed.
//
// Set your Paymob integration's "Transaction processed callback" URL to
// this function's URL once deployed.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function computeValidUntil(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

async function hmacSha512Hex(keyStr: string, msgStr: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(keyStr),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msgStr));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ---- Meta Conversions API: the ONLY place this site fires a "Purchase"
// event. This function is the sole source of truth for a paid course
// actually being confirmed (see meta-pixel.js's comment for why the
// client never fires Purchase itself). Silently no-ops if the
// META_PIXEL_ID/META_CAPI_ACCESS_TOKEN secrets aren't set, and never
// throws — a Meta API hiccup must never affect the actual payment
// confirmation this function exists to do.
async function sendMetaPurchaseEvent(row: { email?: string; phone?: string; course?: string; amount?: number }) {
  const pixelId = Deno.env.get('META_PIXEL_ID');
  const accessToken = Deno.env.get('META_CAPI_ACCESS_TOKEN');
  if (!pixelId || !accessToken) return;

  try {
    const userData: Record<string, string[]> = {};
    // Meta requires SHA-256 hashed, normalized (lowercase/trimmed email,
    // digits-only phone) values — never send raw PII to the events endpoint.
    if (row.email) userData.em = [await sha256Hex(row.email.trim().toLowerCase())];
    if (row.phone) userData.ph = [await sha256Hex(row.phone.replace(/[^0-9]/g, ''))];

    const payload: Record<string, unknown> = {
      data: [{
        event_name: 'Purchase',
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        event_source_url: 'https://www.cartel.academy/', // update if the production domain changes
        user_data: userData,
        custom_data: {
          currency: 'AED',
          value: row.amount || 0,
          content_name: row.course || '',
        },
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
    console.error('Meta CAPI Purchase event failed (payment itself is still confirmed):', err);
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const hmacParam = url.searchParams.get('hmac') || '';

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'bad_request' }), { status: 400 });
  }

  const obj = (body.obj || {}) as Record<string, unknown>;
  const orderObj = (obj.order || {}) as Record<string, unknown>;
  const srcData = (obj.source_data || {}) as Record<string, unknown>;

  // Fixed field order per Paymob docs: Accept ▸ Payment Integration ▸ HMAC Calculation.
  const fields = [
    obj.amount_cents, obj.created_at, obj.currency, obj.error_occured,
    obj.has_parent_transaction, obj.id, obj.integration_id, obj.is_3d_secure,
    obj.is_auth, obj.is_capture, obj.is_refunded, obj.is_standalone_payment,
    obj.is_voided, orderObj.id, obj.owner, obj.pending,
    srcData.pan, srcData.sub_type, srcData.type, obj.success,
  ];
  const concatStr = fields.map((v) => (v === undefined || v === null ? '' : String(v))).join('');

  const secret = Deno.env.get('PAYMOB_HMAC_SECRET')!;
  const computed = await hmacSha512Hex(secret, concatStr);
  if (!hmacParam || computed.toLowerCase() !== hmacParam.toLowerCase()) {
    return new Response(JSON.stringify({ ok: false, error: 'hmac_mismatch' }), { status: 401 });
  }
  if (!obj.success) return new Response(JSON.stringify({ ok: true, ignored: true }));

  const orderId = String(orderObj.merchant_order_id || '');
  if (!orderId) return new Response(JSON.stringify({ ok: true }));

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  const { data: updatedRow } = await supabase
    .from('students')
    .update({
      payment_status: 'Paid',
      paymob_ref: String(obj.id || ''),
      paid_at: new Date().toISOString(),
      valid_until: computeValidUntil(),
    })
    .eq('order_id', orderId)
    .select('email, phone, course, amount')
    .single();

  if (updatedRow) await sendMetaPurchaseEvent(updatedRow);

  return new Response(JSON.stringify({ ok: true }));
});
